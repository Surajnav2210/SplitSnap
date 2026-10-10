// zod schemas for everything read from Supabase. Database responses are
// untrusted at the boundary: a shape mismatch becomes LiveBillError("MALFORMED")
// instead of a crash deep in the UI. Integer columns accept number or string
// (Postgres bigint); src/core/liveBill.ts converts them to safe integers.

import { z } from "zod";
import type {
  AdjustmentRow,
  BillRow,
  ClaimRow,
  LineItemRow,
  ParticipantRow,
  SettlementRow,
} from "@/core/liveBill";

const id = z.uuid();
const dbInt = z.union([z.number(), z.string()]);
const handle = z.string().nullable();

export const BillRowSchema = z.object({
  id,
  share_code: z.string(),
  host_id: id,
  merchant: z.string().nullable(),
  status: z.enum(["draft", "open", "locked", "archived"]),
  currency: z.string(),
  host_venmo_handle: handle,
  host_paypal_handle: handle,
  host_cashapp_handle: handle,
}) satisfies z.ZodType<BillRow>;

export const LineItemRowSchema = z.object({
  id,
  bill_id: id,
  name: z.string(),
  quantity: dbInt,
  price_cents: dbInt,
  position: dbInt,
}) satisfies z.ZodType<LineItemRow>;

export const AdjustmentRowSchema = z.object({
  id,
  bill_id: id,
  kind: z.enum(["tax", "tip", "fee", "discount"]),
  amount_cents: dbInt,
}) satisfies z.ZodType<AdjustmentRow>;

export const ParticipantRowSchema = z.object({
  id,
  bill_id: id,
  user_id: id.nullable(),
  display_name: z.string(),
  join_order: dbInt,
  is_host: z.boolean().nullish(),
}) satisfies z.ZodType<ParticipantRow>;

export const ClaimRowSchema = z.object({
  bill_id: id,
  line_item_id: id,
  participant_id: id,
}) satisfies z.ZodType<ClaimRow>;

export const SettlementRowSchema = z.object({
  id,
  bill_id: id,
  participant_id: id,
  amount_cents: dbInt,
  status: z.enum(["unpaid", "marked_paid", "confirmed"]),
  marked_paid_at: z.string().nullish(),
}) satisfies z.ZodType<SettlementRow>;

/** publish_bill returns a one-row table. */
export const PublishResultSchema = z.array(z.object({ bill_id: id, share_code: z.string() })).length(1);

/** join_bill returns a one-row table. */
export const JoinResultSchema = z.array(z.object({ bill_id: id, participant_id: id })).length(1);

export const BillIdOnlySchema = z.object({ id }).nullable();

/** Column lists, kept next to the schemas they must match. */
export const COLUMNS = {
  bills: "id, share_code, host_id, merchant, status, currency, host_venmo_handle, host_paypal_handle, host_cashapp_handle",
  line_items: "id, bill_id, name, quantity, price_cents, position",
  bill_adjustments: "id, bill_id, kind, amount_cents",
  participants: "id, bill_id, user_id, display_name, join_order, is_host",
  claims: "bill_id, line_item_id, participant_id",
  settlements: "id, bill_id, participant_id, amount_cents, status, marked_paid_at",
} as const;
