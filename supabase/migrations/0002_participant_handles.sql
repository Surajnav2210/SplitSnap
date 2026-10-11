-- Participant payment handles: a guest's Venmo handle, so the host can "Request on Venmo". Overview: docs/data-model.md
--
-- Visible only to the participant themself and the bill's host (never to
-- other guests). Written only through set_participant_venmo(). Handle values
-- never reach the audit log. Deleted by retention when the bill is archived.

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table public.participant_handles (
  participant_id uuid primary key references public.participants (id) on delete cascade,
  bill_id        uuid not null,
  -- Stored without the leading @ (same rule as profiles and src/core/paymentLinks.ts).
  venmo_handle   text,
  updated_at     timestamptz not null default now(),
  constraint participant_handles_venmo_format check (venmo_handle ~ '^[A-Za-z0-9._-]{1,64}$'),
  -- Same pattern as claims: the row's bill must be the participant's bill.
  constraint participant_handles_participant_bill_fk foreign key (participant_id, bill_id)
    references public.participants (id, bill_id) on delete cascade
);

create index participant_handles_bill_id_idx on public.participant_handles (bill_id);

create trigger t20_set_updated_at before update on public.participant_handles
  for each row execute function private.set_updated_at();

-- Audited, with the handle value stripped (no payment handles in the log).
create trigger t90_audit after insert or update or delete on public.participant_handles
  for each row execute function private.audit_row('venmo_handle');

-- -----------------------------------------------------------------------------
-- Privileges and RLS: read-only for clients; writes go through the RPC.
-- -----------------------------------------------------------------------------
revoke all on public.participant_handles from anon, authenticated;
grant select on public.participant_handles to authenticated;

alter table public.participant_handles enable row level security;

create policy "participant_handles: self and the bill's host can read"
  on public.participant_handles for select to authenticated
  using (
    participant_id in (select private.my_participant_ids())
    or bill_id in (select private.hosted_bill_ids(
         array['draft', 'open', 'locked', 'archived']::public.bill_status[]))
  );

-- -----------------------------------------------------------------------------
-- RPC: set_participant_venmo(p_participant_id uuid, p_venmo text) returns void
--   Caller: the participant themself or the bill's host. Bill must be open or
--   locked. NULL or '' clears the handle. A leading '@' is stripped.
--   Errors: 28000 not signed in, 22023 invalid handle, P0002 participant not
--   found, 42501 not that participant or the host, SS001 bill not open/locked.
-- -----------------------------------------------------------------------------
create function public.set_participant_venmo(p_participant_id uuid, p_venmo text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_handle  text := nullif(btrim(p_venmo), '');
  v_bill_id uuid;
  v_host_id uuid;
  v_status  public.bill_status;
  v_user_id uuid;
begin
  if v_uid is null then
    raise exception 'set_participant_venmo: not signed in' using errcode = '28000';
  end if;

  if v_handle is not null then
    v_handle := regexp_replace(v_handle, '^@', '');
    if v_handle !~ '^[A-Za-z0-9._-]{1,64}$' then
      raise exception 'set_participant_venmo: invalid Venmo handle' using errcode = '22023';
    end if;
  end if;

  select p.bill_id into v_bill_id
  from public.participants p
  where p.id = p_participant_id;

  if not found then
    raise exception 'set_participant_venmo: participant not found' using errcode = 'P0002';
  end if;

  -- Same lock order as every other write: bill row first.
  select b.host_id, b.status into v_host_id, v_status
  from public.bills b
  where b.id = v_bill_id
  for share;

  -- Re-read after the lock (the participant may have left meanwhile).
  select p.user_id into v_user_id
  from public.participants p
  where p.id = p_participant_id;

  if not found then
    raise exception 'set_participant_venmo: participant not found' using errcode = 'P0002';
  end if;
  if not (v_uid = v_host_id or v_uid = v_user_id) then
    raise exception 'set_participant_venmo: only that participant or the host can set this'
      using errcode = '42501';
  end if;
  if v_status not in ('open', 'locked') then
    raise exception 'set_participant_venmo: bill is %, handles can only change while open or locked', v_status
      using errcode = 'SS001';
  end if;

  perform private.set_audit_reason('set_participant_venmo');
  if v_handle is null then
    delete from public.participant_handles h where h.participant_id = p_participant_id;
  else
    insert into public.participant_handles (participant_id, bill_id, venmo_handle)
    values (p_participant_id, v_bill_id, v_handle)
    on conflict (participant_id) do update
      set venmo_handle = excluded.venmo_handle;
  end if;
  perform private.set_audit_reason(null);
end;
$$;

revoke all on function public.set_participant_venmo(uuid, text) from public, anon;
grant execute on function public.set_participant_venmo(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Retention: same as 0001, plus deleting participant handles of archived bills.
-- (CREATE OR REPLACE keeps the existing privileges: no client can execute it.)
-- -----------------------------------------------------------------------------
create or replace function private.archive_old_bills(p_now timestamptz default now())
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

  delete from public.participant_handles h
  using public.bills b
  where b.id = h.bill_id
    and b.status = 'archived';

  perform private.set_audit_reason(null);
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Realtime: the host's screen updates when a guest adds a handle (RLS applies
-- to INSERT/UPDATE; DELETE events carry only the primary key).
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.participant_handles;
