import { describe, expect, it } from "vitest";
import type { SplitResult } from "@/core/split";
import {
  demoReducer,
  initialDemoState,
  selectSplit,
  type DemoAction,
  type DemoState,
} from "./state";

function run(actions: DemoAction[], start: DemoState = initialDemoState): DemoState {
  return actions.reduce(demoReducer, start);
}

function expectOk(state: DemoState): { result: SplitResult; tipCents: number } {
  const outcome = selectSplit(state);
  if (!outcome.ok) throw new Error(`expected ok, got: ${outcome.error}`);
  return outcome;
}

function sumTotals(result: SplitResult): number {
  return (
    result.participants.reduce((acc, p) => acc + p.total.cents, 0) + result.unassigned.total.cents
  );
}

/** Alex + Sam, a burger and fries. */
const basic: DemoAction[] = [
  { type: "addPerson", name: "Alex" }, // person-1
  { type: "addPerson", name: "Sam" }, // person-2
  { type: "addItem", name: "Burger", priceCents: 1500 }, // item-3
  { type: "addItem", name: "Fries", priceCents: 600 }, // item-4
];

describe("initialDemoState", () => {
  it("starts empty with an 18% tip", () => {
    expect(initialDemoState.items).toEqual([]);
    expect(initialDemoState.people).toEqual([]);
    expect(initialDemoState.claims).toEqual([]);
    expect(initialDemoState.tip).toEqual({ mode: "percent", hundredths: 1800 });
  });
});

describe("demoReducer", () => {
  it("generates deterministic IDs and join order from a counter", () => {
    const s = run(basic);
    expect(s.people.map((p) => [p.id, p.joinOrder])).toEqual([
      ["person-1", 1],
      ["person-2", 2],
    ]);
    expect(s.items.map((i) => i.id)).toEqual(["item-3", "item-4"]);
    expect(run(basic)).toEqual(s);
  });

  it("trims names and ignores blank names or invalid prices", () => {
    const s = run([
      { type: "addPerson", name: "  Priya  " },
      { type: "addPerson", name: "   " },
      { type: "addItem", name: "", priceCents: 100 },
      { type: "addItem", name: "Soup", priceCents: -1 },
      { type: "addItem", name: "Soup", priceCents: 1.5 },
    ]);
    expect(s.people.map((p) => p.name)).toEqual(["Priya"]);
    expect(s.items).toEqual([]);
  });

  it("toggleClaim adds when absent and removes when present", () => {
    const s0 = run(basic);
    const toggle: DemoAction = { type: "toggleClaim", itemId: "item-3", personId: "person-1" };
    const s1 = demoReducer(s0, toggle);
    expect(s1.claims).toEqual([{ itemId: "item-3", personId: "person-1" }]);
    const s2 = demoReducer(s1, toggle);
    expect(s2.claims).toEqual([]);
    // Toggling twice returns to the same claims; never duplicates.
    const s4 = run([toggle, toggle, toggle], s0);
    expect(s4.claims).toEqual([{ itemId: "item-3", personId: "person-1" }]);
  });

  it("toggleClaim ignores unknown items or people", () => {
    const s0 = run(basic);
    expect(demoReducer(s0, { type: "toggleClaim", itemId: "nope", personId: "person-1" })).toBe(s0);
    expect(demoReducer(s0, { type: "toggleClaim", itemId: "item-3", personId: "nope" })).toBe(s0);
  });

  it("removing an item drops its claims", () => {
    const s = run([
      ...basic,
      { type: "toggleClaim", itemId: "item-3", personId: "person-1" },
      { type: "toggleClaim", itemId: "item-3", personId: "person-2" },
      { type: "toggleClaim", itemId: "item-4", personId: "person-2" },
      { type: "removeItem", id: "item-3" },
    ]);
    expect(s.items.map((i) => i.id)).toEqual(["item-4"]);
    expect(s.claims).toEqual([{ itemId: "item-4", personId: "person-2" }]);
    expectOk(s);
  });

  it("removing a person drops their claims", () => {
    const s = run([
      ...basic,
      { type: "toggleClaim", itemId: "item-3", personId: "person-1" },
      { type: "toggleClaim", itemId: "item-4", personId: "person-1" },
      { type: "toggleClaim", itemId: "item-4", personId: "person-2" },
      { type: "removePerson", id: "person-1" },
    ]);
    expect(s.people.map((p) => p.id)).toEqual(["person-2"]);
    expect(s.claims).toEqual([{ itemId: "item-4", personId: "person-2" }]);
    expectOk(s);
  });

  it("does not reuse IDs after removal", () => {
    const s = run([
      { type: "addPerson", name: "A" },
      { type: "removePerson", id: "person-1" },
      { type: "addPerson", name: "B" },
    ]);
    expect(s.people.map((p) => p.id)).toEqual(["person-2"]);
  });

  it("sets tax, tip, and discount, rejecting invalid values", () => {
    const s = run([
      { type: "setTax", cents: 250 },
      { type: "setTip", tip: { mode: "amount", cents: 500 } },
      { type: "setDiscount", cents: 100 },
    ]);
    expect(s.taxCents).toBe(250);
    expect(s.tip).toEqual({ mode: "amount", cents: 500 });
    expect(s.discountCents).toBe(100);

    expect(demoReducer(s, { type: "setTax", cents: -1 })).toBe(s);
    expect(demoReducer(s, { type: "setDiscount", cents: 0.5 })).toBe(s);
    expect(demoReducer(s, { type: "setTip", tip: { mode: "percent", hundredths: 10001 } })).toBe(s);
    expect(demoReducer(s, { type: "setTip", tip: { mode: "amount", cents: -5 } })).toBe(s);
  });

  it("reset returns to the initial bill and bumps the session", () => {
    const s = run([...basic, { type: "reset" }]);
    expect({ ...s, session: 0 }).toEqual(initialDemoState);
    expect(s.session).toBe(1);
  });
});

describe("loadSample", () => {
  const sample = demoReducer(initialDemoState, { type: "loadSample" });

  it("loads 4 people and 6 items with shared appetizer and pitcher", () => {
    expect(sample.people.map((p) => p.name)).toEqual(["Alex", "Sam", "Priya", "Jordan"]);
    expect(sample.items).toHaveLength(6);
    const claimers = (name: string): number => {
      const item = sample.items.find((i) => i.name.toLowerCase().includes(name));
      if (!item) throw new Error(`no item matching ${name}`);
      return sample.claims.filter((c) => c.itemId === item.id).length;
    };
    expect(claimers("fries")).toBe(4);
    expect(claimers("pitcher")).toBe(3);
  });

  it("uses 8.25% tax on the subtotal and an 18% tip", () => {
    const subtotal = sample.items.reduce((acc, i) => acc + i.priceCents, 0);
    expect(subtotal).toBe(11049);
    expect(sample.taxCents).toBe(912); // 911.5425 rounds half-up to 912
    expect(sample.tip).toEqual({ mode: "percent", hundredths: 1800 });
  });

  it("has every item claimed and totals that sum exactly to billTotal", () => {
    const { result, tipCents } = expectOk(sample);
    expect(tipCents).toBe(1989); // 18% of 110.49 = 19.8882 -> 19.89
    expect(result.isFullyClaimed).toBe(true);
    expect(result.billTotal.cents).toBe(11049 + 912 + 1989);
    expect(result.participants.reduce((acc, p) => acc + p.total.cents, 0)).toBe(
      result.billTotal.cents,
    );
    expect(sumTotals(result)).toBe(result.billTotal.cents);
  });

  it("keeps IDs unique after adding more to the sample", () => {
    const s = run(
      [
        { type: "addPerson", name: "Taylor" },
        { type: "addItem", name: "Dessert", priceCents: 900 },
      ],
      sample,
    );
    const ids = [...s.people.map((p) => p.id), ...s.items.map((i) => i.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic", () => {
    expect(demoReducer(initialDemoState, { type: "loadSample" })).toEqual(sample);
  });
});

describe("selectSplit", () => {
  it("returns ok on an empty bill", () => {
    const { result } = expectOk(initialDemoState);
    expect(result.billTotal.cents).toBe(0);
  });

  it("computes a percent tip on the pre-tax items subtotal", () => {
    const s = run([...basic, { type: "setTax", cents: 1000 }]);
    // 18% of $21.00 = $3.78, not 18% of $31.00
    expect(expectOk(s).tipCents).toBe(378);
  });

  it("uses a fixed tip amount as-is", () => {
    const s = run([...basic, { type: "setTip", tip: { mode: "amount", cents: 400 } }]);
    const { result, tipCents } = expectOk(s);
    expect(tipCents).toBe(400);
    expect(result.billTotal.cents).toBe(2100 + 400);
  });

  it("reports unclaimed items in the unassigned bucket while totals still add up", () => {
    const s = run([...basic, { type: "toggleClaim", itemId: "item-3", personId: "person-1" }]);
    const { result } = expectOk(s);
    expect(result.isFullyClaimed).toBe(false);
    expect(result.unassigned.itemIds).toEqual(["item-4"]);
    expect(sumTotals(result)).toBe(result.billTotal.cents);
  });

  it("returns ok:false when the discount exceeds the items subtotal", () => {
    const s = run([...basic, { type: "setDiscount", cents: 2101 }]);
    const outcome = selectSplit(s);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/discount/i);
  });

  it("allows a discount equal to the items subtotal", () => {
    const s = run([
      ...basic,
      { type: "toggleClaim", itemId: "item-3", personId: "person-1" },
      { type: "toggleClaim", itemId: "item-4", personId: "person-2" },
      { type: "setTip", tip: { mode: "percent", hundredths: 0 } },
      { type: "setDiscount", cents: 2100 },
    ]);
    const { result } = expectOk(s);
    expect(result.billTotal.cents).toBe(0);
    expect(result.participants.every((p) => p.total.cents === 0)).toBe(true);
  });
});
