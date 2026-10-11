import { describe, expect, it, vi } from "vitest";
import { LiveBillError } from "./errors";
import {
  fetchMyProfile,
  fetchParticipantHandles,
  setParticipantVenmo,
  subscribeToParticipantHandles,
} from "./liveBillApi";
import { ParticipantHandleRowSchema, ProfileRowSchema } from "./schemas";
import type { LiveClient } from "./types";

const BILL = "0b2c3d4e-0000-4000-8000-000000000001";
const HOST = "0b2c3d4e-0000-4000-8000-0000000000a1";
const P_GUEST = "0b2c3d4e-0000-4000-8000-0000000000b2";

type Result = { data: unknown; error: unknown };

function fakeQuery(result: Result) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "maybeSingle"]) {
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
  return { client: { rpc, from } as unknown as LiveClient, rpc, queries };
}

const handleRow = { participant_id: P_GUEST, bill_id: BILL, venmo_handle: "sam-k", updated_at: "2026-10-11T12:00:00+00:00" };

describe("set_participant_venmo", () => {
  it("sends the participant id and the username without @", async () => {
    const { client, rpc } = fakeClient();
    await setParticipantVenmo(client, P_GUEST, "  @sam-k ");
    expect(rpc.mock.calls).toEqual([["set_participant_venmo", { p_participant_id: P_GUEST, p_venmo: "sam-k" }]]);
  });

  it("sends null to clear when blank", async () => {
    const { client, rpc } = fakeClient();
    await setParticipantVenmo(client, P_GUEST, "");
    await setParticipantVenmo(client, P_GUEST, "   ");
    expect(rpc.mock.calls).toEqual([
      ["set_participant_venmo", { p_participant_id: P_GUEST, p_venmo: null }],
      ["set_participant_venmo", { p_participant_id: P_GUEST, p_venmo: null }],
    ]);
  });

  it("rejects an invalid username without calling the database (never clears by accident)", async () => {
    const { client, rpc } = fakeClient();
    for (const bad of ["sam k", "@", "$sam", "a".repeat(65)]) {
      const err = await setParticipantVenmo(client, P_GUEST, bad).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LiveBillError);
      expect((err as LiveBillError).code).toBe("INVALID");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database errors (bad format, not allowed, bill closed)", async () => {
    for (const [sqlstate, code] of [
      ["22023", "INVALID"],
      ["42501", "FORBIDDEN"],
      ["SS001", "STATE"],
      ["P0002", "CLOSED"],
    ] as const) {
      const { client } = fakeClient({ rpc: { data: null, error: { code: sqlstate, message: "x" } } });
      await expect(setParticipantVenmo(client, P_GUEST, "sam")).rejects.toMatchObject({ code });
    }
  });
});

describe("fetchParticipantHandles", () => {
  it("reads the bill's rows and validates them", async () => {
    const { client, queries } = fakeClient({ tables: { participant_handles: { data: [handleRow], error: null } } });
    await expect(fetchParticipantHandles(client, BILL)).resolves.toEqual([handleRow]);
    expect(queries).toEqual([
      {
        table: "participant_handles",
        calls: [
          ["select", ["participant_id, bill_id, venmo_handle, updated_at"]],
          ["eq", ["bill_id", BILL]],
        ],
      },
    ]);
  });

  it("returns an empty list when RLS hides every row", async () => {
    const { client } = fakeClient({ tables: { participant_handles: { data: [], error: null } } });
    await expect(fetchParticipantHandles(client, BILL)).resolves.toEqual([]);
  });

  it("throws MALFORMED for bad rows and surfaces errors", async () => {
    for (const data of [[{ ...handleRow, participant_id: "nope" }], [{ ...handleRow, venmo_handle: 5 }], [{ participant_id: P_GUEST }], null]) {
      const { client } = fakeClient({ tables: { participant_handles: { data, error: null } } });
      await expect(fetchParticipantHandles(client, BILL)).rejects.toMatchObject({ code: "MALFORMED" });
    }
    const { client } = fakeClient({ tables: { participant_handles: { data: null, error: { code: "42501", message: "rls" } } } });
    await expect(fetchParticipantHandles(client, BILL)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("ParticipantHandleRowSchema", () => {
  it("accepts a cleared username and rejects missing fields", () => {
    expect(ParticipantHandleRowSchema.safeParse({ ...handleRow, venmo_handle: null }).success).toBe(true);
    expect(ParticipantHandleRowSchema.safeParse({ ...handleRow, bill_id: "x" }).success).toBe(false);
    const noTimestamp = { participant_id: P_GUEST, bill_id: BILL, venmo_handle: "sam-k" };
    expect(ParticipantHandleRowSchema.safeParse(noTimestamp).success).toBe(false);
  });
});

describe("fetchMyProfile", () => {
  const profile = { id: HOST, display_name: "Alex", venmo_handle: "alex-k", paypal_handle: null, cashapp_handle: "bad handle" };

  it("reads only the viewer's own row and keeps valid handles", async () => {
    const { client, queries } = fakeClient({ tables: { profiles: { data: profile, error: null } } });
    await expect(fetchMyProfile(client, HOST)).resolves.toEqual({
      displayName: "Alex",
      handles: { venmo: "alex-k", paypal: undefined, cashapp: undefined },
    });
    expect(queries).toEqual([
      {
        table: "profiles",
        calls: [
          ["select", ["id, display_name, venmo_handle, paypal_handle, cashapp_handle"]],
          ["eq", ["id", HOST]],
          ["maybeSingle", []],
        ],
      },
    ]);
  });

  it("returns null when there's no profile yet", async () => {
    const { client } = fakeClient({ tables: { profiles: { data: null, error: null } } });
    await expect(fetchMyProfile(client, HOST)).resolves.toBeNull();
  });

  it("rejects malformed rows", async () => {
    const { client } = fakeClient({ tables: { profiles: { data: { ...profile, display_name: null }, error: null } } });
    await expect(fetchMyProfile(client, HOST)).rejects.toMatchObject({ code: "MALFORMED" });
    expect(ProfileRowSchema.safeParse({ ...profile, id: 1 }).success).toBe(false);
  });
});

describe("subscribeToParticipantHandles", () => {
  it("uses its own channel, filters inserts/updates by bill, and stops after unsubscribe", () => {
    const handlers: { filter: Record<string, unknown>; cb: (p: { old: Record<string, unknown> }) => void }[] = [];
    const channel = {
      on: vi.fn((_type: string, filter: Record<string, unknown>, cb: (p: { old: Record<string, unknown> }) => void) => {
        handlers.push({ filter, cb });
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const removeChannel = vi.fn(() => Promise.resolve("ok"));
    const channelFn = vi.fn(() => channel);
    const client = { channel: channelFn, removeChannel } as unknown as LiveClient;

    const changes: unknown[] = [];
    const stop = subscribeToParticipantHandles(client, BILL, (c) => changes.push(c));
    expect(channelFn).toHaveBeenCalledWith(`bill-handles:${BILL}`);
    expect(handlers.map((h) => [h.filter.event, h.filter.table, h.filter.filter])).toEqual([
      ["INSERT", "participant_handles", `bill_id=eq.${BILL}`],
      ["UPDATE", "participant_handles", `bill_id=eq.${BILL}`],
      ["DELETE", "participant_handles", undefined],
    ]);
    handlers[1].cb({ old: {} });
    handlers[2].cb({ old: { participant_id: P_GUEST } });
    expect(changes).toEqual([
      { table: "participant_handles", type: "UPDATE", old: {} },
      { table: "participant_handles", type: "DELETE", old: { participant_id: P_GUEST } },
    ]);
    stop();
    handlers[0].cb({ old: {} });
    expect(changes).toHaveLength(2);
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
