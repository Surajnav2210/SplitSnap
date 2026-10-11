# Data model: shareable live bills

Source: `supabase/migrations/0001_initial_schema.sql`, `0002_participant_handles.sql` ·
Tests: `supabase/tests/rls_test.sql`, `supabase/tests/participant_handles_test.sql`

## Tables at a glance

```
auth.users 1─1 profiles (hosts: name + Venmo/PayPal/Cash App handles)
auth.users 1─* bills (host_id)              share_code = the secret in the link
bills      1─* line_items                   price_cents = printed line total, quantity, source ai|manual
bills      1─* bill_adjustments             kind tax|tip|fee|discount, amount_cents ≥ 0
bills      1─* participants ─*─1 auth.users  host = join_order 1, guests 2, 3, …
line_items *─* participants via claims      PK (line_item_id, participant_id) → idempotent
participants 1─0..1 participant_handles     guest's Venmo handle (self + host only)
bills      1─* settlements ─1 participant   created by lock_bill, one per guest with amount > 0
audit_log  (no FKs, append-only)            who / what / when / before / after / reason
```

Money is always integer cents (`bigint`), never float. Timestamps are `timestamptz`.
The database never splits the bill; `src/core/split.ts` does that. The database checks
who may change what and when. At lock time it also checks that the amounts add up
exactly to the bill total.

## Bill state machine (enforced by a trigger)

```
(publish_bill) ─▶ open ──lock_bill──▶ locked ──(retention, 30 days)──▶ archived
                   ▲                    │
                   └────unlock_bill─────┘  only if nobody marked paid; voids settlements
```
`draft` exists only inside `publish_bill`'s transaction. Open bills are also archived
30 days after their last status change (`updated_at`, which unlock also bumps), so a bill
that was just unlocked is never archived straight away. Any other move raises `SS002`. Locked and archived bills are frozen
(`SS003`): no item, adjustment, or claim changes, even for admin roles. Every change is
written to `audit_log`.

Settlements:
- A guest can move their own settlement between `unpaid` and `marked_paid`.
- The host can confirm a settlement that is `marked_paid`, or one that is still `unpaid`
  (the guest paid in cash).
- The host can undo a confirmation, back to `marked_paid` or `unpaid`.
- Guests can't change a confirmed settlement.

## Auth and permissions in plain language

- **Solo mode needs no account.** A host signs in with Google only to share a bill.
- **Guests are signed in silently** with Supabase anonymous sign-in. They get a real user id
  (`auth.uid()`) without giving an email, so the database can recognize "the same phone as
  before". Tradeoff: they count toward monthly active users (50k free).
- **Row Level Security (RLS)** is a filter Postgres adds to every query. Even if the app has
  a bug, a guest's query can't return rows they aren't allowed to see.
- **Participants** can read the bill, its items, adjustments, everyone's display names,
  claims, and their own settlement. They can add or remove their own claims while the bill
  is open, mark their own settlement paid, and leave while it is open. They can also see
  each other's user ids (random anonymous-auth UUIDs in `participants.user_id`); this is
  accepted for v1.
- **The host** can do all of that on their bill, plus:
  - assign or unassign anyone's claims while it is open
  - edit items and adjustments while it is open (same limits as publishing: at most 500
    items and 50 adjustments, discounts never above the items total)
  - remove a guest while it is open
  - lock and unlock the bill
  - confirm payments, including cash payments the guest never marked
  - see every settlement
- **Important writes go through RPC functions** (below). They check the caller themselves.
  Direct table writes are limited to claims, the host's item/adjustment edits, and
  renaming yourself. People leave or are removed only through `leave_bill` and
  `remove_participant`.
- **Guest Venmo handles** (`participant_handles`, for "Request on Venmo") can be read only by
  that guest and the bill's host, never by other guests. They are set only through
  `set_participant_venmo`, never written to the audit log, deleted when the guest leaves or
  is removed, and deleted by retention when the bill is archived.
- **Audit log:** written only by triggers. The host can read it for their bills; nobody can
  edit or delete it. Participant names and user ids are stripped before logging, so
  retention anonymization can't be undone from the log.
- **Retention:** `private.archive_old_bills()` archives old bills, renames guests to
  "Guest 1, 2…" and unlinks their accounts. Scheduling (pg_cron) is still to be confirmed.

Patterns to look up: *row level security*, *security definer function*, *idempotency key*,
*state machine*, *append-only audit log*, *composite foreign key*.

## API (RPC) reference

Call with `supabase.rpc('<name>', { p_...: ... })`. All are `SECURITY DEFINER` with
`set search_path = ''`. Money is always integer cents.

| Function | Who | What |
|---|---|---|
| `publish_bill(p_bill jsonb) returns table(bill_id uuid, share_code text)` | Google user | Creates the bill (open), items, adjustments, host participant (join_order 1). Idempotent per `client_key`: a repeat returns the existing bill (whatever its status) and creates nothing |
| `join_bill(p_share_code text, p_display_name text) returns table(bill_id uuid, participant_id uuid)` | any signed-in user, incl. anonymous | Joins an open bill. Idempotent: returns the existing participant |
| `lock_bill(p_bill_id uuid, p_amounts jsonb, p_host_cents bigint) returns void` | host, bill open | Validates the amounts, snapshots the host's handles, creates settlements, locks the bill. One transaction |
| `unlock_bill(p_bill_id uuid) returns void` | host, bill locked | Deletes the settlements (audited) and reopens the bill. Blocked if any is marked_paid/confirmed |
| `leave_bill(p_bill_id uuid) returns void` | guest, bill open | Removes the caller's participant row and claims |
| `remove_participant(p_participant_id uuid) returns void` | host, bill open | Removes a guest's participant row and claims (audited). The host can't be removed |
| `set_settlement_status(p_settlement_id uuid, p_status text) returns void` | guest or host | Guest, own settlement: `unpaid ⇄ marked_paid`. Host: `unpaid`/`marked_paid → confirmed`, `confirmed → marked_paid`/`unpaid`. Anything else `SS010`. Setting the current status again is a no-op |
| `set_participant_venmo(p_participant_id uuid, p_venmo text) returns void` | that participant or the bill's host; bill open or locked | Sets a guest's Venmo handle. A leading `@` is stripped and the format is `^[A-Za-z0-9._-]{1,64}$` (else `22023`). NULL or '' clears it (the row is deleted). Errors: `P0002` unknown participant, `42501` someone else, `SS001` bill not open/locked |
| `upsert_profile(p_display_name text, p_venmo text, p_paypal text, p_cashapp text) returns void` | Google user | Saves name + handles. NULL or '' clears a handle; handles are stored without @ / $ / paypal.me/ |

`p_bill` shape:
`{client_key: uuid, merchant: text|null, currency: 'USD', host_display_name: text, items: [{name, quantity?, price_cents, source?: 'ai'|'manual', position?}], adjustments?: [{kind: 'tax'|'tip'|'fee'|'discount', amount_cents}]}`.
- `client_key` is required. The app generates a new UUID per share action and reuses it on
  retries. Uniqueness is per host (`unique (host_id, client_key)`), so two hosts can't
  collide.
- Items: 1–500. Names 1–100 chars, price 0–999,999,999.
- Optional item fields default to quantity 1, source `manual`, position = array index.
- Adjustments: up to 50, amount 0–999,999,999.
- Discounts may not exceed the items total.

`p_amounts` shape: `[{participant_id, amount_cents}]`.
- List every non-host participant exactly once; never list the host.
- Every item must be claimed.
- The bill total (items + tax + tip + fee − discount) must not be negative (`SS011`).
- `SUM(amount_cents) + p_host_cents` must equal items + tax + tip + fee − discount.
- Settlements (status `unpaid`, idempotency key `lock:<bill_id>:<participant_id>`) are
  created only for amounts > 0.

Claims are written directly to the `claims` table:
- Add: `insert {line_item_id, participant_id, bill_id}` with `on conflict do nothing`.
- Remove: `delete`.

**Error codes** (SQLSTATE, stable):

| Code | Meaning | Code | Meaning |
|---|---|---|---|
| `28000` | not signed in | `SS004` | unclaimed items at lock |
| `42501` | not allowed (not host, anonymous, no privilege) | `SS005` | amounts don't add up to the bill total |
| `P0002` | not found / no open bill for that link | `SS006` | amounts don't list exactly the bill's guests |
| `22023` | invalid input (incl. more than 500 items / 50 adjustments) | `SS007` | someone marked paid (unlock blocked) |
| `SS001` | wrong bill status for this operation | `SS008` | bill full (50 people) |
| `SS002` | illegal bill status transition | `SS009` | host cannot leave or be removed |
| `SS003` | bill locked/archived: frozen | `SS010` | settlement status change not allowed for you |
| `SS011` | discounts exceed items total | `SS012` | immutable field / append-only |

Realtime publication: `bills`, `line_items`, `bill_adjustments`, `participants`, `claims`,
`settlements`, `participant_handles`. INSERT/UPDATE events respect RLS. DELETE events don't: Supabase can't check
RLS against a deleted row, so it sends every subscriber the old row's primary key, even for
other bills. Those keys are only UUIDs (for `claims`, the line item and participant ids); no
names or amounts are sent. The app treats a DELETE as a hint: drop the row if it has it,
otherwise ignore it. When in doubt it refetches through the RLS-protected reads.

## Open questions

1. Is pg_cron available on the free tier? If not, use a daily Vercel Cron plus a
   service-role-only wrapper function.
2. Audit log growth vs. the 500 MB free database. It is kept forever for now.
3. A retried `lock_bill` whose first call succeeded returns `SS001`. Should the app re-read
   the bill and treat "already locked" as success?
