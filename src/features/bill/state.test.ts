import { describe, expect, it } from "vitest";
import type { SplitResult } from "@/core/split";
import type { ScanResult } from "@/core/receipt";
import {
  SAMPLE_RECEIPT,
  billReducer,
  hostWords,
  itemSharesFor,
  initialBillState,
  reconcile,
  selectBillSplit,
  type BillAction,
  type BillState,
} from "./state";

function run(actions: BillAction[], start: BillState = initialBillState): BillState {
  return actions.reduce(billReducer, start);
}

function expectOk(state: BillState): SplitResult {
  const outcome = selectBillSplit(state);
  if (!outcome.ok) throw new Error(`expected ok, got: ${outcome.error}`);
  return outcome.result;
}

function sumTotals(result: SplitResult): number {
  return (
    result.participants.reduce((acc, p) => acc + p.total.cents, 0) + result.unassigned.total.cents
  );
}

const scan: ScanResult = {
  merchant: "  Corner   Bistro ",
  currency: "USD",
  items: [
    { name: "Draft IPA", quantity: 3, priceCents: 1000 },
    { name: "Burger", quantity: 1, priceCents: 1500 },
  ],
  taxCents: 200,
  tipCents: 0,
  feeCents: 100,
  discountCents: 50,
  receiptTotalCents: 2750,
  warnings: ["Tip line was blurry", "   "],
};

describe("initialBillState", () => {
  it("starts with the host only", () => {
    expect(initialBillState.people).toEqual([{ id: "person-1", name: "You", joinOrder: 1, tone: 0 }]);
    expect(initialBillState.hostId).toBe("person-1");
    expect(initialBillState.items).toEqual([]);
    expect(initialBillState.source).toBeNull();
  });
});

describe("host", () => {
  it("setHostName renames the host and ignores blank names", () => {
    const s = run([{ type: "setHostName", name: "  Alex " }]);
    expect(s.people[0].name).toBe("Alex");
    expect(billReducer(s, { type: "setHostName", name: "  " })).toBe(s);
  });

  it("the host cannot be removed", () => {
    expect(billReducer(initialBillState, { type: "removePerson", id: "person-1" })).toBe(
      initialBillState,
    );
  });
});

describe("loadScan", () => {
  const s = run([{ type: "addPerson", name: "Sam" }, { type: "loadScan", receipt: scan }]);

  it("loads items with quantities, adjustments, merchant and warnings; keeps people", () => {
    expect(s.source).toBe("scan");
    expect(s.merchant).toBe("Corner Bistro");
    expect(s.items.map((i) => [i.name, i.quantity, i.priceCents])).toEqual([
      ["Draft IPA", 3, 1000],
      ["Burger", 1, 1500],
    ]);
    expect([s.taxCents, s.feeCents, s.discountCents]).toEqual([200, 100, 50]);
    expect(s.warnings.map((w) => w.text)).toEqual(["Tip line was blurry"]);
    expect(s.people.map((p) => p.name)).toEqual(["You", "Sam"]);
    expect(s.session).toBe(initialBillState.session + 1);
  });

  it("uses the default percent tip when the receipt has none, and an amount when it does", () => {
    expect(s.tip).toEqual({ mode: "percent", hundredths: 1800 });
    expect(s.receiptIncludesTip).toBe(false);
    const tipped = billReducer(s, { type: "loadScan", receipt: { ...scan, tipCents: 400 } });
    expect(tipped.tip).toEqual({ mode: "amount", cents: 400 });
    expect(tipped.receiptIncludesTip).toBe(true);
  });

  it("skips unreadable lines with a warning", () => {
    const t = billReducer(initialBillState, {
      type: "loadScan",
      receipt: { ...scan, warnings: [], items: [...scan.items, { name: " ", quantity: 1, priceCents: 5 }] },
    });
    expect(t.items).toHaveLength(2);
    expect(t.warnings.map((w) => w.text)).toEqual(["1 line couldn't be read. Add it by hand."]);
  });

  it("clears claims from a previous receipt and keeps IDs unique", () => {
    const claimed = billReducer(s, { type: "toggleClaim", itemId: s.items[0].id, personId: "person-1" });
    const again = billReducer(claimed, { type: "loadScan", receipt: scan });
    expect(again.claims).toEqual([]);
    const ids = [...again.items.map((i) => i.id), ...again.people.map((p) => p.id), ...again.warnings.map((w) => w.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("dismissWarning removes one warning", () => {
    const t = billReducer(s, { type: "dismissWarning", id: s.warnings[0].id });
    expect(t.warnings).toEqual([]);
  });
});

describe("reconcile", () => {
  const s = billReducer(initialBillState, { type: "loadScan", receipt: scan });

  it("matches items + tax + fee - discount, reporting the tip the host added", () => {
    // 2500 + 200 + 100 - 50 = 2750; 18% tip on 2500 = 450 was added on top.
    expect(reconcile(s)).toEqual({
      status: "match",
      receiptTotal: { cents: 2750, currency: "USD" },
      addedTip: { cents: 450, currency: "USD" },
    });
  });

  it("reports the difference on a mismatch", () => {
    const t = billReducer(s, { type: "editItem", id: s.items[1].id, priceCents: 1600 });
    expect(reconcile(t)).toEqual({
      status: "mismatch",
      receiptTotal: { cents: 2750, currency: "USD" },
      computed: { cents: 2850, currency: "USD" },
      difference: { cents: 100, currency: "USD" },
    });
  });

  it("includes the tip when the receipt printed one", () => {
    const t = billReducer(s, { type: "loadScan", receipt: { ...scan, tipCents: 400, receiptTotalCents: 3150 } });
    expect(reconcile(t).status).toBe("match");
  });

  it("is unknown without a receipt total", () => {
    expect(reconcile(initialBillState)).toEqual({ status: "unknown" });
  });
});

describe("editItem", () => {
  const s = run([{ type: "addItem", name: "Soup", priceCents: 800 }]);
  const id = s.items[0].id;

  it("edits name and price", () => {
    const t = billReducer(s, { type: "editItem", id, name: " Ramen ", priceCents: 1450 });
    expect(t.items[0]).toMatchObject({ name: "Ramen", priceCents: 1450 });
  });

  it("rejects blank names, bad prices, unknown ids", () => {
    expect(billReducer(s, { type: "editItem", id, name: "" })).toBe(s);
    expect(billReducer(s, { type: "editItem", id, priceCents: -1 })).toBe(s);
    expect(billReducer(s, { type: "editItem", id, priceCents: 1.5 })).toBe(s);
    expect(billReducer(s, { type: "editItem", id: "nope", name: "x" })).toBe(s);
  });
});

describe("splitItemIntoUnits", () => {
  const s = billReducer(initialBillState, { type: "loadScan", receipt: scan });
  const beer = s.items[0];

  it("splits a 3x line into 3 units that sum exactly, in place", () => {
    const t = billReducer(s, { type: "splitItemIntoUnits", itemId: beer.id });
    expect(t.items.map((i) => [i.name, i.quantity, i.priceCents])).toEqual([
      ["Draft IPA", 1, 334],
      ["Draft IPA", 1, 333],
      ["Draft IPA", 1, 333],
      ["Burger", 1, 1500],
    ]);
    expect(t.items.slice(0, 3).reduce((a, i) => a + i.priceCents, 0)).toBe(1000);
    expect(new Set(t.items.map((i) => i.id)).size).toBe(4);
  });

  it("carries existing claims to every unit", () => {
    const claimed = billReducer(s, { type: "toggleClaim", itemId: beer.id, personId: "person-1" });
    const t = billReducer(claimed, { type: "splitItemIntoUnits", itemId: beer.id });
    expect(t.claims).toHaveLength(3);
    expect(t.claims.every((c) => c.personId === "person-1" && c.itemId !== beer.id)).toBe(true);
  });

  it("ignores single-quantity and unknown items", () => {
    expect(billReducer(s, { type: "splitItemIntoUnits", itemId: s.items[1].id })).toBe(s);
    expect(billReducer(s, { type: "splitItemIntoUnits", itemId: "nope" })).toBe(s);
  });

  it("splits a 1-cent line... into units that still sum exactly (zero-price units allowed)", () => {
    const t = run([
      { type: "addItem", name: "Mint", priceCents: 1, quantity: 3 },
    ]);
    const u = billReducer(t, { type: "splitItemIntoUnits", itemId: t.items[0].id });
    expect(u.items.map((i) => i.priceCents)).toEqual([1, 0, 0]);
  });
});

describe("assignUnclaimedToAll", () => {
  it("gives every unclaimed item to everyone and leaves claimed items alone", () => {
    const s = run([
      { type: "addPerson", name: "Sam" },
      { type: "addItem", name: "Fries", priceCents: 600 },
      { type: "addItem", name: "Burger", priceCents: 1500 },
    ]);
    const [fries, burger] = s.items;
    const t = run(
      [
        { type: "toggleClaim", itemId: burger.id, personId: "person-2" },
        { type: "assignUnclaimedToAll" },
      ],
      s,
    );
    expect(t.claims).toEqual([
      { itemId: burger.id, personId: "person-2" },
      { itemId: fries.id, personId: "person-1" },
      { itemId: fries.id, personId: "person-2" },
    ]);
    const result = expectOk(t);
    expect(result.isFullyClaimed).toBe(true);
    expect(sumTotals(result)).toBe(result.billTotal.cents);
    expect(billReducer(t, { type: "assignUnclaimedToAll" })).toBe(t);
  });
});

describe("fees and handles", () => {
  it("includes fees in the split and the bill total", () => {
    const s = run([
      { type: "addItem", name: "A", priceCents: 1000 },
      { type: "setTip", tip: { mode: "amount", cents: 0 } },
      { type: "setFee", cents: 299 },
      { type: "toggleClaim", itemId: "item-2", personId: "person-1" },
    ]);
    const result = expectOk(s);
    expect(result.billTotal.cents).toBe(1299);
    expect(result.participants[0].fees.cents).toBe(299);
    expect(billReducer(s, { type: "setFee", cents: -1 })).toBe(s);
  });

  it("stores handles and keeps them across reset, along with the host name", () => {
    const s = run([
      { type: "setHostName", name: "Alex" },
      { type: "setHandles", handles: { venmo: "@alex" } },
      { type: "addItem", name: "A", priceCents: 1000 },
      { type: "reset" },
    ]);
    expect(s.handles).toEqual({ venmo: "@alex" });
    expect(s.people).toEqual([{ id: "person-1", name: "Alex", joinOrder: 1, tone: 0 }]);
    expect(s.items).toEqual([]);
  });
});

describe("loadSample", () => {
  const s = billReducer(initialBillState, { type: "loadSample" });

  it("loads the sample receipt, friends, and a total that reconciles", () => {
    const subtotal = SAMPLE_RECEIPT.items.reduce((a, i) => a + i.priceCents, 0);
    expect(SAMPLE_RECEIPT.receiptTotalCents).toBe(subtotal + SAMPLE_RECEIPT.taxCents);
    expect(s.people.map((p) => p.name)).toEqual(["You", "Sam", "Priya", "Jordan"]);
    expect(reconcile(s).status).toBe("match");
    expect(s.source).toBe("sample");
  });

  it("gives each person a distinct avatar tone in the order they were added", () => {
    expect(s.people.map((p) => p.tone)).toEqual([0, 1, 2, 3]);
    const t = run([{ type: "removePerson", id: s.people[1].id }, { type: "addPerson", name: "Taylor" }], s);
    expect(t.people.map((p) => p.tone)).toEqual([0, 2, 3, 4]);
  });

  it("does not duplicate friends when loaded twice", () => {
    const t = billReducer(s, { type: "loadSample" });
    expect(t.people.map((p) => p.name)).toEqual(["You", "Sam", "Priya", "Jordan"]);
  });

  it("splits exactly when everyone shares everything", () => {
    const t = billReducer(s, { type: "assignUnclaimedToAll" });
    const result = expectOk(t);
    expect(result.participants.reduce((a, p) => a + p.total.cents, 0)).toBe(result.billTotal.cents);
  });
});

describe("itemSharesFor", () => {
  it("matches each person's itemsSubtotal from the engine, cent for cent", () => {
    const s = run([
      { type: "addPerson", name: "Sam" },
      { type: "addPerson", name: "Priya" },
      { type: "addItem", name: "Mint", priceCents: 1 },
      { type: "addItem", name: "Pitcher", priceCents: 3200 },
      { type: "addItem", name: "Fries", priceCents: 1001 },
      { type: "assignUnclaimedToAll" },
      { type: "toggleClaim", itemId: "item-5", personId: "person-1" },
    ]);
    const result = expectOk(s);
    for (const share of result.participants) {
      const items = itemSharesFor(s, share.participantId);
      expect(items.reduce((a, i) => a + i.cents, 0)).toBe(share.itemsSubtotal.cents);
    }
    expect(itemSharesFor(s, "person-1").map((i) => [i.name, i.cents, i.ways])).toEqual([
      ["Mint", 1, 3],
      ["Fries", 334, 3],
    ]);
  });
});

describe("hostWords", () => {
  it("reads naturally for the default 'You' and for real names", () => {
    expect(hostWords("You")).toEqual({ object: "you", getsBack: "You get back" });
    expect(hostWords(" you ")).toEqual({ object: "you", getsBack: "You get back" });
    expect(hostWords("Alex")).toEqual({ object: "Alex", getsBack: "Alex gets back" });
  });
});
