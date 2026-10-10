-- SplitSnap initial schema: shareable live bills (Supabase Postgres). Overview: docs/data-model.md
--
-- AUTH MODEL
--   * Hosts sign in with Google (Supabase Auth) only when they share a bill.
--     Solo mode (splitting on one phone) never touches the database.
--   * Guests use Supabase ANONYMOUS SIGN-INS: the browser calls
--     supabase.auth.signInAnonymously(), which creates a real auth.users row and
--     a JWT with role = 'authenticated' and claim is_anonymous = true.
--     Every participant therefore has an auth.uid() that RLS can use directly;
--     there are no hand-rolled guest tokens (this replaces SPEC §9's token idea).
--   * Tradeoffs: anonymous users count toward Supabase MAU (free tier 50k);
--     anonymous sign-in must be enabled in the dashboard (CAPTCHA recommended);
--     old anonymous users need periodic cleanup; a guest who clears storage
--     gets a new uid and must re-join. Upside: a guest can later link Google
--     and keep the same uid.
--   * Anonymous users can never publish bills or own a profile
--     (private.is_permanent_user() checks the is_anonymous claim).
--
-- WRITE PATHS
--   All state changes that matter go through the RPC functions below
--   (publish_bill, join_bill, lock_bill, unlock_bill, leave_bill,
--   remove_participant, set_settlement_status, upsert_profile). Direct table
--   writes are limited to: claims (insert/delete), the host editing
--   items/adjustments while open, and a participant renaming themself.
--
-- MONEY: integer cents in bigint only. Single inputs are capped at
-- 999_999_999 (matches src/core/parse.ts MAX_INPUT_CENTS); computed amounts at
-- 9_007_199_254_740_991 (Number.MAX_SAFE_INTEGER, the TS core uses `number`).
-- Line items and adjustments inherit the bill's currency; settlements carry
-- their own currency column, tied to the bill's by a composite foreign key.
--
-- TIME: every timestamp is timestamptz (an absolute instant, shown in UTC).
--
-- WHO COMPUTES WHAT: shares are computed by src/core/split.ts. The database
-- enforces who may change what and when, and checks at lock time that the
-- submitted amounts add up exactly to the bill total.
--
-- ERROR CODES (stable; the app maps them to messages):
--   28000 not signed in              42501 not allowed (wrong user / anonymous)
--   P0002 not found / no open bill   22023 invalid input
--   SS001 wrong bill status for this operation
--   SS002 illegal bill status transition
--   SS003 bill is locked/archived: items, adjustments, claims are frozen
--   SS004 unclaimed items at lock    SS005 amounts don't add up to the bill total
--   SS006 amounts don't list exactly the bill's guests
--   SS007 someone already marked paid (unlock blocked)
--   SS008 bill is full (50 people)   SS009 the host cannot leave or be removed
--   SS010 illegal settlement status change for this user
--   SS011 discounts exceed items total
--   SS012 immutable field / append-only row

-- -----------------------------------------------------------------------------
-- Extensions and schemas
-- -----------------------------------------------------------------------------
-- pgcrypto (gen_random_bytes) ships in the "extensions" schema on Supabase.
create extension if not exists pgcrypto with schema extensions;

-- "private" is not exposed through the Supabase API, so nothing in it can be
-- called as an RPC.
create schema if not exists private;
revoke all on schema private from public;
-- Functions created here later are not executable by PUBLIC by default.
alter default privileges in schema private revoke execute on functions from public;
grant usage on schema private to authenticated; -- RLS policies call helpers

-- -----------------------------------------------------------------------------
-- Enums (explicit state machines; SPEC §7)
-- -----------------------------------------------------------------------------
create type public.bill_status       as enum ('draft', 'open', 'locked', 'archived');
create type public.line_item_source  as enum ('ai', 'manual');
create type public.adjustment_kind   as enum ('tax', 'tip', 'fee', 'discount');
create type public.settlement_status as enum ('unpaid', 'marked_paid', 'confirmed');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Hosts only. Written via upsert_profile(). Handles are stored normalized,
-- without the leading @ / $ / paypal.me/ (same rule as src/core/paymentLinks.ts).
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null,
  venmo_handle   text,
  paypal_handle  text,
  cashapp_handle text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_venmo_format   check (venmo_handle   ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint profiles_paypal_format  check (paypal_handle  ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint profiles_cashapp_format check (cashapp_handle ~ '^[A-Za-z0-9._-]{1,64}$')
);

create table public.bills (
  id          uuid primary key default gen_random_uuid(),
  -- Always generated by trigger: 10 chars from a 32-symbol alphabet
  -- (50 random bits). The only way in for a guest is join_bill(share_code).
  share_code  text not null,
  host_id     uuid not null references auth.users (id) on delete cascade,
  merchant    text,
  status      public.bill_status not null default 'draft',
  currency    char(3) not null default 'USD',
  -- Host payment handles copied from the profile at lock time, so the
  -- payment buttons can't change after amounts are frozen. Cleared on unlock.
  host_venmo_handle   text,
  host_paypal_handle  text,
  host_cashapp_handle text,
  -- v1.1 groups (SPEC §14). No FK yet; always NULL in v1.
  group_id    uuid,
  -- Chosen by the host's app once per "share" action; makes publish_bill
  -- idempotent (a retried publish returns the same bill).
  client_key  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  locked_at   timestamptz,
  archived_at timestamptz,
  constraint bills_share_code_key unique (share_code),
  constraint bills_share_code_format check (share_code ~ '^[a-km-np-z2-9]{10}$'),
  constraint bills_merchant_len check (merchant is null or char_length(btrim(merchant)) between 1 and 100),
  constraint bills_currency_format check (currency ~ '^[A-Z]{3}$'),
  -- v1 is USD only (SPEC §4). Drop this one constraint for multi-currency.
  constraint bills_currency_v1_usd_only check (currency = 'USD'),
  constraint bills_venmo_format   check (host_venmo_handle   ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint bills_paypal_format  check (host_paypal_handle  ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint bills_cashapp_format check (host_cashapp_handle ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint bills_locked_has_timestamp check (status <> 'locked' or locked_at is not null),
  constraint bills_archived_has_timestamp check (status <> 'archived' or archived_at is not null),
  -- Lets settlements reference (bill, currency) so their currency can't drift.
  constraint bills_id_currency_key unique (id, currency),
  constraint bills_host_client_key_key unique (host_id, client_key)
);

-- price_cents is the LINE total as printed ("3 x Beer  $18.00" -> 1800,
-- quantity 3), matching computeSplit(), which treats each row as one claimable
-- amount. Splitting into single units = replacing the row with N rows.
create table public.line_items (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references public.bills (id) on delete cascade,
  name        text not null,
  price_cents bigint not null,
  quantity    integer not null default 1,
  source      public.line_item_source not null default 'manual',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint line_items_name_len check (char_length(btrim(name)) between 1 and 100),
  constraint line_items_price_range check (price_cents between 0 and 999999999),
  constraint line_items_quantity_range check (quantity between 1 and 999),
  constraint line_items_position_nonneg check (position >= 0),
  constraint line_items_id_bill_key unique (id, bill_id) -- target of claims composite FK
);

-- Discounts are stored as a POSITIVE amount and subtracted (same convention
-- as computeSplit's adjustments).
create table public.bill_adjustments (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references public.bills (id) on delete cascade,
  kind         public.adjustment_kind not null,
  amount_cents bigint not null,
  label        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint bill_adjustments_amount_range check (amount_cents between 0 and 999999999),
  constraint bill_adjustments_label_len check (label is null or char_length(label) <= 100)
);

-- One row per person on a bill, including the host (join_order 1).
create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references public.bills (id) on delete cascade,
  -- NULL after retention anonymization or if the auth user is deleted.
  user_id      uuid references auth.users (id) on delete set null,
  display_name text not null,
  is_host      boolean not null default false,
  -- Per-bill join order: host = 1, then 2, 3, ... assigned under a lock on the
  -- bill row. Deterministic tie-break for leftover cents (SPEC §6). Gaps are
  -- possible after someone leaves; only the relative order matters.
  join_order   integer not null,
  joined_at    timestamptz not null default now(),
  constraint participants_display_name_len check (char_length(btrim(display_name)) between 1 and 50),
  constraint participants_join_order_positive check (join_order >= 1),
  constraint participants_bill_user_key unique (bill_id, user_id),
  constraint participants_bill_join_order_key unique (bill_id, join_order),
  constraint participants_id_bill_key unique (id, bill_id) -- target of composite FKs
);

-- Primary key (line_item_id, participant_id) makes claiming idempotent:
-- insert with ON CONFLICT DO NOTHING, so a double tap or retry is a no-op.
-- bill_id is denormalized for cheap RLS and Realtime filtering; the composite
-- FKs guarantee the item and the participant belong to that same bill.
create table public.claims (
  line_item_id   uuid not null,
  participant_id uuid not null,
  bill_id        uuid not null,
  created_at     timestamptz not null default now(),
  primary key (line_item_id, participant_id),
  constraint claims_line_item_fk foreign key (line_item_id, bill_id)
    references public.line_items (id, bill_id) on delete cascade,
  constraint claims_participant_fk foreign key (participant_id, bill_id)
    references public.participants (id, bill_id) on delete cascade
);

-- What each guest owes the host. Created only by lock_bill (amounts computed
-- by src/core/split.ts and checked to sum to the bill total). Status is
-- self-reported; we never move money.
create table public.settlements (
  id              uuid primary key default gen_random_uuid(),
  bill_id         uuid not null,
  participant_id  uuid not null,
  amount_cents    bigint not null,
  currency        char(3) not null default 'USD',
  status          public.settlement_status not null default 'unpaid',
  -- 'lock:<bill_id>:<participant_id>': a retried lock can never double-create.
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  marked_paid_at  timestamptz,
  confirmed_at    timestamptz,
  constraint settlements_amount_range check (amount_cents between 0 and 9007199254740991),
  constraint settlements_idempotency_key_len check (char_length(idempotency_key) between 8 and 200),
  constraint settlements_idempotency_key_key unique (idempotency_key),
  constraint settlements_bill_participant_key unique (bill_id, participant_id),
  constraint settlements_bill_fk foreign key (bill_id, currency)
    references public.bills (id, currency) on delete cascade,
  constraint settlements_participant_fk foreign key (participant_id, bill_id)
    references public.participants (id, bill_id)
);

-- Append-only audit trail, written only by triggers. No foreign keys on
-- purpose: history must outlive the bill or user it describes. Participant
-- display names are stripped before logging (no PII in logs).
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,          -- auth.uid() of the caller; NULL = system (cron / service role)
  bill_id     uuid,
  table_name  text not null,
  action      text not null, -- e.g. 'bills.status_change', 'claims.insert', 'settlements.delete'
  before      jsonb,
  after       jsonb,
  reason      text           -- which RPC / job made the change (splitsnap.audit_reason)
);

-- -----------------------------------------------------------------------------
-- Indexes (foreign keys, share_code, RLS lookups, retention scans)
-- -----------------------------------------------------------------------------
-- share_code: covered by unique constraint bills_share_code_key.
create index bills_host_id_idx            on public.bills (host_id);
create index bills_group_id_idx           on public.bills (group_id) where group_id is not null;
create index bills_retention_locked_idx   on public.bills (locked_at)  where status = 'locked';
create index bills_retention_stale_idx    on public.bills (updated_at) where status in ('draft', 'open');
create index line_items_bill_position_idx on public.line_items (bill_id, position);
create index bill_adjustments_bill_id_idx on public.bill_adjustments (bill_id);
-- participants (bill_id, ...) covered by participants_bill_user_key.
create index participants_user_id_idx     on public.participants (user_id);
create unique index participants_one_host_per_bill on public.participants (bill_id) where is_host;
-- claims (line_item_id, ...) covered by the primary key.
create index claims_bill_id_idx           on public.claims (bill_id);
create index claims_participant_bill_idx  on public.claims (participant_id, bill_id);
create index claims_line_item_bill_idx    on public.claims (line_item_id, bill_id);
-- settlements (bill_id, ...) covered by settlements_bill_participant_key.
create index settlements_participant_bill_idx on public.settlements (participant_id, bill_id);
create index audit_log_bill_occurred_idx  on public.audit_log (bill_id, occurred_at);

-- -----------------------------------------------------------------------------
-- Small helpers
-- -----------------------------------------------------------------------------

-- True for Google (non-anonymous) users only.
create function private.is_permanent_user()
returns boolean
language sql stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
$$;

-- True if j is a JSON integer (no fraction/exponent text) between lo and hi.
-- CASE guarantees the cast only runs on validated text.
create function private.json_int_between(j jsonb, lo numeric, hi numeric)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case
           when j is not null
                and jsonb_typeof(j) = 'number'
                and (j #>> '{}') ~ '^-?[0-9]{1,18}$'
           then (j #>> '{}')::numeric between lo and hi
           else false
         end
$$;

-- Transaction-local note picked up by the audit trigger ('' clears it).
create function private.set_audit_reason(p_reason text)
returns void
language sql volatile
set search_path = ''
as $$
  select set_config('splitsnap.audit_reason', coalesce(p_reason, ''), true);
$$;

-- 10 chars from a 32-symbol alphabet without l/o/0/1. 256 % 32 = 0, so
-- byte % 32 is unbiased: 50 random bits.
create function private.generate_share_code()
returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code  text := '';
begin
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS helper functions
-- SECURITY DEFINER so they can read bills/participants without recursing into
-- those tables' own policies. Policies use them as
--   bill_id in (select private.fn(...))
-- which runs once per query, not once per row (Supabase's documented
-- RLS performance pattern, together with (select auth.uid())).
-- -----------------------------------------------------------------------------

create function private.hosted_bill_ids(p_statuses public.bill_status[])
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select b.id
  from public.bills b
  where b.host_id = (select auth.uid())
    and b.status = any (p_statuses)
$$;

create function private.joined_bill_ids(p_statuses public.bill_status[])
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select p.bill_id
  from public.participants p
  join public.bills b on b.id = p.bill_id
  where p.user_id = (select auth.uid())
    and b.status = any (p_statuses)
$$;

-- Every bill I host (any status), plus bills I joined while open or locked.
-- Archived bills disappear for guests ("the guest link stops working").
create function private.readable_bill_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select b.id from public.bills b
  where b.host_id = (select auth.uid())
  union
  select p.bill_id
  from public.participants p
  join public.bills b on b.id = p.bill_id
  where p.user_id = (select auth.uid())
    and b.status in ('open', 'locked')
$$;

create function private.my_participant_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id from public.participants p where p.user_id = (select auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Trigger functions
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- BILL STATE MACHINE (SPEC §7). Allowed transitions:
--   draft  -> open       publish_bill (a bill is inserted as draft and opened
--                         in the same transaction)
--   open   -> locked     lock_bill (sets locked_at, keeps the handle snapshot)
--   locked -> open       unlock_bill, only if no settlement is marked_paid or
--                         confirmed (clears locked_at and the handle snapshot)
--   draft|open|locked -> archived   system only (retention job; open bills
--                         archive 30 days after their last status change)
-- Everything else raises SS002. Locked/archived bills are frozen (SS003):
-- only the status may change. Some columns are always immutable (SS012).
-- Clients have no UPDATE privilege on bills; only the RPCs change status.
create function private.bills_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_is_system boolean := (select auth.uid()) is null;
  v_mutable   text[]  := array['status', 'locked_at', 'archived_at', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    new.share_code          := private.generate_share_code();
    new.status              := 'draft';
    new.group_id            := null;   -- v1: groups don't exist yet
    new.host_venmo_handle   := null;
    new.host_paypal_handle  := null;
    new.host_cashapp_handle := null;
    new.created_at          := now();
    new.updated_at          := now();
    new.locked_at           := null;
    new.archived_at         := null;
    return new;
  end if;

  -- UPDATE
  if new.id         is distinct from old.id
     or new.host_id    is distinct from old.host_id
     or new.share_code is distinct from old.share_code
     or new.currency   is distinct from old.currency
     or new.created_at is distinct from old.created_at
     or new.client_key is distinct from old.client_key then
    raise exception 'bills: id, host_id, share_code, currency, client_key and created_at are immutable'
      using errcode = 'SS012';
  end if;

  if old.status in ('locked', 'archived')
     and (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'bills: bill is %, its fields are frozen', old.status
      using errcode = 'SS003';
  end if;

  -- Derived fields: never taken from the caller except as noted.
  new.locked_at   := old.locked_at;
  new.archived_at := old.archived_at;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'open' then
      null;
    elsif old.status = 'open' and new.status = 'locked' then
      new.locked_at := now();   -- handle snapshot comes from lock_bill's UPDATE
    elsif old.status = 'locked' and new.status = 'open' then
      if exists (select 1 from public.settlements s
                 where s.bill_id = old.id and s.status <> 'unpaid') then
        raise exception 'bills: cannot unlock, someone has already marked paid'
          using errcode = 'SS007';
      end if;
      new.locked_at           := null;
      new.host_venmo_handle   := null;
      new.host_paypal_handle  := null;
      new.host_cashapp_handle := null;
    elsif new.status = 'archived' and old.status in ('draft', 'open', 'locked') and v_is_system then
      new.archived_at := now();
    else
      raise exception 'bills: illegal status transition % -> %', old.status, new.status
        using errcode = 'SS002';
    end if;
  end if;

  -- The handle snapshot may only change on open -> locked (set) or
  -- locked -> open (cleared above).
  if not (old.status = 'open' and new.status = 'locked')
     and not (old.status = 'locked' and new.status = 'open') then
    new.host_venmo_handle   := old.host_venmo_handle;
    new.host_paypal_handle  := old.host_paypal_handle;
    new.host_cashapp_handle := old.host_cashapp_handle;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Guard for line_items, bill_adjustments, claims:
--   * nothing changes while the bill is locked or archived (SS003)
--   * claims can only be ADDED while the bill is open (SS001)
--   * rows can't move to another bill (SS012)
--   * items/adjustments keep publish_bill's per-bill limits: at most 500 items,
--     at most 50 adjustments (22023), and total discount <= items total (SS011)
-- Claims take FOR SHARE on the bill row, which serializes with lock_bill /
-- join_bill (FOR UPDATE), so a claim can't slip in while the bill is being
-- locked. Item/adjustment writes take FOR UPDATE so the limit checks can't race.
create function private.guard_bill_child()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill_id     uuid;
  v_status      public.bill_status;
  v_row_id      uuid;
  v_new         jsonb;
  v_items       numeric;
  v_item_count  integer;
  v_discount    numeric;
  v_adj_count   integer;
begin
  if tg_op = 'UPDATE' then
    if new.bill_id is distinct from old.bill_id then
      raise exception '%: bill_id is immutable', tg_table_name using errcode = 'SS012';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_bill_id := old.bill_id;
  else
    v_bill_id := new.bill_id;
  end if;

  if tg_table_name = 'claims' then
    select b.status into v_status
    from public.bills b
    where b.id = v_bill_id
    for share;
  else
    select b.status into v_status
    from public.bills b
    where b.id = v_bill_id
    for update;
  end if;

  if found then
    if v_status in ('locked', 'archived') then
      raise exception '%: bill is %, items, adjustments and claims are frozen', tg_table_name, v_status
        using errcode = 'SS003';
    end if;
    if tg_table_name = 'claims' and tg_op = 'INSERT' and v_status <> 'open' then
      raise exception 'claims: bill is %, claiming is only possible while open', v_status
        using errcode = 'SS001';
    end if;

    -- Per-bill limits for items and adjustments. Totals exclude the row being
    -- written, then add its new values (INSERT/UPDATE).
    if tg_table_name in ('line_items', 'bill_adjustments')
       and (tg_op <> 'DELETE' or tg_table_name = 'line_items') then
      if tg_op = 'DELETE' then
        v_row_id := old.id;
        v_new    := null;
      else
        v_row_id := new.id;
        v_new    := to_jsonb(new);
      end if;

      select coalesce(sum(li.price_cents), 0), count(*) into v_items, v_item_count
      from public.line_items li
      where li.bill_id = v_bill_id
        and (tg_table_name <> 'line_items' or li.id is distinct from v_row_id);

      select coalesce(sum(a.amount_cents) filter (where a.kind = 'discount'), 0), count(*)
        into v_discount, v_adj_count
      from public.bill_adjustments a
      where a.bill_id = v_bill_id
        and (tg_table_name <> 'bill_adjustments' or a.id is distinct from v_row_id);

      if v_new is not null then
        if tg_table_name = 'line_items' then
          v_items      := v_items + (v_new ->> 'price_cents')::bigint;
          v_item_count := v_item_count + 1;
        else
          if v_new ->> 'kind' = 'discount' then
            v_discount := v_discount + (v_new ->> 'amount_cents')::bigint;
          end if;
          v_adj_count := v_adj_count + 1;
        end if;
      end if;

      if v_item_count > 500 then
        raise exception 'line_items: too many items on this bill (max 500)' using errcode = '22023';
      end if;
      if v_adj_count > 50 then
        raise exception 'bill_adjustments: too many adjustments on this bill (max 50)' using errcode = '22023';
      end if;
      if v_discount > v_items then
        raise exception '%: discounts (%) would exceed the items total (%)', tg_table_name, v_discount, v_items
          using errcode = 'SS011';
      end if;
    end if;
  end if;
  -- not found: the parent bill is being deleted in this same statement (FK
  -- cascade), or, for an INSERT, the FK check will reject the row.

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- SETTLEMENT STATE MACHINE (self-reported; we can't verify payments):
--   unpaid      -> marked_paid   the guest themself ("I've paid")
--   marked_paid -> unpaid        the guest themself (undo)
--   marked_paid -> confirmed     host ("Received")
--   unpaid      -> confirmed     host (paid in cash, guest never tapped "I've paid")
--   confirmed   -> marked_paid   host (undo a mistaken confirm)
--   confirmed   -> unpaid        host (undo a cash confirm)
-- Inserts: only by the host/system, while the bill is locked, status unpaid.
-- Deletes: only unpaid rows of a locked bill, by the host/system (unlock_bill).
-- After insert only the status can change (SS012).
create function private.settlements_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_is_system   boolean := (select auth.uid()) is null;
  v_bill_status public.bill_status;
  v_host_id     uuid;
  v_is_host     boolean;
  v_is_self     boolean;
  v_mutable     text[] := array['status', 'updated_at', 'marked_paid_at', 'confirmed_at'];
begin
  if tg_op = 'DELETE' then
    select b.status, b.host_id into v_bill_status, v_host_id
    from public.bills b
    where b.id = old.bill_id;
    if not found then
      return old;  -- cascade from a bill that is itself being deleted
    end if;
    if v_bill_status <> 'locked' or old.status <> 'unpaid'
       or not (v_is_system or v_uid = v_host_id) then
      raise exception 'settlements: only unpaid settlements of a locked bill can be voided, by the host'
        using errcode = 'SS012';
    end if;
    return old;
  end if;

  select b.status, b.host_id into v_bill_status, v_host_id
  from public.bills b
  where b.id = new.bill_id
  for share;

  if not found then
    raise exception 'settlements: bill not found' using errcode = 'P0002';
  end if;
  if v_bill_status <> 'locked' then
    raise exception 'settlements: bill must be locked (it is %)', v_bill_status
      using errcode = 'SS001';
  end if;

  v_is_host := v_uid is not null and v_uid = v_host_id;
  v_is_self := v_uid is not null and exists (
    select 1 from public.participants p
    where p.id = new.participant_id and p.user_id = v_uid
  );

  if tg_op = 'INSERT' then
    if not (v_is_host or v_is_system) then
      raise exception 'settlements: only the host creates settlements' using errcode = '42501';
    end if;
    if exists (select 1 from public.participants p
               where p.id = new.participant_id and p.is_host) then
      raise exception 'settlements: the host does not owe themselves' using errcode = 'SS006';
    end if;
    if new.status <> 'unpaid' then
      raise exception 'settlements: new settlements start unpaid' using errcode = 'SS010';
    end if;
    new.created_at     := now();
    new.updated_at     := now();
    new.marked_paid_at := null;
    new.confirmed_at   := null;
    return new;
  end if;

  -- UPDATE
  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'settlements: only status can change' using errcode = 'SS012';
  end if;

  new.marked_paid_at := old.marked_paid_at;
  new.confirmed_at   := old.confirmed_at;

  if new.status is distinct from old.status then
    if old.status = 'unpaid' and new.status = 'marked_paid' and (v_is_self or v_is_system) then
      new.marked_paid_at := now();
    elsif old.status = 'marked_paid' and new.status = 'unpaid' and (v_is_self or v_is_system) then
      new.marked_paid_at := null;
    elsif old.status in ('unpaid', 'marked_paid') and new.status = 'confirmed' and (v_is_host or v_is_system) then
      new.confirmed_at := now();
    elsif old.status = 'confirmed' and new.status = 'marked_paid' and (v_is_host or v_is_system) then
      new.confirmed_at := null;
    elsif old.status = 'confirmed' and new.status = 'unpaid' and (v_is_host or v_is_system) then
      new.confirmed_at   := null;
      new.marked_paid_at := null;
    else
      raise exception 'settlements: % -> % is not allowed for this user', old.status, new.status
        using errcode = 'SS010';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Generic audit writer. Trigger arguments name columns to strip before
-- logging (keeps participant display names out of the log).
create function private.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_strip  text[] := coalesce(tg_argv, '{}'::text[]);
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
  v_action text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old) - v_strip;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new) - v_strip;
  end if;
  if tg_op = 'UPDATE' and v_before = v_after then
    return null; -- nothing auditable changed
  end if;

  v_row    := coalesce(v_after, v_before);
  v_action := tg_table_name || '.' || lower(tg_op);
  if tg_table_name = 'bills' and tg_op = 'UPDATE'
     and (v_before ->> 'status') is distinct from (v_after ->> 'status') then
    v_action := 'bills.status_change';
  end if;

  insert into public.audit_log (actor_id, bill_id, table_name, action, before, after, reason)
  values (
    (select auth.uid()),
    case when tg_table_name = 'bills' then (v_row ->> 'id')::uuid
         else (v_row ->> 'bill_id')::uuid end,
    tg_table_name,
    v_action,
    v_before,
    v_after,
    nullif(current_setting('splitsnap.audit_reason', true), '')
  );
  return null;
end;
$$;

-- audit_log is append-only. (A superuser can still disable triggers; this
-- protects against app bugs and API callers, not a rogue database admin.)
create function private.audit_log_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only (% is not allowed)', tg_op using errcode = 'SS012';
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers. Same-timing triggers fire in name order, hence the tNN_ prefixes.
-- -----------------------------------------------------------------------------
create trigger t10_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger t10_state_machine before insert or update on public.bills
  for each row execute function private.bills_before_write();
create trigger t90_audit after insert or update or delete on public.bills
  for each row execute function private.audit_row();

create trigger t10_guard before insert or update or delete on public.line_items
  for each row execute function private.guard_bill_child();
create trigger t20_set_updated_at before update on public.line_items
  for each row execute function private.set_updated_at();
create trigger t90_audit after insert or update or delete on public.line_items
  for each row execute function private.audit_row();

create trigger t10_guard before insert or update or delete on public.bill_adjustments
  for each row execute function private.guard_bill_child();
create trigger t20_set_updated_at before update on public.bill_adjustments
  for each row execute function private.set_updated_at();
create trigger t90_audit after insert or update or delete on public.bill_adjustments
  for each row execute function private.audit_row();

create trigger t10_guard before insert or update or delete on public.claims
  for each row execute function private.guard_bill_child();
create trigger t90_audit after insert or update or delete on public.claims
  for each row execute function private.audit_row();

-- Join/leave/remove is audited; display name and auth user id are stripped
-- so retention anonymization isn't undone by the audit log.
create trigger t90_audit after insert or delete on public.participants
  for each row execute function private.audit_row('display_name', 'user_id');

create trigger t10_state_machine before insert or update or delete on public.settlements
  for each row execute function private.settlements_before_write();
create trigger t90_audit after insert or update or delete on public.settlements
  for each row execute function private.audit_row();

create trigger t10_append_only before update or delete on public.audit_log
  for each row execute function private.audit_log_block_mutation();
create trigger t10_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_block_mutation();

-- =============================================================================
-- RPC API (called with supabase.rpc(name, { p_... })). Signatures are a
-- contract with the app; see docs/data-model.md "API (RPC) reference".
-- All are SECURITY DEFINER with an empty search_path and check the caller
-- themselves. "#variable_conflict use_column" avoids clashes between
-- RETURNS TABLE column names and table columns.
-- =============================================================================

-- 1. publish_bill: a signed-in (Google) host shares a bill. Creates the bill,
--    items, adjustments and the host participant (join_order 1), and opens it.
--    Idempotent per (host, p_bill.client_key): if that bill already exists
--    (any status) its id and share code are returned and nothing is created.
create function public.publish_bill(p_bill jsonb)
returns table (bill_id uuid, share_code text)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid         uuid := (select auth.uid());
  v_items       jsonb;
  v_adjustments jsonb;
  v_item        jsonb;
  v_adj         jsonb;
  v_merchant    text;
  v_currency    text;
  v_host_name   text;
  v_items_total bigint := 0;
  v_discount    bigint := 0;
  v_bill_id     uuid;
  v_share_code  text;
  v_client_key  uuid;
begin
  if v_uid is null then
    raise exception 'publish_bill: not signed in' using errcode = '28000';
  end if;
  if not private.is_permanent_user() then
    raise exception 'publish_bill: sign in with Google to share a bill' using errcode = '42501';
  end if;
  if p_bill is null or jsonb_typeof(p_bill) <> 'object' then
    raise exception 'publish_bill: p_bill must be a JSON object' using errcode = '22023';
  end if;

  -- merchant: string or null
  if p_bill -> 'merchant' is null or jsonb_typeof(p_bill -> 'merchant') = 'null' then
    v_merchant := null;
  elsif jsonb_typeof(p_bill -> 'merchant') = 'string' then
    v_merchant := nullif(btrim(p_bill ->> 'merchant'), '');
    if char_length(v_merchant) > 100 then
      raise exception 'publish_bill: merchant must be at most 100 characters' using errcode = '22023';
    end if;
  else
    raise exception 'publish_bill: merchant must be a string or null' using errcode = '22023';
  end if;

  -- client_key: required uuid string (idempotency key for this publish)
  if jsonb_typeof(p_bill -> 'client_key') is distinct from 'string'
     or (p_bill ->> 'client_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'publish_bill: client_key (uuid) is required' using errcode = '22023';
  end if;
  v_client_key := (p_bill ->> 'client_key')::uuid;

  -- currency: v1 is USD only
  v_currency := coalesce(p_bill ->> 'currency', 'USD');
  if v_currency <> 'USD' then
    raise exception 'publish_bill: only USD is supported' using errcode = '22023';
  end if;

  -- host display name
  if jsonb_typeof(p_bill -> 'host_display_name') is distinct from 'string' then
    raise exception 'publish_bill: host_display_name is required' using errcode = '22023';
  end if;
  v_host_name := btrim(p_bill ->> 'host_display_name');
  if char_length(v_host_name) not between 1 and 50 then
    raise exception 'publish_bill: host_display_name must be 1-50 characters' using errcode = '22023';
  end if;

  -- items: 1..500
  v_items := p_bill -> 'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'publish_bill: at least one item is required' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 500 then
    raise exception 'publish_bill: too many items (max 500)' using errcode = '22023';
  end if;

  -- adjustments: optional, 0..50
  v_adjustments := p_bill -> 'adjustments';
  if v_adjustments is null or jsonb_typeof(v_adjustments) = 'null' then
    v_adjustments := '[]'::jsonb;
  end if;
  if jsonb_typeof(v_adjustments) <> 'array' or jsonb_array_length(v_adjustments) > 50 then
    raise exception 'publish_bill: adjustments must be an array (max 50)' using errcode = '22023';
  end if;

  for v_item in select e.value from jsonb_array_elements(v_items) as e(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'name') is distinct from 'string'
       or char_length(btrim(v_item ->> 'name')) not between 1 and 100
       or not private.json_int_between(v_item -> 'price_cents', 0, 999999999)
       or (v_item ? 'quantity' and not private.json_int_between(v_item -> 'quantity', 1, 999))
       or (v_item ? 'position' and not private.json_int_between(v_item -> 'position', 0, 2147483647))
       or (v_item ? 'source' and coalesce(v_item ->> 'source', '') not in ('ai', 'manual'))
    then
      raise exception 'publish_bill: invalid item (name 1-100 chars, price_cents 0-999999999, quantity 1-999, position >= 0, source ai|manual)'
        using errcode = '22023';
    end if;
    v_items_total := v_items_total + (v_item ->> 'price_cents')::bigint;
  end loop;

  for v_adj in select e.value from jsonb_array_elements(v_adjustments) as e(value) loop
    if jsonb_typeof(v_adj) <> 'object'
       or coalesce(v_adj ->> 'kind', '') not in ('tax', 'tip', 'fee', 'discount')
       or not private.json_int_between(v_adj -> 'amount_cents', 0, 999999999)
    then
      raise exception 'publish_bill: invalid adjustment (kind tax|tip|fee|discount, amount_cents 0-999999999)'
        using errcode = '22023';
    end if;
    if v_adj ->> 'kind' = 'discount' then
      v_discount := v_discount + (v_adj ->> 'amount_cents')::bigint;
    end if;
  end loop;

  if v_discount > v_items_total then
    raise exception 'publish_bill: discounts (%) exceed the items total (%)', v_discount, v_items_total
      using errcode = 'SS011';
  end if;

  -- Already published with this key? Return it unchanged.
  select b.id, b.share_code into v_bill_id, v_share_code
  from public.bills b
  where b.host_id = v_uid and b.client_key = v_client_key;
  if found then
    return query select v_bill_id, v_share_code;
    return;
  end if;

  perform private.set_audit_reason('publish_bill');

  -- ON CONFLICT handles two concurrent publishes with the same key: the loser
  -- waits for the winner to commit, inserts nothing, and returns its bill.
  insert into public.bills as b (host_id, merchant, currency, client_key)
  values (v_uid, v_merchant, v_currency, v_client_key)
  on conflict on constraint bills_host_client_key_key do nothing
  returning b.id, b.share_code into v_bill_id, v_share_code;

  if not found then
    perform private.set_audit_reason(null);
    select b.id, b.share_code into v_bill_id, v_share_code
    from public.bills b
    where b.host_id = v_uid and b.client_key = v_client_key;
    return query select v_bill_id, v_share_code;
    return;
  end if;

  insert into public.participants (bill_id, user_id, display_name, is_host, join_order)
  values (v_bill_id, v_uid, v_host_name, true, 1);

  insert into public.line_items (bill_id, name, price_cents, quantity, source, position)
  select v_bill_id,
         btrim(e.value ->> 'name'),
         (e.value ->> 'price_cents')::bigint,
         coalesce((e.value ->> 'quantity')::integer, 1),
         coalesce(e.value ->> 'source', 'manual')::public.line_item_source,
         coalesce((e.value ->> 'position')::integer, (e.ord - 1)::integer)
  from jsonb_array_elements(v_items) with ordinality as e(value, ord);

  insert into public.bill_adjustments (bill_id, kind, amount_cents)
  select v_bill_id,
         (e.value ->> 'kind')::public.adjustment_kind,
         (e.value ->> 'amount_cents')::bigint
  from jsonb_array_elements(v_adjustments) as e(value);

  update public.bills as b set status = 'open' where b.id = v_bill_id;

  perform private.set_audit_reason(null);
  return query select v_bill_id, v_share_code;
end;
$$;

-- 2. join_bill: any signed-in user (anonymous guests included). Looks the
--    bill up by share code only (bills are never enumerable by id). Same error
--    for an unknown code and a bill that isn't open. Idempotent: joining twice
--    returns the existing participant (the name is not changed).
create function public.join_bill(p_share_code text, p_display_name text)
returns table (bill_id uuid, participant_id uuid)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid            uuid := (select auth.uid());
  v_name           text := btrim(p_display_name);
  v_bill_id        uuid;
  v_status         public.bill_status;
  v_participant_id uuid;
  v_count          integer;
  v_next           integer;
begin
  if v_uid is null then
    raise exception 'join_bill: not signed in (anonymous sign-in is fine)' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'join_bill: display name must be 1-50 characters' using errcode = '22023';
  end if;

  -- FOR UPDATE serializes joins on the same bill (cap, join_order) and
  -- conflicts with a concurrent lock_bill.
  select b.id, b.status into v_bill_id, v_status
  from public.bills b
  where b.share_code = lower(btrim(p_share_code))
  for update;

  if not found or v_status <> 'open' then
    raise exception 'join_bill: no open bill for that link' using errcode = 'P0002';
  end if;

  select p.id into v_participant_id
  from public.participants p
  where p.bill_id = v_bill_id and p.user_id = v_uid;

  if not found then
    select count(*), coalesce(max(p.join_order), 0) + 1 into v_count, v_next
    from public.participants p
    where p.bill_id = v_bill_id;

    if v_count >= 50 then
      raise exception 'join_bill: this bill is full (50 people)' using errcode = 'SS008';
    end if;

    perform private.set_audit_reason('join_bill');
    insert into public.participants as p (bill_id, user_id, display_name, join_order)
    values (v_bill_id, v_uid, v_name, v_next)
    returning p.id into v_participant_id;
    perform private.set_audit_reason(null);
  end if;

  return query select v_bill_id, v_participant_id;
end;
$$;

-- 4. lock_bill: host only, bill open. p_amounts = [{participant_id, amount_cents}]
--    for every non-host participant (exactly once); p_host_cents = the host's
--    own share. Requires every item claimed and
--    SUM(amounts) + p_host_cents = items + tax + tip + fee - discount.
--    Snapshots the host's handles, creates unpaid settlements for amounts > 0,
--    and locks the bill, all in one transaction.
create function public.lock_bill(p_bill_id uuid, p_amounts jsonb, p_host_cents bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_host_id    uuid;
  v_status     public.bill_status;
  v_currency   text;
  v_elem       jsonb;
  v_n          integer;
  v_n_distinct integer;
  v_sum        numeric;
  v_items      numeric;
  v_adjust     numeric;
  v_total      numeric;
begin
  if v_uid is null then
    raise exception 'lock_bill: not signed in' using errcode = '28000';
  end if;

  select b.host_id, b.status, b.currency into v_host_id, v_status, v_currency
  from public.bills b
  where b.id = p_bill_id
  for update;

  if not found then
    raise exception 'lock_bill: bill not found' using errcode = 'P0002';
  end if;
  if v_host_id <> v_uid then
    raise exception 'lock_bill: only the host can lock this bill' using errcode = '42501';
  end if;
  if v_status <> 'open' then
    raise exception 'lock_bill: bill is %, only open bills can be locked', v_status
      using errcode = 'SS001';
  end if;
  if p_host_cents is null or p_host_cents < 0 then
    raise exception 'lock_bill: p_host_cents must be a non-negative integer' using errcode = '22023';
  end if;
  if p_amounts is null or jsonb_typeof(p_amounts) <> 'array' then
    raise exception 'lock_bill: p_amounts must be a JSON array' using errcode = '22023';
  end if;

  for v_elem in select e.value from jsonb_array_elements(p_amounts) as e(value) loop
    if jsonb_typeof(v_elem) <> 'object'
       or jsonb_typeof(v_elem -> 'participant_id') is distinct from 'string'
       or (v_elem ->> 'participant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not private.json_int_between(v_elem -> 'amount_cents', 0, 9007199254740991)
    then
      raise exception 'lock_bill: each entry needs a participant_id (uuid) and a non-negative integer amount_cents'
        using errcode = '22023';
    end if;
  end loop;

  select count(*),
         count(distinct (e.value ->> 'participant_id')::uuid),
         coalesce(sum((e.value ->> 'amount_cents')::numeric), 0)
    into v_n, v_n_distinct, v_sum
  from jsonb_array_elements(p_amounts) as e(value);

  if v_n <> v_n_distinct
     or exists (
       select 1 from public.participants p
       where p.bill_id = p_bill_id and not p.is_host
         and p.id not in (select (e.value ->> 'participant_id')::uuid
                          from jsonb_array_elements(p_amounts) as e(value)))
     or exists (
       select 1 from jsonb_array_elements(p_amounts) as e(value)
       where (e.value ->> 'participant_id')::uuid not in (
         select p.id from public.participants p
         where p.bill_id = p_bill_id and not p.is_host))
  then
    raise exception 'lock_bill: amounts must list every guest on the bill exactly once, and not the host'
      using errcode = 'SS006';
  end if;

  if exists (
    select 1 from public.line_items li
    where li.bill_id = p_bill_id
      and not exists (select 1 from public.claims c where c.line_item_id = li.id))
  then
    raise exception 'lock_bill: every item must be claimed before locking' using errcode = 'SS004';
  end if;

  select coalesce(sum(li.price_cents), 0) into v_items
  from public.line_items li where li.bill_id = p_bill_id;

  select coalesce(sum(case when a.kind = 'discount' then -a.amount_cents else a.amount_cents end), 0)
    into v_adjust
  from public.bill_adjustments a where a.bill_id = p_bill_id;

  v_total := v_items + v_adjust;
  if v_total < 0 then
    raise exception 'lock_bill: discounts exceed the items total' using errcode = 'SS011';
  end if;
  if v_sum + p_host_cents <> v_total then
    raise exception 'lock_bill: amounts add up to % but the bill total is %', v_sum + p_host_cents, v_total
      using errcode = 'SS005';
  end if;

  perform private.set_audit_reason('lock_bill');

  update public.bills as b
  set status              = 'locked',
      host_venmo_handle   = (select pr.venmo_handle   from public.profiles pr where pr.id = v_uid),
      host_paypal_handle  = (select pr.paypal_handle  from public.profiles pr where pr.id = v_uid),
      host_cashapp_handle = (select pr.cashapp_handle from public.profiles pr where pr.id = v_uid)
  where b.id = p_bill_id;

  insert into public.settlements (bill_id, participant_id, amount_cents, currency, idempotency_key)
  select p_bill_id,
         (e.value ->> 'participant_id')::uuid,
         (e.value ->> 'amount_cents')::bigint,
         v_currency,
         'lock:' || p_bill_id::text || ':' || ((e.value ->> 'participant_id')::uuid)::text
  from jsonb_array_elements(p_amounts) as e(value)
  where (e.value ->> 'amount_cents')::bigint > 0
  on conflict (idempotency_key) do nothing;

  perform private.set_audit_reason(null);
end;
$$;

-- 5. unlock_bill: host only, bill locked, nobody has marked paid. Voids
--    (deletes, audit-logged) the bill's settlements and reopens it.
create function public.unlock_bill(p_bill_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_host_id uuid;
  v_status  public.bill_status;
begin
  if v_uid is null then
    raise exception 'unlock_bill: not signed in' using errcode = '28000';
  end if;

  select b.host_id, b.status into v_host_id, v_status
  from public.bills b
  where b.id = p_bill_id
  for update;

  if not found then
    raise exception 'unlock_bill: bill not found' using errcode = 'P0002';
  end if;
  if v_host_id <> v_uid then
    raise exception 'unlock_bill: only the host can unlock this bill' using errcode = '42501';
  end if;
  if v_status <> 'locked' then
    raise exception 'unlock_bill: bill is %, only locked bills can be unlocked', v_status
      using errcode = 'SS001';
  end if;
  if exists (select 1 from public.settlements s
             where s.bill_id = p_bill_id and s.status <> 'unpaid') then
    raise exception 'unlock_bill: someone has already marked paid' using errcode = 'SS007';
  end if;

  perform private.set_audit_reason('unlock_bill: settlements voided');
  delete from public.settlements s where s.bill_id = p_bill_id;
  update public.bills as b set status = 'open' where b.id = p_bill_id;
  perform private.set_audit_reason(null);
end;
$$;

-- 6. leave_bill: a guest removes themself (and their claims) while open.
create function public.leave_bill(p_bill_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_pid     uuid;
  v_is_host boolean;
  v_status  public.bill_status;
begin
  if v_uid is null then
    raise exception 'leave_bill: not signed in' using errcode = '28000';
  end if;

  select p.id, p.is_host into v_pid, v_is_host
  from public.participants p
  where p.bill_id = p_bill_id and p.user_id = v_uid;

  if not found then
    raise exception 'leave_bill: you are not on this bill' using errcode = 'P0002';
  end if;
  if v_is_host then
    raise exception 'leave_bill: the host cannot leave their own bill' using errcode = 'SS009';
  end if;

  select b.status into v_status
  from public.bills b
  where b.id = p_bill_id
  for update;

  if v_status <> 'open' then
    raise exception 'leave_bill: bill is %, you can only leave while it is open', v_status
      using errcode = 'SS001';
  end if;

  perform private.set_audit_reason('leave_bill');
  delete from public.participants p where p.id = v_pid;  -- claims cascade
  perform private.set_audit_reason(null);
end;
$$;

-- 7. set_settlement_status: guest unpaid <-> marked_paid on their own;
--    host marked_paid -> confirmed and confirmed -> marked_paid. Setting the
--    current status again is a no-op (safe to retry). Transition rules are
--    enforced by the settlements trigger (SS010).
create function public.set_settlement_status(p_settlement_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_current        public.settlement_status;
  v_bill_id        uuid;
  v_participant_id uuid;
begin
  if v_uid is null then
    raise exception 'set_settlement_status: not signed in' using errcode = '28000';
  end if;
  if p_status is null or p_status not in ('unpaid', 'marked_paid', 'confirmed') then
    raise exception 'set_settlement_status: status must be unpaid, marked_paid or confirmed'
      using errcode = '22023';
  end if;

  -- Lock order everywhere is bill row first, then settlement rows (same as
  -- unlock_bill and lock_bill), so this can't deadlock with them.
  select s.bill_id into v_bill_id
  from public.settlements s
  where s.id = p_settlement_id;

  if found then
    perform 1 from public.bills b where b.id = v_bill_id for share;

    select s.status, s.participant_id into v_current, v_participant_id
    from public.settlements s
    where s.id = p_settlement_id
    for update;  -- not found if unlock_bill voided it meanwhile
  end if;

  -- Not found and not yours look the same (no probing other people's rows).
  if not found
     or not (
       exists (select 1 from public.bills b where b.id = v_bill_id and b.host_id = v_uid)
       or exists (select 1 from public.participants p
                  where p.id = v_participant_id and p.user_id = v_uid))
  then
    raise exception 'set_settlement_status: settlement not found' using errcode = 'P0002';
  end if;

  if v_current::text = p_status then
    return;
  end if;

  perform private.set_audit_reason('set_settlement_status');
  update public.settlements as s
  set status = p_status::public.settlement_status
  where s.id = p_settlement_id;
  perform private.set_audit_reason(null);
end;
$$;

-- remove_participant: the host removes a guest (and their claims) while
--    the bill is open. Same locking pattern as leave_bill.
create function public.remove_participant(p_participant_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_bill_id uuid;
  v_host_id uuid;
  v_status  public.bill_status;
  v_is_host boolean;
begin
  if v_uid is null then
    raise exception 'remove_participant: not signed in' using errcode = '28000';
  end if;

  select p.bill_id into v_bill_id
  from public.participants p
  where p.id = p_participant_id;

  if not found then
    raise exception 'remove_participant: participant not found' using errcode = 'P0002';
  end if;

  select b.host_id, b.status into v_host_id, v_status
  from public.bills b
  where b.id = v_bill_id
  for update;

  if v_host_id is distinct from v_uid then
    raise exception 'remove_participant: only the host can remove people' using errcode = '42501';
  end if;

  select p.is_host into v_is_host
  from public.participants p
  where p.id = p_participant_id;

  if not found then
    raise exception 'remove_participant: participant not found' using errcode = 'P0002';
  end if;
  if v_is_host then
    raise exception 'remove_participant: the host cannot be removed' using errcode = 'SS009';
  end if;
  if v_status <> 'open' then
    raise exception 'remove_participant: bill is %, people can only be removed while it is open', v_status
      using errcode = 'SS001';
  end if;

  perform private.set_audit_reason('remove_participant');
  delete from public.participants p where p.id = p_participant_id;  -- claims cascade
  perform private.set_audit_reason(null);
end;
$$;

-- 8. upsert_profile: Google users only. NULL or '' clears a handle.
--    Handles must already be normalized (no @ / $ / paypal.me/ prefix).
create function public.upsert_profile(
  p_display_name text,
  p_venmo        text,
  p_paypal       text,
  p_cashapp      text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_name    text := btrim(p_display_name);
  v_venmo   text := nullif(btrim(p_venmo), '');
  v_paypal  text := nullif(btrim(p_paypal), '');
  v_cashapp text := nullif(btrim(p_cashapp), '');
  v_re      constant text := '^[A-Za-z0-9._-]{1,64}$';
begin
  if v_uid is null then
    raise exception 'upsert_profile: not signed in' using errcode = '28000';
  end if;
  if not private.is_permanent_user() then
    raise exception 'upsert_profile: sign in with Google first' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 50 then
    raise exception 'upsert_profile: display name must be 1-50 characters' using errcode = '22023';
  end if;
  if v_venmo is not null and v_venmo !~ v_re then
    raise exception 'upsert_profile: invalid Venmo handle' using errcode = '22023';
  end if;
  if v_paypal is not null and v_paypal !~ v_re then
    raise exception 'upsert_profile: invalid PayPal.me handle' using errcode = '22023';
  end if;
  if v_cashapp is not null and v_cashapp !~ v_re then
    raise exception 'upsert_profile: invalid Cash App handle' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name, venmo_handle, paypal_handle, cashapp_handle)
  values (v_uid, v_name, v_venmo, v_paypal, v_cashapp)
  on conflict (id) do update
    set display_name   = excluded.display_name,
        venmo_handle   = excluded.venmo_handle,
        paypal_handle  = excluded.paypal_handle,
        cashapp_handle = excluded.cashapp_handle;
end;
$$;

-- -----------------------------------------------------------------------------
-- Retention (SPEC §10): archive bills 30 days after lock, or open bills
-- with no status change for 30 days (bills.updated_at is bumped by every
-- status change, including unlock, and clients can't update bills directly); anonymize guest names and unlink guest accounts on
-- archived bills. Idempotent. p_now exists so tests can simulate time.
-- -----------------------------------------------------------------------------
create function private.archive_old_bills(p_now timestamptz default now())
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is not null then
    raise exception 'archive_old_bills: system only' using errcode = '42501';
  end if;

  perform private.set_audit_reason('retention: auto-archive after 30 days');

  update public.bills b
  set status = 'archived'
  where (b.status = 'locked' and b.locked_at < p_now - interval '30 days')
     or (b.status in ('draft', 'open') and b.updated_at < p_now - interval '30 days');
  get diagnostics v_count = row_count;

  update public.participants p
  set display_name = 'Guest ' || r.n,
      user_id      = null
  from (
    select p2.id,
           row_number() over (partition by p2.bill_id order by p2.join_order) as n
    from public.participants p2
    join public.bills b on b.id = p2.bill_id
    where b.status = 'archived' and not p2.is_host
  ) r
  where p.id = r.id
    and (p.display_name is distinct from 'Guest ' || r.n or p.user_id is not null);

  perform private.set_audit_reason(null);
  return v_count;
end;
$$;

-- Scheduling (not enabled): confirm pg_cron is available on the free tier
-- first (Dashboard > Integrations > Cron). If it is:
--   create extension if not exists pg_cron;
--   select cron.schedule('archive-old-bills', '17 3 * * *',
--                        $cron$ select private.archive_old_bills(); $cron$);
-- Otherwise: a daily Vercel Cron calling a server route with the service role
-- key, which needs a thin public wrapper granted only to service_role.

-- -----------------------------------------------------------------------------
-- Function privileges (Postgres grants EXECUTE to PUBLIC by default).
-- -----------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_permanent_user(),
  private.hosted_bill_ids(public.bill_status[]),
  private.joined_bill_ids(public.bill_status[]),
  private.readable_bill_ids(),
  private.my_participant_ids()
to authenticated;

revoke all on function
  public.publish_bill(jsonb),
  public.join_bill(text, text),
  public.lock_bill(uuid, jsonb, bigint),
  public.unlock_bill(uuid),
  public.leave_bill(uuid),
  public.set_settlement_status(uuid, text),
  public.upsert_profile(text, text, text, text),
  public.remove_participant(uuid)
from public, anon;
grant execute on function
  public.publish_bill(jsonb),
  public.join_bill(text, text),
  public.lock_bill(uuid, jsonb, bigint),
  public.unlock_bill(uuid),
  public.leave_bill(uuid),
  public.set_settlement_status(uuid, text),
  public.upsert_profile(text, text, text, text),
  public.remove_participant(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Table privileges. Supabase grants everything to anon/authenticated by
-- default and relies on RLS; we also narrow privileges so most writes can only
-- happen through the RPCs above. "anon" (no session) gets nothing: guests sign
-- in anonymously and are therefore "authenticated".
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.bills, public.line_items, public.bill_adjustments,
              public.participants, public.claims, public.settlements, public.audit_log
  from anon, authenticated;

grant select on public.profiles to authenticated;     -- writes: upsert_profile
grant select on public.bills to authenticated;        -- writes: publish/lock/unlock
grant select on public.settlements to authenticated;  -- writes: lock_bill, set_settlement_status

-- Host edits items/adjustments while the bill is open (SPEC §7).
grant select, insert, delete on public.line_items to authenticated;
grant update (name, price_cents, quantity, source, position) on public.line_items to authenticated;
grant select, insert, delete on public.bill_adjustments to authenticated;
grant update (kind, amount_cents, label) on public.bill_adjustments to authenticated;

-- Insert only via join_bill/publish_bill; delete only via leave_bill /
-- remove_participant.
grant select on public.participants to authenticated;
grant update (display_name) on public.participants to authenticated;

-- A claim is just (item, participant): remove + add, never update.
grant select, insert, delete on public.claims to authenticated;

grant select on public.audit_log to authenticated;
revoke insert, update, delete, truncate on public.audit_log from service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.bills            enable row level security;
alter table public.line_items       enable row level security;
alter table public.bill_adjustments enable row level security;
alter table public.participants     enable row level security;
alter table public.claims           enable row level security;
alter table public.settlements      enable row level security;
alter table public.audit_log        enable row level security;

-- profiles: only yourself. Guests get the host's handles from the bill's
-- lock-time snapshot instead.
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- bills: the direct host_id check also covers rows not yet visible to the
-- helper's snapshot.
create policy "bills: host and joined participants can read"
  on public.bills for select to authenticated
  using (host_id = (select auth.uid()) or id in (select private.readable_bill_ids()));

-- line_items ------------------------------------------------------------------
create policy "line_items: readable with the bill"
  on public.line_items for select to authenticated
  using (bill_id in (select private.readable_bill_ids()));

create policy "line_items: host inserts while draft/open"
  on public.line_items for insert to authenticated
  with check (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])));

create policy "line_items: host updates while draft/open"
  on public.line_items for update to authenticated
  using (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])))
  with check (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])));

create policy "line_items: host deletes while draft/open"
  on public.line_items for delete to authenticated
  using (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])));

-- bill_adjustments ------------------------------------------------------------
create policy "bill_adjustments: readable with the bill"
  on public.bill_adjustments for select to authenticated
  using (bill_id in (select private.readable_bill_ids()));

create policy "bill_adjustments: host inserts while draft/open"
  on public.bill_adjustments for insert to authenticated
  with check (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])));

create policy "bill_adjustments: host updates while draft/open"
  on public.bill_adjustments for update to authenticated
  using (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])))
  with check (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])));

create policy "bill_adjustments: host deletes while draft/open"
  on public.bill_adjustments for delete to authenticated
  using (bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])));

-- participants ----------------------------------------------------------------
-- Everyone on a bill sees everyone's display name ("who had what").
create policy "participants: readable with the bill"
  on public.participants for select to authenticated
  using (bill_id in (select private.readable_bill_ids()));

create policy "participants: rename self while draft/open"
  on public.participants for update to authenticated
  using (user_id = (select auth.uid())
         and bill_id in (select private.joined_bill_ids(array['draft', 'open']::public.bill_status[])))
  with check (user_id = (select auth.uid()));

-- claims ----------------------------------------------------------------------
create policy "claims: readable with the bill"
  on public.claims for select to authenticated
  using (bill_id in (select private.readable_bill_ids()));

-- Guests: only their own claims. Host: may also assign/unassign anyone's
-- (SPEC §5.3). Only while open.
create policy "claims: add own (or host assigns) while open"
  on public.claims for insert to authenticated
  with check (
    bill_id in (select private.joined_bill_ids(array['open']::public.bill_status[]))
    and (participant_id in (select private.my_participant_ids())
         or bill_id in (select private.hosted_bill_ids(array['open']::public.bill_status[])))
  );

create policy "claims: remove own (or host removes) while open"
  on public.claims for delete to authenticated
  using (
    bill_id in (select private.joined_bill_ids(array['open']::public.bill_status[]))
    and (participant_id in (select private.my_participant_ids())
         or bill_id in (select private.hosted_bill_ids(array['open']::public.bill_status[])))
  );

-- settlements: host sees all on their bills; a guest sees only their own.
create policy "settlements: host sees all, guest sees own"
  on public.settlements for select to authenticated
  using (
    bill_id in (select private.hosted_bill_ids(array['locked', 'archived']::public.bill_status[]))
    or (participant_id in (select private.my_participant_ids())
        and bill_id in (select private.joined_bill_ids(array['locked']::public.bill_status[])))
  );

-- audit_log: read-only, host-only, for their own bills. Only SECURITY DEFINER
-- triggers write here.
create policy "audit_log: host reads own bills' history"
  on public.audit_log for select to authenticated
  using (bill_id in (select private.hosted_bill_ids(
           array['draft', 'open', 'locked', 'archived']::public.bill_status[])));

-- -----------------------------------------------------------------------------
-- Realtime (SPEC §5.2). postgres_changes respects RLS per subscriber.
-- With RLS on, DELETE events carry only the primary key and cannot be
-- filtered by bill_id; clients drop the matching row by key.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.bills,
  public.line_items,
  public.bill_adjustments,
  public.participants,
  public.claims,
  public.settlements;
