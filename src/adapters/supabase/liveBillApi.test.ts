import { describe, expect, it, vi } from "vitest";
import { buildLockPayload, toLiveBill } from "@/core/liveBill";
import { readSupabaseConfig } from "./config";
import { LiveBillError, isNetworkError, toLiveBillError } from "./errors";
import {
  addClaims,
  fetchBillRows,
  findBillIdByShareCode,
  joinBill,
  leaveBill,
  lockBill,
  publishBill,
  removeClaim,
  removeParticipant,
  setSettlementStatus,
  signInAnonymously,
  subscribeToBill,
  unlockBill,
  upsertProfile,
  watchSession,
} from "./liveBillApi";
import type { LiveClient } from "./types";

const BILL = "0b2c3d4e-0000-4000-8000-000000000001";
const HOST = "0b2c3d4e-0000-4000-8000-0000000000a1";
const GUEST = "0b2c3d4e-0000-4000-8000-0000000000a2";
const P_HOST = "0b2c3d4e-0000-4000-8000-0000000000b1";
const P_GUEST = "0b2c3d4e-0000-4000-8000-0000000000b2";
const ITEM = "0b2c3d4e-0000-4000-8000-0000000000c1";
const SETTLEMENT = "0b2c3d4e-0000-4000-8000-0000000000d1";

type Result = { data: unknown; error: unknown };

/** Chainable query-builder fake: records calls, resolves to the queued result. */
function fakeQuery(result: Result) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "upsert", "delete", "insert", "maybeSingle"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

function fakeClient(opts: { rpc?: Result; tables?: Record<string, Result> } = {}) {
  const queries: { table: string; calls: [string, unknown[]][] }[] = [];
  const rpc = vi.fn<(fn: string, args?: unknown) => Promise<Result>>(() => Promise.resolve(opts.rpc ?? { data: null, error: null }));
  const from = vi.fn((table: string) => {
    const { builder, calls } = fakeQuery(opts.tables?.[table] ?? { data: [], error: null });
    queries.push({ table, calls });
    return builder;
  });
  const client = { rpc, from } as unknown as LiveClient;
  return { client, rpc, queries };
}

describe("RPC wrappers send exactly the contract's arguments", () => {
  it("publish_bill", async () => {
    const { client, rpc } = fakeClient({ rpc: { data: [{ bill_id: BILL, share_code: "abcdefghjkmn" }], error: null } });
    const p_bill = {
      client_key: "8d1c3f0a-5b2e-4c7d-9a10-0f2e3d4c5b6a",
      merchant: null,
      currency: "USD" as const,
      host_display_name: "Alex",
      items: [{ name: "Fries", quantity: 1, price_cents: 1200, source: "manual" as const, position: 0 }],
      adjustments: [{ kind: "tax" as const, amount_cents: 100 }],
    };
    await expect(publishBill(client, p_bill)).resolves.toEqual({ billId: BILL, shareCode: "abcdefghjkmn" });
    expect(rpc).toHaveBeenCalledWith("publish_bill", { p_bill });
  });

  it("publish_bill retried with the same client_key gets the same bill back", async () => {
    // The DB returns the existing bill for a repeated key; the wrapper must send the key unchanged.
    const { client, rpc } = fakeClient({ rpc: { data: [{ bill_id: BILL, share_code: "abcdefghjkmn" }], error: null } });
    const p_bill = {
      client_key: "8d1c3f0a-5b2e-4c7d-9a10-0f2e3d4c5b6a",
      merchant: "Bistro",
      currency: "USD" as const,
      host_display_name: "Alex",
      items: [{ name: "Fries", quantity: 1, price_cents: 1200, source: "ai" as const, position: 0 }],
      adjustments: [],
    };
    const first = await publishBill(client, p_bill);
    const second = await publishBill(client, p_bill);
    expect(second).toEqual(first);
    expect(rpc.mock.calls.map(([, args]) => (args as { p_bill: { client_key: string } }).p_bill.client_key)).toEqual([
      p_bill.client_key,
      p_bill.client_key,
    ]);
  });

  it("join_bill", async () => {
    const { client, rpc } = fakeClient({ rpc: { data: [{ bill_id: BILL, participant_id: P_GUEST }], error: null } });
    await expect(joinBill(client, "abcdefghjkmn", "Sam")).resolves.toEqual({ billId: BILL, participantId: P_GUEST });
    expect(rpc).toHaveBeenCalledWith("join_bill", { p_share_code: "abcdefghjkmn", p_display_name: "Sam" });
  });

  it("lock_bill maps the core payload to snake_case and excludes the host", async () => {
    const bill = toLiveBill({
      bill: {
        id: BILL,
        share_code: "abcdefghjkmn",
        host_id: HOST,
        merchant: null,
        status: "open",
        currency: "USD",
        host_venmo_handle: null,
        host_paypal_handle: null,
        host_cashapp_handle: null,
      },
      items: [{ id: ITEM, bill_id: BILL, name: "Fries", quantity: 1, price_cents: "1001", position: 0 }],
      adjustments: [],
      participants: [
        { id: P_HOST, bill_id: BILL, user_id: HOST, display_name: "Alex", join_order: 1, is_host: true },
        { id: P_GUEST, bill_id: BILL, user_id: GUEST, display_name: "Sam", join_order: 2, is_host: false },
      ],
      claims: [
        { bill_id: BILL, line_item_id: ITEM, participant_id: P_HOST },
        { bill_id: BILL, line_item_id: ITEM, participant_id: P_GUEST },
      ],
      settlements: [],
    });
    const { client, rpc } = fakeClient();
    await lockBill(client, BILL, buildLockPayload(bill));
    expect(rpc).toHaveBeenCalledWith("lock_bill", {
      p_bill_id: BILL,
      p_amounts: [{ participant_id: P_GUEST, amount_cents: 500 }],
      p_host_cents: 501,
    });
  });

  it("unlock_bill, leave_bill, set_settlement_status", async () => {
    const { client, rpc } = fakeClient();
    await unlockBill(client, BILL);
    await leaveBill(client, BILL);
    await setSettlementStatus(client, SETTLEMENT, "marked_paid");
    await removeParticipant(client, P_GUEST);
    expect(rpc.mock.calls).toEqual([
      ["unlock_bill", { p_bill_id: BILL }],
      ["leave_bill", { p_bill_id: BILL }],
      ["set_settlement_status", { p_settlement_id: SETTLEMENT, p_status: "marked_paid" }],
      ["remove_participant", { p_participant_id: P_GUEST }],
    ]);
  });

  it("upsert_profile normalizes handles and sends null for blank or invalid ones", async () => {
    const { client, rpc } = fakeClient();
    await upsertProfile(client, { displayName: "Alex", handles: { venmo: "@alex-k", paypal: "", cashapp: "bad handle" } });
    expect(rpc).toHaveBeenCalledWith("upsert_profile", {
      p_display_name: "Alex",
      p_venmo: "alex-k",
      p_paypal: null,
      p_cashapp: null,
    });
  });
});

describe("errors", () => {
  it("maps SQLSTATEs to friendly LiveBillErrors", async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { code: "P0002", message: "join_bill: no open bill", details: "", hint: "" } } });
    const err = await joinBill(client, "abcdefghjkmn", "Sam").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LiveBillError);
    expect((err as LiveBillError).code).toBe("CLOSED");
    expect((err as LiveBillError).message).toBe("This bill isn't open anymore.");
  });

  it("covers the custom codes", () => {
    const cases: [string, string][] = [
      ["28000", "AUTH"],
      ["42501", "FORBIDDEN"],
      ["22023", "INVALID"],
      ["SS001", "STATE"],
      ["SS004", "UNCLAIMED"],
      ["SS005", "AMOUNTS_CHANGED"],
      ["SS006", "AMOUNTS_CHANGED"],
      ["SS007", "ALREADY_PAID"],
      ["SS008", "FULL"],
      ["SS009", "HOST_CANNOT_LEAVE"],
      ["SS010", "BAD_TRANSITION"],
      ["SS011", "DISCOUNT"],
      ["XX999", "UNKNOWN"],
    ];
    for (const [sqlstate, code] of cases) {
      expect(toLiveBillError({ code: sqlstate, message: "x" }).code).toBe(code);
    }
  });

  it("detects network failures (returned or thrown)", async () => {
    expect(isNetworkError({ code: "", message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError({ code: "P0002", message: "fetch" })).toBe(false);
    const rpc = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const err = await unlockBill({ rpc } as unknown as LiveClient, BILL).catch((e: unknown) => e);
    expect((err as LiveBillError).code).toBe("NETWORK");
  });

  it("rejects malformed RPC results", async () => {
    for (const data of [[], [{ bill_id: "not-a-uuid", share_code: "x" }], null, [{ bill_id: BILL }]]) {
      const { client } = fakeClient({ rpc: { data, error: null } });
      const err = await publishBill(client, {
        client_key: "8d1c3f0a-5b2e-4c7d-9a10-0f2e3d4c5b6a",
        merchant: null,
        currency: "USD",
        host_display_name: "A",
        items: [],
        adjustments: [],
      }).catch((e: unknown) => e);
      expect((err as LiveBillError).code).toBe("MALFORMED");
    }
  });
});

describe("claims", () => {
  it("inserts with ON CONFLICT DO NOTHING on the claims primary key", async () => {
    const { client, queries } = fakeClient();
    await addClaims(client, [{ billId: BILL, itemId: ITEM, participantId: P_GUEST }]);
    expect(queries[0].table).toBe("claims");
    expect(queries[0].calls).toEqual([
      [
        "upsert",
        [
          [{ bill_id: BILL, line_item_id: ITEM, participant_id: P_GUEST }],
          { onConflict: "line_item_id,participant_id", ignoreDuplicates: true },
        ],
      ],
    ]);
  });

  it("does nothing for an empty list", async () => {
    const { client, queries } = fakeClient();
    await addClaims(client, []);
    expect(queries).toEqual([]);
  });

  it("deletes one claim by its full key", async () => {
    const { client, queries } = fakeClient();
    await removeClaim(client, { billId: BILL, itemId: ITEM, participantId: P_GUEST });
    expect(queries[0].calls).toEqual([
      ["delete", []],
      ["eq", ["bill_id", BILL]],
      ["eq", ["line_item_id", ITEM]],
      ["eq", ["participant_id", P_GUEST]],
    ]);
  });

  it("surfaces RLS failures instead of swallowing them", async () => {
    const { client } = fakeClient({ tables: { claims: { data: null, error: { code: "42501", message: "rls" } } } });
    await expect(addClaims(client, [{ billId: BILL, itemId: ITEM, participantId: P_HOST }])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("reads", () => {
  const billRow = {
    id: BILL,
    share_code: "abcdefghjkmn",
    host_id: HOST,
    merchant: "Bistro",
    status: "open",
    currency: "USD",
    host_venmo_handle: null,
    host_paypal_handle: null,
    host_cashapp_handle: null,
  };

  it("findBillIdByShareCode returns the id or null", async () => {
    const found = fakeClient({ tables: { bills: { data: { id: BILL }, error: null } } });
    await expect(findBillIdByShareCode(found.client, "abcdefghjkmn")).resolves.toBe(BILL);
    expect(found.queries[0].calls).toEqual([
      ["select", ["id"]],
      ["eq", ["share_code", "abcdefghjkmn"]],
      ["maybeSingle", []],
    ]);
    const missing = fakeClient({ tables: { bills: { data: null, error: null } } });
    await expect(findBillIdByShareCode(missing.client, "abcdefghjkmn")).resolves.toBeNull();
  });

  it("fetchBillRows validates every table and accepts string bigints", async () => {
    const { client, queries } = fakeClient({
      tables: {
        bills: { data: billRow, error: null },
        line_items: { data: [{ id: ITEM, bill_id: BILL, name: "Fries", quantity: 1, price_cents: "1200", position: 0 }], error: null },
        participants: {
          data: [{ id: P_HOST, bill_id: BILL, user_id: HOST, display_name: "Alex", join_order: "1", is_host: true }],
          error: null,
        },
        settlements: {
          data: [{ id: SETTLEMENT, bill_id: BILL, participant_id: P_GUEST, amount_cents: "700", status: "confirmed", marked_paid_at: "2026-10-10T12:00:00+00:00" }],
          error: null,
        },
      },
    });
    const rows = await fetchBillRows(client, BILL);
    expect(rows?.settlements[0].marked_paid_at).toBe("2026-10-10T12:00:00+00:00");
    expect(rows?.bill.id).toBe(BILL);
    expect(rows?.items[0].price_cents).toBe("1200");
    expect(queries.map((q) => q.table).sort()).toEqual(
      ["bill_adjustments", "bills", "claims", "line_items", "participants", "settlements"],
    );
    for (const q of queries) {
      const filter = q.calls.find(([m]) => m === "eq");
      expect(filter?.[1]).toEqual([q.table === "bills" ? "id" : "bill_id", BILL]);
    }
  });

  it("fetchBillRows returns null when the bill isn't visible", async () => {
    const { client } = fakeClient({ tables: { bills: { data: null, error: null } } });
    await expect(fetchBillRows(client, BILL)).resolves.toBeNull();
  });

  it("zod rejects malformed rows", async () => {
    const bad: Record<string, Result>[] = [
      { bills: { data: { ...billRow, status: "deleted" }, error: null } },
      { bills: { data: { ...billRow, host_id: 5 }, error: null } },
      { bills: { data: billRow, error: null }, line_items: { data: [{ id: ITEM, bill_id: BILL, name: "X", quantity: 1, price_cents: null, position: 0 }], error: null } },
      { bills: { data: billRow, error: null }, settlements: { data: [{ id: SETTLEMENT, bill_id: BILL, participant_id: P_GUEST, amount_cents: 5, status: "paid", marked_paid_at: null }], error: null } },
      { bills: { data: billRow, error: null }, bill_adjustments: { data: [{ id: ITEM, bill_id: BILL, kind: "service", amount_cents: 5 }], error: null } },
      { bills: { data: billRow, error: null }, claims: { data: [{ bill_id: BILL, line_item_id: ITEM }], error: null } },
      { bills: { data: billRow, error: null }, participants: { data: "nope", error: null } },
    ];
    for (const tables of bad) {
      const { client } = fakeClient({ tables });
      await expect(fetchBillRows(client, BILL)).rejects.toMatchObject({ code: "MALFORMED" });
    }
  });
});

describe("realtime", () => {
  function fakeRealtime() {
    const handlers: { filter: Record<string, unknown>; cb: (p: { old: Record<string, unknown> }) => void }[] = [];
    let statusCb: ((s: string) => void) | null = null;
    const channel = {
      on: vi.fn((_type: string, filter: Record<string, unknown>, cb: (p: { old: Record<string, unknown> }) => void) => {
        handlers.push({ filter, cb });
        return channel;
      }),
      subscribe: vi.fn((cb: (s: string) => void) => {
        statusCb = cb;
        return channel;
      }),
    };
    const removeChannel = vi.fn(() => Promise.resolve("ok"));
    const client = { channel: vi.fn(() => channel), removeChannel } as unknown as LiveClient;
    return { client, handlers, removeChannel, status: (s: string) => statusCb?.(s) };
  }

  it("filters inserts/updates by bill and listens to deletes unfiltered", () => {
    const rt = fakeRealtime();
    const changes: unknown[] = [];
    const statuses: string[] = [];
    const stop = subscribeToBill(rt.client, BILL, (c) => changes.push(c), (s) => statuses.push(s));

    const claimInsert = rt.handlers.find((h) => h.filter.table === "claims" && h.filter.event === "INSERT");
    expect(claimInsert?.filter.filter).toBe(`bill_id=eq.${BILL}`);
    const billUpdate = rt.handlers.find((h) => h.filter.table === "bills" && h.filter.event === "UPDATE");
    expect(billUpdate?.filter.filter).toBe(`id=eq.${BILL}`);
    const claimDelete = rt.handlers.find((h) => h.filter.table === "claims" && h.filter.event === "DELETE");
    expect(claimDelete?.filter.filter).toBeUndefined();
    expect(rt.handlers).toHaveLength(18);

    claimDelete?.cb({ old: { line_item_id: ITEM, participant_id: P_GUEST } });
    expect(changes).toEqual([{ table: "claims", type: "DELETE", old: { line_item_id: ITEM, participant_id: P_GUEST } }]);

    rt.status("SUBSCRIBED");
    rt.status("CHANNEL_ERROR");
    expect(statuses).toEqual(["live", "down"]);

    stop();
    rt.status("CLOSED");
    claimDelete?.cb({ old: {} });
    expect(statuses).toEqual(["live", "down"]);
    expect(changes).toHaveLength(1);
    expect(rt.removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe("auth", () => {
  it("watchSession reports users and unsubscribes", () => {
    let cb: ((e: string, s: unknown) => void) | null = null;
    const unsubscribe = vi.fn();
    const client = {
      auth: {
        onAuthStateChange: (fn: (e: string, s: unknown) => void) => {
          cb = fn;
          return { data: { subscription: { unsubscribe } } };
        },
      },
    } as unknown as LiveClient;
    const seen: unknown[] = [];
    const stop = watchSession(client, (u) => seen.push(u));
    cb!("INITIAL_SESSION", null);
    cb!("SIGNED_IN", { user: { id: HOST, is_anonymous: false, user_metadata: { full_name: " Alex K " } } });
    expect(seen).toEqual([null, { id: HOST, isAnonymous: false, suggestedName: "Alex K" }]);
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("signInAnonymously returns the anonymous user or throws a friendly error", async () => {
    const ok = { auth: { signInAnonymously: () => Promise.resolve({ data: { user: { id: GUEST, is_anonymous: true } }, error: null }) } };
    await expect(signInAnonymously(ok as unknown as LiveClient)).resolves.toEqual({ id: GUEST, isAnonymous: true, suggestedName: null });
    const off = { auth: { signInAnonymously: () => Promise.resolve({ data: { user: null }, error: { status: 422, message: "Anonymous sign-ins are disabled" } }) } };
    await expect(signInAnonymously(off as unknown as LiveClient)).rejects.toBeInstanceOf(LiveBillError);
  });
});

describe("readSupabaseConfig", () => {
  it("is null unless both URL and a key are set", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ url: "https://x.supabase.co" })).toBeNull();
    expect(readSupabaseConfig({ url: "not a url", anonKey: "k" })).toBeNull();
    expect(readSupabaseConfig({ url: "ftp://x.supabase.co", anonKey: "k" })).toBeNull();
  });

  it("prefers the publishable key and falls back to the anon key", () => {
    expect(readSupabaseConfig({ url: "https://x.supabase.co/", publishableKey: "pub", anonKey: "anon" })).toEqual({
      url: "https://x.supabase.co",
      key: "pub",
    });
    expect(readSupabaseConfig({ url: "https://x.supabase.co", publishableKey: " ", anonKey: "anon" })?.key).toBe("anon");
  });
});
