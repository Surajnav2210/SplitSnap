// Bridge from the solo /split bill to a shared live bill.
//
// Google sign-in leaves the page, so the bill to publish is parked in
// sessionStorage (this tab only) and picked up by /share after sign-in. It is
// removed as soon as publishing succeeds.
//
// Idempotency: the parked bill carries a client key (UUID) sent as
// p_bill.client_key. Every retry or redirect reuses it, so a publish whose
// response was lost returns the same bill instead of creating a second one.

import { z } from "zod";
import type { PublishInput } from "@/core/liveBill";
import type { PaymentHandles } from "@/core/paymentLinks";
import { billTipCents, hostOf, type BillState } from "@/features/bill/state";

export interface PendingPublish {
  clientKey: string;
  bill: PublishInput;
  handles: PaymentHandles;
}

const STORAGE_KEY = "splitsnap:pending-share";

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const PendingSchema = z.object({
  clientKey: z.uuid(),
  bill: z.object({
    merchant: z.string().nullable(),
    hostName: z.string(),
    source: z.enum(["ai", "manual"]),
    items: z.array(z.object({ name: z.string(), quantity: z.number().int().positive(), priceCents: cents })).max(500),
    adjustments: z.array(z.object({ kind: z.enum(["tax", "tip", "fee", "discount"]), cents })).max(50),
  }),
  handles: z.object({
    venmo: z.string().optional(),
    paypal: z.string().optional(),
    cashapp: z.string().optional(),
  }),
});

/** The local bill as publish input. "You" (the default host name) is not a real name. */
export function pendingFromBillState(state: BillState, clientKey: string): PendingPublish {
  const hostName = hostOf(state).name.trim();
  return {
    clientKey,
    bill: {
      merchant: state.merchant,
      hostName: hostName.toLowerCase() === "you" ? "" : hostName,
      source: state.source === "scan" ? "ai" : "manual",
      items: state.items.map((i) => ({ name: i.name, quantity: i.quantity, priceCents: i.priceCents })),
      adjustments: [
        { kind: "tax", cents: state.taxCents },
        { kind: "tip", cents: billTipCents(state) },
        { kind: "fee", cents: state.feeCents },
        { kind: "discount", cents: state.discountCents },
      ],
    },
    handles: { ...state.handles },
  };
}

/**
 * The pending publish to park when the host taps "Share with the table".
 * Re-sharing the exact same bill (e.g. after a failed sign-in) keeps the
 * existing key, so it can't create a duplicate; a changed bill gets the new key.
 */
export function nextPending(existing: PendingPublish | null, state: BillState, newKey: string): PendingPublish {
  const fresh = pendingFromBillState(state, newKey);
  if (existing === null) return fresh;
  const same = JSON.stringify({ b: existing.bill, h: existing.handles }) === JSON.stringify({ b: fresh.bill, h: fresh.handles });
  return same ? { ...fresh, clientKey: existing.clientKey } : fresh;
}

/**
 * A random UUID v4 for the idempotency key. crypto.randomUUID needs a secure
 * context (HTTPS/localhost); fall back to getRandomValues, which doesn't.
 */
export function newClientKey(rng: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = crypto): string {
  if (typeof rng.randomUUID === "function") return rng.randomUUID();
  const b = rng.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function savePending(store: KeyValueStore, pending: PendingPublish): void {
  store.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function readPendingRaw(store: KeyValueStore): string | null {
  return store.getItem(STORAGE_KEY);
}

/** The parked bill, or null if there is none or it doesn't validate. */
export function loadPending(store: KeyValueStore): PendingPublish | null {
  return parsePending(readPendingRaw(store));
}

export function parsePending(raw: string | null): PendingPublish | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    throw err;
  }
  const parsed = PendingSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function clearPending(store: KeyValueStore): void {
  store.removeItem(STORAGE_KEY);
}
