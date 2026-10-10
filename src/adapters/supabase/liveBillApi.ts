// Typed wrappers around the live-bill database API: one function per RPC,
// plus the direct table reads/writes RLS allows (claims insert/delete, reads).
// This module and its siblings are the only code that touches supabase-js.
//
// Every function either returns validated data or throws LiveBillError with a
// user-safe message. Nothing here logs: errors can carry names and ids.

import type { z } from "zod";
import type {
  LiveBillRows,
  LiveTable,
  LockPayload,
  PublishBillPayload,
  SettlementStatus,
} from "@/core/liveBill";
import { normalizeHandle, type PaymentHandles } from "@/core/paymentLinks";
import { LiveBillError, toLiveBillError } from "./errors";
import {
  AdjustmentRowSchema,
  BillIdOnlySchema,
  BillRowSchema,
  COLUMNS,
  ClaimRowSchema,
  JoinResultSchema,
  LineItemRowSchema,
  ParticipantRowSchema,
  PublishResultSchema,
  SettlementRowSchema,
} from "./schemas";
import type { LiveClient } from "./types";

interface DbResult {
  data: unknown;
  error: unknown;
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new LiveBillError("MALFORMED", { cause: result.error });
  return result.data;
}

/** Await a supabase-js call; throw LiveBillError on `error` or a thrown fetch failure. */
async function run(query: PromiseLike<DbResult>): Promise<unknown> {
  let res: DbResult;
  try {
    res = await query;
  } catch (err) {
    throw toLiveBillError(err);
  }
  if (res.error) throw toLiveBillError(res.error);
  return res.data;
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

export async function publishBill(
  client: LiveClient,
  bill: PublishBillPayload,
): Promise<{ billId: string; shareCode: string }> {
  const data = await run(client.rpc("publish_bill", { p_bill: bill }));
  const [row] = parse(PublishResultSchema, data);
  return { billId: row.bill_id, shareCode: row.share_code };
}

export async function joinBill(
  client: LiveClient,
  shareCode: string,
  displayName: string,
): Promise<{ billId: string; participantId: string }> {
  const data = await run(client.rpc("join_bill", { p_share_code: shareCode, p_display_name: displayName }));
  const [row] = parse(JoinResultSchema, data);
  return { billId: row.bill_id, participantId: row.participant_id };
}

export async function lockBill(client: LiveClient, billId: string, payload: LockPayload): Promise<void> {
  await run(
    client.rpc("lock_bill", {
      p_bill_id: billId,
      p_amounts: payload.amounts.map((a) => ({ participant_id: a.participantId, amount_cents: a.amountCents })),
      p_host_cents: payload.hostCents,
    }),
  );
}

export async function unlockBill(client: LiveClient, billId: string): Promise<void> {
  await run(client.rpc("unlock_bill", { p_bill_id: billId }));
}

/** Host only, bill open: remove a guest (and their claims). The host can't be removed. */
export async function removeParticipant(client: LiveClient, participantId: string): Promise<void> {
  await run(client.rpc("remove_participant", { p_participant_id: participantId }));
}

export async function leaveBill(client: LiveClient, billId: string): Promise<void> {
  await run(client.rpc("leave_bill", { p_bill_id: billId }));
}

export async function setSettlementStatus(
  client: LiveClient,
  settlementId: string,
  status: SettlementStatus,
): Promise<void> {
  await run(client.rpc("set_settlement_status", { p_settlement_id: settlementId, p_status: status }));
}

/** Save the host's name and handles. Invalid or blank handles are sent as null (clears them). */
export async function upsertProfile(
  client: LiveClient,
  profile: { displayName: string; handles: PaymentHandles },
): Promise<void> {
  const h = (app: keyof PaymentHandles) => normalizeHandle(app, profile.handles[app] ?? "");
  await run(
    client.rpc("upsert_profile", {
      p_display_name: profile.displayName,
      p_venmo: h("venmo"),
      p_paypal: h("paypal"),
      p_cashapp: h("cashapp"),
    }),
  );
}

// ---------------------------------------------------------------------------
// Claims (direct table writes, checked by RLS)
// ---------------------------------------------------------------------------

export interface ClaimKey {
  billId: string;
  itemId: string;
  participantId: string;
}

/** Insert claims; existing ones are left alone (ON CONFLICT DO NOTHING), so retries are safe. */
export async function addClaims(client: LiveClient, claims: readonly ClaimKey[]): Promise<void> {
  if (claims.length === 0) return;
  const rows = claims.map((c) => ({ bill_id: c.billId, line_item_id: c.itemId, participant_id: c.participantId }));
  await run(client.from("claims").upsert(rows, { onConflict: "line_item_id,participant_id", ignoreDuplicates: true }));
}

/** Delete one claim. Deleting a claim that's already gone is a no-op. */
export async function removeClaim(client: LiveClient, claim: ClaimKey): Promise<void> {
  await run(
    client
      .from("claims")
      .delete()
      .eq("bill_id", claim.billId)
      .eq("line_item_id", claim.itemId)
      .eq("participant_id", claim.participantId),
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The bill id for a share code, if the signed-in user can see it (host or joined). */
export async function findBillIdByShareCode(client: LiveClient, shareCode: string): Promise<string | null> {
  const data = await run(client.from("bills").select("id").eq("share_code", shareCode).maybeSingle());
  return parse(BillIdOnlySchema, data)?.id ?? null;
}

/** Every row the viewer may see for one bill, or null if the bill isn't visible. */
export async function fetchBillRows(client: LiveClient, billId: string): Promise<LiveBillRows | null> {
  const [bill, items, adjustments, participants, claims, settlements] = await Promise.all([
    run(client.from("bills").select(COLUMNS.bills).eq("id", billId).maybeSingle()),
    run(client.from("line_items").select(COLUMNS.line_items).eq("bill_id", billId)),
    run(client.from("bill_adjustments").select(COLUMNS.bill_adjustments).eq("bill_id", billId)),
    run(client.from("participants").select(COLUMNS.participants).eq("bill_id", billId)),
    run(client.from("claims").select(COLUMNS.claims).eq("bill_id", billId)),
    run(client.from("settlements").select(COLUMNS.settlements).eq("bill_id", billId)),
  ]);
  if (bill === null) return null;
  return {
    bill: parse(BillRowSchema, bill),
    items: parse(LineItemRowSchema.array(), items),
    adjustments: parse(AdjustmentRowSchema.array(), adjustments),
    participants: parse(ParticipantRowSchema.array(), participants),
    claims: parse(ClaimRowSchema.array(), claims),
    settlements: parse(SettlementRowSchema.array(), settlements),
  };
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export const LIVE_TABLES: readonly LiveTable[] = [
  "bills",
  "line_items",
  "bill_adjustments",
  "participants",
  "claims",
  "settlements",
];

export interface LiveChange {
  table: LiveTable;
  type: "INSERT" | "UPDATE" | "DELETE";
  /** For DELETE: the old row's primary key (RLS strips everything else). */
  old: Record<string, unknown>;
}

export type ConnectionStatus = "live" | "down";

/**
 * Subscribe to every change on one bill. INSERT/UPDATE are filtered by bill
 * on the server. DELETE events can't be filtered under RLS, so they arrive
 * for all bills; callers check them with isRelevantDelete (src/core/liveBill.ts).
 * Returns an unsubscribe function.
 */
export function subscribeToBill(
  client: LiveClient,
  billId: string,
  onChange: (change: LiveChange) => void,
  onStatus: (status: ConnectionStatus) => void,
): () => void {
  let active = true;
  const channel = client.channel(`bill:${billId}`);
  for (const table of LIVE_TABLES) {
    const filter = table === "bills" ? `id=eq.${billId}` : `bill_id=eq.${billId}`;
    for (const event of ["INSERT", "UPDATE"] as const) {
      channel.on("postgres_changes", { event, schema: "public", table, filter }, () => {
        if (active) onChange({ table, type: event, old: {} });
      });
    }
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, (payload) => {
      if (active) onChange({ table, type: "DELETE", old: { ...payload.old } });
    });
  }
  channel.subscribe((status) => {
    if (!active) return;
    onStatus(status === "SUBSCRIBED" ? "live" : "down");
  });
  return () => {
    active = false;
    void client.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  isAnonymous: boolean;
  /** Name from the Google profile, if any (used only to prefill a field). */
  suggestedName: string | null;
}

interface AuthUserLike {
  id: string;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown>;
}

function toSessionUser(user: AuthUserLike | null | undefined): SessionUser | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const raw = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  return { id: user.id, isAnonymous: user.is_anonymous === true, suggestedName: raw?.trim() || null };
}

/**
 * Report the current user now and on every auth change. The local session is
 * only used to pick what to show; every read and write is still checked by RLS.
 */
export function watchSession(client: LiveClient, onUser: (user: SessionUser | null) => void): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    onUser(toSessionUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}

export async function signInAnonymously(client: LiveClient): Promise<SessionUser> {
  const data = await run(client.auth.signInAnonymously());
  const user = toSessionUser((data as { user?: AuthUserLike | null } | null)?.user);
  if (user === null) throw new LiveBillError("AUTH");
  return user;
}

/** Start Google sign-in. The browser leaves the page; `redirectTo` must be our /auth/callback. */
export async function signInWithGoogle(client: LiveClient, redirectTo: string): Promise<void> {
  await run(client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } }));
}

/** OAuth callback: trade the one-time code for a session (written to cookies). */
export async function exchangeCodeForSession(client: LiveClient, code: string): Promise<void> {
  await run(client.auth.exchangeCodeForSession(code));
}

/** Refresh the session cookie if needed (proxy). Returns whether a valid session exists. */
export async function refreshSession(client: LiveClient): Promise<boolean> {
  const { data, error } = await client.auth.getClaims();
  return error === null && data !== null;
}
