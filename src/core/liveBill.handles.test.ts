import { describe, expect, it } from "vitest";
import { deriveLiveView, isRelevantDelete, toLiveBill, type LiveBillRows } from "./liveBill";

const BILL = "b-1";
const HOST_USER = "u-host";
const SAM_USER = "u-sam";
const P_HOST = "p-host";
const P_SAM = "p-sam";
const P_PRIYA = "p-priya";

function rows(overrides: Partial<LiveBillRows> = {}): LiveBillRows {
  return {
    bill: {
      id: BILL,
      share_code: "abcdefghjk",
      host_id: HOST_USER,
      merchant: "Bistro",
      status: "locked",
      currency: "USD",
      host_venmo_handle: "alex",
      host_paypal_handle: null,
      host_cashapp_handle: null,
    },
    items: [{ id: "i-1", bill_id: BILL, name: "Fries", quantity: 1, price_cents: 3000, position: 0 }],
    adjustments: [],
    participants: [
      { id: P_HOST, bill_id: BILL, user_id: HOST_USER, display_name: "Alex", join_order: 1, is_host: true },
      { id: P_SAM, bill_id: BILL, user_id: SAM_USER, display_name: "Sam", join_order: 2, is_host: false },
      { id: P_PRIYA, bill_id: BILL, user_id: "u-priya", display_name: "Priya", join_order: 3, is_host: false },
    ],
    claims: [P_HOST, P_SAM, P_PRIYA].map((p) => ({ bill_id: BILL, line_item_id: "i-1", participant_id: p })),
    settlements: [
      { id: "s-sam", bill_id: BILL, participant_id: P_SAM, amount_cents: 1000, status: "unpaid" },
      { id: "s-priya", bill_id: BILL, participant_id: P_PRIYA, amount_cents: 1000, status: "unpaid" },
    ],
    ...overrides,
  };
}

const handle = (participantId: string, venmo: string | null, billId = BILL) => ({
  participant_id: participantId,
  bill_id: billId,
  venmo_handle: venmo,
  updated_at: "2026-10-11T12:00:00+00:00",
});

describe("participant Venmo usernames", () => {
  it("is empty when no rows are given (older callers, or nobody added one)", () => {
    expect(toLiveBill(rows()).participantVenmo).toEqual({});
  });

  it("maps visible rows by participant, normalizing and dropping unusable ones", () => {
    const bill = toLiveBill(
      rows({
        participantHandles: [handle(P_SAM, "@sam-k"), handle(P_PRIYA, null), handle(P_HOST, "bad handle"), handle("p-gone", "ghost")],
      }),
    );
    expect(bill.participantVenmo).toEqual({ [P_SAM]: "sam-k" });
  });

  it("throws for a row from another bill", () => {
    expect(() => toLiveBill(rows({ participantHandles: [handle(P_SAM, "sam", "b-other")] }))).toThrow(/different bill/);
  });

  it("exposes each guest's username to the host, and only their own to a guest", () => {
    const bill = toLiveBill(rows({ participantHandles: [handle(P_SAM, "sam")] }));
    const host = deriveLiveView(bill, HOST_USER);
    expect(host.settlementLines.map((l) => [l.participant.id, l.venmo])).toEqual([
      [P_SAM, "sam"],
      [P_PRIYA, null],
    ]);
    expect(host.myVenmo).toBeNull();
    expect(deriveLiveView(bill, SAM_USER).myVenmo).toBe("sam");
    expect(deriveLiveView(bill, "u-priya").myVenmo).toBeNull();
    expect(deriveLiveView(bill, "u-stranger").myVenmo).toBeNull();
  });

  it("treats a deleted handle row as relevant only for this bill's participants", () => {
    const bill = toLiveBill(rows());
    expect(isRelevantDelete(bill, "participant_handles", { participant_id: P_SAM })).toBe(true);
    expect(isRelevantDelete(bill, "participant_handles", { participant_id: "p-other" })).toBe(false);
    expect(isRelevantDelete(bill, "participant_handles", {})).toBe(false);
  });
});
