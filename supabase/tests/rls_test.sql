-- pgTAP tests for supabase/migrations/0001_initial_schema.sql: RLS, RPCs, state machines, audit log, retention.
--
-- How to run (local only, free, needs Docker + the Supabase CLI):
--   supabase init                # if supabase/config.toml doesn't exist yet
--   supabase start               # local Postgres + Auth in Docker
--   supabase db reset            # applies supabase/migrations/*
--   supabase test db             # runs pgTAP files under supabase/tests/
-- If your CLI version only picks up supabase/tests/database/*.sql, move this
-- file there. Never point these tests at a hosted/production database.
--
-- Everything runs in one transaction and is rolled back at the end.
-- tests.act_as() sets the JWT claims that auth.uid()/auth.jwt() read and
-- switches to the "authenticated" role, like a supabase-js request.
-- `reset role` returns to the table owner (bypasses RLS, not triggers).
--
-- Error codes are listed at the top of the migration. Note: BEFORE triggers
-- run before RLS WITH CHECK, so a write to a locked bill fails with the
-- trigger's SS003 even for a guest.

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

-- Lookups that bypass RLS (SECURITY DEFINER, owned by the test runner).
create function tests.b1() returns uuid
language sql stable as $$ select current_setting('test.b1')::uuid $$;

create function tests.pid(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.participants p
  where p.bill_id = tests.b1() and p.user_id = p_user
$$;

create function tests.host_pid() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.participants p where p.bill_id = tests.b1() and p.is_host
$$;

create function tests.item(p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select li.id from public.line_items li where li.bill_id = tests.b1() and li.name = p_name
$$;

create function tests.sid(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.settlements s where s.participant_id = tests.pid(p_user)
$$;

-- Amounts payload for guest 1 and guest 2.
create function tests.amounts(p_g1 bigint, p_g2 bigint) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_array(
    jsonb_build_object('participant_id', tests.pid('22222222-2222-4222-8222-222222222222'), 'amount_cents', p_g1),
    jsonb_build_object('participant_id', tests.pid('33333333-3333-4333-8333-333333333333'), 'amount_cents', p_g2))
$$;

-- People
--   host     11111111-1111-4111-8111-111111111111  (Google)
--   guest 1  22222222-2222-4222-8222-222222222222  (anonymous)
--   guest 2  33333333-3333-4333-8333-333333333333  (anonymous)
--   outsider 44444444-4444-4444-8444-444444444444  (anonymous, never joins)
--   leaver   55555555-5555-4555-8555-555555555555  (anonymous, joins then leaves)
--   removed  66666666-6666-4666-8666-666666666666  (anonymous, removed by the host)
--   host 2   77777777-7777-4777-8777-777777777777  (Google, used for client_key tests)
--
-- Bill: Nachos 1200 (guest 1 + guest 2), Soda 300 (guest 2), Fries 500
-- (assigned to guest 1 by the host), tax 160, discount 100 -> total 2060.
-- Shares (as computeSplit would produce): guest 1 = 1100 + 88 - 55 = 1133,
-- guest 2 = 900 + 72 - 45 = 927, host = 0.

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', null),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', null),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', null),
  ('55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', null),
  ('66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', null);

-- ------------------------------------------ anonymous users cannot host ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);

select throws_ok($$
  select * from public.publish_bill($j${"client_key":"c0000000-0000-4000-8000-0000000000ff","host_display_name":"Gia","items":[{"name":"Tea","price_cents":100}]}$j$::jsonb)
$$, '42501', null, 'publish_bill: anonymous users are rejected');

select throws_ok($$ select public.upsert_profile('Gia', null, null, null) $$,
  '42501', null, 'upsert_profile: anonymous users are rejected');

select throws_ok($$ insert into public.bills (host_id) values ('22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'nobody can insert bills directly');

-- ------------------------------------------------------- host: profile ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);

select lives_ok($$ select public.upsert_profile('Hana Host', 'hana-host', null, null) $$,
  'upsert_profile: host saves name and Venmo handle');
select throws_ok($$ select public.upsert_profile('Hana Host', 'bad handle!', null, null) $$,
  '22023', null, 'upsert_profile: handle format is enforced');
select is((select venmo_handle from public.profiles), 'hana-host', 'host reads own profile');

-- ------------------------------------------------- host: publish_bill ---
select throws_ok($$
  select * from public.publish_bill($j${"client_key":"c0000000-0000-4000-8000-0000000000ff","host_display_name":"Hana","items":[]}$j$::jsonb)
$$, '22023', null, 'publish_bill: at least one item');

select throws_ok($$
  select * from public.publish_bill($j${"client_key":"c0000000-0000-4000-8000-0000000000ff","host_display_name":"Hana",
    "items":[{"name":"Tea","price_cents":100}],
    "adjustments":[{"kind":"discount","amount_cents":200}]}$j$::jsonb)
$$, 'SS011', null, 'publish_bill: discount cannot exceed items total');

select throws_ok($$
  select * from public.publish_bill($j${"client_key":"c0000000-0000-4000-8000-0000000000ff","host_display_name":"Hana",
    "items":[{"name":"Tea","price_cents":12.5}]}$j$::jsonb)
$$, '22023', null, 'publish_bill: price must be integer cents');

select throws_ok($$
  select * from public.publish_bill($j${"client_key":"c0000000-0000-4000-8000-0000000000ff","host_display_name":"Hana",
    "items":[{"name":"Tea","price_cents":-1}]}$j$::jsonb)
$$, '22023', null, 'publish_bill: negative price rejected');

select set_config('test.b1', r.bill_id::text, true),
       set_config('test.b1_code', r.share_code, true)
from public.publish_bill($j${
  "merchant": "Test Diner",
  "currency": "USD",
  "client_key": "c1000000-0000-4000-8000-000000000001",
  "host_display_name": "Hana Host",
  "items": [
    {"name": "Nachos", "quantity": 1, "price_cents": 1200, "source": "ai",     "position": 0},
    {"name": "Soda",   "quantity": 1, "price_cents": 300,  "source": "ai",     "position": 1},
    {"name": "Fries",  "quantity": 1, "price_cents": 500,  "source": "manual", "position": 2}
  ],
  "adjustments": [
    {"kind": "tax",      "amount_cents": 160},
    {"kind": "discount", "amount_cents": 100}
  ]
}$j$::jsonb) r;

select is((select status::text from public.bills where id = tests.b1()), 'open',
  'publish_bill: bill is created open');
select ok(current_setting('test.b1_code') ~ '^[a-km-np-z2-9]{10}$',
  'publish_bill: share code is 10 unambiguous characters');
select is((select join_order from public.participants where id = tests.host_pid()), 1,
  'publish_bill: host is participant with join_order 1');
select is((select count(*)::int from public.line_items where bill_id = tests.b1()), 3, 'three items');
select is((select count(*)::int from public.bill_adjustments where bill_id = tests.b1()), 2, 'two adjustments');

-- --------------------------------------------------------------- joining ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);

select is_empty($$ select 1 from public.bills $$, 'before joining, a guest sees no bills');
select is((select j.bill_id from public.join_bill(current_setting('test.b1_code'), 'Gia') j),
  tests.b1(), 'guest 1 joins by share code');
select is((select j.participant_id from public.join_bill(current_setting('test.b1_code'), 'Gia') j),
  tests.pid('22222222-2222-4222-8222-222222222222'), 'joining twice is idempotent');
select is((select join_order from public.participants
           where id = tests.pid('22222222-2222-4222-8222-222222222222')), 2, 'guest 1 has join_order 2');
select throws_ok($$ select * from public.join_bill('aaaaaaaaaa', 'Gia') $$,
  'P0002', null, 'unknown share code is rejected');
select is((select count(*)::int from public.bills), 1, 'guest sees the joined bill');
select is_empty($$ select 1 from public.profiles $$, 'guests cannot read host profiles');

select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select isnt((select j.participant_id from public.join_bill(current_setting('test.b1_code'), 'Gus') j),
  null, 'guest 2 joins');

select tests.act_as('55555555-5555-4555-8555-555555555555', true);
select isnt((select j.participant_id from public.join_bill(current_setting('test.b1_code'), 'Lee') j),
  null, 'leaver joins');

select tests.act_as('66666666-6666-4666-8666-666666666666', true);
select isnt((select j.participant_id from public.join_bill(current_setting('test.b1_code'), 'Rex') j),
  null, 'a guest who will be removed joins');

-- ---------------------------------------------- outsider (never joined) ---
select tests.act_as('44444444-4444-4444-8444-444444444444', true);
select is_empty($$ select 1 from public.bills $$,            'non-participant cannot read bills');
select is_empty($$ select 1 from public.line_items $$,       'non-participant cannot read items');
select is_empty($$ select 1 from public.bill_adjustments $$, 'non-participant cannot read adjustments');
select is_empty($$ select 1 from public.participants $$,     'non-participant cannot read participants');
select is_empty($$ select 1 from public.claims $$,           'non-participant cannot read claims');
select is_empty($$ select 1 from public.settlements $$,      'non-participant cannot read settlements');

-- ---------------------------------------------------------------- claims ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values (tests.item('Nachos'), tests.pid('22222222-2222-4222-8222-222222222222'), tests.b1())
$$, 'guest claims an item for themself');
select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values (tests.item('Nachos'), tests.pid('22222222-2222-4222-8222-222222222222'), tests.b1())
  on conflict do nothing
$$, 'claiming twice is an idempotent no-op');
select throws_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values (tests.item('Soda'), tests.pid('33333333-3333-4333-8333-333333333333'), tests.b1())
$$, '42501', null, 'guest cannot claim on behalf of another participant');

select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id) values
    (tests.item('Nachos'), tests.pid('33333333-3333-4333-8333-333333333333'), tests.b1()),
    (tests.item('Soda'),   tests.pid('33333333-3333-4333-8333-333333333333'), tests.b1())
$$, 'guest 2 shares Nachos and claims Soda');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select lives_ok($$
  delete from public.claims where participant_id = tests.pid('33333333-3333-4333-8333-333333333333')
$$, 'deleting another guest''s claims affects nothing (RLS)');
select lives_ok($$ update public.line_items set price_cents = 1 where id = tests.item('Nachos') $$,
  'guest price edit affects nothing (RLS)');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.claims
           where participant_id = tests.pid('33333333-3333-4333-8333-333333333333')),
          2, 'guest 2''s claims survived guest 1''s delete attempt');
select is((select price_cents from public.line_items where id = tests.item('Nachos')),
          1200::bigint, 'price unchanged by guest');

-- ----------------------------------------------------------------- leave ---
select tests.act_as('55555555-5555-4555-8555-555555555555', true);
select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values (tests.item('Soda'), tests.pid('55555555-5555-4555-8555-555555555555'), tests.b1())
$$, 'leaver claims Soda');
select lives_ok($$ select public.leave_bill(tests.b1()) $$, 'guest can leave an open bill');
select throws_ok($$ select public.leave_bill(tests.b1()) $$,
  'P0002', null, 'leaving twice: no longer on the bill');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.participants
           where bill_id = tests.b1() and user_id = '55555555-5555-4555-8555-555555555555'),
          0, 'leaver''s participant row is gone');
select is((select count(*)::int from public.claims c
           join public.line_items li on li.id = c.line_item_id
           where li.name = 'Soda' and c.bill_id = tests.b1()),
          1, 'leaver''s claim is gone (only guest 2 still has Soda)');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select throws_ok($$ select public.leave_bill(tests.b1()) $$,
  'SS009', null, 'the host cannot leave');

-- ---------------------------------------------------- remove_participant ---
select tests.act_as('66666666-6666-4666-8666-666666666666', true);
select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values (tests.item('Soda'), tests.pid('66666666-6666-4666-8666-666666666666'), tests.b1())
$$, 'guest to be removed claims Soda');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select throws_ok($$ select public.remove_participant(tests.pid('66666666-6666-4666-8666-666666666666')) $$,
  '42501', null, 'remove_participant: non-host caller rejected');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select throws_ok($$ delete from public.participants where id = tests.pid('66666666-6666-4666-8666-666666666666') $$,
  '42501', null, 'participants cannot be deleted directly (RPC only)');
select throws_ok($$ select public.remove_participant(tests.host_pid()) $$,
  'SS009', null, 'remove_participant: host cannot remove themself');
select throws_ok($$ select public.remove_participant('00000000-0000-4000-8000-000000000000') $$,
  'P0002', null, 'remove_participant: unknown participant');
select lives_ok($$ select public.remove_participant(tests.pid('66666666-6666-4666-8666-666666666666')) $$,
  'remove_participant: host removes a guest while open');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.participants
           where bill_id = tests.b1() and user_id = '66666666-6666-4666-8666-666666666666'),
          0, 'removed guest''s participant row is gone');
select is((select count(*)::int from public.claims c
           where c.bill_id = tests.b1() and c.line_item_id = tests.item('Soda')),
          1, 'removed guest''s claim is gone (only guest 2 still has Soda)');
select is((select count(*)::int from public.audit_log
           where bill_id = tests.b1() and action = 'participants.delete'
             and reason = 'remove_participant'),
          1, 'removal is audit-logged');

-- ------------------------------------------- item / adjustment limits ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select throws_ok($$
  insert into public.bill_adjustments (bill_id, kind, amount_cents)
  values (tests.b1(), 'discount', 2000)
$$, 'SS011', null, 'host cannot add a discount above the items total');
select throws_ok($$
  update public.bill_adjustments set amount_cents = 2001
  where bill_id = tests.b1() and kind = 'discount'
$$, 'SS011', null, 'host cannot raise a discount above the items total');
select throws_ok($$
  insert into public.line_items (bill_id, name, price_cents)
  select tests.b1(), 'Extra ' || g, 0 from generate_series(1, 498) g
$$, '22023', null, 'a bill cannot exceed 500 items');
select throws_ok($$
  insert into public.bill_adjustments (bill_id, kind, amount_cents)
  select tests.b1(), 'fee', 0 from generate_series(1, 49) g
$$, '22023', null, 'a bill cannot exceed 50 adjustments');
select is((select count(*)::int from public.line_items where bill_id = tests.b1()), 3,
  'items unchanged after rejected writes');

-- ----------------------------------------------------- lock validation ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select throws_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 927), 0) $$,
  '42501', null, 'lock_bill: non-host caller rejected');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select throws_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 927), 0) $$,
  'SS004', null, 'lock_bill: rejected while an item (Fries) is unclaimed');

select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values (tests.item('Fries'), tests.pid('22222222-2222-4222-8222-222222222222'), tests.b1())
$$, 'host assigns Fries to guest 1');

select throws_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 926), 0) $$,
  'SS005', null, 'lock_bill: amounts must add up to the bill total');
select throws_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 927), 1) $$,
  'SS005', null, 'lock_bill: host share counts toward the total');
select throws_ok($$
  select public.lock_bill(tests.b1(),
    jsonb_build_array(jsonb_build_object(
      'participant_id', tests.pid('22222222-2222-4222-8222-222222222222'), 'amount_cents', 2060)),
    0)
$$, 'SS006', null, 'lock_bill: every guest must be listed');
select throws_ok($$
  select public.lock_bill(tests.b1(),
    tests.amounts(1133, 927) || jsonb_build_array(jsonb_build_object(
      'participant_id', tests.host_pid(), 'amount_cents', 0)),
    0)
$$, 'SS006', null, 'lock_bill: the host must not be listed');
select throws_ok($$
  select public.lock_bill(tests.b1(),
    tests.amounts(1133, 927) || jsonb_build_array(jsonb_build_object(
      'participant_id', tests.pid('22222222-2222-4222-8222-222222222222'), 'amount_cents', 0)),
    0)
$$, 'SS006', null, 'lock_bill: a guest cannot be listed twice');
select throws_ok($$ select public.lock_bill(tests.b1(), tests.amounts(2060, -1), 1) $$,
  '22023', null, 'lock_bill: negative amounts rejected');
select throws_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 927), -1) $$,
  '22023', null, 'lock_bill: negative host share rejected');

select lives_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 927), 0) $$,
  'lock_bill: valid amounts lock the bill');
select is((select status::text from public.bills where id = tests.b1()), 'locked', 'bill is locked');
select isnt((select locked_at from public.bills where id = tests.b1()), null, 'locked_at set');
select is((select host_venmo_handle from public.bills where id = tests.b1()), 'hana-host',
  'host handles are snapshotted onto the bill');
select is((select count(*)::int from public.settlements where bill_id = tests.b1()), 2,
  'one unpaid settlement per guest with amount > 0');
select is((select idempotency_key from public.settlements
           where participant_id = tests.pid('22222222-2222-4222-8222-222222222222')),
          'lock:' || tests.b1()::text || ':' || tests.pid('22222222-2222-4222-8222-222222222222')::text,
          'settlement idempotency key format');
select throws_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 927), 0) $$,
  'SS001', null, 'lock_bill: cannot lock twice');
select throws_ok($$ select public.remove_participant(tests.pid('33333333-3333-4333-8333-333333333333')) $$,
  'SS001', null, 'remove_participant: rejected after lock');
select throws_ok($$ update public.bills set merchant = 'x' where id = tests.b1() $$,
  '42501', null, 'host cannot update bills directly (RPC only)');

-- ---------------------------------------------------- frozen after lock ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select throws_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  values (tests.item('Soda'), tests.pid('22222222-2222-4222-8222-222222222222'), tests.b1())
$$, 'SS003', null, 'guest cannot claim on a locked bill');
select lives_ok($$
  delete from public.claims where participant_id = tests.pid('22222222-2222-4222-8222-222222222222')
$$, 'guest unclaim on a locked bill affects nothing (RLS)');
select throws_ok($$ select public.leave_bill(tests.b1()) $$,
  'SS001', null, 'guest cannot leave a locked bill');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.claims where bill_id = tests.b1()), 4,
  'claims unchanged after lock');
select throws_ok($$ delete from public.claims where bill_id = tests.b1() $$,
  'SS003', null, 'trigger freezes claims even for privileged roles');
select throws_ok($$ update public.line_items set price_cents = 1 where id = tests.item('Nachos') $$,
  'SS003', null, 'trigger freezes items on a locked bill');
select throws_ok($$ update public.bills set status = 'draft' where id = tests.b1() $$,
  'SS002', null, 'locked -> draft is not a legal transition');
select throws_ok($$ update public.bills set merchant = 'Changed' where id = tests.b1() $$,
  'SS003', null, 'locked bill fields are frozen');

-- ----------------------------------------------------------- settlements ---
select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select is_empty($$
  select 1 from public.settlements where participant_id = tests.pid('22222222-2222-4222-8222-222222222222')
$$, 'a guest cannot see another guest''s settlement');
select throws_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'marked_paid')
$$, 'P0002', null, 'a guest cannot mark another guest''s settlement');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select is((select status::text from public.settlements), 'unpaid', 'guest 1 sees own settlement, unpaid');
select throws_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'confirmed')
$$, 'SS010', null, 'guest cannot confirm their own payment');
select throws_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'bogus')
$$, '22023', null, 'unknown status rejected');
select throws_ok($$ update public.settlements set status = 'marked_paid' $$,
  '42501', null, 'settlements cannot be updated directly (RPC only)');
select lives_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'marked_paid')
$$, 'guest marks own settlement paid');
select lives_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'marked_paid')
$$, 'marking paid again is a no-op');
select isnt((select marked_paid_at from public.settlements), null, 'marked_paid_at set');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select throws_ok($$ select public.unlock_bill(tests.b1()) $$,
  'SS007', null, 'unlock blocked once someone marked paid');
select lives_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'confirmed')
$$, 'host confirms receipt');
select throws_ok($$ select public.unlock_bill(tests.b1()) $$,
  'SS007', null, 'unlock blocked while a settlement is confirmed');

-- Cash payments: the host may confirm an unpaid settlement directly, and undo it.
select lives_ok($$
  select public.set_settlement_status(tests.sid('33333333-3333-4333-8333-333333333333'), 'confirmed')
$$, 'host confirms an unpaid settlement directly (cash)');
select is((select status::text from public.settlements
           where id = tests.sid('33333333-3333-4333-8333-333333333333')),
          'confirmed', 'guest 2 confirmed without marking paid');
select lives_ok($$
  select public.set_settlement_status(tests.sid('33333333-3333-4333-8333-333333333333'), 'unpaid')
$$, 'host undoes a cash confirm (confirmed -> unpaid)');
select is((select status::text from public.settlements
           where id = tests.sid('33333333-3333-4333-8333-333333333333')),
          'unpaid', 'guest 2 back to unpaid');
select throws_ok($$
  select public.set_settlement_status(tests.sid('33333333-3333-4333-8333-333333333333'), 'marked_paid')
$$, 'SS010', null, 'host cannot mark paid on a guest''s behalf');

-- Guests can't undo a host confirmation.
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select throws_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'unpaid')
$$, 'SS010', null, 'guest cannot move a confirmed settlement to unpaid');
select throws_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'marked_paid')
$$, 'SS010', null, 'guest cannot move a confirmed settlement to marked_paid');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'marked_paid')
$$, 'host undoes a confirm (confirmed -> marked_paid)');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select lives_ok($$
  select public.set_settlement_status(tests.sid('22222222-2222-4222-8222-222222222222'), 'unpaid')
$$, 'guest undoes "I''ve paid"');
select throws_ok($$ select public.unlock_bill(tests.b1()) $$,
  '42501', null, 'unlock_bill: non-host caller rejected');

-- ---------------------------------------------------------------- unlock ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$ select public.unlock_bill(tests.b1()) $$, 'host unlocks when nobody has paid');
select is((select status::text from public.bills where id = tests.b1()), 'open', 'bill is open again');
select is((select locked_at from public.bills where id = tests.b1()), null, 'locked_at cleared');
select is((select host_venmo_handle from public.bills where id = tests.b1()), null,
  'handle snapshot cleared');
select throws_ok($$ select public.unlock_bill(tests.b1()) $$,
  'SS001', null, 'cannot unlock an open bill');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.settlements where bill_id = tests.b1()), 0,
  'unlock deleted the settlements');
select is((select count(*)::int from public.audit_log
           where bill_id = tests.b1() and action = 'settlements.delete'
             and reason = 'unlock_bill: settlements voided'),
          2, 'voided settlements are audit-logged');

-- A bill created long ago but unlocked just now must not be archived: open
-- bills go stale by their last status change (updated_at), not created_at.
-- (Backdating created_at needs the state-machine trigger off for one statement.)
alter table public.bills disable trigger t10_state_machine;
update public.bills set created_at = now() - interval '40 days' where id = tests.b1();
alter table public.bills enable trigger t10_state_machine;
select is(private.archive_old_bills(now()), 0, 'a just-unlocked old bill is not archived');
select is((select status::text from public.bills where id = tests.b1()), 'open', 'still open');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$ select public.lock_bill(tests.b1(), tests.amounts(1133, 927), 0) $$,
  'host can lock again after unlocking');

-- ------------------------------------------------------------- audit log ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select is_empty($$ select 1 from public.audit_log $$, 'guests cannot read the audit log');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select ok((select count(*) from public.audit_log where bill_id = tests.b1()) > 0,
  'host can read the audit log of their own bill');
select throws_ok($$ update public.audit_log set action = 'tampered' $$,
  '42501', null, 'authenticated users cannot update audit_log');
select throws_ok($$ delete from public.audit_log $$,
  '42501', null, 'authenticated users cannot delete audit_log');
select throws_ok($$ insert into public.audit_log (table_name, action) values ('bills', 'forged') $$,
  '42501', null, 'authenticated users cannot forge audit rows');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.audit_log
           where bill_id = tests.b1() and action = 'bills.status_change'),
          4, 'status changes audited: open, locked, unlocked, locked');
select is((select actor_id from public.audit_log
           where bill_id = tests.b1() and action = 'bills.status_change'
           order by id limit 1),
          '11111111-1111-4111-8111-111111111111'::uuid, 'audit records who made the change');
select is((select reason from public.audit_log
           where bill_id = tests.b1() and action = 'bills.status_change'
           order by id limit 1),
          'publish_bill', 'audit records which RPC made the change');
select ok(not exists (select 1 from public.audit_log
                      where table_name = 'participants'
                        and (before ? 'display_name' or after ? 'display_name'
                             or before ? 'user_id' or after ? 'user_id')),
          'participant display names and user ids never reach the audit log');
select throws_ok($$ update public.audit_log set action = 'tampered' $$,
  'SS012', null, 'even the table owner cannot update audit_log (trigger)');
select throws_ok($$ delete from public.audit_log $$,
  'SS012', null, 'even the table owner cannot delete audit_log rows (trigger)');
select throws_ok($$ truncate public.audit_log $$,
  'SS012', null, 'audit_log cannot be truncated');

-- ------------------------------------------------------------- retention ---
select is(private.archive_old_bills(now() + interval '31 days'), 1,
  'retention archives the bill 30+ days after lock');
select is((select status::text from public.bills where id = tests.b1()), 'archived', 'bill archived');
select results_eq($$
  select display_name from public.participants
  where bill_id = current_setting('test.b1')::uuid and not is_host
  order by join_order
$$, $$ values ('Guest 1'::text), ('Guest 2'::text) $$, 'guest names are anonymized');
select is((select count(*)::int from public.participants
           where bill_id = tests.b1() and not is_host and user_id is not null),
          0, 'guest accounts are unlinked from archived bills');
select is(private.archive_old_bills(now() + interval '31 days'), 0, 'retention is idempotent');
select is((select reason from public.audit_log
           where bill_id = tests.b1() and action = 'bills.status_change'
           order by id desc limit 1),
          'retention: auto-archive after 30 days', 'archival is audited with a reason');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select is_empty($$ select 1 from public.bills $$, 'the guest link stops working once archived');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select is((select count(*)::int from public.bills where id = tests.b1()), 1,
  'host can still read the archived bill');
select throws_ok($$ select private.archive_old_bills() $$,
  '42501', null, 'users cannot call the retention job');

-- ------------------------------------------------ idempotent publish ---
reset role;
insert into auth.users (id, aud, role, email) values
  ('77777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated', 'host2@example.test');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select set_config('test.k1_first', r.bill_id::text, true)
from public.publish_bill($j${"client_key":"c2000000-0000-4000-8000-000000000002",
  "host_display_name":"Hana","items":[{"name":"Tea","price_cents":100}]}$j$::jsonb) r;
select set_config('test.k1_second', r.bill_id::text, true)
from public.publish_bill($j${"client_key":"c2000000-0000-4000-8000-000000000002",
  "host_display_name":"Hana","items":[{"name":"Tea","price_cents":100}]}$j$::jsonb) r;
select is(current_setting('test.k1_second'), current_setting('test.k1_first'),
  'publish_bill: same client_key twice returns the same bill');
select is((select count(*)::int from public.bills
           where client_key = 'c2000000-0000-4000-8000-000000000002'), 1,
  'publish_bill: retry created no second bill');
select is((select count(*)::int from public.line_items
           where bill_id = current_setting('test.k1_first')::uuid), 1,
  'publish_bill: retry created no extra items');
select isnt((select r.bill_id from public.publish_bill($j${"client_key":"c3000000-0000-4000-8000-000000000003",
  "host_display_name":"Hana","items":[{"name":"Tea","price_cents":100}]}$j$::jsonb) r),
  current_setting('test.k1_first')::uuid, 'publish_bill: a different client_key creates a new bill');
select throws_ok($$
  select * from public.publish_bill($j${"host_display_name":"Hana","items":[{"name":"Tea","price_cents":100}]}$j$::jsonb)
$$, '22023', null, 'publish_bill: client_key is required');

select tests.act_as('77777777-7777-4777-8777-777777777777', false);
select isnt((select r.bill_id from public.publish_bill($j${"client_key":"c2000000-0000-4000-8000-000000000002",
  "host_display_name":"Hal","items":[{"name":"Tea","price_cents":100}]}$j$::jsonb) r),
  current_setting('test.k1_first')::uuid, 'publish_bill: another host''s identical client_key is independent');

reset role;
select tests.act_as_system();
select is((select count(*)::int from public.bills
           where client_key = 'c2000000-0000-4000-8000-000000000002'), 2,
  'one bill per (host, client_key)');

select * from finish();
rollback;
