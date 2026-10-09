-- =============================================================================
-- DRAFT — NOT APPLIED — REQUIRES APPROVAL BEFORE APPLYING
-- There is no Supabase project yet. Do not run this against any database until
-- the human has reviewed it. Explanations for a learner: docs/data-model.md
-- =============================================================================
--
-- SplitSnap initial schema: shareable live bills.
--
-- AUTH MODEL (deviates from SPEC §9 "random guest token" — needs approval)
--   * Hosts sign in with Google (Supabase Auth). They are "permanent" users.
--   * Guests use Supabase ANONYMOUS SIGN-INS: the browser calls
--     supabase.auth.signInAnonymously(), which creates a real auth.users row and
--     a JWT with role = 'authenticated' and claim is_anonymous = true.
--     So EVERY participant has an auth.uid() and RLS can use it directly; we do
--     not invent our own guest tokens (which would need hashing, rotation, and
--     custom checks in every policy).
--   * Tradeoffs:
--       - Anonymous users count toward Supabase MAU (free tier: 50k MAU; fine for v1).
--       - Anonymous sign-in must be enabled in the dashboard, and Supabase
--         recommends CAPTCHA/Turnstile on it to limit abuse.
--       - Old anonymous users pile up in auth.users; plan a periodic cleanup.
--       - If a guest clears storage they get a new uid and must re-join
--         (same as losing a guest token).
--       - An anonymous user can later link Google and keep the same uid
--         (SPEC §14 "optional guest sign-in to keep history" comes for free).
--   * Anonymous users must NOT create bills or profiles: policies check the
--     is_anonymous JWT claim via private.is_permanent_user().
--
-- MONEY: always integer cents in bigint. Never numeric/float. Caps match
-- src/core/parse.ts MAX_INPUT_CENTS (999_999_999) for single inputs and
-- Number.MAX_SAFE_INTEGER for computed totals (the TS core uses `number`).
-- Line items and adjustments inherit the bill's currency; settlements carry
-- their own currency column, tied to the bill's by a composite foreign key.
--
-- TIME: every timestamp is timestamptz (stored as UTC instant); convert only
-- for display.
--
-- WHO COMPUTES WHAT: the database enforces *who may change what, and when*
-- (state machine, RLS, audit). It never computes shares; that is
-- src/core/split.ts (AI decides, code executes; core logic stays in TS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions and schemas
-- -----------------------------------------------------------------------------
-- pgcrypto (gen_random_bytes) is pre-installed in the "extensions" schema on
-- Supabase; this is a no-op there. gen_random_uuid() is core Postgres 13+.
create extension if not exists pgcrypto with schema extensions;

-- "private" is NOT exposed through the Supabase REST API (only "public" is),
-- so helper/trigger functions here cannot be called directly as RPCs.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated; -- needed: RLS policies call helpers

-- -----------------------------------------------------------------------------
-- Enums (explicit state machines; see SPEC §7)
-- -----------------------------------------------------------------------------
create type public.bill_status       as enum ('draft', 'open', 'locked', 'archived');
create type public.line_item_source  as enum ('ai', 'manual');
create type public.adjustment_kind   as enum ('tax', 'tip', 'fee', 'discount');
create type public.settlement_status as enum ('unpaid', 'marked_paid', 'confirmed');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Hosts only (anonymous guests never get a profile). Created by the app on
-- first Google sign-in (upsert). Handles are stored normalized, without the
-- leading @ / $ / paypal.me/ prefix, matching src/core/paymentLinks.ts
-- (HANDLE_RE = /^[A-Za-z0-9._-]+$/, MAX_HANDLE_LENGTH = 64).
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
  -- Always generated by trigger (client values are overwritten): 12 chars from
  -- a 32-char alphabet = 60 random bits. This is the ONLY way into a bill for
  -- a guest (via join_bill); bill ids are never used as an access secret.
  share_code  text not null,
  host_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  merchant    text,
  status      public.bill_status not null default 'draft',
  currency    char(3) not null default 'USD',
  -- Printed receipt total, for the SPEC §5.1 step 5 consistency check.
  receipt_total_cents        bigint,
  -- Set when the host explicitly accepts a receipt/items mismatch.
  total_mismatch_accepted_at timestamptz,
  -- v1.1 groups (SPEC §14). No FK yet: the groups table doesn't exist.
  -- Forced to NULL on insert in v1 and not client-updatable.
  group_id    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  locked_at   timestamptz,
  archived_at timestamptz,
  constraint bills_share_code_key unique (share_code),
  constraint bills_share_code_format check (share_code ~ '^[a-km-np-z2-9]{12}$'),
  constraint bills_merchant_len check (merchant is null or char_length(btrim(merchant)) between 1 and 100),
  constraint bills_currency_format check (currency ~ '^[A-Z]{3}$'),
  -- v1 is USD only (SPEC §4). Drop this one constraint for multi-currency.
  constraint bills_currency_v1_usd_only check (currency = 'USD'),
  constraint bills_receipt_total_range check (receipt_total_cents is null or receipt_total_cents between 0 and 999999999),
  constraint bills_locked_has_timestamp check (status <> 'locked' or locked_at is not null),
  constraint bills_archived_has_timestamp check (status <> 'archived' or archived_at is not null),
  -- Lets settlements reference (bill, currency) so their currency can't drift.
  constraint bills_id_currency_key unique (id, currency)
);

-- price_cents is the LINE total as printed ("3 x Beer  $18.00" -> 1800,
-- quantity 3). This matches computeSplit(), which treats each row as one
-- claimable amount. To let people claim single units, the app replaces the
-- row with N rows (quantity 1 each) using core logic. (Open question in docs.)
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

-- Discounts are stored as a POSITIVE amount and subtracted by core logic
-- (same convention as computeSplit's adjustments).
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

-- One row per person on a bill, including the host (inserted automatically
-- when the bill is created, so the host can claim their own items).
create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references public.bills (id) on delete cascade,
  -- NULL after retention anonymization or if the auth user is deleted.
  user_id      uuid references auth.users (id) on delete set null,
  display_name text not null,
  is_host      boolean not null default false,
  -- Deterministic tie-break for leftover cents (SPEC §6: "by join time").
  -- A sequence never repeats, unlike timestamps, so ties are impossible.
  join_order   bigint generated always as identity,
  joined_at    timestamptz not null default now(),
  constraint participants_display_name_len check (char_length(btrim(display_name)) between 1 and 50),
  constraint participants_bill_user_key unique (bill_id, user_id),
  constraint participants_id_bill_key unique (id, bill_id) -- target of composite FKs
);

-- Primary key (line_item_id, participant_id) makes claiming idempotent:
-- clients insert with ON CONFLICT DO NOTHING, so a double tap/retry is a no-op.
-- bill_id is denormalized so RLS is cheap and Realtime can filter by bill;
-- the composite FKs guarantee the item and participant belong to that bill.
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

-- What each guest owes the host once the bill is locked. Amounts come from
-- src/core/split.ts (computed by the app at lock time); the DB only enforces
-- who may move the self-reported status. We never move money.
create table public.settlements (
  id              uuid primary key default gen_random_uuid(),
  bill_id         uuid not null,
  participant_id  uuid not null,
  amount_cents    bigint not null,
  currency        char(3) not null default 'USD',
  status          public.settlement_status not null default 'unpaid',
  -- Idempotency key: the app derives it deterministically, e.g.
  -- 'lock:<bill_id>:<participant_id>', so a retried "lock & create
  -- settlements" request can never create a second row.
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

-- Append-only audit trail. No foreign keys on purpose: history must survive
-- deletion of the bill or user it describes. Written only by triggers.
-- Participant display names are stripped before logging (no PII in logs).
create table public.audit_log (
  id         bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id   uuid,            -- auth.uid() of the caller; NULL = system (cron / service role)
  bill_id    uuid,
  table_name text not null,
  action     text not null,   -- e.g. 'bills.status_change', 'claims.insert', 'settlements.update'
  before     jsonb,
  after      jsonb,
  reason     text             -- from the transaction-local setting splitsnap.audit_reason, if set
);

-- -----------------------------------------------------------------------------
-- Indexes (foreign keys, share_code, RLS lookups, retention scans)
-- -----------------------------------------------------------------------------
-- share_code: covered by unique constraint bills_share_code_key.
create index bills_host_id_idx           on public.bills (host_id);
create index bills_group_id_idx          on public.bills (group_id) where group_id is not null;
create index bills_retention_locked_idx  on public.bills (locked_at)  where status = 'locked';
create index bills_retention_stale_idx   on public.bills (created_at) where status in ('draft', 'open');
create index line_items_bill_position_idx on public.line_items (bill_id, position);
create index bill_adjustments_bill_id_idx on public.bill_adjustments (bill_id);
-- participants (bill_id, ...) covered by participants_bill_user_key.
create index participants_user_id_idx    on public.participants (user_id);
create unique index participants_one_host_per_bill on public.participants (bill_id) where is_host;
-- claims (line_item_id, ...) covered by the primary key.
create index claims_bill_id_idx          on public.claims (bill_id);
create index claims_participant_bill_idx on public.claims (participant_id, bill_id);
create index claims_line_item_bill_idx   on public.claims (line_item_id, bill_id);
-- settlements (bill_id, ...) covered by settlements_bill_participant_key.
create index settlements_participant_bill_idx on public.settlements (participant_id, bill_id);
create index audit_log_bill_occurred_idx on public.audit_log (bill_id, occurred_at);

-- -----------------------------------------------------------------------------
-- RLS helper functions
-- SECURITY DEFINER so they can read bills/participants without recursing into
-- those tables' own RLS policies. Policies call them as
--   bill_id in (select private.fn(...))
-- which Postgres evaluates ONCE per query (not once per row): this, plus
-- (select auth.uid()), is Supabase's documented RLS performance pattern.
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

-- Bills I host, in the given statuses.
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

-- Bills I am a participant on (host included), in the given statuses.
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

-- Bills I may read: every bill I host (incl. draft and archived), plus bills
-- I joined while they are open or locked. Archived bills disappear for guests
-- ("the guest link stops working", SPEC §7).
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

-- My participant rows across all bills.
create function private.my_participant_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id from public.participants p where p.user_id = (select auth.uid())
$$;

-- Hosts whose profile (display name + payment handles) I may see: hosts of
-- bills I joined that are open or locked (needed for the payment buttons).
create function private.visible_host_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select b.host_id
  from public.bills b
  join public.participants p on p.bill_id = b.id
  where p.user_id = (select auth.uid())
    and b.status in ('open', 'locked')
$$;

-- 12 chars from a 32-symbol alphabet (no l/o/0/1 to avoid misreading).
-- 256 % 32 = 0, so byte % 32 is unbiased. 60 bits of randomness.
create function private.generate_share_code()
returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code  text := '';
begin
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
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
--   draft  -> open
--   open   -> draft     only if no settlement is marked_paid/confirmed
--   open   -> locked    (sets locked_at)
--   locked -> archived  system only (retention job / service role)
--   draft|open -> archived  system only (retention: never locked, >30 days old)
-- Everything else raises. Locked and archived bills are frozen: only the
-- status (locked -> archived) may change. Some columns are always immutable.
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
    new.share_code  := private.generate_share_code();
    new.status      := 'draft';
    new.group_id    := null;   -- v1: groups don't exist yet
    new.created_at  := now();
    new.updated_at  := now();
    new.locked_at   := null;
    new.archived_at := null;
    return new;
  end if;

  -- UPDATE
  if new.id         is distinct from old.id
     or new.host_id    is distinct from old.host_id
     or new.share_code is distinct from old.share_code
     or new.currency   is distinct from old.currency
     or new.created_at is distinct from old.created_at then
    raise exception 'bills: id, host_id, share_code, currency and created_at are immutable'
      using errcode = 'P0001';
  end if;

  if old.status in ('locked', 'archived')
     and (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'bills: bill is %, its fields are frozen', old.status
      using errcode = 'P0001';
  end if;

  -- Timestamps are derived from transitions, never taken from the client.
  new.locked_at   := old.locked_at;
  new.archived_at := old.archived_at;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'open' then
      null;
    elsif old.status = 'open' and new.status = 'draft' then
      if exists (select 1 from public.settlements s
                 where s.bill_id = old.id and s.status <> 'unpaid') then
        raise exception 'bills: cannot reopen to draft, someone has already marked paid'
          using errcode = 'P0001';
      end if;
    elsif old.status = 'open' and new.status = 'locked' then
      new.locked_at := now();
    elsif new.status = 'archived' and old.status in ('draft', 'open', 'locked') and v_is_system then
      new.archived_at := now();
    else
      raise exception 'bills: illegal status transition % -> %', old.status, new.status
        using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- The host is always participant #1 on their own bill.
create function private.bills_add_host_participant()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.participants (bill_id, user_id, display_name, is_host)
  select new.id, new.host_id, left(btrim(p.display_name), 50), true
  from public.profiles p
  where p.id = new.host_id;
  return null;
end;
$$;

-- Guard for line_items, bill_adjustments, claims:
--   * nothing changes while the bill is locked or archived
--   * claims can only be ADDED while the bill is open
--   * rows can't be moved to another bill
-- FOR SHARE on the bill row serializes with a concurrent "lock bill" update,
-- so a claim can't sneak in while the bill is being locked.
create function private.guard_bill_child()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bill_id uuid;
  v_status  public.bill_status;
begin
  if tg_op = 'UPDATE' then
    if new.bill_id is distinct from old.bill_id then
      raise exception '%: bill_id is immutable', tg_table_name using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_bill_id := old.bill_id;
  else
    v_bill_id := new.bill_id;
  end if;

  select b.status into v_status
  from public.bills b
  where b.id = v_bill_id
  for share;

  if found then
    if v_status in ('locked', 'archived') then
      raise exception '%: bill is %, items, adjustments and claims are frozen', tg_table_name, v_status
        using errcode = 'P0001';
    end if;
    if tg_table_name = 'claims' and tg_op = 'INSERT' and v_status <> 'open' then
      raise exception 'claims: bill is %, claiming is only possible while open', v_status
        using errcode = 'P0001';
    end if;
  end if;
  -- not found: either the parent bill is being deleted in this same statement
  -- (FK cascade) or, for an INSERT, the FK check will reject the row.

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- SETTLEMENT STATE MACHINE (self-reported; we can't verify payments):
--   unpaid      -> marked_paid   the participant themself ("I've paid")
--   marked_paid -> unpaid        the participant themself (undo)
--   unpaid|marked_paid -> confirmed  host only ("Received")
--   confirmed   -> marked_paid   host only (undo a mistaken confirm)
-- Only allowed while the bill is locked. Only status can change after insert.
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
    -- No client delete path exists (no grant/policy). Only allow cascades from
    -- a bill that is itself being deleted.
    perform 1 from public.bills b where b.id = old.bill_id;
    if found then
      raise exception 'settlements: rows are never deleted while their bill exists'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  select b.status, b.host_id into v_bill_status, v_host_id
  from public.bills b
  where b.id = new.bill_id
  for share;

  if not found then
    raise exception 'settlements: bill not found' using errcode = 'P0001';
  end if;
  if v_bill_status <> 'locked' then
    raise exception 'settlements: bill must be locked (it is %)', v_bill_status
      using errcode = 'P0001';
  end if;

  v_is_host := v_uid is not null and v_uid = v_host_id;
  v_is_self := v_uid is not null and exists (
    select 1 from public.participants p
    where p.id = new.participant_id and p.user_id = v_uid
  );

  if tg_op = 'INSERT' then
    if not (v_is_host or v_is_system) then
      raise exception 'settlements: only the host creates settlements' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.participants p
               where p.id = new.participant_id and p.is_host) then
      raise exception 'settlements: the host does not owe themselves' using errcode = 'P0001';
    end if;
    if new.status <> 'unpaid' then
      raise exception 'settlements: new settlements start unpaid' using errcode = 'P0001';
    end if;
    new.created_at     := now();
    new.updated_at     := now();
    new.marked_paid_at := null;
    new.confirmed_at   := null;
    return new;
  end if;

  -- UPDATE
  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'settlements: only status can change' using errcode = 'P0001';
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
    else
      raise exception 'settlements: % -> % is not allowed for this user', old.status, new.status
        using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Generic audit writer. Trigger arguments (TG_ARGV) name columns to strip
-- before logging (used to keep participant display names out of the log).
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

-- audit_log is append-only. Note: a superuser/table owner can still disable
-- triggers; this protects against app bugs and API callers, not a rogue DBA.
create function private.audit_log_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only (% is not allowed)', tg_op using errcode = 'P0001';
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
create trigger t95_add_host_participant after insert on public.bills
  for each row execute function private.bills_add_host_participant();

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

-- Join/leave is audited; the display name (PII) is stripped.
create trigger t90_audit after insert or delete on public.participants
  for each row execute function private.audit_row('display_name');

create trigger t10_state_machine before insert or update or delete on public.settlements
  for each row execute function private.settlements_before_write();
create trigger t90_audit after insert or update or delete on public.settlements
  for each row execute function private.audit_row();

create trigger t10_append_only before update or delete on public.audit_log
  for each row execute function private.audit_log_block_mutation();
create trigger t10_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_block_mutation();

-- -----------------------------------------------------------------------------
-- Joining a bill: the only way a guest gets access.
-- SECURITY DEFINER because the caller can't see the bill yet. It looks the
-- bill up by share_code only, so bills are never enumerable by id, and it
-- returns the same error for "no such code" and "not open" (no oracle).
-- Idempotent: joining twice returns the existing participant id.
-- Call from the client: supabase.rpc('join_bill', { share_code, display_name })
-- -----------------------------------------------------------------------------
create function public.join_bill(share_code text, display_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_name           text := btrim(join_bill.display_name);
  v_bill_id        uuid;
  v_status         public.bill_status;
  v_participant_id uuid;
  v_count          integer;
begin
  if v_uid is null then
    raise exception 'join_bill: sign in first (anonymous sign-in is fine)' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'join_bill: display name must be 1-50 characters' using errcode = '22023';
  end if;

  -- FOR UPDATE serializes joins on the same bill (participant cap, idempotency)
  -- and conflicts with a concurrent lock.
  select b.id, b.status into v_bill_id, v_status
  from public.bills b
  where b.share_code = lower(btrim(join_bill.share_code))
  for update;

  if not found or v_status <> 'open' then
    raise exception 'join_bill: no open bill for that link' using errcode = 'P0002';
  end if;

  select p.id into v_participant_id
  from public.participants p
  where p.bill_id = v_bill_id and p.user_id = v_uid;
  if found then
    return v_participant_id;
  end if;

  select count(*) into v_count from public.participants p where p.bill_id = v_bill_id;
  if v_count >= 50 then
    raise exception 'join_bill: this bill is full (50 people)' using errcode = 'P0001';
  end if;

  insert into public.participants (bill_id, user_id, display_name)
  values (v_bill_id, v_uid, v_name)
  returning id into v_participant_id;

  return v_participant_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Retention (SPEC §10): archive bills 30 days after lock, or 30 days after
-- creation if never locked; anonymize guest names and unlink guest accounts
-- on archived bills. Idempotent. p_now exists so tests can simulate time.
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

  perform set_config('splitsnap.audit_reason', 'retention: auto-archive after 30 days', true);

  update public.bills b
  set status = 'archived'
  where (b.status = 'locked' and b.locked_at < p_now - interval '30 days')
     or (b.status in ('draft', 'open') and b.created_at < p_now - interval '30 days');
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

  perform set_config('splitsnap.audit_reason', '', true);
  return v_count;
end;
$$;

-- Scheduling (NOT enabled): pg_cron availability/limits on the free tier must
-- be verified first (Dashboard > Integrations > Cron). If available:
--   create extension if not exists pg_cron;
--   select cron.schedule('archive-old-bills', '17 3 * * *',
--                        $cron$ select private.archive_old_bills(); $cron$);
-- Alternative if not: a daily Vercel Cron hitting a server route that uses the
-- service role key. That needs a thin public wrapper function granted ONLY to
-- service_role, because the "private" schema is not reachable over the API.

-- -----------------------------------------------------------------------------
-- Function privileges. Postgres grants EXECUTE to PUBLIC by default.
-- -----------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_permanent_user(),
  private.hosted_bill_ids(public.bill_status[]),
  private.joined_bill_ids(public.bill_status[]),
  private.readable_bill_ids(),
  private.my_participant_ids(),
  private.visible_host_ids()
to authenticated;

revoke all on function public.join_bill(text, text) from public, anon;
grant execute on function public.join_bill(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Table privileges. Supabase grants everything to anon/authenticated by
-- default and relies on RLS; we also narrow privileges so that, e.g., a guest
-- can only ever UPDATE a settlement's status column.
-- "anon" (no session at all) gets nothing: guests sign in anonymously and are
-- therefore "authenticated".
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.bills, public.line_items, public.bill_adjustments,
              public.participants, public.claims, public.settlements, public.audit_log
  from anon, authenticated;

grant select, insert on public.profiles to authenticated;
grant update (display_name, venmo_handle, paypal_handle, cashapp_handle) on public.profiles to authenticated;

grant select, insert, delete on public.bills to authenticated;
grant update (merchant, status, receipt_total_cents, total_mismatch_accepted_at) on public.bills to authenticated;

grant select, insert, delete on public.line_items to authenticated;
grant update (name, price_cents, quantity, source, position) on public.line_items to authenticated;

grant select, insert, delete on public.bill_adjustments to authenticated;
grant update (kind, amount_cents, label) on public.bill_adjustments to authenticated;

-- No INSERT: participants are created only by join_bill / the host trigger.
grant select, delete on public.participants to authenticated;
grant update (display_name) on public.participants to authenticated;

-- No UPDATE: a claim is just (item, participant); remove + add instead.
grant select, insert, delete on public.claims to authenticated;

grant select, insert on public.settlements to authenticated;
grant update (status) on public.settlements to authenticated;

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

-- profiles --------------------------------------------------------------------
create policy "profiles: read own, and hosts of bills I joined"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id in (select private.visible_host_ids()));

create policy "profiles: Google users create their own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and (select private.is_permanent_user()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and (select private.is_permanent_user()));

-- bills -----------------------------------------------------------------------
-- The direct host_id check matters: for INSERT ... RETURNING (supabase-js
-- .insert().select()) the brand-new row is not yet visible to the helper's
-- snapshot, so the helper alone would reject the host's own new bill.
create policy "bills: host and joined participants can read"
  on public.bills for select to authenticated
  using (host_id = (select auth.uid()) or id in (select private.readable_bill_ids()));

create policy "bills: Google users create their own drafts"
  on public.bills for insert to authenticated
  with check (host_id = (select auth.uid()) and (select private.is_permanent_user()));

-- Host has full control while draft/open. Locked/archived rows are invisible
-- to UPDATE (only the system can archive). The trigger validates transitions.
create policy "bills: host updates while not locked"
  on public.bills for update to authenticated
  using (host_id = (select auth.uid()) and status in ('draft', 'open'))
  with check (host_id = (select auth.uid()));

create policy "bills: host deletes drafts"
  on public.bills for delete to authenticated
  using (host_id = (select auth.uid()) and status = 'draft');

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
-- Everyone on a bill sees everyone's display name (needed for "who had what").
create policy "participants: readable with the bill"
  on public.participants for select to authenticated
  using (bill_id in (select private.readable_bill_ids()));

create policy "participants: rename self while draft/open"
  on public.participants for update to authenticated
  using (user_id = (select auth.uid())
         and bill_id in (select private.joined_bill_ids(array['draft', 'open']::public.bill_status[])))
  with check (user_id = (select auth.uid()));

-- Their claims are removed with them (cascade). Not possible once locked.
create policy "participants: host removes guests while draft/open"
  on public.participants for delete to authenticated
  using (not is_host
         and bill_id in (select private.hosted_bill_ids(array['draft', 'open']::public.bill_status[])));

-- claims ----------------------------------------------------------------------
create policy "claims: readable with the bill"
  on public.claims for select to authenticated
  using (bill_id in (select private.readable_bill_ids()));

-- Guests: only their own claims. Host: may also assign items to anyone
-- (SPEC §5.3 "host can assign unclaimed items"). Only while open.
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

-- settlements -----------------------------------------------------------------
-- Host sees all settlements on their bills; a guest sees only their own.
create policy "settlements: host sees all, guest sees own"
  on public.settlements for select to authenticated
  using (
    bill_id in (select private.hosted_bill_ids(array['locked', 'archived']::public.bill_status[]))
    or (participant_id in (select private.my_participant_ids())
        and bill_id in (select private.joined_bill_ids(array['locked']::public.bill_status[])))
  );

create policy "settlements: host creates after lock"
  on public.settlements for insert to authenticated
  with check (bill_id in (select private.hosted_bill_ids(array['locked']::public.bill_status[])));

-- Which transition each side may make is enforced by the trigger.
create policy "settlements: guest updates own, host updates any, while locked"
  on public.settlements for update to authenticated
  using (
    bill_id in (select private.hosted_bill_ids(array['locked']::public.bill_status[]))
    or (participant_id in (select private.my_participant_ids())
        and bill_id in (select private.joined_bill_ids(array['locked']::public.bill_status[])))
  )
  with check (
    bill_id in (select private.hosted_bill_ids(array['locked']::public.bill_status[]))
    or (participant_id in (select private.my_participant_ids())
        and bill_id in (select private.joined_bill_ids(array['locked']::public.bill_status[])))
  );

-- audit_log -------------------------------------------------------------------
-- Read-only, host-only, for their own bills. No insert/update/delete policies
-- (and no privileges): only SECURITY DEFINER triggers write here.
create policy "audit_log: host reads own bills' history"
  on public.audit_log for select to authenticated
  using (bill_id in (select private.hosted_bill_ids(
           array['draft', 'open', 'locked', 'archived']::public.bill_status[])));

-- -----------------------------------------------------------------------------
-- Realtime (SPEC §5.2.4). postgres_changes respects RLS for each subscriber.
-- bill_adjustments is included too (beyond the original list) so guests see
-- tax/tip edits live in their running total.
-- Gotcha: with RLS on, DELETE events carry only the primary key and cannot be
-- filtered by bill_id; clients should drop the matching row by key.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.bills,
  public.line_items,
  public.bill_adjustments,
  public.participants,
  public.claims,
  public.settlements;
