// Live (shared) bills: pure mapping between database rows and the split
// engine. No I/O, no floats, no clocks.
//
// The database stores money as Postgres `bigint`. Depending on the driver and
// the value, PostgREST may return those as JSON numbers or as strings, so every
// integer column goes through parseDbInt, which accepts both and refuses
// anything that isn't an exact safe integer.
//
// The database never computes who owes what. This module does, with
// computeSplit (src/core/split.ts), and builds the exact payload the host's app
// sends to lock_bill. The database then re-checks that the amounts add up.

import { money } from "./money";
import { MAX_INPUT_CENTS } from "./parse";
import { buildPaymentLinks, normalizeHandle, type PaymentHandles, type PaymentLink } from "./paymentLinks";
import { computeSplit, type AdjustmentKind, type BillInput, type SplitResult } from "./split";
import { paymentNote } from "./summary";

// ---------------------------------------------------------------------------
// Raw rows, as read from the database (snake_case). The adapter validates the
// shape with zod; this module converts the values.
// ---------------------------------------------------------------------------

/** A bigint column: a JSON number or a decimal string. */
export type DbInt = number | string;

export type LiveBillStatus = "draft" | "open" | "locked" | "archived";
export type SettlementStatus = "unpaid" | "marked_paid" | "confirmed";

export interface BillRow {
  id: string;
  share_code: string;
  host_id: string;
  merchant: string | null;
  status: LiveBillStatus;
  currency: string;
  /** Host's handles, snapshotted by lock_bill (null while open). */
  host_venmo_handle: string | null;
  host_paypal_handle: string | null;
  host_cashapp_handle: string | null;
}

export interface LineItemRow {
  id: string;
  bill_id: string;
  name: string;
  quantity: DbInt;
  price_cents: DbInt;
  position: DbInt;
}

export interface AdjustmentRow {
  id: string;
  bill_id: string;
  kind: AdjustmentKind;
  amount_cents: DbInt;
}

export interface ParticipantRow {
  id: string;
  bill_id: string;
  user_id: string | null;
  display_name: string;
  join_order: DbInt;
  is_host?: boolean | null;
}

export interface ClaimRow {
  bill_id: string;
  line_item_id: string;
  participant_id: string;
}

export interface SettlementRow {
  id: string;
  bill_id: string;
  participant_id: string;
  amount_cents: DbInt;
  status: SettlementStatus;
  /** Set while the guest has marked paid; kept when the host then confirms. */
  marked_paid_at?: string | null;
}

/** A guest's own Venmo username, so the host can request money (participant_handles). */
export interface ParticipantHandleRow {
  participant_id: string;
  bill_id: string;
  venmo_handle: string | null;
  updated_at: string;
}

export interface LiveBillRows {
  bill: BillRow;
  items: readonly LineItemRow[];
  adjustments: readonly AdjustmentRow[];
  participants: readonly ParticipantRow[];
  claims: readonly ClaimRow[];
  settlements: readonly SettlementRow[];
  /** Visible rows only: a guest sees their own, the host sees everyone's. */
  participantHandles?: readonly ParticipantHandleRow[];
}

// ---------------------------------------------------------------------------
// Parsed snapshot (camelCase, integer cents)
// ---------------------------------------------------------------------------

export interface LiveItem {
  id: string;
  name: string;
  quantity: number;
  priceCents: number;
  position: number;
}

export interface LiveAdjustment {
  id: string;
  kind: AdjustmentKind;
  cents: number;
}

export interface LiveParticipant {
  id: string;
  userId: string | null;
  name: string;
  joinOrder: number;
  isHost: boolean;
  /** Avatar color slot: position in join order (0 = host). */
  tone: number;
}

export interface LiveClaim {
  itemId: string;
  participantId: string;
}

export interface LiveSettlement {
  id: string;
  participantId: string;
  amountCents: number;
  status: SettlementStatus;
  /** True if the guest said they paid (vs. the host marking cash received directly). */
  guestMarkedPaid: boolean;
}

export interface LiveBill {
  id: string;
  shareCode: string;
  hostUserId: string;
  merchant: string | null;
  status: LiveBillStatus;
  currency: "USD";
  /** Host's payment handles, snapshotted onto the bill when it was locked. */
  handles: PaymentHandles;
  /** Sorted by position, then id. */
  items: LiveItem[];
  adjustments: LiveAdjustment[];
  /** Sorted by join order, then id. */
  participants: LiveParticipant[];
  claims: LiveClaim[];
  settlements: LiveSettlement[];
  /** Participant id -> their Venmo username (no "@"), for the rows the viewer can see. */
  participantVenmo: Readonly<Record<string, string>>;
}

const SAFE_INT_RE = /^-?\d{1,16}$/;

/**
 * Parse a bigint column that may arrive as a number or a string.
 * Throws RangeError unless it is an exact safe integer ("12", 12, "-3").
 * Rejects floats, exponents, blanks, and anything beyond ±(2^53 - 1).
 */
export function parseDbInt(value: DbInt, label: string): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
    return value;
  }
  const trimmed = value.trim();
  if (!SAFE_INT_RE.test(trimmed)) throw new RangeError(`${label} must be an integer`);
  const big = BigInt(trimmed);
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} is too large`);
  }
  return Number(big);
}

/** parseDbInt for money: also rejects negative amounts. */
export function parseCents(value: DbInt, label: string): number {
  const cents = parseDbInt(value, label);
  if (cents < 0) throw new RangeError(`${label} can't be negative`);
  return cents;
}

function cleanHandle(app: keyof PaymentHandles, raw: string | null): string | undefined {
  if (raw === null) return undefined;
  return normalizeHandle(app, raw) ?? undefined;
}

function byIdTieBreak(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Convert validated rows into a snapshot with integer cents.
 *
 * Rows are fetched with separate queries, so a snapshot can briefly see a
 * claim whose item or participant was deleted between two reads. Such claims
 * are dropped here (the next refetch is consistent). Rows that belong to a
 * different bill are a bug and throw.
 */
export function toLiveBill(rows: LiveBillRows): LiveBill {
  const { bill } = rows;
  if (bill.currency !== "USD") throw new Error(`Unsupported currency: ${bill.currency}`);
  const own = (row: { bill_id: string }, what: string) => {
    if (row.bill_id !== bill.id) throw new Error(`${what} belongs to a different bill`);
  };

  const items: LiveItem[] = rows.items
    .map((r) => {
      own(r, "Line item");
      return {
        id: r.id,
        name: r.name,
        quantity: parseDbInt(r.quantity, "Item quantity"),
        priceCents: parseCents(r.price_cents, "Item price"),
        position: parseDbInt(r.position, "Item position"),
      };
    })
    .sort((a, b) => a.position - b.position || byIdTieBreak(a.id, b.id));

  const adjustments: LiveAdjustment[] = rows.adjustments.map((r) => {
    own(r, "Adjustment");
    return { id: r.id, kind: r.kind, cents: parseCents(r.amount_cents, `Adjustment (${r.kind})`) };
  });

  const participants: LiveParticipant[] = rows.participants
    .map((r) => {
      own(r, "Participant");
      return {
        id: r.id,
        userId: r.user_id,
        name: r.display_name,
        joinOrder: parseDbInt(r.join_order, "Join order"),
        isHost: r.is_host === true || (r.user_id !== null && r.user_id === bill.host_id),
        tone: 0,
      };
    })
    .sort((a, b) => a.joinOrder - b.joinOrder || byIdTieBreak(a.id, b.id))
    .map((p, i) => ({ ...p, tone: i }));

  const itemIds = new Set(items.map((i) => i.id));
  const participantIds = new Set(participants.map((p) => p.id));
  const seen = new Set<string>();
  const claims: LiveClaim[] = [];
  for (const r of rows.claims) {
    own(r, "Claim");
    if (!itemIds.has(r.line_item_id) || !participantIds.has(r.participant_id)) continue;
    const key = `${r.line_item_id}:${r.participant_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({ itemId: r.line_item_id, participantId: r.participant_id });
  }

  const settlements: LiveSettlement[] = rows.settlements.map((r) => {
    own(r, "Settlement");
    return {
      id: r.id,
      participantId: r.participant_id,
      amountCents: parseCents(r.amount_cents, "Settlement amount"),
      status: r.status,
      guestMarkedPaid: r.status === "marked_paid" || (r.marked_paid_at !== null && r.marked_paid_at !== undefined),
    };
  });

  const participantVenmo: Record<string, string> = {};
  for (const r of rows.participantHandles ?? []) {
    own(r, "Participant handle");
    if (!participantIds.has(r.participant_id)) continue;
    const venmo = cleanHandle("venmo", r.venmo_handle);
    if (venmo !== undefined) participantVenmo[r.participant_id] = venmo;
  }

  return {
    id: bill.id,
    shareCode: bill.share_code,
    hostUserId: bill.host_id,
    merchant: bill.merchant,
    status: bill.status,
    currency: "USD",
    handles: {
      venmo: cleanHandle("venmo", bill.host_venmo_handle),
      paypal: cleanHandle("paypal", bill.host_paypal_handle),
      cashapp: cleanHandle("cashapp", bill.host_cashapp_handle),
    },
    items,
    adjustments,
    participants,
    claims,
    settlements,
    participantVenmo,
  };
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

export function toBillInput(bill: LiveBill): BillInput {
  return {
    currency: bill.currency,
    items: bill.items.map((i) => ({ id: i.id, priceCents: i.priceCents })),
    adjustments: bill.adjustments.map((a) => ({ kind: a.kind, cents: a.cents })),
    participants: bill.participants.map((p) => ({ id: p.id, joinOrder: p.joinOrder })),
    claims: bill.claims.map((c) => ({ itemId: c.itemId, participantId: c.participantId })),
  };
}

export type LiveSplitOutcome = { ok: true; result: SplitResult } | { ok: false; error: string };

/** Run computeSplit; engine errors come back as { ok: false } for inline display. */
export function computeLiveSplit(bill: LiveBill): LiveSplitOutcome {
  try {
    return { ok: true, result: computeSplit(toBillInput(bill)) };
  } catch (err) {
    if (err instanceof Error) return { ok: false, error: err.message };
    throw err;
  }
}

/** Items nobody has claimed yet, in display order. */
export function unclaimedItemIds(bill: LiveBill): string[] {
  const claimed = new Set(bill.claims.map((c) => c.itemId));
  return bill.items.filter((i) => !claimed.has(i.id)).map((i) => i.id);
}

/** The participant row of the person who paid. Throws if the bill has none. */
export function hostParticipant(bill: LiveBill): LiveParticipant {
  const host = bill.participants.find((p) => p.isHost);
  if (!host) throw new Error("Bill has no host participant");
  return host;
}

/**
 * Claims that "Split the rest evenly" should add: every unclaimed item, for
 * every participant (host included).
 */
export function claimsForSplittingRest(bill: LiveBill): LiveClaim[] {
  return unclaimedItemIds(bill).flatMap((itemId) =>
    bill.participants.map((p) => ({ itemId, participantId: p.id })),
  );
}

// ---------------------------------------------------------------------------
// Lock payload
// ---------------------------------------------------------------------------

export interface LockPayload {
  /** One entry per non-host participant, in join order (zero amounts included). */
  amounts: { participantId: string; amountCents: number }[];
  /** The host's own share: not owed to anyone. */
  hostCents: number;
  billTotalCents: number;
}

/**
 * Freeze the split into the payload for lock_bill. Throws (with a message safe
 * to show the host) unless the bill is open, has items, and every item is
 * claimed. Asserts that the amounts plus the host's share equal the bill total
 * exactly before anything is sent.
 */
export function buildLockPayload(bill: LiveBill): LockPayload {
  if (bill.status !== "open") throw new Error("Only an open bill can be locked.");
  if (bill.items.length === 0) throw new Error("Add at least one item before locking.");
  const host = hostParticipant(bill);
  const result = computeSplit(toBillInput(bill));
  if (!result.isFullyClaimed) {
    const n = result.unassigned.itemIds.length;
    throw new Error(`${n} item${n === 1 ? " is" : "s are"} still unclaimed.`);
  }

  let hostCents: number | null = null;
  const amounts: LockPayload["amounts"] = [];
  let sum = 0;
  for (const share of result.participants) {
    sum = money(sum + share.total.cents).cents;
    if (share.participantId === host.id) {
      hostCents = share.total.cents;
    } else {
      amounts.push({ participantId: share.participantId, amountCents: share.total.cents });
    }
  }
  if (hostCents === null) throw new Error("Bill has no host participant");
  for (const a of amounts) {
    if (!Number.isSafeInteger(a.amountCents) || a.amountCents < 0) {
      throw new Error("A share came out negative; refusing to lock.");
    }
  }
  if (sum !== result.billTotal.cents) {
    throw new Error(`Shares (${sum}) don't add up to the bill total (${result.billTotal.cents}).`);
  }
  return { amounts, hostCents, billTotalCents: result.billTotal.cents };
}

// ---------------------------------------------------------------------------
// Publish payload (p_bill for publish_bill)
// ---------------------------------------------------------------------------

export interface PublishBillPayload {
  /** Idempotency key: publishing again with the same key returns the same bill. */
  client_key: string;
  merchant: string | null;
  currency: "USD";
  host_display_name: string;
  items: { name: string; quantity: number; price_cents: number; source: "ai" | "manual"; position: number }[];
  adjustments: { kind: AdjustmentKind; amount_cents: number }[];
}

export interface PublishInput {
  merchant: string | null;
  hostName: string;
  source: "ai" | "manual";
  items: readonly { name: string; quantity: number; priceCents: number }[];
  adjustments: readonly { kind: AdjustmentKind; cents: number }[];
}

export const MAX_DISPLAY_NAME_LENGTH = 50;
export const MAX_ITEM_NAME_LENGTH = 100;
export const MAX_MERCHANT_LENGTH = 100;
export const MAX_LIVE_ITEMS = 200;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Trim and validate a person's display name. Returns null if unusable. */
export function cleanDisplayName(raw: string): string | null {
  const name = oneLine(raw);
  if (name === "" || name.length > MAX_DISPLAY_NAME_LENGTH) return null;
  return name;
}

/**
 * Build publish_bill's p_bill from a local bill. `clientKey` (a UUID) must be
 * reused on every retry of the same publish so it can never create two bills. Throws Error with a message
 * safe to show if the bill can't be shared as is. Zero adjustments are left
 * out; amounts must be non-negative integer cents.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function buildPublishPayload(input: PublishInput, clientKey: string): PublishBillPayload {
  if (!isUuid(clientKey)) throw new Error("Couldn't prepare the link. Go back and tap “Share with the table” again.");
  const host = cleanDisplayName(input.hostName);
  if (host === null) throw new Error(`Enter your name (1–${MAX_DISPLAY_NAME_LENGTH} characters).`);
  if (input.items.length === 0) throw new Error("Add at least one item first.");
  if (input.items.length > MAX_LIVE_ITEMS) throw new Error(`A shared bill can have at most ${MAX_LIVE_ITEMS} items.`);

  const items = input.items.map((item, position) => {
    const name = oneLine(item.name).slice(0, MAX_ITEM_NAME_LENGTH).trim();
    if (name === "") throw new Error("Every item needs a name.");
    if (!Number.isSafeInteger(item.priceCents) || item.priceCents < 0 || item.priceCents > MAX_INPUT_CENTS) throw new Error(`"${name}" has an invalid price.`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error(`"${name}" has an invalid quantity.`);
    return { name, quantity: item.quantity, price_cents: item.priceCents, source: input.source, position };
  });

  const adjustments: PublishBillPayload["adjustments"] = [];
  for (const adj of input.adjustments) {
    if (!Number.isSafeInteger(adj.cents) || adj.cents < 0 || adj.cents > MAX_INPUT_CENTS) throw new Error(`The ${adj.kind} amount is invalid.`);
    if (adj.cents > 0) adjustments.push({ kind: adj.kind, amount_cents: adj.cents });
  }

  const merchant = input.merchant === null ? "" : oneLine(input.merchant).slice(0, MAX_MERCHANT_LENGTH).trim();
  const payload: PublishBillPayload = {
    client_key: clientKey.toLowerCase(),
    merchant: merchant === "" ? null : merchant,
    currency: "USD",
    host_display_name: host,
    items,
    adjustments,
  };
  // Same rule computeSplit enforces for everyone who opens the link.
  const itemsTotal = items.reduce((acc, i) => money(acc + i.price_cents).cents, 0);
  const discount = adjustments
    .filter((a) => a.kind === "discount")
    .reduce((acc, a) => money(acc + a.amount_cents).cents, 0);
  if (discount > itemsTotal) throw new Error("The discount is larger than the items subtotal.");
  return payload;
}

// ---------------------------------------------------------------------------
// Share codes
// ---------------------------------------------------------------------------

// Must match the bills_share_code_format check in the database migration.
const SHARE_CODE_RE = /^[a-km-np-z2-9]{10}$/;

/** Normalize a share code from a URL; null if it can't be a valid code. */
export function normalizeShareCode(raw: string): string | null {
  const code = raw.trim().toLowerCase();
  return SHARE_CODE_RE.test(code) ? code : null;
}

// ---------------------------------------------------------------------------
// Realtime helpers
// ---------------------------------------------------------------------------

export type LiveTable =
  | "bills"
  | "line_items"
  | "bill_adjustments"
  | "participants"
  | "claims"
  | "settlements"
  | "participant_handles";

/**
 * With Row Level Security on, Realtime DELETE events carry only the primary
 * key and can't be filtered by bill_id, so clients listen to all deletes and
 * ask: does this key belong to the bill on screen?
 */
export function isRelevantDelete(bill: LiveBill, table: LiveTable, old: Readonly<Record<string, unknown>>): boolean {
  const str = (key: string) => (typeof old[key] === "string" ? (old[key] as string) : null);
  switch (table) {
    case "bills":
      return str("id") === bill.id;
    case "line_items":
      return bill.items.some((i) => i.id === str("id"));
    case "bill_adjustments":
      return bill.adjustments.some((a) => a.id === str("id"));
    case "participants":
      return bill.participants.some((p) => p.id === str("id"));
    case "settlements":
      return bill.settlements.some((s) => s.id === str("id"));
    case "participant_handles":
      return bill.participants.some((p) => p.id === str("participant_id"));
    case "claims": {
      const itemId = str("line_item_id");
      const participantId = str("participant_id");
      return bill.items.some((i) => i.id === itemId) || bill.participants.some((p) => p.id === participantId);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-viewer view model
// ---------------------------------------------------------------------------

export type LiveRole = "host" | "guest" | "outsider";

export interface SettlementLine {
  participant: LiveParticipant;
  settlement: LiveSettlement | null;
  /** The guest's Venmo username, if they (or the host) added it. */
  venmo: string | null;
}

export interface LiveBillView {
  role: LiveRole;
  host: LiveParticipant;
  /** The viewer's participant row (the host's own row for the host). */
  me: LiveParticipant | null;
  split: SplitResult | null;
  splitError: string | null;
  unclaimedItemIds: string[];
  /** Claims can change: bill is open and the viewer is on it. */
  canClaim: boolean;
  /** Host only: open, has items, every item claimed, split computes. */
  canLock: boolean;
  /** Host only: locked and nobody has marked paid (or been confirmed). */
  canUnlock: boolean;
  /** Guest only, after lock. Null when they owe nothing (no row is created for $0). */
  mySettlement: LiveSettlement | null;
  /** Guest only, after lock, when they owe something. */
  myPaymentLinks: PaymentLink[];
  /** Guest only: the Venmo username they shared with the host, if any. */
  myVenmo: string | null;
  /** Host only: one line per guest, in join order. */
  settlementLines: SettlementLine[];
  /** Host only: owed and not yet confirmed received. */
  outstandingCents: number;
}

/** Everything the screen needs for one viewer. Pure; recomputed on every snapshot. */
export function deriveLiveView(bill: LiveBill, viewerUserId: string | null): LiveBillView {
  const host = hostParticipant(bill);
  const isHost = viewerUserId !== null && viewerUserId === bill.hostUserId;
  const mine = viewerUserId === null ? null : (bill.participants.find((p) => p.userId === viewerUserId) ?? null);
  const me = isHost ? host : mine;
  const role: LiveRole = isHost ? "host" : me !== null ? "guest" : "outsider";

  const outcome = computeLiveSplit(bill);
  const split = outcome.ok ? outcome.result : null;
  const unclaimed = unclaimedItemIds(bill);
  const open = bill.status === "open";

  const mySettlement =
    role === "guest" && me !== null ? (bill.settlements.find((s) => s.participantId === me.id) ?? null) : null;
  const myPaymentLinks =
    mySettlement !== null && (bill.status === "locked" || bill.status === "archived")
      ? buildPaymentLinks(bill.handles, money(mySettlement.amountCents), paymentNote(bill.merchant))
      : [];

  const settlementLines: SettlementLine[] = isHost
    ? bill.participants
        .filter((p) => p.id !== host.id)
        .map((participant) => ({
          participant,
          settlement: bill.settlements.find((s) => s.participantId === participant.id) ?? null,
          venmo: bill.participantVenmo[participant.id] ?? null,
        }))
    : [];
  const outstandingCents = isHost
    ? bill.settlements
        .filter((s) => s.participantId !== host.id && s.status !== "confirmed")
        .reduce((acc, s) => money(acc + s.amountCents).cents, 0)
    : 0;

  return {
    role,
    host,
    me,
    split,
    splitError: outcome.ok ? null : outcome.error,
    unclaimedItemIds: unclaimed,
    canClaim: open && role !== "outsider",
    canLock: isHost && open && bill.items.length > 0 && unclaimed.length === 0 && split !== null,
    canUnlock: isHost && bill.status === "locked" && bill.settlements.every((s) => s.status === "unpaid"),
    mySettlement,
    myPaymentLinks,
    myVenmo: role === "guest" && me !== null ? (bill.participantVenmo[me.id] ?? null) : null,
    settlementLines,
    outstandingCents,
  };
}

/**
 * Which settlement moves a viewer may offer, as (label, next status) pairs.
 * Mirrors the database's settlement state machine:
 * - guest: unpaid -> marked_paid ("I've paid"), and back (undo);
 * - host: marked_paid -> confirmed ("Received"), unpaid -> confirmed ("Mark
 *   received", e.g. cash), and undo back to wherever it came from.
 */
export function settlementActions(
  role: LiveRole,
  settlement: Pick<LiveSettlement, "status" | "guestMarkedPaid">,
): { label: string; next: SettlementStatus }[] {
  const { status } = settlement;
  if (role === "guest") {
    if (status === "unpaid") return [{ label: "I've paid", next: "marked_paid" }];
    if (status === "marked_paid") return [{ label: "Undo", next: "unpaid" }];
    return [];
  }
  if (role === "host") {
    if (status === "unpaid") return [{ label: "Mark received", next: "confirmed" }];
    if (status === "marked_paid") return [{ label: "Received", next: "confirmed" }];
    return [{ label: "Undo", next: settlement.guestMarkedPaid ? "marked_paid" : "unpaid" }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Optimistic updates (shown until the next snapshot arrives)
// ---------------------------------------------------------------------------

export function hasClaim(bill: LiveBill, itemId: string, participantId: string): boolean {
  return bill.claims.some((c) => c.itemId === itemId && c.participantId === participantId);
}

/** The bill with one claim flipped. Unknown items/participants leave it unchanged. */
export function withClaimToggled(bill: LiveBill, itemId: string, participantId: string): LiveBill {
  if (!bill.items.some((i) => i.id === itemId) || !bill.participants.some((p) => p.id === participantId)) return bill;
  const claims = hasClaim(bill, itemId, participantId)
    ? bill.claims.filter((c) => !(c.itemId === itemId && c.participantId === participantId))
    : [...bill.claims, { itemId, participantId }];
  return { ...bill, claims };
}

/** The bill with claims added (duplicates ignored, like ON CONFLICT DO NOTHING). */
export function withClaimsAdded(bill: LiveBill, added: readonly LiveClaim[]): LiveBill {
  const claims = [...bill.claims];
  for (const c of added) {
    if (!claims.some((x) => x.itemId === c.itemId && x.participantId === c.participantId)) claims.push(c);
  }
  return { ...bill, claims };
}
