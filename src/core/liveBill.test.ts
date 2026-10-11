import { describe, expect, it } from "vitest";
import {
  buildLockPayload,
  buildPublishPayload,
  claimsForSplittingRest,
  cleanDisplayName,
  computeLiveSplit,
  deriveLiveView,
  hasClaim,
  hostParticipant,
  isRelevantDelete,
  normalizeShareCode,
  parseCents,
  parseDbInt,
  settlementActions,
  toBillInput,
  toLiveBill,
  unclaimedItemIds,
  withClaimToggled,
  withClaimsAdded,
  type LiveBill,
  type LiveBillRows,
  type SettlementRow,
} from "./liveBill";

const BILL = "b0000000-0000-4000-8000-000000000000";
const HOST_USER = "u0000000-0000-4000-8000-000000000001";
const SAM_USER = "u0000000-0000-4000-8000-000000000002";
const PRIYA_USER = "u0000000-0000-4000-8000-000000000003";
const P_HOST = "p-host";
const P_SAM = "p-sam";
const P_PRIYA = "p-priya";

function rows(overrides: Partial<LiveBillRows> = {}): LiveBillRows {
  return {
    bill: {
      id: BILL,
      share_code: "abcdefghjkmn",
      host_id: HOST_USER,
      merchant: "Corner Bistro",
      status: "open",
      currency: "USD",
      host_venmo_handle: "alex-k",
      host_paypal_handle: null,
      host_cashapp_handle: "alexk",
    },
    items: [
      { id: "i-fries", bill_id: BILL, name: "Fries", quantity: 1, price_cents: "1200", position: 0 },
      { id: "i-pizza", bill_id: BILL, name: "Pizza", quantity: 1, price_cents: 1850, position: "1" },
      { id: "i-beer", bill_id: BILL, name: "Beer", quantity: "3", price_cents: "2100", position: 2 },
    ],
    adjustments: [
      { id: "a-tax", bill_id: BILL, kind: "tax", amount_cents: "421" },
      { id: "a-tip", bill_id: BILL, kind: "tip", amount_cents: 900 },
    ],
    participants: [
      { id: P_SAM, bill_id: BILL, user_id: SAM_USER, display_name: "Sam", join_order: "2", is_host: false },
      { id: P_HOST, bill_id: BILL, user_id: HOST_USER, display_name: "Alex", join_order: 1, is_host: true },
      { id: P_PRIYA, bill_id: BILL, user_id: PRIYA_USER, display_name: "Priya", join_order: "3", is_host: false },
    ],
    claims: [],
    settlements: [],
    ...overrides,
  };
}

const claim = (itemId: string, participantId: string) => ({ bill_id: BILL, line_item_id: itemId, participant_id: participantId });

const allClaimed = [
  claim("i-fries", P_HOST),
  claim("i-fries", P_SAM),
  claim("i-pizza", P_SAM),
  claim("i-beer", P_PRIYA),
  claim("i-beer", P_HOST),
];

function settlement(id: string, participantId: string, amount: number | string, status: SettlementRow["status"] = "unpaid"): SettlementRow {
  return { id, bill_id: BILL, participant_id: participantId, amount_cents: amount, status };
}

describe("parseDbInt / parseCents", () => {
  it("accepts numbers and integer strings", () => {
    expect(parseDbInt(0, "x")).toBe(0);
    expect(parseDbInt(1234, "x")).toBe(1234);
    expect(parseDbInt("1234", "x")).toBe(1234);
    expect(parseDbInt(" 42 ", "x")).toBe(42);
    expect(parseDbInt("-7", "x")).toBe(-7);
    expect(parseDbInt("9007199254740991", "x")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects floats, exponents, blanks and unsafe values", () => {
    for (const bad of [1.5, Number.NaN, Infinity, 2 ** 53, "12.5", "1e3", "", " ", "abc", "0x10", "9007199254740992", "99999999999999999"]) {
      expect(() => parseDbInt(bad, "x")).toThrow(RangeError);
    }
  });

  it("parseCents rejects negative money", () => {
    expect(parseCents("0", "x")).toBe(0);
    expect(() => parseCents("-1", "x")).toThrow(RangeError);
    expect(() => parseCents(-1, "x")).toThrow(RangeError);
  });
});

describe("toLiveBill", () => {
  it("maps rows to integer cents, sorted items and participants", () => {
    const bill = toLiveBill(rows());
    expect(bill.items.map((i) => [i.id, i.priceCents, i.quantity, i.position])).toEqual([
      ["i-fries", 1200, 1, 0],
      ["i-pizza", 1850, 1, 1],
      ["i-beer", 2100, 3, 2],
    ]);
    expect(bill.participants.map((p) => [p.id, p.joinOrder, p.isHost, p.tone])).toEqual([
      [P_HOST, 1, true, 0],
      [P_SAM, 2, false, 1],
      [P_PRIYA, 3, false, 2],
    ]);
    expect(bill.adjustments).toEqual([
      { id: "a-tax", kind: "tax", cents: 421 },
      { id: "a-tip", kind: "tip", cents: 900 },
    ]);
    expect(bill.handles).toEqual({ venmo: "alex-k", paypal: undefined, cashapp: "alexk" });
  });

  it("sorts items with equal positions by id", () => {
    const bill = toLiveBill(
      rows({
        items: [
          { id: "b", bill_id: BILL, name: "B", quantity: 1, price_cents: 1, position: 0 },
          { id: "a", bill_id: BILL, name: "A", quantity: 1, price_cents: 1, position: 0 },
        ],
      }),
    );
    expect(bill.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("treats the participant whose user is the bill's host as host even without is_host", () => {
    const r = rows();
    const bill = toLiveBill({
      ...r,
      participants: r.participants.map((p) => ({ ...p, is_host: undefined })),
    });
    expect(hostParticipant(bill).id).toBe(P_HOST);
  });

  it("drops duplicate claims and claims on rows missing from the snapshot", () => {
    const bill = toLiveBill(
      rows({ claims: [claim("i-fries", P_SAM), claim("i-fries", P_SAM), claim("i-gone", P_SAM), claim("i-pizza", "p-gone")] }),
    );
    expect(bill.claims).toEqual([{ itemId: "i-fries", participantId: P_SAM }]);
  });

  it("throws on rows from another bill", () => {
    const other = "c0000000-0000-4000-8000-000000000000";
    expect(() =>
      toLiveBill(rows({ items: [{ id: "x", bill_id: other, name: "X", quantity: 1, price_cents: 1, position: 0 }] })),
    ).toThrow(/different bill/);
    expect(() => toLiveBill(rows({ claims: [{ ...claim("i-fries", P_SAM), bill_id: other }] }))).toThrow(/different bill/);
  });

  it("rejects bad money and non-USD bills", () => {
    expect(() => toLiveBill(rows({ adjustments: [{ id: "a", bill_id: BILL, kind: "tax", amount_cents: "1.50" }] }))).toThrow(RangeError);
    expect(() =>
      toLiveBill(rows({ items: [{ id: "x", bill_id: BILL, name: "X", quantity: 1, price_cents: -5, position: 0 }] })),
    ).toThrow(RangeError);
    expect(() => toLiveBill({ ...rows(), bill: { ...rows().bill, currency: "EUR" } })).toThrow(/currency/i);
  });

  it("drops invalid snapshotted handles instead of building broken links", () => {
    const bill = toLiveBill({ ...rows(), bill: { ...rows().bill, host_venmo_handle: "bad handle!", host_paypal_handle: "paypal.me/alex" } });
    expect(bill.handles).toEqual({ venmo: undefined, paypal: "alex", cashapp: "alexk" });
  });
});

describe("split mapping", () => {
  it("toBillInput carries ids, cents and join order", () => {
    const input = toBillInput(toLiveBill(rows({ claims: [claim("i-fries", P_SAM)] })));
    expect(input.currency).toBe("USD");
    expect(input.items).toEqual([
      { id: "i-fries", priceCents: 1200 },
      { id: "i-pizza", priceCents: 1850 },
      { id: "i-beer", priceCents: 2100 },
    ]);
    expect(input.participants).toEqual([
      { id: P_HOST, joinOrder: 1 },
      { id: P_SAM, joinOrder: 2 },
      { id: P_PRIYA, joinOrder: 3 },
    ]);
    expect(input.claims).toEqual([{ itemId: "i-fries", participantId: P_SAM }]);
  });

  it("detects unclaimed items in display order", () => {
    const bill = toLiveBill(rows({ claims: [claim("i-pizza", P_SAM)] }));
    expect(unclaimedItemIds(bill)).toEqual(["i-fries", "i-beer"]);
    expect(unclaimedItemIds(toLiveBill(rows({ claims: allClaimed })))).toEqual([]);
  });

  it("split-the-rest adds every unclaimed item for every participant", () => {
    const bill = toLiveBill(rows({ claims: [claim("i-pizza", P_SAM)] }));
    expect(claimsForSplittingRest(bill)).toEqual([
      { itemId: "i-fries", participantId: P_HOST },
      { itemId: "i-fries", participantId: P_SAM },
      { itemId: "i-fries", participantId: P_PRIYA },
      { itemId: "i-beer", participantId: P_HOST },
      { itemId: "i-beer", participantId: P_SAM },
      { itemId: "i-beer", participantId: P_PRIYA },
    ]);
  });

  it("computeLiveSplit reports engine errors instead of throwing", () => {
    const bill = toLiveBill(rows({ adjustments: [{ id: "d", bill_id: BILL, kind: "discount", amount_cents: 999_999 }] }));
    const outcome = computeLiveSplit(bill);
    expect(outcome.ok).toBe(false);
  });
});

describe("buildLockPayload", () => {
  it("excludes the host, includes every guest, and sums exactly to the bill total", () => {
    const bill = toLiveBill(rows({ claims: allClaimed }));
    const payload = buildLockPayload(bill);
    expect(payload.amounts.map((a) => a.participantId)).toEqual([P_SAM, P_PRIYA]);
    expect(payload.amounts.some((a) => a.participantId === P_HOST)).toBe(false);
    const sum = payload.amounts.reduce((acc, a) => acc + a.amountCents, 0) + payload.hostCents;
    expect(sum).toBe(payload.billTotalCents);
    expect(payload.billTotalCents).toBe(1200 + 1850 + 2100 + 421 + 900);
    for (const a of payload.amounts) expect(Number.isSafeInteger(a.amountCents)).toBe(true);
  });

  it("keeps zero-amount guests with an explicit 0", () => {
    const bill = toLiveBill(rows({ claims: [claim("i-fries", P_HOST), claim("i-pizza", P_SAM), claim("i-beer", P_HOST)] }));
    const payload = buildLockPayload(bill);
    expect(payload.amounts).toContainEqual({ participantId: P_PRIYA, amountCents: 0 });
    expect(payload.amounts.reduce((a, b) => a + b.amountCents, 0) + payload.hostCents).toBe(payload.billTotalCents);
  });

  it("splits a 1-cent item three ways without losing a cent", () => {
    const bill = toLiveBill(
      rows({
        items: [{ id: "i-mint", bill_id: BILL, name: "Mint", quantity: 1, price_cents: 1, position: 0 }],
        adjustments: [],
        claims: [claim("i-mint", P_HOST), claim("i-mint", P_SAM), claim("i-mint", P_PRIYA)],
      }),
    );
    const payload = buildLockPayload(bill);
    expect(payload.hostCents).toBe(1); // leftover cent goes to the first by join order
    expect(payload.amounts).toEqual([
      { participantId: P_SAM, amountCents: 0 },
      { participantId: P_PRIYA, amountCents: 0 },
    ]);
  });

  it("handles very large bills exactly", () => {
    const bill = toLiveBill(
      rows({
        items: [{ id: "i-big", bill_id: BILL, name: "Big", quantity: 1, price_cents: "9999999", position: 0 }],
        adjustments: [{ id: "t", bill_id: BILL, kind: "tax", amount_cents: "999999999" }],
        claims: [claim("i-big", P_HOST), claim("i-big", P_SAM), claim("i-big", P_PRIYA)],
      }),
    );
    const payload = buildLockPayload(bill);
    expect(payload.amounts.reduce((a, b) => a + b.amountCents, 0) + payload.hostCents).toBe(9_999_999 + 999_999_999);
  });

  it("refuses while items are unclaimed", () => {
    const bill = toLiveBill(rows({ claims: [claim("i-fries", P_SAM)] }));
    expect(() => buildLockPayload(bill)).toThrow("2 items are still unclaimed.");
    const one = toLiveBill(rows({ claims: allClaimed.filter((c) => c.line_item_id !== "i-pizza") }));
    expect(() => buildLockPayload(one)).toThrow("1 item is still unclaimed.");
  });

  it("refuses when the bill isn't open, is empty, or has no host", () => {
    expect(() => buildLockPayload({ ...toLiveBill(rows({ claims: allClaimed })), status: "locked" })).toThrow(/open/);
    expect(() => buildLockPayload(toLiveBill(rows({ items: [], claims: [] })))).toThrow(/at least one item/);
    const noHost: LiveBill = toLiveBill(rows({ claims: allClaimed }));
    expect(() => buildLockPayload({ ...noHost, participants: noHost.participants.map((p) => ({ ...p, isHost: false })) })).toThrow(/host/);
  });

  it("is deterministic for the same snapshot", () => {
    const bill = toLiveBill(rows({ claims: allClaimed }));
    expect(buildLockPayload(bill)).toEqual(buildLockPayload(toLiveBill(rows({ claims: [...allClaimed].reverse() }))));
  });
});

describe("buildPublishPayload", () => {
  const KEY = "8d1c3f0a-5b2e-4c7d-9a10-0f2e3d4c5b6a";
  const withKey = (input: Parameters<typeof buildPublishPayload>[0]) => buildPublishPayload(input, KEY);
  const base = {
    merchant: "  Corner   Bistro ",
    hostName: "  Alex  ",
    source: "ai" as const,
    items: [
      { name: " Fries ", quantity: 1, priceCents: 1200 },
      { name: "Beer", quantity: 3, priceCents: 2100 },
    ],
    adjustments: [
      { kind: "tax" as const, cents: 421 },
      { kind: "tip" as const, cents: 0 },
      { kind: "fee" as const, cents: 0 },
      { kind: "discount" as const, cents: 100 },
    ],
  };

  it("matches the publish_bill contract exactly", () => {
    expect(withKey(base)).toEqual({
      client_key: KEY,
      merchant: "Corner Bistro",
      currency: "USD",
      host_display_name: "Alex",
      items: [
        { name: "Fries", quantity: 1, price_cents: 1200, source: "ai", position: 0 },
        { name: "Beer", quantity: 3, price_cents: 2100, source: "ai", position: 1 },
      ],
      adjustments: [
        { kind: "tax", amount_cents: 421 },
        { kind: "discount", amount_cents: 100 },
      ],
    });
  });

  it("requires a UUID idempotency key and keeps it as is (lowercased)", () => {
    expect(buildPublishPayload(base, KEY.toUpperCase()).client_key).toBe(KEY);
    for (const bad of ["", "not-a-uuid", "8d1c3f0a5b2e4c7d9a100f2e3d4c5b6a"]) {
      expect(() => buildPublishPayload(base, bad)).toThrow(/Share with the table/);
    }
    // Same input + same key -> identical payload (safe to retry).
    expect(buildPublishPayload(base, KEY)).toEqual(buildPublishPayload(base, KEY));
  });

  it("uses null for a blank merchant", () => {
    expect(withKey({ ...base, merchant: "   " }).merchant).toBeNull();
    expect(withKey({ ...base, merchant: null }).merchant).toBeNull();
  });

  it("rejects unusable input with friendly messages", () => {
    expect(() => withKey({ ...base, hostName: " " })).toThrow(/your name/);
    expect(() => withKey({ ...base, hostName: "x".repeat(51) })).toThrow(/your name/);
    expect(() => withKey({ ...base, items: [] })).toThrow(/at least one item/);
    expect(() => withKey({ ...base, items: [{ name: " ", quantity: 1, priceCents: 1 }] })).toThrow(/name/);
    expect(() => withKey({ ...base, items: [{ name: "X", quantity: 1, priceCents: 1.5 }] })).toThrow(/price/);
    expect(() => withKey({ ...base, items: [{ name: "X", quantity: 1, priceCents: -1 }] })).toThrow(/price/);
    expect(() => withKey({ ...base, items: [{ name: "X", quantity: 0, priceCents: 1 }] })).toThrow(/quantity/);
    expect(() => withKey({ ...base, adjustments: [{ kind: "tax", cents: -1 }] })).toThrow(/tax/);
    expect(() => withKey({ ...base, adjustments: [{ kind: "discount", cents: 3301 }] })).toThrow(/discount/);
  });

  it("allows zero-price items and a 100% discount", () => {
    const payload = withKey({
      ...base,
      items: [{ name: "Water", quantity: 1, priceCents: 0 }, { name: "Cake", quantity: 1, priceCents: 500 }],
      adjustments: [{ kind: "discount", cents: 500 }],
    });
    expect(payload.items[0].price_cents).toBe(0);
    expect(payload.adjustments).toEqual([{ kind: "discount", amount_cents: 500 }]);
  });
});

describe("cleanDisplayName / normalizeShareCode", () => {
  it("cleans names", () => {
    expect(cleanDisplayName("  Sam   K ")).toBe("Sam K");
    expect(cleanDisplayName("   ")).toBeNull();
    expect(cleanDisplayName("x".repeat(50))).toBe("x".repeat(50));
    expect(cleanDisplayName("x".repeat(51))).toBeNull();
  });

  it("accepts only the share code alphabet", () => {
    // Codes are 10 chars from [a-km-np-z2-9], as generated by the database.
    expect(normalizeShareCode(" YRN5ECM36E ")).toBe("yrn5ecm36e");
    expect(normalizeShareCode("yrn5ecm36")).toBeNull(); // 9 chars
    expect(normalizeShareCode("yrn5ecm36ee")).toBeNull(); // 11 chars
    expect(normalizeShareCode("yrn5ecm36l")).toBeNull(); // contains l
    expect(normalizeShareCode("yrn5ecm36o")).toBeNull(); // contains o
    expect(normalizeShareCode("yrn5ecm360")).toBeNull(); // contains 0
    expect(normalizeShareCode("../etc/passwd")).toBeNull();
  });
});

describe("isRelevantDelete", () => {
  const bill = toLiveBill(rows({ claims: allClaimed, settlements: [settlement("s1", P_SAM, 100)] }));
  it("matches by primary key against the bill on screen", () => {
    expect(isRelevantDelete(bill, "claims", { line_item_id: "i-fries", participant_id: P_SAM })).toBe(true);
    expect(isRelevantDelete(bill, "claims", { line_item_id: "other", participant_id: "other" })).toBe(false);
    expect(isRelevantDelete(bill, "line_items", { id: "i-beer" })).toBe(true);
    expect(isRelevantDelete(bill, "line_items", { id: "zzz" })).toBe(false);
    expect(isRelevantDelete(bill, "participants", { id: P_PRIYA })).toBe(true);
    expect(isRelevantDelete(bill, "bill_adjustments", { id: "a-tax" })).toBe(true);
    expect(isRelevantDelete(bill, "settlements", { id: "s1" })).toBe(true);
    expect(isRelevantDelete(bill, "bills", { id: BILL })).toBe(true);
    expect(isRelevantDelete(bill, "bills", {})).toBe(false);
    expect(isRelevantDelete(bill, "claims", { line_item_id: 5 })).toBe(false);
  });
});

describe("deriveLiveView", () => {
  it("host view while open: can lock only when every item is claimed", () => {
    const partial = deriveLiveView(toLiveBill(rows({ claims: [claim("i-fries", P_SAM)] })), HOST_USER);
    expect(partial.role).toBe("host");
    expect(partial.me?.id).toBe(P_HOST);
    expect(partial.canClaim).toBe(true);
    expect(partial.canLock).toBe(false);
    expect(partial.unclaimedItemIds).toEqual(["i-pizza", "i-beer"]);

    const full = deriveLiveView(toLiveBill(rows({ claims: allClaimed })), HOST_USER);
    expect(full.canLock).toBe(true);
    expect(full.canUnlock).toBe(false);
  });

  it("guest view while open", () => {
    const view = deriveLiveView(toLiveBill(rows({ claims: allClaimed })), SAM_USER);
    expect(view.role).toBe("guest");
    expect(view.me?.id).toBe(P_SAM);
    expect(view.host.name).toBe("Alex");
    expect(view.canClaim).toBe(true);
    expect(view.canLock).toBe(false);
    expect(view.settlementLines).toEqual([]);
    expect(view.split?.participants.find((p) => p.participantId === P_SAM)?.total.cents).toBeGreaterThan(0);
  });

  it("outsider (signed in but not on the bill) can't claim", () => {
    const view = deriveLiveView(toLiveBill(rows()), "u-stranger");
    expect(view.role).toBe("outsider");
    expect(view.canClaim).toBe(false);
    expect(deriveLiveView(toLiveBill(rows()), null).role).toBe("outsider");
  });

  it("guest after lock gets their frozen amount and pay links", () => {
    const locked = toLiveBill({
      ...rows({ claims: allClaimed, settlements: [settlement("s-sam", P_SAM, "2400")] }),
      bill: { ...rows().bill, status: "locked" },
    });
    const view = deriveLiveView(locked, SAM_USER);
    expect(view.canClaim).toBe(false);
    expect(view.mySettlement).toEqual({ id: "s-sam", participantId: P_SAM, amountCents: 2400, status: "unpaid", guestMarkedPaid: false });
    expect(view.myPaymentLinks.map((l) => l.app)).toEqual(["venmo", "cashapp"]);
    expect(view.myPaymentLinks[0].url).toContain("amount=24.00");
  });

  it("guest who owes $0 gets no pay links", () => {
    const zeroRow = toLiveBill({
      ...rows({ claims: allClaimed, settlements: [settlement("s-sam", P_SAM, 0)] }),
      bill: { ...rows().bill, status: "locked" },
    });
    expect(deriveLiveView(zeroRow, SAM_USER).myPaymentLinks).toEqual([]);
    // lock_bill creates no settlement row for a $0 share.
    const noRow = toLiveBill({ ...rows({ claims: allClaimed }), bill: { ...rows().bill, status: "locked" } });
    const view = deriveLiveView(noRow, SAM_USER);
    expect(view.mySettlement).toBeNull();
    expect(view.myPaymentLinks).toEqual([]);
  });

  it("host after lock: settlement lines, outstanding, unlock only while nobody marked paid", () => {
    const lockedRows = (s: SettlementRow[]) =>
      toLiveBill({ ...rows({ claims: allClaimed, settlements: s }), bill: { ...rows().bill, status: "locked" } });

    const fresh = deriveLiveView(lockedRows([settlement("s1", P_SAM, 2000), settlement("s2", P_PRIYA, 1500)]), HOST_USER);
    expect(fresh.settlementLines.map((l) => [l.participant.id, l.settlement?.id])).toEqual([
      [P_SAM, "s1"],
      [P_PRIYA, "s2"],
    ]);
    expect(fresh.outstandingCents).toBe(3500);
    expect(fresh.canUnlock).toBe(true);
    expect(fresh.canLock).toBe(false);

    const paid = deriveLiveView(
      lockedRows([settlement("s1", P_SAM, 2000, "marked_paid"), settlement("s2", P_PRIYA, 1500, "confirmed")]),
      HOST_USER,
    );
    expect(paid.outstandingCents).toBe(2000);
    expect(paid.canUnlock).toBe(false);
  });
});

describe("settlementActions", () => {
  const s = (status: SettlementRow["status"], guestMarkedPaid = status === "marked_paid") => ({ status, guestMarkedPaid });
  it("guest: mark paid and undo; nothing once confirmed", () => {
    expect(settlementActions("guest", s("unpaid"))).toEqual([{ label: "I've paid", next: "marked_paid" }]);
    expect(settlementActions("guest", s("marked_paid"))).toEqual([{ label: "Undo", next: "unpaid" }]);
    expect(settlementActions("guest", s("confirmed", true))).toEqual([]);
  });
  it("host: received after the guest marks paid, undo back to marked paid", () => {
    expect(settlementActions("host", s("marked_paid"))).toEqual([{ label: "Received", next: "confirmed" }]);
    expect(settlementActions("host", s("confirmed", true))).toEqual([{ label: "Undo", next: "marked_paid" }]);
  });
  it("host: cash received directly from unpaid, undo back to unpaid", () => {
    expect(settlementActions("host", s("unpaid"))).toEqual([{ label: "Mark received", next: "confirmed" }]);
    expect(settlementActions("host", s("confirmed", false))).toEqual([{ label: "Undo", next: "unpaid" }]);
  });
  it("outsiders get nothing", () => {
    expect(settlementActions("outsider", s("unpaid"))).toEqual([]);
  });
});

describe("guestMarkedPaid", () => {
  it("comes from status or marked_paid_at", () => {
    const locked = (rowsIn: SettlementRow[]) =>
      toLiveBill({ ...rows({ claims: allClaimed, settlements: rowsIn }), bill: { ...rows().bill, status: "locked" } });
    const bill = locked([
      { ...settlement("s1", P_SAM, 100, "confirmed"), marked_paid_at: "2026-10-10T12:00:00Z" },
      { ...settlement("s2", P_PRIYA, 100, "confirmed"), marked_paid_at: null },
    ]);
    expect(bill.settlements.map((x) => x.guestMarkedPaid)).toEqual([true, false]);
    expect(locked([settlement("s3", P_SAM, 1, "marked_paid")]).settlements[0].guestMarkedPaid).toBe(true);
    expect(locked([settlement("s4", P_SAM, 1)]).settlements[0].guestMarkedPaid).toBe(false);
  });
});

describe("optimistic helpers", () => {
  it("toggles one claim without touching the original", () => {
    const bill = toLiveBill(rows());
    const on = withClaimToggled(bill, "i-fries", P_SAM);
    expect(hasClaim(on, "i-fries", P_SAM)).toBe(true);
    expect(hasClaim(bill, "i-fries", P_SAM)).toBe(false);
    expect(hasClaim(withClaimToggled(on, "i-fries", P_SAM), "i-fries", P_SAM)).toBe(false);
    expect(withClaimToggled(bill, "nope", P_SAM)).toBe(bill);
  });

  it("adds claims idempotently", () => {
    const bill = toLiveBill(rows({ claims: [claim("i-fries", P_SAM)] }));
    const next = withClaimsAdded(bill, [
      { itemId: "i-fries", participantId: P_SAM },
      { itemId: "i-pizza", participantId: P_SAM },
    ]);
    expect(next.claims).toHaveLength(2);
  });
});
