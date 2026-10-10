// Adapt a live bill to the BillState shape the existing ClaimStep renders, so
// the solo and live claim screens stay one component.

import type { LiveBill } from "@/core/liveBill";
import { initialBillState, type BillState } from "@/features/bill/state";

export function toClaimState(bill: LiveBill, hostParticipantId: string): BillState {
  return {
    ...initialBillState,
    merchant: bill.merchant,
    items: bill.items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, quantity: i.quantity })),
    people: bill.participants.map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder, tone: p.tone })),
    hostId: hostParticipantId,
    claims: bill.claims.map((c) => ({ itemId: c.itemId, personId: c.participantId })),
  };
}
