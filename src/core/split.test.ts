import { describe, expect, it } from "vitest";
import { money, type Money } from "./money";
import {
  allocateProportionally,
  computeSplit,
  splitEvenly,
  type AdjustmentKind,
  type BillInput,
  type SplitResult,
} from "./split";

const cents = (xs: Money[]): number[] => xs.map((m) => m.cents);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

function assertInvariant(r: SplitResult): void {
  const participantsTotal = sum(r.participants.map((p) => p.total.cents));
  expect(participantsTotal + r.unassigned.total.cents).toBe(r.billTotal.cents);
}

function bill(partial: Partial<BillInput>): BillInput {
  return {
    currency: "USD",
    items: [],
    adjustments: [],
    participants: [],
    claims: [],
    ...partial,
  };
}

describe("splitEvenly", () => {
  it("splits 1 cent 3 ways as [1, 0, 0]", () => {
    expect(cents(splitEvenly(money(1), 3))).toEqual([1, 0, 0]);
  });

  it("splits $10 3 ways as 334/333/333", () => {
    expect(cents(splitEvenly(money(1000), 3))).toEqual([334, 333, 333]);
  });

  it("handles negative amounts symmetrically", () => {
    expect(cents(splitEvenly(money(-10), 3))).toEqual([-4, -3, -3]);
    expect(cents(splitEvenly(money(-1), 2))).toEqual([-1, 0]);
  });

  it("returns zeros (not -0) for zero amounts", () => {
    const shares = cents(splitEvenly(money(0), 3));
    shares.forEach((s) => expect(Object.is(s, 0)).toBe(true));
  });

  it("returns the whole amount for a single part", () => {
    expect(cents(splitEvenly(money(999), 1))).toEqual([999]);
  });

  it("carries the currency through", () => {
    splitEvenly(money(100, "USD"), 3).forEach((m) => expect(m.currency).toBe("USD"));
  });

  it("rejects non-positive or non-integer parts", () => {
    expect(() => splitEvenly(money(100), 0)).toThrow(RangeError);
    expect(() => splitEvenly(money(100), -1)).toThrow(RangeError);
    expect(() => splitEvenly(money(100), 1.5)).toThrow(RangeError);
    expect(() => splitEvenly(money(100), Number.NaN)).toThrow(RangeError);
  });

  it("always sums exactly to the amount", () => {
    for (const amount of [0, 1, 7, 100, 1001, -1001, 9_999_999]) {
      for (let parts = 1; parts <= 9; parts++) {
        expect(sum(cents(splitEvenly(money(amount), parts)))).toBe(amount);
      }
    }
  });
});

describe("allocateProportionally", () => {
  it("allocates exactly when shares divide evenly", () => {
    expect(cents(allocateProportionally(money(100), [1, 1, 2]))).toEqual([25, 25, 50]);
  });

  it("gives leftover cents to the largest remainders", () => {
    // exact shares: 100*[1,2,3]/6 = 16.67, 33.33, 50 -> floors 16,33,50 (99); leftover to idx 0
    expect(cents(allocateProportionally(money(100), [1, 2, 3]))).toEqual([17, 33, 50]);
  });

  it("breaks remainder ties by lower index", () => {
    expect(cents(allocateProportionally(money(100), [1, 1, 1]))).toEqual([34, 33, 33]);
    expect(cents(allocateProportionally(money(2), [1, 1, 1]))).toEqual([1, 1, 0]);
  });

  it("handles negative amounts symmetrically", () => {
    expect(cents(allocateProportionally(money(-100), [1, 2, 3]))).toEqual([-17, -33, -50]);
    expect(cents(allocateProportionally(money(-100), [1, 1, 1]))).toEqual([-34, -33, -33]);
  });

  it("never gives cents to a zero-weight bucket", () => {
    expect(cents(allocateProportionally(money(5), [0, 1, 0, 1, 0]))).toEqual([0, 3, 0, 2, 0]);
  });

  it("returns all zeros when all weights and the amount are 0", () => {
    expect(cents(allocateProportionally(money(0), [0, 0]))).toEqual([0, 0]);
  });

  it("throws when all weights are 0 but the amount is not", () => {
    expect(() => allocateProportionally(money(1), [0, 0])).toThrow(RangeError);
  });

  it("rejects empty, negative, and non-integer weights", () => {
    expect(() => allocateProportionally(money(1), [])).toThrow(RangeError);
    expect(() => allocateProportionally(money(1), [1, -1])).toThrow(RangeError);
    expect(() => allocateProportionally(money(1), [1.5])).toThrow(RangeError);
  });

  it("does not overflow with huge amounts and weights", () => {
    const big = Number.MAX_SAFE_INTEGER;
    const shares = allocateProportionally(money(big), [big, big, 1]);
    expect(sum(cents(shares))).toBe(big);
    cents(shares).forEach((c) => expect(Number.isSafeInteger(c)).toBe(true));
  });

  it("always sums exactly to the amount", () => {
    const weightSets = [[1], [3, 7], [1, 1, 1], [5, 0, 9, 2], [333, 333, 334]];
    for (const amount of [0, 1, 99, 1000, -777, 9_999_999]) {
      for (const w of weightSets) {
        expect(sum(cents(allocateProportionally(money(amount), w)))).toBe(amount);
      }
    }
  });
});

describe("computeSplit", () => {
  it("splits a simple bill with tax and tip proportionally", () => {
    const r = computeSplit(
      bill({
        items: [
          { id: "burger", priceCents: 1500 },
          { id: "salad", priceCents: 500 },
        ],
        adjustments: [
          { kind: "tax", cents: 200 },
          { kind: "tip", cents: 400 },
        ],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "b", joinOrder: 2 },
        ],
        claims: [
          { itemId: "burger", participantId: "a" },
          { itemId: "salad", participantId: "b" },
        ],
      }),
    );
    expect(r.billTotal.cents).toBe(2600);
    expect(r.participants[0]).toMatchObject({
      participantId: "a",
      itemsSubtotal: { cents: 1500 },
      tax: { cents: 150 },
      tip: { cents: 300 },
      total: { cents: 1950 },
    });
    expect(r.participants[1].total.cents).toBe(650);
    expect(r.isFullyClaimed).toBe(true);
    assertInvariant(r);
  });

  it("splits a 1-cent item 3 ways", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "mint", priceCents: 1 }],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "b", joinOrder: 2 },
          { id: "c", joinOrder: 3 },
        ],
        claims: ["a", "b", "c"].map((p) => ({ itemId: "mint", participantId: p })),
      }),
    );
    expect(r.participants.map((p) => p.total.cents)).toEqual([1, 0, 0]);
    assertInvariant(r);
  });

  it("splits a $10 item claimed by everyone as 334/333/333", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "pizza", priceCents: 1000 }],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "b", joinOrder: 2 },
          { id: "c", joinOrder: 3 },
        ],
        claims: ["a", "b", "c"].map((p) => ({ itemId: "pizza", participantId: p })),
      }),
    );
    expect(r.participants.map((p) => p.itemsSubtotal.cents)).toEqual([334, 333, 333]);
    expect(r.isFullyClaimed).toBe(true);
    assertInvariant(r);
  });

  it("uses join order, not array order, to decide leftover cents", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "pizza", priceCents: 1000 }],
        participants: [
          { id: "late", joinOrder: 30 },
          { id: "early", joinOrder: 10 },
          { id: "mid", joinOrder: 20 },
        ],
        claims: ["late", "mid", "early"].map((p) => ({ itemId: "pizza", participantId: p })),
      }),
    );
    expect(r.participants.map((p) => p.participantId)).toEqual(["early", "mid", "late"]);
    expect(r.participants.map((p) => p.itemsSubtotal.cents)).toEqual([334, 333, 333]);
  });

  it("breaks join order ties by participant id", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "x", priceCents: 2 }],
        participants: [
          { id: "zed", joinOrder: 1 },
          { id: "amy", joinOrder: 1 },
          { id: "bob", joinOrder: 1 },
        ],
        claims: ["zed", "amy", "bob"].map((p) => ({ itemId: "x", participantId: p })),
      }),
    );
    expect(r.participants.map((p) => [p.participantId, p.total.cents])).toEqual([
      ["amy", 1],
      ["bob", 1],
      ["zed", 0],
    ]);
  });

  it("handles a $0 tip", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "x", priceCents: 1000 }],
        adjustments: [{ kind: "tip", cents: 0 }],
        participants: [{ id: "a", joinOrder: 1 }],
        claims: [{ itemId: "x", participantId: "a" }],
      }),
    );
    expect(r.participants[0].tip.cents).toBe(0);
    expect(r.participants[0].total.cents).toBe(1000);
    assertInvariant(r);
  });

  it("a 100% item discount leaves tax and tip owed", () => {
    const r = computeSplit(
      bill({
        items: [
          { id: "x", priceCents: 500 },
          { id: "y", priceCents: 500 },
        ],
        adjustments: [
          { kind: "tax", cents: 80 },
          { kind: "tip", cents: 200 },
          { kind: "discount", cents: 1000 },
        ],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "b", joinOrder: 2 },
        ],
        claims: [
          { itemId: "x", participantId: "a" },
          { itemId: "y", participantId: "b" },
        ],
      }),
    );
    expect(r.billTotal.cents).toBe(280);
    expect(r.participants.map((p) => p.total.cents)).toEqual([140, 140]);
    expect(r.participants.map((p) => p.discount.cents)).toEqual([-500, -500]);
    assertInvariant(r);
  });

  it("throws when the discount exceeds the bill total", () => {
    expect(() =>
      computeSplit(
        bill({
          items: [{ id: "x", priceCents: 1000 }],
          adjustments: [
            { kind: "tax", cents: 50 },
            { kind: "discount", cents: 1051 },
          ],
          participants: [{ id: "a", joinOrder: 1 }],
          claims: [{ itemId: "x", participantId: "a" }],
        }),
      ),
    ).toThrow(RangeError);
  });

  it("never produces a negative total when the discount nearly cancels the items", () => {
    const r = computeSplit(
      bill({
        items: [
          { id: "x", priceCents: 333 },
          { id: "y", priceCents: 333 },
          { id: "z", priceCents: 334 },
        ],
        adjustments: [
          { kind: "tax", cents: 7 },
          { kind: "tip", cents: 13 },
          { kind: "discount", cents: 999 },
        ],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "b", joinOrder: 2 },
          { id: "c", joinOrder: 3 },
        ],
        claims: [
          { itemId: "x", participantId: "a" },
          { itemId: "y", participantId: "b" },
          { itemId: "z", participantId: "c" },
        ],
      }),
    );
    expect(r.billTotal.cents).toBe(1000 + 7 + 13 - 999);
    for (const p of r.participants) {
      expect(p.total.cents).toBeGreaterThanOrEqual(0);
      expect(p.itemsSubtotal.cents + p.discount.cents).toBeGreaterThanOrEqual(0);
    }
    expect(r.unassigned.total.cents).toBe(0);
    assertInvariant(r);
  });

  it("throws when the discount exceeds the items subtotal even if tax/tip would cover it", () => {
    expect(() =>
      computeSplit(
        bill({
          items: [{ id: "x", priceCents: 1000 }],
          adjustments: [
            { kind: "tax", cents: 80 },
            { kind: "tip", cents: 200 },
            { kind: "discount", cents: 1001 },
          ],
          participants: [{ id: "a", joinOrder: 1 }],
          claims: [{ itemId: "x", participantId: "a" }],
        }),
      ),
    ).toThrow(RangeError);
  });

  it("allows a discount equal to the items subtotal (items free, tax/tip still owed)", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "x", priceCents: 1000 }],
        adjustments: [
          { kind: "tax", cents: 80 },
          { kind: "discount", cents: 1000 },
        ],
        participants: [{ id: "a", joinOrder: 1 }],
        claims: [{ itemId: "x", participantId: "a" }],
      }),
    );
    expect(r.billTotal.cents).toBe(80);
    expect(r.participants[0].total.cents).toBe(80);
    assertInvariant(r);
  });

  it("puts tax/tip/fees in unassigned when the items subtotal is 0", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "free", priceCents: 0 }],
        adjustments: [
          { kind: "tax", cents: 50 },
          { kind: "tip", cents: 200 },
          { kind: "fee", cents: 25 },
        ],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "b", joinOrder: 2 },
        ],
        claims: [{ itemId: "free", participantId: "a" }],
      }),
    );
    expect(r.billTotal.cents).toBe(275);
    expect(r.participants.map((p) => p.total.cents)).toEqual([0, 0]);
    expect(r.unassigned.total.cents).toBe(275);
    assertInvariant(r);

    const noItems = computeSplit(
      bill({ adjustments: [{ kind: "tip", cents: 100 }], participants: [{ id: "a", joinOrder: 1 }] }),
    );
    expect(noItems.participants[0].total.cents).toBe(0);
    expect(noItems.unassigned.total.cents).toBe(100);
    assertInvariant(noItems);
  });

  it("handles a single participant who claims everything", () => {
    const r = computeSplit(
      bill({
        items: [
          { id: "x", priceCents: 1234 },
          { id: "y", priceCents: 0 },
        ],
        adjustments: [
          { kind: "tax", cents: 111 },
          { kind: "fee", cents: 99 },
          { kind: "discount", cents: 44 },
        ],
        participants: [{ id: "solo", joinOrder: 1 }],
        claims: [
          { itemId: "x", participantId: "solo" },
          { itemId: "y", participantId: "solo" },
        ],
      }),
    );
    expect(r.participants[0].total.cents).toBe(1234 + 111 + 99 - 44);
    expect(r.unassigned.total.cents).toBe(0);
    assertInvariant(r);
  });

  it("handles a $99,999.99 bill exactly", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "feast", priceCents: 9_999_999 }],
        adjustments: [
          { kind: "tax", cents: 887_777 },
          { kind: "tip", cents: 1_999_999 },
        ],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "b", joinOrder: 2 },
          { id: "c", joinOrder: 3 },
          { id: "d", joinOrder: 4 },
          { id: "e", joinOrder: 5 },
          { id: "f", joinOrder: 6 },
          { id: "g", joinOrder: 7 },
        ],
        claims: ["a", "b", "c", "d", "e", "f", "g"].map((p) => ({
          itemId: "feast",
          participantId: p,
        })),
      }),
    );
    expect(r.billTotal.cents).toBe(9_999_999 + 887_777 + 1_999_999);
    expect(sum(r.participants.map((p) => p.itemsSubtotal.cents))).toBe(9_999_999);
    assertInvariant(r);
  });

  it("gives all zeros to a participant who claims nothing", () => {
    const r = computeSplit(
      bill({
        items: [{ id: "x", priceCents: 1000 }],
        adjustments: [
          { kind: "tax", cents: 80 },
          { kind: "tip", cents: 150 },
          { kind: "fee", cents: 25 },
          { kind: "discount", cents: 100 },
        ],
        participants: [
          { id: "a", joinOrder: 1 },
          { id: "lurker", joinOrder: 0 },
        ],
        claims: [{ itemId: "x", participantId: "a" }],
      }),
    );
    const lurker = r.participants.find((p) => p.participantId === "lurker");
    expect(lurker).toEqual({
      participantId: "lurker",
      itemsSubtotal: money(0),
      tax: money(0),
      tip: money(0),
      fees: money(0),
      discount: money(0),
      total: money(0),
    });
    assertInvariant(r);
  });

  it("puts unclaimed items in the unassigned bucket", () => {
    const r = computeSplit(
      bill({
        items: [
          { id: "x", priceCents: 600 },
          { id: "y", priceCents: 400 },
          { id: "z", priceCents: 100 },
        ],
        adjustments: [{ kind: "tax", cents: 110 }],
        participants: [{ id: "a", joinOrder: 1 }],
        claims: [{ itemId: "x", participantId: "a" }],
      }),
    );
    expect(r.isFullyClaimed).toBe(false);
    expect(r.unassigned.itemIds).toEqual(["y", "z"]);
    expect(r.unassigned.itemsSubtotal.cents).toBe(500);
    expect(r.unassigned.total.cents).toBe(550);
    expect(r.participants[0].total.cents).toBe(660);
    assertInvariant(r);
  });

  it("makes the unassigned bucket lose remainder ties", () => {
    const r = computeSplit(
      bill({
        items: [
          { id: "x", priceCents: 100 },
          { id: "y", priceCents: 100 },
        ],
        adjustments: [{ kind: "tax", cents: 1 }],
        participants: [{ id: "a", joinOrder: 1 }],
        claims: [{ itemId: "x", participantId: "a" }],
      }),
    );
    expect(r.participants[0].tax.cents).toBe(1);
    expect(r.unassigned.total.cents).toBe(100);
  });

  it("ignores duplicate claims", () => {
    const base = bill({
      items: [{ id: "x", priceCents: 1000 }],
      participants: [
        { id: "a", joinOrder: 1 },
        { id: "b", joinOrder: 2 },
      ],
      claims: [
        { itemId: "x", participantId: "a" },
        { itemId: "x", participantId: "b" },
      ],
    });
    const withDupes = { ...base, claims: [...base.claims, ...base.claims, base.claims[0]] };
    expect(computeSplit(withDupes)).toEqual(computeSplit(base));
    expect(computeSplit(withDupes).participants.map((p) => p.total.cents)).toEqual([500, 500]);
  });

  it("throws on unknown item or participant ids in claims", () => {
    const base = bill({
      items: [{ id: "x", priceCents: 100 }],
      participants: [{ id: "a", joinOrder: 1 }],
    });
    expect(() =>
      computeSplit({ ...base, claims: [{ itemId: "nope", participantId: "a" }] }),
    ).toThrow(/unknown item/);
    expect(() =>
      computeSplit({ ...base, claims: [{ itemId: "x", participantId: "ghost" }] }),
    ).toThrow(/unknown participant/);
  });

  it("throws on duplicate item or participant ids", () => {
    expect(() =>
      computeSplit(
        bill({
          items: [
            { id: "x", priceCents: 1 },
            { id: "x", priceCents: 2 },
          ],
        }),
      ),
    ).toThrow(/Duplicate item/);
    expect(() =>
      computeSplit(
        bill({
          participants: [
            { id: "a", joinOrder: 1 },
            { id: "a", joinOrder: 2 },
          ],
        }),
      ),
    ).toThrow(/Duplicate participant/);
  });

  it("rejects negative or fractional prices and adjustments", () => {
    expect(() => computeSplit(bill({ items: [{ id: "x", priceCents: -1 }] }))).toThrow(
      RangeError,
    );
    expect(() => computeSplit(bill({ items: [{ id: "x", priceCents: 1.5 }] }))).toThrow(
      RangeError,
    );
    expect(() =>
      computeSplit(
        bill({
          items: [{ id: "x", priceCents: 100 }],
          adjustments: [{ kind: "tip", cents: -5 }],
        }),
      ),
    ).toThrow(RangeError);
  });

  it("carries the currency through to every amount", () => {
    const r = computeSplit(
      bill({
        currency: "USD",
        items: [{ id: "x", priceCents: 100 }],
        adjustments: [{ kind: "tax", cents: 9 }],
        participants: [{ id: "a", joinOrder: 1 }],
        claims: [{ itemId: "x", participantId: "a" }],
      }),
    );
    expect(r.currency).toBe("USD");
    expect(r.billTotal.currency).toBe("USD");
    expect(r.unassigned.total.currency).toBe("USD");
    for (const p of r.participants) {
      for (const m of [p.itemsSubtotal, p.tax, p.tip, p.fees, p.discount, p.total]) {
        expect(m.currency).toBe("USD");
      }
    }
  });
});

// Tiny deterministic PRNG (mulberry32) so the random test is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("computeSplit (seeded random bills)", () => {
  it("holds the invariant for 1,000 random bills", () => {
    const rand = mulberry32(0x5eed);
    const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));

    for (let n = 0; n < 1000; n++) {
      const participants = Array.from({ length: int(1, 8) }, (_, i) => ({
        id: `p${i}`,
        joinOrder: int(0, 5), // deliberate ties exercise the id tiebreak
      }));
      const items = Array.from({ length: int(1, 15) }, (_, i) => ({
        id: `i${i}`,
        // at least one non-zero item so adjustments always have something to allocate against
        priceCents: i === 0 ? int(1, 50_000) : int(0, 50_000),
      }));
      const claims: { itemId: string; participantId: string }[] = [];
      for (const item of items) {
        if (rand() < 0.2) continue; // leave some items unclaimed
        for (const p of participants) {
          if (rand() < 0.4) claims.push({ itemId: item.id, participantId: p.id });
        }
        if (rand() < 0.1 && claims.length > 0) claims.push(claims[claims.length - 1]); // duplicate
      }
      const itemsTotal = sum(items.map((i) => i.priceCents));
      const adjustments: { kind: AdjustmentKind; cents: number }[] = [];
      if (rand() < 0.8) adjustments.push({ kind: "tax", cents: int(0, Math.ceil(itemsTotal * 0.15)) });
      if (rand() < 0.8) adjustments.push({ kind: "tip", cents: int(0, Math.ceil(itemsTotal * 0.3)) });
      if (rand() < 0.5) adjustments.push({ kind: "fee", cents: int(0, 2_000) });
      if (rand() < 0.5) adjustments.push({ kind: "fee", cents: int(0, 500) });
      // Discounts apply to items before tax, so they are bounded by the items subtotal.
      if (rand() < 0.5) adjustments.push({ kind: "discount", cents: int(0, itemsTotal) });

      const r = computeSplit(bill({ items, adjustments, participants, claims }));

      assertInvariant(r);
      const allMoney: Money[] = [r.billTotal, r.unassigned.itemsSubtotal, r.unassigned.total];
      for (const p of r.participants) {
        allMoney.push(p.itemsSubtotal, p.tax, p.tip, p.fees, p.discount, p.total);
        expect(p.total.cents).toBe(
          p.itemsSubtotal.cents + p.tax.cents + p.tip.cents + p.fees.cents + p.discount.cents,
        );
        if (p.itemsSubtotal.cents === 0) expect(p.total.cents).toBe(0);
        expect(p.total.cents).toBeGreaterThanOrEqual(0);
        expect(p.itemsSubtotal.cents + p.discount.cents).toBeGreaterThanOrEqual(0);
      }
      expect(r.unassigned.total.cents).toBeGreaterThanOrEqual(0);
      allMoney.forEach((m) => expect(Number.isSafeInteger(m.cents)).toBe(true));
      expect(sum(r.participants.map((p) => p.itemsSubtotal.cents)) + r.unassigned.itemsSubtotal.cents).toBe(
        itemsTotal,
      );
      expect(r.isFullyClaimed).toBe(r.unassigned.itemIds.length === 0);
    }
  });
});
