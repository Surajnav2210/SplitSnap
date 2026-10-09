-- =============================================================================
-- DRAFT — NOT RUN YET — tests for the DRAFT schema awaiting human approval.
-- =============================================================================
-- pgTAP tests for RLS, the bill/settlement state machines, the append-only
-- audit log, and retention in supabase/migrations/0001_initial_schema.sql.
--
-- How to run (once the human approves the schema and the Supabase CLI is set up;
-- all local, free, needs Docker):
--   supabase init                # if supabase/config.toml doesn't exist yet
--   supabase start               # local Postgres + Auth in Docker
--   supabase db reset            # applies supabase/migrations/*
--   supabase test db             # runs pgTAP files under supabase/tests/
-- If the installed CLI only picks up supabase/tests/database/*.sql, move this
-- file there. Never point these tests at a hosted/production database.
--
-- Everything runs inside one transaction and is rolled back at the end.
-- Identity switching: tests.act_as() sets the JWT claims that auth.uid() /
-- auth.jwt() read and switches to the "authenticated" role, exactly like a
-- request from supabase-js. `reset role` goes back to the postgres owner,
-- which bypasses RLS (used for setup and for checking trigger-level rules).
--
-- Expected error codes:
--   42501  RLS "new row violates row-level security policy" or missing privilege
--   P0001  our triggers (state machine / frozen bill / append-only)
--   P0002  join_bill: no open bill for that link
--   23505  unique violation, 23514 check violation
-- Note: BEFORE triggers run before RLS WITH CHECK, so a write to a locked bill
-- fails with the trigger's P0001 even for a guest.
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------------------------------------------------------------- helpers ---
create schema tests;
grant usage on schema tests to authenticated;

create function tests.act_as(p_uid uuid, p_anonymous boolean) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text,
    true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Call after `reset role;` to act as the system (cron / no user).
create function tests.act_as_system() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Fixed ids
--   host     11111111-1111-4111-8111-111111111111  (Google user)
--   guest 1  22222222-2222-4222-8222-222222222222  (anonymous)
--   guest 2  33333333-3333-4333-8333-333333333333  (anonymous)
--   outsider 44444444-4444-4444-8444-444444444444  (anonymous, never joins)
--   bill B1  b1000000-0000-4000-8000-000000000001  (opened, then locked)
--   bill B2  b2000000-0000-4000-8000-000000000002  (stays draft)
--   item I1  a1000000-0000-4000-8000-000000000001, item I2 a2000000-0000-4000-8000-000000000002

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', null),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', null),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', null);

-- ------------------------------------------------------------ host setup ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);

select lives_ok($$
  insert into public.profiles (id, display_name, venmo_handle)
  values ('11111111-1111-4111-8111-111111111111', 'Hana Host', 'hana-host')
$$, 'host can create their own profile');

select throws_ok($$
  update public.profiles set venmo_handle = 'bad handle!'
  where id = '11111111-1111-4111-8111-111111111111'
$$, '23514', null, 'payment handle format is enforced');

select lives_ok($$
  insert into public.bills (id, merchant) values
    ('b1000000-0000-4000-8000-000000000001', 'Test Diner'),
    ('b2000000-0000-4000-8000-000000000002', 'Draft Cafe')
$$, 'host can create bills (host_id defaults to auth.uid())');

select is(
  (select count(*)::int from public.participants
   where bill_id = 'b1000000-0000-4000-8000-000000000001' and is_host),
  1, 'host is automatically participant #1');

select lives_ok($$
  insert into public.line_items (id, bill_id, name, price_cents) values
    ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Nachos', 1200),
    ('a2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Soda', 300)
$$, 'host adds items to a draft');

select throws_ok($$
  insert into public.line_items (bill_id, name, price_cents)
  values ('b1000000-0000-4000-8000-000000000001', 'Negative', -1)
$$, '23514', null, 'negative prices are rejected');

select lives_ok($$
  insert into public.bill_adjustments (bill_id, kind, amount_cents)
  values ('b1000000-0000-4000-8000-000000000001', 'tax', 120)
$$, 'host adds tax');

select lives_ok($$
  update public.bills set status = 'open' where id = 'b1000000-0000-4000-8000-000000000001'
$$, 'host opens B1 (draft -> open)');

select is((select status::text from public.bills where id = 'b1000000-0000-4000-8000-000000000001'),
          'open', 'B1 is open');

-- Stash the generated share codes where any role can read them.
select set_config('test.b1_code',
  (select share_code from public.bills where id = 'b1000000-0000-4000-8000-000000000001'), true);
select set_config('test.b2_code',
  (select share_code from public.bills where id = 'b2000000-0000-4000-8000-000000000002'), true);

-- --------------------------------------------------------------- joining ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);

select throws_ok($$ insert into public.bills (merchant) values ('Sneaky') $$,
  '42501', null, 'anonymous guests cannot create bills');

select is_empty($$ select 1 from public.bills $$, 'before joining, a guest sees no bills');

select isnt(public.join_bill(current_setting('test.b1_code'), 'Gia'), null,
  'guest 1 joins an open bill by share code');

select is(public.join_bill(current_setting('test.b1_code'), 'Gia'),
  (select id from public.participants
   where bill_id = 'b1000000-0000-4000-8000-000000000001'
     and user_id = '22222222-2222-4222-8222-222222222222'),
  'joining twice is idempotent (same participant id)');

select throws_ok($$ select public.join_bill(current_setting('test.b2_code'), 'Gia') $$,
  'P0002', null, 'cannot join a draft bill');

select is((select count(*)::int from public.bills), 1,
  'guest sees only the open bill they joined, not the host''s draft');

select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select isnt(public.join_bill(current_setting('test.b1_code'), 'Gus'), null, 'guest 2 joins');

-- ---------------------------------------------- outsider (never joined) ---
select tests.act_as('44444444-4444-4444-8444-444444444444', true);

select is_empty($$ select 1 from public.bills $$,            'non-participant cannot read bills');
select is_empty($$ select 1 from public.line_items $$,       'non-participant cannot read items');
select is_empty($$ select 1 from public.bill_adjustments $$, 'non-participant cannot read adjustments');
select is_empty($$ select 1 from public.participants $$,     'non-participant cannot read participants');
select is_empty($$ select 1 from public.claims $$,           'non-participant cannot read claims');
select is_empty($$ select 1 from public.profiles $$,         'non-participant cannot read host profile');
select throws_ok($$ select public.join_bill('aaaaaaaaaaaa', 'Olly') $$,
  'P0002', null, 'unknown share code gives the same error as a closed bill');

-- ---------------------------------------------------------------- claims ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);

select is((select count(*)::int from public.profiles), 1,
  'participant can read the host profile (for payment buttons)');

select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values ('a1000000-0000-4000-8000-000000000001',
          (select id from public.participants
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and user_id = '22222222-2222-4222-8222-222222222222'),
          'b1000000-0000-4000-8000-000000000001')
$$, 'guest claims an item for themself');

select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values ('a1000000-0000-4000-8000-000000000001',
          (select id from public.participants
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and user_id = '22222222-2222-4222-8222-222222222222'),
          'b1000000-0000-4000-8000-000000000001')
  on conflict do nothing
$$, 'claiming the same item twice is an idempotent no-op');

select throws_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values ('a2000000-0000-4000-8000-000000000002',
          (select id from public.participants
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and user_id = '33333333-3333-4333-8333-333333333333'),
          'b1000000-0000-4000-8000-000000000001')
$$, '42501', null, 'guest cannot claim on behalf of another participant');

select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values ('a1000000-0000-4000-8000-000000000001',
          (select id from public.participants
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and user_id = '33333333-3333-4333-8333-333333333333'),
          'b1000000-0000-4000-8000-000000000001')
$$, 'guest 2 shares the same item');

-- Guest 1 tries to remove guest 2's claim: RLS silently filters it out.
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select lives_ok($$
  delete from public.claims
  where participant_id = (select id from public.participants
                          where bill_id = 'b1000000-0000-4000-8000-000000000001'
                            and user_id = '33333333-3333-4333-8333-333333333333')
$$, 'deleting another guest''s claim affects nothing');

-- Guest 1 tries to change a price: RLS filters it out.
select lives_ok($$
  update public.line_items set price_cents = 1
  where id = 'a1000000-0000-4000-8000-000000000001'
$$, 'guest price edit affects nothing');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.claims
           where participant_id = (select id from public.participants
                                   where user_id = '33333333-3333-4333-8333-333333333333')),
          1, 'guest 2''s claim survived guest 1''s delete attempt');
select is((select price_cents from public.line_items where id = 'a1000000-0000-4000-8000-000000000001'),
          1200::bigint, 'price unchanged by guest');

-- ------------------------------------------------------------------ lock ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$
  update public.bills set status = 'locked' where id = 'b1000000-0000-4000-8000-000000000001'
$$, 'host locks B1 (open -> locked)');
select isnt((select locked_at from public.bills where id = 'b1000000-0000-4000-8000-000000000001'),
            null, 'locked_at is set by the trigger');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select throws_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values ('a2000000-0000-4000-8000-000000000002',
          (select id from public.participants
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and user_id = '22222222-2222-4222-8222-222222222222'),
          'b1000000-0000-4000-8000-000000000001')
$$, 'P0001', null, 'guest cannot claim on a locked bill');
select lives_ok($$
  delete from public.claims
  where participant_id = (select id from public.participants
                          where bill_id = 'b1000000-0000-4000-8000-000000000001'
                            and user_id = '22222222-2222-4222-8222-222222222222')
$$, 'guest unclaim on a locked bill affects nothing');

-- Even the table owner (bypasses RLS) hits the triggers.
reset role;
select tests.act_as_system();
select is((select count(*)::int from public.claims
           where bill_id = 'b1000000-0000-4000-8000-000000000001'),
          2, 'claims unchanged after lock');
select throws_ok($$
  delete from public.claims where bill_id = 'b1000000-0000-4000-8000-000000000001'
$$, 'P0001', null, 'trigger freezes claims on a locked bill, even for privileged roles');
select throws_ok($$
  update public.line_items set price_cents = 1 where id = 'a1000000-0000-4000-8000-000000000001'
$$, 'P0001', null, 'trigger freezes items on a locked bill');
select throws_ok($$
  update public.bills set status = 'open' where id = 'b1000000-0000-4000-8000-000000000001'
$$, 'P0001', null, 'locked -> open is not a legal transition');
select throws_ok($$
  update public.bills set merchant = 'Changed' where id = 'b1000000-0000-4000-8000-000000000001'
$$, 'P0001', null, 'locked bill fields are frozen');
select throws_ok($$
  update public.bills set status = 'locked' where id = 'b2000000-0000-4000-8000-000000000002'
$$, 'P0001', null, 'draft -> locked is not a legal transition');

-- ----------------------------------------------------------- settlements ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$
  insert into public.settlements (bill_id, participant_id, amount_cents, idempotency_key)
  values ('b1000000-0000-4000-8000-000000000001',
          (select id from public.participants where user_id = '22222222-2222-4222-8222-222222222222'),
          1234, 'lock:b1:guest1')
$$, 'host records what guest 1 owes');
select lives_ok($$
  insert into public.settlements (bill_id, participant_id, amount_cents, idempotency_key)
  values ('b1000000-0000-4000-8000-000000000001',
          (select id from public.participants where user_id = '22222222-2222-4222-8222-222222222222'),
          1234, 'lock:b1:guest1')
  on conflict do nothing
$$, 'retry with the same idempotency key is a no-op');
select throws_ok($$
  insert into public.settlements (bill_id, participant_id, amount_cents, idempotency_key)
  values ('b1000000-0000-4000-8000-000000000001',
          (select id from public.participants where user_id = '22222222-2222-4222-8222-222222222222'),
          999, 'lock:b1:guest1:again')
$$, '23505', null, 'at most one settlement per participant per bill');
select throws_ok($$
  insert into public.settlements (bill_id, participant_id, amount_cents, idempotency_key)
  values ('b1000000-0000-4000-8000-000000000001',
          (select id from public.participants
           where bill_id = 'b1000000-0000-4000-8000-000000000001' and is_host),
          500, 'lock:b1:host')
$$, 'P0001', null, 'the host does not owe themselves');

select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select is_empty($$
  select 1 from public.settlements
  where participant_id = (select id from public.participants where user_id = '22222222-2222-4222-8222-222222222222')
$$, 'a guest cannot see another guest''s settlement');
select lives_ok($$
  update public.settlements set status = 'marked_paid'
  where participant_id = (select id from public.participants where user_id = '22222222-2222-4222-8222-222222222222')
$$, 'a guest marking another guest''s settlement affects nothing');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select is((select status::text from public.settlements), 'unpaid', 'still unpaid');
select throws_ok($$ update public.settlements set status = 'confirmed' $$,
  'P0001', null, 'guest cannot confirm their own payment');
select throws_ok($$ update public.settlements set amount_cents = 1 $$,
  '42501', null, 'guest cannot change the amount (column privilege)');
select lives_ok($$ update public.settlements set status = 'marked_paid' $$,
  'guest marks their own settlement as paid');
select isnt((select marked_paid_at from public.settlements), null, 'marked_paid_at set by trigger');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$
  update public.settlements set status = 'confirmed'
  where bill_id = 'b1000000-0000-4000-8000-000000000001'
$$, 'host confirms receipt');
select is((select status::text from public.settlements
           where bill_id = 'b1000000-0000-4000-8000-000000000001'),
          'confirmed', 'settlement confirmed');

-- ------------------------------------------------------------- audit log ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select is_empty($$ select 1 from public.audit_log $$, 'guests cannot read the audit log');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select ok((select count(*) from public.audit_log
           where bill_id = 'b1000000-0000-4000-8000-000000000001') > 0,
          'host can read the audit log of their own bill');
select throws_ok($$ update public.audit_log set action = 'tampered' $$,
  '42501', null, 'authenticated users cannot update audit_log');
select throws_ok($$ delete from public.audit_log $$,
  '42501', null, 'authenticated users cannot delete audit_log');
select throws_ok($$
  insert into public.audit_log (table_name, action) values ('bills', 'forged')
$$, '42501', null, 'authenticated users cannot forge audit rows');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.audit_log
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and action = 'bills.status_change'),
          2, 'both status changes (open, locked) were audited');
select is((select actor_id from public.audit_log
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and action = 'bills.status_change'
           order by id limit 1),
          '11111111-1111-4111-8111-111111111111'::uuid, 'audit records who made the change');
select ok((select count(*) from public.audit_log where table_name = 'settlements') >= 3,
          'settlement insert and status changes are audited');
select ok(not exists (select 1 from public.audit_log
                      where table_name = 'participants'
                        and (before ? 'display_name' or after ? 'display_name')),
          'participant display names (PII) never reach the audit log');
select throws_ok($$ update public.audit_log set action = 'tampered' $$,
  'P0001', null, 'even the table owner cannot update audit_log (trigger)');
select throws_ok($$ delete from public.audit_log $$,
  'P0001', null, 'even the table owner cannot delete audit_log rows (trigger)');
select throws_ok($$ truncate public.audit_log $$,
  'P0001', null, 'audit_log cannot be truncated');

-- ------------------------------------------------------------- retention ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$
  update public.bills set status = 'archived' where id = 'b1000000-0000-4000-8000-000000000001'
$$, 'host archive attempt on a locked bill affects nothing (RLS: host cannot edit locked bills)');

reset role;
select tests.act_as_system();
select is((select status::text from public.bills where id = 'b1000000-0000-4000-8000-000000000001'),
          'locked', 'only the retention job archives');

select is(private.archive_old_bills(now() + interval '31 days'), 2,
  'retention archives the locked bill and the stale draft');
select is((select status::text from public.bills where id = 'b1000000-0000-4000-8000-000000000001'),
          'archived', 'B1 archived');
select results_eq($$
  select display_name from public.participants
  where bill_id = 'b1000000-0000-4000-8000-000000000001' and not is_host
  order by join_order
$$, $$ values ('Guest 1'::text), ('Guest 2'::text) $$, 'guest names are anonymized');
select is((select count(*)::int from public.participants
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and not is_host and user_id is not null),
          0, 'guest accounts are unlinked from archived bills');
select is(private.archive_old_bills(now() + interval '31 days'), 0, 'retention is idempotent');
select is((select reason from public.audit_log
           where bill_id = 'b1000000-0000-4000-8000-000000000001'
             and action = 'bills.status_change'
           order by id desc limit 1),
          'retention: auto-archive after 30 days', 'archival is audited with a reason');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select is_empty($$ select 1 from public.bills $$, 'the guest link stops working once archived');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select is((select count(*)::int from public.bills
           where id = 'b1000000-0000-4000-8000-000000000001'),
          1, 'host can still read the archived bill');
select throws_ok($$ select private.archive_old_bills() $$,
  '42501', null, 'users cannot call the retention job');

select * from finish();
rollback;
