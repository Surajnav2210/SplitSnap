// Bill split engine. Pure functions only: no I/O, no floats for money.
// All amounts are integer cents. Proportional math uses BigInt for the
// intermediate products (amount * weight) so nothing can overflow or round.
//
// Rounding rules (SPEC.md §6):
// - Even split: integer division; leftover cents go one each to the first
//   parts (callers order parts by join time).
// - Proportional allocation: largest-remainder method; leftover cents go to
//   the largest fractional remainders, ties broken by lower index.
// - Negative amounts are handled symmetrically: allocate the absolute value,
//   then negate every share.

import { money, type Currency, type Money } from "./money";

/** Negate without producing -0 (which breaks Object.is / toBe comparisons). */
function negate(cents: number): number {
  return cents === 0 ? 0 : -cents;
}

/**
 * Split `amount` into `parts` shares that differ by at most 1 cent.
 * Leftover cents go to the lowest indexes. Sum of shares === amount.
 * Example: -10 / 3 -> [-4, -3, -3].
 */
export function splitEvenly(amount: Money, parts: number): Money[] {
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  const total = money(amount.cents, amount.currency).cents;
  const negative = total < 0;
  const abs = Math.abs(total);
  const base = Math.floor(abs / parts);
  const leftover = abs - base * parts;

  const shares: Money[] = [];
  for (let i = 0; i < parts; i++) {
    const share = base + (i < leftover ? 1 : 0);
    shares.push(money(negative ? negate(share) : share, amount.currency));
  }
  return shares;
}

/**
 * Allocate `amount` across buckets in proportion to non-negative integer
 * `weights`, using the largest-remainder method. Sum of shares === amount.
 * A zero-weight bucket always gets exactly 0.
 */
export function allocateProportionally(amount: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new RangeError("weights must not be empty");
  }
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new RangeError(`weights must be non-negative safe integers, got ${w}`);
    }
  }
  const total = money(amount.cents, amount.currency).cents;
  const zero = BigInt(0);
  const totalWeight = weights.reduce((acc, w) => acc + BigInt(w), zero);

  if (totalWeight === zero) {
    if (total === 0) {
      return weights.map(() => money(0, amount.currency));
    }
    throw new RangeError("cannot allocate a non-zero amount when all weights are 0");
  }

  const negative = total < 0;
  const abs = BigInt(Math.abs(total));

  const floors: bigint[] = [];
  const remainders: bigint[] = [];
  let allocated = zero;
  for (const w of weights) {
    const product = abs * BigInt(w);
    const floor = product / totalWeight; // BigInt division truncates; operands are >= 0
    floors.push(floor);
    remainders.push(product % totalWeight);
    allocated += floor;
  }

  // leftover < number of buckets with a non-zero remainder, so zero-weight
  // buckets (remainder 0) can never receive a leftover cent.
  const leftover = Number(abs - allocated);
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = remainders[a];
      const rb = remainders[b];
      if (ra !== rb) return ra > rb ? -1 : 1;
      return a - b;
    });
  for (let k = 0; k < leftover; k++) {
    floors[order[k]] += BigInt(1);
  }

  return floors.map((f) => {
    const cents = Number(f);
    return money(negative ? negate(cents) : cents, amount.currency);
  });
}

export type AdjustmentKind = "tax" | "tip" | "fee" | "discount";

export interface BillInput {
  currency: Currency;
  items: readonly { id: string; priceCents: number }[];
  adjustments: readonly { kind: AdjustmentKind; cents: number }[];
  participants: readonly { id: string; joinOrder: number }[];
  claims: readonly { itemId: string; participantId: string }[];
}

export interface ParticipantShare {
  participantId: string;
  itemsSubtotal: Money;
  tax: Money;
  tip: Money;
  fees: Money;
  /** Negative (or zero): the participant's share of discounts. */
  discount: Money;
  total: Money;
}

export interface SplitResult {
  currency: Currency;
  billTotal: Money;
  /** In join order (ties broken by id). */
  participants: ParticipantShare[];
  unassigned: { itemIds: string[]; itemsSubtotal: Money; total: Money };
  isFullyClaimed: boolean;
}

function assertNonNegativeCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of cents, got ${value}`);
  }
}

/**
 * Compute what each participant owes for a bill.
 * Invariant: sum(participants.total) + unassigned.total === billTotal.
 */
export function computeSplit(bill: BillInput): SplitResult {
  const { currency } = bill;

  // --- Validate items ---
  const itemIds = new Set<string>();
  for (const item of bill.items) {
    if (itemIds.has(item.id)) throw new Error(`Duplicate item id: ${item.id}`);
    itemIds.add(item.id);
    assertNonNegativeCents(item.priceCents, `Item ${item.id} price`);
  }

  // --- Validate and order participants ---
  const participantIds = new Set<string>();
  for (const p of bill.participants) {
    if (participantIds.has(p.id)) throw new Error(`Duplicate participant id: ${p.id}`);
    participantIds.add(p.id);
    if (!Number.isFinite(p.joinOrder)) {
      throw new RangeError(`Participant ${p.id} joinOrder must be a finite number`);
    }
  }
  const ordered = [...bill.participants].sort((a, b) => {
    if (a.joinOrder !== b.joinOrder) return a.joinOrder - b.joinOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const rank = new Map<string, number>();
  ordered.forEach((p, i) => rank.set(p.id, i));

  // --- Validate claims; duplicates are ignored (idempotent) ---
  const claimersByItem = new Map<string, Set<string>>();
  for (const c of bill.claims) {
    if (!itemIds.has(c.itemId)) throw new Error(`Claim references unknown item: ${c.itemId}`);
    if (!participantIds.has(c.participantId)) {
      throw new Error(`Claim references unknown participant: ${c.participantId}`);
    }
    let set = claimersByItem.get(c.itemId);
    if (!set) {
      set = new Set<string>();
      claimersByItem.set(c.itemId, set);
    }
    set.add(c.participantId);
  }

  // --- Validate adjustments and sum per kind ---
  const kindTotals: Record<AdjustmentKind, number> = { tax: 0, tip: 0, fee: 0, discount: 0 };
  for (const adj of bill.adjustments) {
    assertNonNegativeCents(adj.cents, `Adjustment (${adj.kind})`);
    kindTotals[adj.kind] = money(kindTotals[adj.kind] + adj.cents, currency).cents;
  }

  // --- Items: split each among its claimers in join order ---
  const n = ordered.length;
  const itemSubtotals: number[] = new Array<number>(n).fill(0);
  const unassignedItemIds: string[] = [];
  let unassignedSubtotal = 0;
  let itemsTotal = 0;

  for (const item of bill.items) {
    itemsTotal = money(itemsTotal + item.priceCents, currency).cents;
    const claimers = [...(claimersByItem.get(item.id) ?? [])].sort(
      (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
    );
    if (claimers.length === 0) {
      unassignedItemIds.push(item.id);
      unassignedSubtotal = money(unassignedSubtotal + item.priceCents, currency).cents;
      continue;
    }
    const shares = splitEvenly(money(item.priceCents, currency), claimers.length);
    claimers.forEach((pid, i) => {
      const idx = rank.get(pid) ?? 0;
      itemSubtotals[idx] = money(itemSubtotals[idx] + shares[i].cents, currency).cents;
    });
  }

  // Discounts apply to items before tax (restaurant semantics). Because the
  // discount never exceeds the total weight, largest-remainder guarantees each
  // bucket's discount share <= its item subtotal, so no total goes negative.
  if (kindTotals.discount > itemsTotal) {
    throw new RangeError(
      `Total discount (${kindTotals.discount}) exceeds items subtotal (${itemsTotal})`,
    );
  }
  const positiveAdjustments = money(
    kindTotals.tax + kindTotals.tip + kindTotals.fee,
    currency,
  ).cents;
  const grossTotal = money(itemsTotal + positiveAdjustments, currency).cents;
  const billTotal = money(grossTotal - kindTotals.discount, currency);

  // --- Adjustments: allocate each kind proportionally; unassigned is LAST ---
  const weights = [...itemSubtotals, unassignedSubtotal];
  const allocate = (cents: number): Money[] => {
    if (cents === 0) return weights.map(() => money(0, currency));
    if (itemsTotal === 0) {
      // Nothing to weight against (e.g. host still entering items): the whole
      // adjustment goes to the unassigned bucket so the live preview never crashes.
      // Only positive adjustments reach here; discount <= itemsTotal = 0.
      return weights.map((_, i) => money(i === n ? cents : 0, currency));
    }
    return allocateProportionally(money(cents, currency), weights);
  };
  const tax = allocate(kindTotals.tax);
  const tip = allocate(kindTotals.tip);
  const fees = allocate(kindTotals.fee);
  const discount = allocate(negate(kindTotals.discount));

  const bucketTotal = (i: number, items: number): Money =>
    money(items + tax[i].cents + tip[i].cents + fees[i].cents + discount[i].cents, currency);

  const participants: ParticipantShare[] = ordered.map((p, i) => ({
    participantId: p.id,
    itemsSubtotal: money(itemSubtotals[i], currency),
    tax: tax[i],
    tip: tip[i],
    fees: fees[i],
    discount: discount[i],
    total: bucketTotal(i, itemSubtotals[i]),
  }));

  return {
    currency,
    billTotal,
    participants,
    unassigned: {
      itemIds: unassignedItemIds,
      itemsSubtotal: money(unassignedSubtotal, currency),
      total: bucketTotal(n, unassignedSubtotal),
    },
    isFullyClaimed: unassignedItemIds.length === 0,
  };
}
