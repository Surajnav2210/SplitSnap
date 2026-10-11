-- pgTAP tests for supabase/migrations/0002_participant_handles.sql (guest Venmo handles).
-- Run the same way as rls_test.sql (local Supabase CLI: supabase db reset && supabase test db).
-- Everything runs in one transaction and is rolled back at the end.

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

create function tests.b1() returns uuid
language sql stable as $$ select current_setting('test.b1')::uuid $$;

create function tests.pid(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.participants p
  where p.bill_id = tests.b1() and p.user_id = p_user
$$;

-- Bypasses RLS: the stored handle (NULL if no row).
create function tests.handle(p_pid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select h.venmo_handle from public.participant_handles h where h.participant_id = p_pid
$$;

create function tests.handle_rows(p_pid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.participant_handles h where h.participant_id = p_pid
$$;

-- People
--   host     11111111-1111-4111-8111-111111111111  (Google)
--   guest 1  22222222-2222-4222-8222-222222222222  (anonymous)
--   guest 2  33333333-3333-4333-8333-333333333333  (anonymous)
--   outsider 44444444-4444-4444-8444-444444444444  (anonymous, never joins)
--   guest 3  55555555-5555-4555-8555-555555555555  (anonymous, removed by the host)
insert into auth.users (id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'host@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', null),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', null),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', null),
  ('55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', null);

-- ------------------------------------------------------------------ setup ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select set_config('test.b1', r.bill_id::text, true),
       set_config('test.b1_code', r.share_code, true)
from public.publish_bill($j${"client_key":"d1000000-0000-4000-8000-000000000001",
  "merchant":"Cafe","host_display_name":"Hana",
  "items":[{"name":"Tea","price_cents":100}]}$j$::jsonb) r;

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select isnt((select j.participant_id from public.join_bill(current_setting('test.b1_code'), 'Gia') j), null, 'guest 1 joins');
select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select isnt((select j.participant_id from public.join_bill(current_setting('test.b1_code'), 'Gus') j), null, 'guest 2 joins');
select tests.act_as('55555555-5555-4555-8555-555555555555', true);
select isnt((select j.participant_id from public.join_bill(current_setting('test.b1_code'), 'Lee') j), null, 'guest 3 joins');

-- ------------------------------------------------------- guest sets own ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select lives_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), 'gia-venmo-77') $$,
  'guest sets their own Venmo handle');
select is((select venmo_handle from public.participant_handles), 'gia-venmo-77', 'guest reads their own handle');
select lives_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), '@gia.venmo-77') $$,
  'guest updates their handle with a leading @');
select is(tests.handle(tests.pid('22222222-2222-4222-8222-222222222222')), 'gia.venmo-77', 'leading @ is stripped');
select throws_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), 'bad handle!') $$,
  '22023', null, 'invalid characters rejected');
select throws_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), repeat('a', 65)) $$,
  '22023', null, 'handles longer than 64 characters rejected');
select throws_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), '@') $$,
  '22023', null, 'a lone @ is rejected');
select is(tests.handle(tests.pid('22222222-2222-4222-8222-222222222222')), 'gia.venmo-77', 'rejected writes changed nothing');
select throws_ok($$
  insert into public.participant_handles (participant_id, bill_id, venmo_handle)
  values (tests.pid('22222222-2222-4222-8222-222222222222'), tests.b1(), 'direct')
$$, '42501', null, 'no direct inserts (RPC only)');
select throws_ok($$ update public.participant_handles set venmo_handle = 'direct' $$,
  '42501', null, 'no direct updates (RPC only)');

-- ---------------------------------------------- other guests are blocked ---
select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select throws_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), 'hijack') $$,
  '42501', null, 'another guest cannot set someone else''s handle');
select is_empty($$ select 1 from public.participant_handles $$,
  'another guest cannot read someone else''s handle');

-- ---------------------------------------------------- host sets a guest's ---
select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$ select public.set_participant_venmo(tests.pid('33333333-3333-4333-8333-333333333333'), 'gus-venmo-77') $$,
  'host sets a guest''s handle');
select is((select count(*)::int from public.participant_handles), 2, 'host reads all handles on their bill');

select tests.act_as('33333333-3333-4333-8333-333333333333', true);
select results_eq($$ select venmo_handle from public.participant_handles $$,
  $$ values ('gus-venmo-77'::text) $$, 'guest 2 sees only their own handle');

-- --------------------------------------------------------- non-participant ---
select tests.act_as('44444444-4444-4444-8444-444444444444', true);
select is_empty($$ select 1 from public.participant_handles $$, 'non-participant reads nothing');
select throws_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), 'hijack') $$,
  '42501', null, 'non-participant cannot set a handle');
select throws_ok($$ select public.set_participant_venmo('00000000-0000-4000-8000-000000000000', 'x') $$,
  'P0002', null, 'unknown participant');

-- ------------------------------------------------------------------- clear ---
select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select lives_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), '') $$,
  'empty string clears the handle');
select is(tests.handle_rows(tests.pid('22222222-2222-4222-8222-222222222222')), 0, 'handle row removed');
select lives_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), null) $$,
  'clearing again (NULL) is a no-op');
select lives_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), 'gia-venmo-77') $$,
  'guest sets the handle again');

-- ------------------------------------------- cascade on participant removal ---
select tests.act_as('55555555-5555-4555-8555-555555555555', true);
select lives_ok($$ select public.set_participant_venmo(tests.pid('55555555-5555-4555-8555-555555555555'), 'lee-venmo-77') $$,
  'guest 3 sets a handle');
select set_config('test.g3_pid', tests.pid('55555555-5555-4555-8555-555555555555')::text, true);

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select lives_ok($$ select public.remove_participant(current_setting('test.g3_pid')::uuid) $$,
  'host removes guest 3');
select is(tests.handle_rows(current_setting('test.g3_pid')::uuid), 0,
  'removing a participant deletes their handle (cascade)');

-- ------------------------------------------------------------ locked bill ---
select lives_ok($$
  insert into public.claims (line_item_id, participant_id, bill_id)
  select li.id, tests.pid('22222222-2222-4222-8222-222222222222'), tests.b1()
  from public.line_items li where li.bill_id = tests.b1()
$$, 'host assigns the only item to guest 1');
select lives_ok($$
  select public.lock_bill(tests.b1(), jsonb_build_array(
    jsonb_build_object('participant_id', tests.pid('22222222-2222-4222-8222-222222222222'), 'amount_cents', 100),
    jsonb_build_object('participant_id', tests.pid('33333333-3333-4333-8333-333333333333'), 'amount_cents', 0)),
    0)
$$, 'host locks the bill');

select tests.act_as('22222222-2222-4222-8222-222222222222', true);
select lives_ok($$ select public.set_participant_venmo(tests.pid('22222222-2222-4222-8222-222222222222'), 'gia-locked-77') $$,
  'guest can still set their handle on a locked bill');
select is(tests.handle(tests.pid('22222222-2222-4222-8222-222222222222')), 'gia-locked-77', 'handle updated while locked');

-- ------------------------------------------------------------------ audit ---
reset role;
select tests.act_as_system();
select ok((select count(*) from public.audit_log where table_name = 'participant_handles') >= 4,
  'handle changes are audit-logged');
select ok(not exists (select 1 from public.audit_log
                      where table_name = 'participant_handles'
                        and (before ? 'venmo_handle' or after ? 'venmo_handle')),
  'audit rows carry no venmo_handle field');
select ok(not exists (select 1 from public.audit_log
                      where coalesce(before::text, '') like '%venmo-77%'
                         or coalesce(after::text, '') like '%venmo-77%'
                         or coalesce(before::text, '') like '%locked-77%'
                         or coalesce(after::text, '') like '%locked-77%'),
  'no handle value appears anywhere in the audit log');

-- -------------------------------------------------------------- retention ---
select set_config('test.g1_pid', tests.pid('22222222-2222-4222-8222-222222222222')::text, true);
select set_config('test.g2_pid', tests.pid('33333333-3333-4333-8333-333333333333')::text, true);
select is(private.archive_old_bills(now() + interval '31 days'), 1, 'retention archives the bill');
select is((select count(*)::int from public.participant_handles where bill_id = tests.b1()), 0,
  'retention deletes handles of archived bills');
select is((select display_name from public.participants where id = current_setting('test.g1_pid')::uuid),
  'Guest 1', 'retention still anonymizes guest names');

select tests.act_as('11111111-1111-4111-8111-111111111111', false);
select throws_ok($$ select public.set_participant_venmo(current_setting('test.g2_pid')::uuid, 'gus-again') $$,
  'SS001', null, 'handles cannot be set on an archived bill');

select * from finish();
rollback;
