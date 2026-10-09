# SPEC — SplitSnap (working name) v1

> "Split the bill before the waiter comes back."
> Snap the receipt, everyone taps what they had, done.

Status: draft for approval · Last updated: 2026-10-08

## 1. Problem
At group dinners, one person pays and then has to work out who owes what:
shared appetizers, tax, and tip make it tedious and error-prone. Splitwise
paywalls receipt scanning and itemization and requires everyone to have an
account. People end up splitting evenly (unfair) or doing math on a napkin.

## 2. Product in one paragraph
The person who paid (the **host**) signs in with Google, snaps a photo of the
receipt, and AI turns it into an editable list of line items. The host
confirms the list and shares a link. Everyone at the table opens the link on
their own phone, enters their name (no account needed), and taps the items they
had. Totals update live for everyone. Shared items split evenly among whoever
claimed them; tax, tip, and fees are allocated in proportion to what each person
ordered. Each guest sees exactly what they owe the host and taps a Venmo,
PayPal, or Cash App button with the amount pre-filled.

## 3. Users
- **Host:** the person who paid. Signs in with Google. Creates and manages bills.
- **Guest:** anyone at the table. Joins via link with just a display name.
  Can optionally sign in with Google to keep a history (nice-to-have, not v1-blocking).
- First 50 users: friends, roommates, campus groups (word of mouth via shared links).

## 4. What it does NOT do (non-goals)
- **Never holds, moves, or processes money.** Payment buttons only open
  third-party apps with a pre-filled amount. We are not affiliated with them.
- No persistent groups or running balances across bills (v2).
- No multi-currency (v2). v1 is USD only, but every amount stores its currency.
- No native mobile app. Responsive web app only (PWA later).
- No paid services of any kind.

## 5. User flows

### 5.1 Host creates a bill
1. Sign in with Google.
2. "New bill" → enter restaurant name (optional) → take/upload a receipt photo
   **or** skip and type items manually.
3. AI extraction returns a **draft**: line items (name, quantity, price),
   subtotal, tax, tip/service charge, discounts, total.
4. Host reviews the draft: edit, add, delete items; fix tax/tip; set tip if not on
   the receipt (percentage of pre-tax subtotal, or a fixed amount).
5. The app shows a **consistency check**: items + tax + tip + fees − discounts
   must equal the receipt total. Mismatch → warning the host must resolve or
   explicitly accept ("receipt total is $X; items add up to $Y").
6. Host adds their payment handles (Venmo / PayPal.me / Cash App; at least one
   recommended, saved to their profile for next time).
7. Host taps "Open for claiming" → gets a share link + QR code.

### 5.2 Guest claims items
1. Opens link → enters display name → becomes a participant on that bill.
2. Sees the item list; taps items they had. Can tap an item others already
   claimed to share it (split evenly among all claimers).
3. Sees a live running total: their items + their share of tax/tip/fees.
4. Everyone's claims update live on every screen (Supabase Realtime).
5. Host also claims their own items (the host's share is not owed to anyone).

### 5.3 Finalize and settle
1. Host sees unclaimed items highlighted. Host can assign them, split them
   among everyone, or absorb them.
2. Host taps "Lock bill" → no more claim changes; amounts are frozen.
3. Each guest sees "You owe {host} $X.XX" + payment buttons
   (Venmo / PayPal.me / Cash App, only those the host provided).
4. Guest taps "I've paid" → host sees it and can confirm "Received".
   (We can't verify payment; these are self-reported markers.)
5. Host dashboard: who has paid, who hasn't, total outstanding.

## 6. Money rules (core logic — pure, tested, no I/O)
- All amounts are **integer cents** with a currency code (`USD`). No floats anywhere.
- **Shared item split:** item price ÷ number of claimers, using integer division.
  Leftover cents go one at a time to claimers in a deterministic order
  (by join time). Sum of shares must always equal the item price exactly.
- **Tax / tip / fees / discounts allocation:** proportional to each person's
  claimed subtotal, using the **largest-remainder method** so the allocated
  pieces sum *exactly* to the original amount. Ties broken deterministically.
- **Invariant:** the sum of everyone's totals (including the host) == bill total.
  This is tested for every scenario.
- Line items with quantity > 1 (e.g. "3 × Beer $18"): host can split into
  individually claimable units.
- A person who claims nothing owes $0 (they don't get a share of tax/tip).
- Edge cases to test: zero-price items, single participant, 100% discount,
  tip of $0, an item claimed by everyone, a 1-cent item split 3 ways,
  very large bills (e.g. $99,999.99), unclaimed items at lock time.

## 7. Bill state machine
```
draft ──open──▶ open ──lock──▶ locked ──(30 days)──▶ archived
  ▲               │
  └──reopen───────┘   (host only, while no one has marked "paid")
```
- `draft`: only the host can see/edit; items editable.
- `open`: guests can join and claim; host can still edit items (claims on an
  edited item are kept; deleted items drop their claims, with a notice).
- `locked`: amounts frozen; settlement markers ("I've paid" / "Received") allowed.
- `archived`: read-only for the host; the guest link stops working. Receipt photo already deleted.
- Every transition is persisted and written to the audit log. No silent transitions.

## 8. AI receipt extraction (Gemini free tier)
- **AI drafts, code computes.** Gemini only turns the image into structured
  JSON; it never calculates what anyone owes.
- Output validated against a strict schema (names, integer cents, quantities).
  Invalid or partial output → show what we could parse + let the host fix it.
- The host always reviews before anything is shared.
- **Fallback:** if Gemini fails, times out, or the free quota is exhausted, the
  host gets a clear message and the manual entry form. The app is fully usable without AI.
- **Privacy:** the free tier allows Google to use inputs to improve its products.
  We show a one-line notice before upload, and delete the photo from our storage
  right after extraction.
- Rate-limit receipt scans per user per day so one user can't burn the shared quota.

## 9. Auth and access
- Hosts: Google sign-in via Supabase Auth (scopes: openid, email, profile only).
- Guests: no account. Joining creates a participant record + a random guest
  token stored in the browser, scoped to that one bill. The token lets them edit
  only their own claims.
- Share links use unguessable IDs (not sequential).
- Postgres Row Level Security on every table: hosts see only their own bills;
  guests see only bills they hold a valid link/token for.
- Basic rate limiting on join/claim/scan endpoints.

## 10. Data (draft — finalized in the build plan)
- `profiles` (host: display name, payment handles)
- `bills` (host, restaurant, status, currency, totals, created/locked/archived timestamps)
- `line_items` (bill, name, quantity, unit price cents, source: ai|manual)
- `bill_adjustments` (bill, type: tax|tip|fee|discount, amount cents)
- `participants` (bill, display name, guest token hash or user id, join order)
- `claims` (line item, participant)
- `settlements` (bill, participant, amount cents, status: unpaid → marked_paid → confirmed)
- `audit_log` (who, what, when, before/after) for every money-related change
- Retention: bills auto-archive 30 days after lock (or after creation if never locked);
  guest names on archived bills are anonymized.

## 11. Payment links
Generated from the host's handles + the exact amount + a note ("SplitSnap: {restaurant}").
- Venmo, PayPal.me, Cash App URL formats verified during build (they change occasionally).
- Clear label: "Opens {app}. SplitSnap never handles your money."

## 12. Stack ($0)
- Next.js + TypeScript on **Vercel Hobby** (non-commercial: fine until we monetize)
- **Supabase** free: Postgres, Auth (Google), Realtime, Storage (temporary receipt photos)
- **Gemini API** free tier for receipt extraction
- Tests: Vitest (unit, core money logic); Playwright for one end-to-end happy path (v1.1)

**Free-tier limits and what happens when we hit them**
| Limit | Effect | Mitigation |
|---|---|---|
| Supabase pauses after ~7 days of no activity | App goes down until resumed | Real usage keeps it awake; one-click resume |
| Supabase 500 MB DB | Can't write new bills | 30-day archival; photos deleted after scan |
| Supabase Realtime ~200 concurrent connections | Live updates degrade | Fall back to refresh-on-focus polling |
| Gemini free quota | Scans fail | Manual entry fallback + per-user daily cap |
| Vercel Hobby non-commercial | Can't monetize | Move to a paid plan if we ever charge |

## 13. Acceptance criteria for v1 launch
- [ ] Host can sign in with Google, create a bill from a photo or manually, and share a link
- [ ] Guest can join with just a name on a phone browser and claim items
- [ ] Claims appear on other participants' screens within ~2 seconds
- [ ] Totals for every participant sum exactly to the bill total (property-tested)
- [ ] Payment buttons open the right app with the right amount
- [ ] App works fully with AI disabled
- [ ] Lighthouse mobile score usable; works on iOS Safari and Android Chrome
- [ ] Deployed to a public `*.vercel.app` URL with a privacy note and disclaimer page
- [ ] `check` passes (typecheck + lint + tests)

## 14. Later (v1.1 / v2)
- **v1.1 Groups:** host saves a bill's people as a group ("Roommates"); new bills
  posted to a group appear for signed-in members without a link; activity feed
  ("Sam claimed 2 items", "Priya marked paid"). v1 schema keeps a nullable
  `bills.group_id` so this needs no rework. No in-app chat (people already have one).
- Notifications: email (free-tier provider) or browser push
- Natural-language expense entry ("Uber 24 split with Sam and Priya")
- Persistent groups and balances across bills; "simplify debts"
- Multi-currency with Frankfurter (ECB) rates
- Optional guest sign-in to keep history; PWA install
- Choosing a payer other than the host

## 15. Open questions
- Final product name (SplitSnap is a placeholder)
- Should guests be allowed to edit item prices, or only the host? (Proposed: host only)
