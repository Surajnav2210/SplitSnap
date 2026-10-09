// Bill state for the /split flow: a pure reducer plus selectors that run the
// split engine. Extends the demo reducer's model (src/features/demo/state.ts)
// with a host, scanned receipts, fees, quantities, warnings and payment handles.
// No I/O, no randomness: IDs come from a counter in state.

import { money, type Money } from "@/core/money";
import { formatCents, percentOf } from "@/core/parse";
import type { PaymentHandles } from "@/core/paymentLinks";
import { computeSplit, splitEvenly, type BillInput } from "@/core/split";
import {
  DEFAULT_TIP_HUNDREDTHS,
  itemsSubtotal,
  tipCents,
  type DemoClaim,
  type DemoItem,
  type DemoPerson,
  type DemoTip,
  type SplitOutcome,
} from "@/features/demo/state";
import type { ScanResult } from "@/core/receipt";

export interface BillItem extends DemoItem {
  /** Units on this line; priceCents is the whole line. Split with splitItemIntoUnits. */
  quantity: number;
}

export interface BillPerson extends DemoPerson {
  /** Avatar color slot, assigned in the order people were added (stable across removals). */
  tone: number;
}

export interface BillWarning {
  id: string;
  text: string;
}

export type BillSource = "manual" | "scan" | "sample";

export interface BillState {
  nextId: number;
  /** Bumped when the whole bill is replaced so inputs can drop their drafts. */
  session: number;
  source: BillSource | null;
  merchant: string | null;
  items: BillItem[];
  people: BillPerson[];
  hostId: string;
  /** Next avatar color slot. */
  nextTone: number;
  claims: DemoClaim[];
  taxCents: number;
  tip: DemoTip;
  feeCents: number;
  discountCents: number;
  /** Total printed on the receipt, if known. Used only for the consistency check. */
  receiptTotalCents: number | null;
  /** True when the receipt already printed a tip (so the receipt total includes it). */
  receiptIncludesTip: boolean;
  warnings: BillWarning[];
  handles: PaymentHandles;
}

export type BillAction =
  | { type: "start"; source: BillSource }
  | { type: "addItem"; name: string; priceCents: number; quantity?: number }
  | { type: "editItem"; id: string; name?: string; priceCents?: number }
  | { type: "removeItem"; id: string }
  | { type: "splitItemIntoUnits"; itemId: string }
  | { type: "addPerson"; name: string }
  | { type: "removePerson"; id: string }
  | { type: "setHostName"; name: string }
  | { type: "toggleClaim"; itemId: string; personId: string }
  | { type: "assignUnclaimedToAll" }
  | { type: "setTax"; cents: number }
  | { type: "setTip"; tip: DemoTip }
  | { type: "setFee"; cents: number }
  | { type: "setDiscount"; cents: number }
  | { type: "setMerchant"; name: string }
  | { type: "loadScan"; receipt: ScanResult }
  | { type: "dismissWarning"; id: string }
  | { type: "setHandles"; handles: PaymentHandles }
  | { type: "loadSample" }
  | { type: "reset" };

export const MAX_NAME_LENGTH = 40;
export const MAX_ITEM_NAME_LENGTH = 60;
export const MAX_UNITS = 50;
const HOST_ID = "person-1";

function freshState(session: number, handles: PaymentHandles, hostName: string): BillState {
  return {
    nextId: 2,
    session,
    source: null,
    merchant: null,
    items: [],
    people: [{ id: HOST_ID, name: hostName, joinOrder: 1, tone: 0 }],
    hostId: HOST_ID,
    nextTone: 1,
    claims: [],
    taxCents: 0,
    tip: { mode: "percent", hundredths: DEFAULT_TIP_HUNDREDTHS },
    feeCents: 0,
    discountCents: 0,
    receiptTotalCents: null,
    receiptIncludesTip: false,
    warnings: [],
    handles,
  };
}

export const initialBillState: BillState = freshState(0, {}, "You");

const isCents = (v: number) => Number.isSafeInteger(v) && v >= 0;
const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

function isValidTip(tip: DemoTip): boolean {
  if (tip.mode === "percent") {
    return Number.isSafeInteger(tip.hundredths) && tip.hundredths >= 0 && tip.hundredths <= 10_000;
  }
  return isCents(tip.cents);
}

/** Replace the bill's receipt contents, keeping the people (and the host) and handles. */
function withReceipt(
  state: BillState,
  source: BillSource,
  receipt: ScanResult,
): BillState {
  let nextId = state.nextId;
  const items: BillItem[] = [];
  const warnings: BillWarning[] = receipt.warnings
    .map((w) => clean(w, 200))
    .filter((w) => w !== "")
    .map((text) => ({ id: `warning-${nextId++}`, text }));
  let skipped = 0;
  for (const line of receipt.items) {
    const name = clean(line.name, MAX_ITEM_NAME_LENGTH);
    if (name === "" || !isCents(line.priceCents)) {
      skipped++;
      continue;
    }
    const quantity = Number.isSafeInteger(line.quantity) && line.quantity > 0 ? line.quantity : 1;
    items.push({ id: `item-${nextId++}`, name, priceCents: line.priceCents, quantity });
  }
  if (skipped > 0) {
    const text = `${skipped} line${skipped === 1 ? "" : "s"} couldn't be read. Add ${skipped === 1 ? "it" : "them"} by hand.`;
    warnings.push({ id: `warning-${nextId++}`, text });
  }
  const safe = (v: number) => (isCents(v) ? v : 0);
  const tip = safe(receipt.tipCents);
  const merchant = receipt.merchant === null ? null : clean(receipt.merchant, MAX_NAME_LENGTH) || null;
  return {
    ...state,
    nextId,
    session: state.session + 1,
    source,
    merchant,
    items,
    claims: [],
    taxCents: safe(receipt.taxCents),
    tip: tip > 0 ? { mode: "amount", cents: tip } : { mode: "percent", hundredths: DEFAULT_TIP_HUNDREDTHS },
    feeCents: safe(receipt.feeCents),
    discountCents: safe(receipt.discountCents),
    receiptTotalCents:
      receipt.receiptTotalCents !== null && isCents(receipt.receiptTotalCents)
        ? receipt.receiptTotalCents
        : null,
    receiptIncludesTip: tip > 0,
    warnings,
  };
}

/** Sample receipt for "Try a sample receipt": 3 friends plus the host, nothing claimed yet. */
export const SAMPLE_RECEIPT: ScanResult = {
  merchant: "Corner Bistro",
  currency: "USD",
  items: [
    { name: "Truffle fries", quantity: 1, priceCents: 1200 },
    { name: "Margherita pizza", quantity: 1, priceCents: 1850 },
    { name: "Smash burger", quantity: 1, priceCents: 1725 },
    { name: "Chicken tikka bowl", quantity: 1, priceCents: 1675 },
    { name: "Caesar salad", quantity: 1, priceCents: 1399 },
    { name: "Draft IPA", quantity: 3, priceCents: 2100 },
  ],
  taxCents: 821, // 8.25% of $99.49 = 820.79, rounded half-up
  tipCents: 0,
  feeCents: 0,
  discountCents: 0,
  receiptTotalCents: 10770,
  warnings: [],
};
const SAMPLE_FRIENDS = ["Sam", "Priya", "Jordan"];

function addPeople(state: BillState, names: readonly string[]): BillState {
  return names.reduce((s, name) => billReducer(s, { type: "addPerson", name }), state);
}

/**
 * Pure reducer. Invalid actions (blank names, negative or fractional cents,
 * unknown IDs, removing the host) leave the state unchanged.
 */
export function billReducer(state: BillState, action: BillAction): BillState {
  switch (action.type) {
    case "start":
      return state.source === null ? { ...state, source: action.source } : state;
    case "addItem": {
      const name = clean(action.name, MAX_ITEM_NAME_LENGTH);
      const quantity = action.quantity ?? 1;
      if (name === "" || !isCents(action.priceCents)) return state;
      if (!Number.isSafeInteger(quantity) || quantity < 1) return state;
      const item: BillItem = { id: `item-${state.nextId}`, name, priceCents: action.priceCents, quantity };
      return { ...state, nextId: state.nextId + 1, items: [...state.items, item] };
    }
    case "editItem": {
      const target = state.items.find((i) => i.id === action.id);
      if (!target) return state;
      const name = action.name === undefined ? target.name : clean(action.name, MAX_ITEM_NAME_LENGTH);
      const priceCents = action.priceCents ?? target.priceCents;
      if (name === "" || !isCents(priceCents)) return state;
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, name, priceCents } : i)),
      };
    }
    case "removeItem":
      if (!state.items.some((i) => i.id === action.id)) return state;
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        claims: state.claims.filter((c) => c.itemId !== action.id),
      };
    case "splitItemIntoUnits": {
      const index = state.items.findIndex((i) => i.id === action.itemId);
      const item = state.items[index];
      if (!item || item.quantity < 2 || item.quantity > MAX_UNITS) return state;
      const shares = splitEvenly(money(item.priceCents), item.quantity);
      const units: BillItem[] = shares.map((share, k) => ({
        id: `item-${state.nextId + k}`,
        name: item.name,
        priceCents: share.cents,
        quantity: 1,
      }));
      // Anyone who had claimed the whole line keeps a claim on every unit.
      const claimers = state.claims.filter((c) => c.itemId === item.id).map((c) => c.personId);
      const unitClaims = units.flatMap((u) => claimers.map((personId) => ({ itemId: u.id, personId })));
      return {
        ...state,
        nextId: state.nextId + units.length,
        items: [...state.items.slice(0, index), ...units, ...state.items.slice(index + 1)],
        claims: [...state.claims.filter((c) => c.itemId !== item.id), ...unitClaims],
      };
    }
    case "addPerson": {
      const name = clean(action.name, MAX_NAME_LENGTH);
      if (name === "") return state;
      const person: BillPerson = {
        id: `person-${state.nextId}`,
        name,
        joinOrder: state.nextId,
        tone: state.nextTone,
      };
      return {
        ...state,
        nextId: state.nextId + 1,
        nextTone: state.nextTone + 1,
        people: [...state.people, person],
      };
    }
    case "removePerson":
      if (action.id === state.hostId || !state.people.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        people: state.people.filter((p) => p.id !== action.id),
        claims: state.claims.filter((c) => c.personId !== action.id),
      };
    case "setHostName": {
      const name = clean(action.name, MAX_NAME_LENGTH);
      if (name === "") return state;
      return {
        ...state,
        people: state.people.map((p) => (p.id === state.hostId ? { ...p, name } : p)),
      };
    }
    case "toggleClaim": {
      const { itemId, personId } = action;
      if (!state.items.some((i) => i.id === itemId)) return state;
      if (!state.people.some((p) => p.id === personId)) return state;
      const exists = state.claims.some((c) => c.itemId === itemId && c.personId === personId);
      return {
        ...state,
        claims: exists
          ? state.claims.filter((c) => !(c.itemId === itemId && c.personId === personId))
          : [...state.claims, { itemId, personId }],
      };
    }
    case "assignUnclaimedToAll": {
      const claimed = new Set(state.claims.map((c) => c.itemId));
      const added = state.items
        .filter((i) => !claimed.has(i.id))
        .flatMap((i) => state.people.map((p) => ({ itemId: i.id, personId: p.id })));
      return added.length === 0 ? state : { ...state, claims: [...state.claims, ...added] };
    }
    case "setTax":
      return isCents(action.cents) ? { ...state, taxCents: action.cents } : state;
    case "setTip":
      return isValidTip(action.tip) ? { ...state, tip: action.tip } : state;
    case "setFee":
      return isCents(action.cents) ? { ...state, feeCents: action.cents } : state;
    case "setDiscount":
      return isCents(action.cents) ? { ...state, discountCents: action.cents } : state;
    case "setMerchant":
      return { ...state, merchant: clean(action.name, MAX_NAME_LENGTH) || null };
    case "loadScan":
      return withReceipt(state, "scan", action.receipt);
    case "dismissWarning":
      return { ...state, warnings: state.warnings.filter((w) => w.id !== action.id) };
    case "setHandles":
      return { ...state, handles: { ...action.handles } };
    case "loadSample": {
      const base = withReceipt(state, "sample", SAMPLE_RECEIPT);
      const existing = new Set(base.people.map((p) => p.name.toLowerCase()));
      return addPeople(base, SAMPLE_FRIENDS.filter((n) => !existing.has(n.toLowerCase())));
    }
    case "reset": {
      const host = state.people.find((p) => p.id === state.hostId);
      return freshState(state.session + 1, state.handles, host?.name ?? "You");
    }
  }
}

/** Tip in cents (a percent tip is on the pre-tax items subtotal). */
export function billTipCents(state: BillState): number {
  return tipCents(state);
}

export function toBillInput(state: BillState): BillInput {
  return {
    currency: "USD",
    items: state.items.map((i) => ({ id: i.id, priceCents: i.priceCents })),
    participants: state.people.map((p) => ({ id: p.id, joinOrder: p.joinOrder })),
    claims: state.claims.map((c) => ({ itemId: c.itemId, participantId: c.personId })),
    adjustments: [
      { kind: "tax", cents: state.taxCents },
      { kind: "tip", cents: billTipCents(state) },
      { kind: "fee", cents: state.feeCents },
      { kind: "discount", cents: state.discountCents },
    ],
  };
}

/** Run the split engine; engine errors come back as { ok: false } for inline display. */
export function selectBillSplit(state: BillState): SplitOutcome {
  const subtotal = itemsSubtotal(state.items);
  if (state.discountCents > subtotal.cents) {
    return {
      ok: false,
      error: `The discount (${formatCents(money(state.discountCents))}) is larger than the items subtotal (${formatCents(subtotal)}).`,
    };
  }
  const input = toBillInput(state);
  try {
    return { ok: true, result: computeSplit(input), tipCents: billTipCents(state) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type Reconciliation =
  | { status: "unknown" }
  | { status: "match"; receiptTotal: Money; addedTip: Money }
  | { status: "mismatch"; receiptTotal: Money; computed: Money; difference: Money };

/**
 * Compare what we have against the total printed on the receipt
 * (items + tax + fee - discount, plus tip only if the receipt printed one).
 */
export function reconcile(state: BillState): Reconciliation {
  if (state.receiptTotalCents === null) return { status: "unknown" };
  const tip = billTipCents(state);
  const computed =
    itemsSubtotal(state.items).cents +
    state.taxCents +
    state.feeCents -
    state.discountCents +
    (state.receiptIncludesTip ? tip : 0);
  const receiptTotal = money(state.receiptTotalCents);
  if (computed === state.receiptTotalCents) {
    return { status: "match", receiptTotal, addedTip: money(state.receiptIncludesTip ? 0 : tip) };
  }
  return {
    status: "mismatch",
    receiptTotal,
    computed: money(computed),
    difference: money(computed - state.receiptTotalCents),
  };
}

/** Percent tip helper for the UI preview. */
export function tipPreview(state: BillState, hundredths: number): Money {
  return percentOf(itemsSubtotal(state.items), hundredths);
}

/**
 * Words for the host in UI copy, so the default name "You" reads naturally:
 * "Who owes you" / "You get back" vs. "Who owes Alex" / "Alex gets back".
 */
export function hostWords(name: string): { object: string; getsBack: string } {
  const isYou = name.trim().toLowerCase() === "you";
  return isYou
    ? { object: "you", getsBack: "You get back" }
    : { object: name, getsBack: `${name} gets back` };
}

export function hostOf(state: BillState): BillPerson {
  const host = state.people.find((p) => p.id === state.hostId);
  if (!host) throw new Error("Bill has no host");
  return host;
}

export interface ItemShare {
  itemId: string;
  name: string;
  /** This person's share of the item, in cents. */
  cents: number;
  /** How many people split it. */
  ways: number;
}

/**
 * Per-item breakdown for one person, using the same even split and claimer
 * order as computeSplit (join order, then id), so the shares always add up to
 * that person's itemsSubtotal.
 */
export function itemSharesFor(state: BillState, personId: string): ItemShare[] {
  const order = new Map(
    [...state.people]
      .sort((a, b) => a.joinOrder - b.joinOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p, i) => [p.id, i]),
  );
  const shares: ItemShare[] = [];
  for (const item of state.items) {
    const claimers = [
      ...new Set(state.claims.filter((c) => c.itemId === item.id).map((c) => c.personId)),
    ]
      .filter((id) => order.has(id))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const index = claimers.indexOf(personId);
    if (index === -1) continue;
    const split = splitEvenly(money(item.priceCents), claimers.length);
    shares.push({ itemId: item.id, name: item.name, cents: split[index].cents, ways: claimers.length });
  }
  return shares;
}
