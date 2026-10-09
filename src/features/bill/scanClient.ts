// Browser client for POST /api/receipts/scan.
// The response is untrusted input: it is validated with zod before the app
// uses it. Network failures and non-JSON replies (e.g. Vercel rejecting a body
// over 4.5 MB before our route runs) become friendly failures so the UI can
// always offer manual entry. Types come from the server contract in
// src/core/receipt.ts.

import { z } from "zod";
import {
  SCAN_ERROR_MESSAGES,
  type ScanErrorCode,
  type ScanResponse,
  type ScanResult,
} from "@/core/receipt";

export type { ScanErrorCode, ScanResponse, ScanResult } from "@/core/receipt";
export { SCAN_ERROR_MESSAGES } from "@/core/receipt";

export const SCAN_ENDPOINT = "/api/receipts/scan";
/** Stay well under Vercel's 4.5 MB request-body limit. */
export const TARGET_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
/** Tried in order until the JPEG fits under TARGET_UPLOAD_BYTES. */
export const JPEG_QUALITIES: readonly number[] = [0.85, 0.7, 0.55];

/** Server codes plus failures that only happen in the browser. */
export type ScanClientErrorCode = ScanErrorCode | "NETWORK" | "BAD_RESPONSE";
export type ScanClientFailure = { ok: false; code: ScanClientErrorCode; message: string };
export type ScanClientResult = { ok: true; receipt: ScanResult } | ScanClientFailure;

const SERVER_CODES = Object.keys(SCAN_ERROR_MESSAGES) as [ScanErrorCode, ...ScanErrorCode[]];

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const receiptSchema = z.object({
  merchant: z.string().nullable(),
  currency: z.literal("USD"),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int().positive(),
      /** Line total in cents (what the receipt prints for this line). */
      priceCents: cents,
    }),
  ),
  taxCents: cents,
  tipCents: cents,
  feeCents: cents,
  discountCents: cents,
  receiptTotalCents: cents.nullable(),
  warnings: z.array(z.string()),
}) satisfies z.ZodType<ScanResult>;

const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), receipt: receiptSchema }),
  z.object({ ok: z.literal(false), code: z.enum(SERVER_CODES), message: z.string() }),
]) satisfies z.ZodType<ScanResponse>;

const BAD_RESPONSE: ScanClientFailure = {
  ok: false,
  code: "BAD_RESPONSE",
  message: "We couldn't scan that receipt. You can enter the items by hand.",
};

/** Validate a parsed JSON body from the scan endpoint. */
export function parseScanResponse(body: unknown): ScanClientResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return BAD_RESPONSE;
  const data = parsed.data;
  if (data.ok) return data;
  // Prefer the server's message; fall back to our own copy for that code.
  return { ok: false, code: data.code, message: data.message.trim() || SCAN_ERROR_MESSAGES[data.code] };
}

/** Scale (width, height) so the long edge is at most `maxEdge`, keeping aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new RangeError("Image has no size.");
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  return {
    width: Math.max(1, Math.round((width * maxEdge) / longEdge)),
    height: Math.max(1, Math.round((height * maxEdge) / longEdge)),
  };
}

/**
 * Downscale a photo to a JPEG (long edge <= 1600px) before upload. If the
 * browser can't decode the format (e.g. HEIC outside Safari), the original
 * file is sent as-is when it's under the size limit; otherwise this rejects.
 */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    if (file.size <= TARGET_UPLOAD_BYTES) return file;
    throw new Error("This photo format can't be resized in your browser.", { cause: err });
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Your browser couldn't prepare this photo.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob: Blob | null = null;
  for (const quality of JPEG_QUALITIES) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Your browser couldn't prepare this photo.");
    if (blob.size <= TARGET_UPLOAD_BYTES) return blob;
  }
  if (!blob) throw new Error("Your browser couldn't prepare this photo.");
  return blob;
}

/** Upload a receipt photo and return a validated result. Never throws for HTTP/network errors. */
export async function scanReceipt(file: File, signal?: AbortSignal): Promise<ScanClientResult> {
  let image: Blob;
  try {
    image = await prepareImage(file);
  } catch (err) {
    return {
      ok: false,
      code: "BAD_IMAGE",
      message: err instanceof Error ? err.message : "We couldn't open that photo.",
    };
  }
  if (image.size > TARGET_UPLOAD_BYTES) {
    return { ok: false, code: "TOO_LARGE", message: SCAN_ERROR_MESSAGES.TOO_LARGE };
  }

  const form = new FormData();
  form.append("image", image, image === file ? file.name : "receipt.jpg");

  let response: Response;
  try {
    response = await fetch(SCAN_ENDPOINT, { method: "POST", body: form, signal });
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled; let them handle it
    return {
      ok: false,
      code: "NETWORK",
      message: "We couldn't reach the receipt scanner. Check your connection or enter items by hand.",
    };
  }

  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return BAD_RESPONSE;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return BAD_RESPONSE;
  }
  return parseScanResponse(body);
}

/**
 * Small JPEG data URL of the photo for the review screen (no object URLs to
 * revoke). Resolves to null when the browser can't decode the format.
 */
export async function makeThumbnail(file: File, maxEdge = 320): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // e.g. HEIC outside Safari: the UI shows a receipt icon instead
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return ctx ? canvas.toDataURL("image/jpeg", 0.7) : null;
}
