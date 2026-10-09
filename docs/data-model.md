# Data model (DRAFT, awaiting approval)

> **DRAFT: not applied anywhere.** CLAUDE.md says schema changes need your OK first.
> Source: `supabase/migrations/0001_initial_schema.sql`. Tests: `supabase/tests/rls_test.sql`.

## Tables at a glance (ER summary)

```
auth.users 1─1 profiles (hosts only: name, Venmo/PayPal/Cash App handles)
profiles   1─* bills (host_id)            bills.share_code = the secret in the link
bills      1─* line_items                 price_cents bigint, quantity, source ai|manual
bills      1─* bill_adjustments           kind tax|tip|fee|discount, amount_cents ≥ 0
bills      1─* participants ─*─1 auth.users   (host is participant #1; guests via join_bill)
line_items *─* participants  via claims   PK (line_item_id, participant_id) → idempotent
bills      1─* settlements ─1 participant  amount_cents, status, idempotency_key
audit_log  (no FKs, append-only)          who / what / when / before / after / reason
```

Money is always integer cents (`bigint`), never float or numeric. Timestamps are `timestamptz` (UTC).
The database does **not** compute who owes what; `src/core/split.ts` does that. The database
enforces who may change what, and when.

## Bill state machine (enforced by a trigger, not just the UI)

```
draft ──open──▶ open ──lock──▶ locked ──(retention job)──▶ archived
  ▲               │                                          ▲
  └──reopen───────┘   draft/open older than 30 days ─────────┘ (retention job)
```
Any other move (e.g. locked → open) raises an error. Locked and archived bills are frozen:
no item, adjustment, or claim changes, even for admin roles. Every change is written to `audit_log`.

Settlements: `unpaid → marked_paid` (guest, "I've paid") · `marked_paid → unpaid` (guest undo) ·
`→ confirmed` (host only, "Received") · `confirmed → marked_paid` (host undo).

## Auth and permissions in plain language

- **Everyone has a login, even guests.** Hosts use Google. Guests are signed in silently with
  Supabase **anonymous sign-in**, so the database knows "this is the same phone as before"
  (`auth.uid()`) without asking for an email. This replaces SPEC §9's hand-rolled guest token.
- **Row Level Security (RLS)** is a filter Postgres adds to every query. Even if the app has a bug,
  a guest's query simply can't return rows they aren't allowed to see.
- **Joining:** the link holds a random 12-character `share_code`. The `join_bill(share_code, name)`
  function is the only way in. It works only while the bill is `open`, and joining twice is safe.
  Bills can't be found by guessing ids.
- **What a participant can do:** read the bill, items, adjustments, everyone's display names, and claims.
  Add or remove **their own** claims while the bill is open. Mark **their own** settlement paid.
  They can't see other guests' settlements.
- **What the host can do:** everything on their own bill while it's draft or open. They can also
  assign items to anyone. After lock, the host can only create settlements and confirm payments.
- **Audit log:** written only by triggers. The host can read it for their bills; nobody can edit
  or delete it. Participant names are stripped before logging.
- **Retention:** `private.archive_old_bills()` archives old bills, renames guests to "Guest 1, 2…",
  and unlinks their accounts. Scheduling it (pg_cron) is left commented until we confirm free-tier support.

Patterns to look up: *row level security*, *security definer function*, *idempotency key*,
*state machine*, *append-only audit log*, *composite foreign key*.

## Decisions / open questions for you

1. **Anonymous sign-in instead of guest tokens (changes SPEC §9).** Tradeoffs: anonymous users count
   toward MAU (50k free), the feature must be enabled in the dashboard (CAPTCHA recommended), and old
   anonymous users need periodic cleanup. OK?
2. **`price_cents` = printed line total** ("3 × Beer $18" → 1800, qty 3), matching `computeSplit`.
   Splitting into single units = replace with 3 rows. Or do you prefer unit price?
3. **Who archives:** only the retention job (system), not the host, so guests don't lose
   "You owe $X" early. OK?
4. **"Reopen only if nobody marked paid"** is enforced, but settlements only exist after lock,
   and locked bills can't be reopened. So in practice it never triggers. Should
   locked → open ("unlock") exist?
5. **Settlements are written by the host's app after lock** (computed by core logic, idempotency
   key `lock:<bill>:<participant>`). Lock and settlement creation are two steps, so a crash leaves a
   locked bill with missing settlements until retried. Alternative: a `lock_bill(bill_id, amounts)`
   function that does both in one transaction.
6. **Host changes their Venmo handle after lock** → payment buttons change. Snapshot the handles
   onto the bill at lock time, and/or audit profile changes?
7. **Limits chosen:** 50 participants/bill, quantity ≤ 999, a single amount ≤ $9,999,999.99
   (matches `parse.ts`), names ≤ 50/100 chars. OK?
8. **Realtime:** `bill_adjustments` was added to the publication so tax/tip edits appear live.
   With RLS, DELETE events only carry the primary key.
9. **Audit log growth** vs. the 500 MB free DB, and whether the actor ids of deleted users should be
   scrubbed. Keep forever for now?
10. Guests can't leave a bill themselves (the host can remove them while open). Is that needed?
11. Rate limiting (join/claim) is not in the DB; it belongs at the API edge or in Supabase Auth limits.
