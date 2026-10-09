import { describe, expect, it } from "vitest";
import { computeSplit, type BillInput } from "./split";
import { buildSummary, paymentNote } from "./summary";

const bill: BillInput = {
  currency: "USD",
  items: [
    { id: "i1", priceCents: 3000 },
    { id: "i2", priceCents: 1500 },
    { id: "i3", priceCents: 1000 },
  ],
  adjustments: [{ kind: "tax", cents: 550 }],
  participants: [
    { id: "alex", joinOrder: 1 },
    { id: "sam", joinOrder: 2 },
    { id: "priya", joinOrder: 3 },
  ],
  claims: [
    { itemId: "i1", participantId: "alex" },
    { itemId: "i2", participantId: "sam" },
    { itemId: "i3", participantId: "priya" },
  ],
};
const names = { alex: "Alex", sam: "Sam", priya: "Priya" };

describe("paymentNote", () => {
  it("includes the merchant when present", () => {
    expect(paymentNote("Corner Bistro")).toBe("SplitSnap: Corner Bistro");
    expect(paymentNote("  ")).toBe("SplitSnap");
    expect(paymentNote(null)).toBe("SplitSnap");
  });
});

describe("buildSummary", () => {
  it("lists the host as paid and everyone else with amounts and links", () => {
    const text = buildSummary({
      merchant: "Corner Bistro",
      result: computeSplit(bill),
      hostId: "alex",
      names,
      handles: { venmo: "@alex", cashapp: "$alexk" },
    });
    expect(text).toBe(
      [
        "🧾 Corner Bistro — $60.50",
        "Alex paid",
        "Sam owes $16.50 · Venmo https://venmo.com/alex?txn=pay&amount=16.50&note=SplitSnap%3A%20Corner%20Bistro · Cash App https://cash.app/$alexk/16.50",
        "Priya owes $11.00 · Venmo https://venmo.com/alex?txn=pay&amount=11.00&note=SplitSnap%3A%20Corner%20Bistro · Cash App https://cash.app/$alexk/11.00",
        "",
        "Split with SplitSnap. It never holds or moves your money.",
      ].join("\n"),
    );
  });

  it("is deterministic", () => {
    const input = { merchant: "X", result: computeSplit(bill), hostId: "alex", names, handles: {} };
    expect(buildSummary(input)).toBe(buildSummary(input));
  });

  it("omits links when no valid handles are set, and says who owes nothing", () => {
    const text = buildSummary({
      merchant: null,
      result: computeSplit({ ...bill, claims: bill.claims.filter((c) => c.participantId !== "priya").concat({ itemId: "i3", participantId: "sam" }) }),
      hostId: "alex",
      names,
      handles: { venmo: "not valid!" },
    });
    expect(text.split("\n").slice(0, 4)).toEqual([
      "🧾 Our bill — $60.50",
      "Alex paid",
      "Sam owes $27.50",
      "Priya owes nothing",
    ]);
  });

  it("flags unclaimed amounts", () => {
    const text = buildSummary({
      merchant: "X",
      result: computeSplit({ ...bill, claims: bill.claims.slice(0, 2) }),
      hostId: "alex",
      names,
      handles: {},
    });
    expect(text).toContain("Unclaimed: $11.00");
  });

  it("keeps each person on one line even if names contain newlines", () => {
    const text = buildSummary({
      merchant: "Line\nBreak",
      result: computeSplit(bill),
      hostId: "alex",
      names: { ...names, sam: "Sam\nSmith" },
      handles: {},
    });
    expect(text.split("\n")[0]).toBe("🧾 Line Break — $60.50");
    expect(text).toContain("\nSam Smith owes $16.50\n");
  });
});
