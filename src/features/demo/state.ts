// Demo bill state: a pure reducer plus a selector that runs the split engine.
// No I/O, no randomness: IDs come from a counter stored in state, so the same
// sequence of actions always produces the same state.

import { addMoney, money, type Money } from "@/core/money";
import { formatCents, percentOf } from "@/core/parse";
import { computeSplit, type BillInput, type SplitResult } from "@/core/split";

export interface DemoItem {
  id: string;
  name: string;
  priceCents: number;
}

export interface DemoPerson {
  id: string;
  name: string;
  joinOrder: number;
}

export interface DemoClaim {
  itemId: string;
  personId: string;
}

export type DemoTip =
  | { mode: "percent"; hundredths: number }
  | { mode: "amount"; cents: number };

export interface DemoState {
  /** Next value for the deterministic ID / join-order counter. */
  nextId: number;
  /**
   * Bumped by loadSample and reset so the UI can discard local input drafts
   * when the whole bill is replaced.
   */
  session: number;
  items: DemoItem[];
  people: DemoPerson[];
  claims: DemoClaim[];
  taxCents: number;
  tip: DemoTip;
  discountCents: number;
}

export type DemoAction =
  | { type: "addItem"; name: string; priceCents: number }
  | { type: "removeItem"; id: string }
  | { type: "addPerson"; name: string }
  | { type: "removePerson"; id: string }
  | { type: "toggleClaim"; itemId: string; personId: string }
  | { type: "setTax"; cents: number }
  | { type: "setTip"; tip: DemoTip }
  | { type: "setDiscount"; cents: number }
  | { type: "loadSample" }
  | { type: "reset" };

export const DEFAULT_TIP_HUNDREDTHS = 1800;
export const SAMPLE_TAX_HUNDREDTHS = 825;

export const initialDemoState: DemoState = {
  nextId: 1,
  session: 0,
  items: [],
  people: [],
  claims: [],
  taxCents: 0,
  tip: { mode: "percent", hundredths: DEFAULT_TIP_HUNDREDTHS },
  discountCents: 0,
};

function isNonNegativeCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidTip(tip: DemoTip): boolean {
  if (tip.mode === "percent") {
    return Number.isSafeInteger(tip.hundredths) && tip.hundredths >= 0 && tip.hundredths <= 10_000;
  }
  return isNonNegativeCents(tip.cents);
}

/** Sum of item prices (pre-tax, pre-discount). */
export function itemsSubtotal(items: readonly DemoItem[]): Money {
  return items.reduce((acc, item) => addMoney(acc, money(item.priceCents)), money(0));
}

/** Tip in cents: a percent tip is computed on the pre-tax items subtotal. */
export function tipCents(state: Pick<DemoState, "items" | "tip">): number {
  if (state.tip.mode === "amount") return state.tip.cents;
  return percentOf(itemsSubtotal(state.items), state.tip.hundredths).cents;
}

function buildSample(session: number): DemoState {
  const names = ["Alex", "Sam", "Priya", "Jordan"];
  const people: DemoPerson[] = names.map((name, i) => ({
    id: `person-${i + 1}`,
    name,
    joinOrder: i + 1,
  }));
  const [alex, sam, priya, jordan] = people.map((p) => p.id);

  const menu: { name: string; priceCents: number; claimedBy: string[] }[] = [
    { name: "Truffle fries (shared)", priceCents: 1200, claimedBy: [alex, sam, priya, jordan] },
    { name: "Pitcher of sangria", priceCents: 3200, claimedBy: [alex, sam, priya] },
    { name: "Margherita pizza", priceCents: 1850, claimedBy: [alex] },
    { name: "Smash burger", priceCents: 1725, claimedBy: [sam] },
    { name: "Chicken tikka bowl", priceCents: 1675, claimedBy: [priya] },
    { name: "Caesar salad", priceCents: 1399, claimedBy: [jordan] },
  ];
  const firstItemId = people.length + 1;
  const items: DemoItem[] = menu.map((m, i) => ({
    id: `item-${firstItemId + i}`,
    name: m.name,
    priceCents: m.priceCents,
  }));
  const claims: DemoClaim[] = menu.flatMap((m, i) =>
    m.claimedBy.map((personId) => ({ itemId: items[i].id, personId })),
  );

  return {
    nextId: firstItemId + items.length,
    session,
    items,
    people,
    claims,
    taxCents: percentOf(itemsSubtotal(items), SAMPLE_TAX_HUNDREDTHS).cents,
    tip: { mode: "percent", hundredths: DEFAULT_TIP_HUNDREDTHS },
    discountCents: 0,
  };
}

/**
 * Pure reducer. Invalid actions (blank names, negative or fractional cents,
 * unknown IDs) leave the state unchanged; the UI validates input first and
 * shows the error, so the reducer never has to throw mid-render.
 */
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "addItem": {
      const name = action.name.trim();
      if (name === "" || !isNonNegativeCents(action.priceCents)) return state;
      const item: DemoItem = { id: `item-${state.nextId}`, name, priceCents: action.priceCents };
      return { ...state, nextId: state.nextId + 1, items: [...state.items, item] };
    }
    case "removeItem": {
      if (!state.items.some((i) => i.id === action.id)) return state;
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        claims: state.claims.filter((c) => c.itemId !== action.id),
      };
    }
    case "addPerson": {
      const name = action.name.trim();
      if (name === "") return state;
      const person: DemoPerson = { id: `person-${state.nextId}`, name, joinOrder: state.nextId };
      return { ...state, nextId: state.nextId + 1, people: [...state.people, person] };
    }
    case "removePerson": {
      if (!state.people.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        people: state.people.filter((p) => p.id !== action.id),
        claims: state.claims.filter((c) => c.personId !== action.id),
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
    case "setTax":
      return isNonNegativeCents(action.cents) ? { ...state, taxCents: action.cents } : state;
    case "setTip":
      return isValidTip(action.tip) ? { ...state, tip: action.tip } : state;
    case "setDiscount":
      return isNonNegativeCents(action.cents) ? { ...state, discountCents: action.cents } : state;
    case "loadSample":
      return buildSample(state.session + 1);
    case "reset":
      return { ...initialDemoState, session: state.session + 1 };
  }
}

export type SplitOutcome =
  | { ok: true; result: SplitResult; tipCents: number }
  | { ok: false; error: string };

/** Build the engine input from demo state. */
export function toBillInput(state: DemoState): BillInput {
  return {
    currency: "USD",
    items: state.items.map((i) => ({ id: i.id, priceCents: i.priceCents })),
    participants: state.people.map((p) => ({ id: p.id, joinOrder: p.joinOrder })),
    claims: state.claims.map((c) => ({ itemId: c.itemId, participantId: c.personId })),
    adjustments: [
      { kind: "tax", cents: state.taxCents },
      { kind: "tip", cents: tipCents(state) },
      { kind: "discount", cents: state.discountCents },
    ],
  };
}

/**
 * Run the split engine on the current state. Engine errors (e.g. a discount
 * larger than the items) are returned as `{ ok: false }` so the UI can show
 * them inline instead of crashing.
 */
export function selectSplit(state: DemoState): SplitOutcome {
  const subtotal = itemsSubtotal(state.items);
  if (state.discountCents > subtotal.cents) {
    return {
      ok: false,
      error: `The discount (${formatCents(money(state.discountCents))}) is larger than the items subtotal (${formatCents(subtotal)}).`,
    };
  }
  try {
    const input = toBillInput(state);
    const tip = input.adjustments.find((a) => a.kind === "tip")?.cents ?? 0;
    return { ok: true, result: computeSplit(input), tipCents: tip };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
