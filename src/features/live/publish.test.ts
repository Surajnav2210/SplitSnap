import { describe, expect, it } from "vitest";
import { buildPublishPayload } from "@/core/liveBill";
import { billReducer, initialBillState, type BillAction, type BillState } from "@/features/bill/state";
import { isUuid } from "@/core/liveBill";
import { clearPending, loadPending, newClientKey, nextPending, pendingFromBillState, savePending, type KeyValueStore } from "./publish";

const KEY_A = "8d1c3f0a-5b2e-4c7d-9a10-0f2e3d4c5b6a";
const KEY_B = "1f2e3d4c-5b6a-4c7d-8e9f-0a1b2c3d4e5f";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const run = (actions: BillAction[]): BillState => actions.reduce(billReducer, initialBillState);

describe("pendingFromBillState", () => {
  it("maps items, adjustments (percent tip resolved to cents) and handles", () => {
    const state = run([
      { type: "start", source: "manual" },
      { type: "addItem", name: "Fries", priceCents: 1000 },
      { type: "addItem", name: "Beer", priceCents: 2000, quantity: 2 },
      { type: "setTax", cents: 250 },
      { type: "setTip", tip: { mode: "percent", hundredths: 2000 } },
      { type: "setHostName", name: "Alex" },
      { type: "setMerchant", name: "Bistro" },
      { type: "setHandles", handles: { venmo: "@alex" } },
    ]);
    const pending = pendingFromBillState(state, KEY_A);
    expect(pending.bill).toEqual({
      merchant: "Bistro",
      hostName: "Alex",
      source: "manual",
      items: [
        { name: "Fries", quantity: 1, priceCents: 1000 },
        { name: "Beer", quantity: 2, priceCents: 2000 },
      ],
      adjustments: [
        { kind: "tax", cents: 250 },
        { kind: "tip", cents: 600 },
        { kind: "fee", cents: 0 },
        { kind: "discount", cents: 0 },
      ],
    });
    expect(pending.handles).toEqual({ venmo: "@alex" });
    expect(pending.clientKey).toBe(KEY_A);
    expect(buildPublishPayload(pending.bill, pending.clientKey).adjustments).toEqual([
      { kind: "tax", amount_cents: 250 },
      { kind: "tip", amount_cents: 600 },
    ]);
  });

  it("treats the default host name 'You' as no name yet and scans as ai", () => {
    const state = run([{ type: "loadSample" }]);
    const pending = pendingFromBillState({ ...state, source: "scan" }, KEY_A);
    expect(pending.bill.hostName).toBe("");
    expect(pending.bill.source).toBe("ai");
  });
});

describe("pending storage", () => {
  it("round-trips and clears", () => {
    const store = memoryStore();
    const pending = pendingFromBillState(run([{ type: "loadSample" }]), KEY_A);
    savePending(store, pending);
    expect(loadPending(store)).toEqual(pending);
    clearPending(store);
    expect(loadPending(store)).toBeNull();
  });

  it("ignores corrupt or tampered data", () => {
    const store = memoryStore();
    store.setItem("splitsnap:pending-share", "{not json");
    expect(loadPending(store)).toBeNull();
    store.setItem(
      "splitsnap:pending-share",
      JSON.stringify({ clientKey: KEY_A, bill: { merchant: null, hostName: "A", source: "ai", items: [{ name: "X", quantity: 1, priceCents: 1.5 }], adjustments: [] }, handles: {} }),
    );
    expect(loadPending(store)).toBeNull();
  });
});

describe("nextPending (idempotency key reuse)", () => {
  const sample = run([{ type: "loadSample" }]);

  it("uses the new key when nothing is parked", () => {
    expect(nextPending(null, sample, KEY_B).clientKey).toBe(KEY_B);
  });

  it("reuses the parked key when the same bill is shared again", () => {
    const parked = pendingFromBillState(sample, KEY_A);
    expect(nextPending(parked, sample, KEY_B).clientKey).toBe(KEY_A);
  });

  it("uses a fresh key once the bill changed", () => {
    const parked = pendingFromBillState(sample, KEY_A);
    const edited = billReducer(sample, { type: "setTax", cents: 1 });
    expect(nextPending(parked, edited, KEY_B).clientKey).toBe(KEY_B);
    const newHandles = billReducer(sample, { type: "setHandles", handles: { venmo: "x" } });
    expect(nextPending(parked, newHandles, KEY_B).clientKey).toBe(KEY_B);
  });

  it("a stored pending without a valid key is ignored", () => {
    const store = memoryStore();
    store.setItem("splitsnap:pending-share", JSON.stringify({ ...pendingFromBillState(sample, KEY_A), clientKey: "nope" }));
    expect(loadPending(store)).toBeNull();
  });
});

describe("newClientKey", () => {
  it("uses randomUUID when available", () => {
    expect(newClientKey({ getRandomValues: crypto.getRandomValues.bind(crypto), randomUUID: () => KEY_A as `${string}-${string}-${string}-${string}-${string}` })).toBe(KEY_A);
  });

  it("falls back to a valid v4 UUID from getRandomValues (insecure contexts)", () => {
    const key = newClientKey({
      getRandomValues: <T extends ArrayBufferView | null>(a: T): T => {
        if (a instanceof Uint8Array) a.fill(0xff);
        return a;
      },
    });
    expect(key).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(isUuid(key)).toBe(true);
    expect(isUuid(newClientKey())).toBe(true);
  });
});
