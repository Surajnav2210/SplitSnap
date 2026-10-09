// Gemini adapter: turns a receipt photo into raw, UNTRUSTED JSON.
//
// SERVER-ONLY. The `server-only` package isn't installed, so this relies on
// never being imported from client code: only src/app/api/** route handlers
// may import it. It reads GEMINI_API_KEY, which must never reach the browser.
//
// The model only transcribes; the caller validates and converts the result
// with normalizeReceipt (src/core/receipt.ts). Never log image bytes, the API
// key, or model output from here.

import { ApiError, FinishReason, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { ScanError } from "@/core/receipt";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_TIMEOUT_MS = 25_000;

export interface ReceiptImage {
  bytes: Uint8Array;
  mimeType: string;
}

const PROMPT = `You are transcribing a photo of a restaurant or shop receipt into JSON.

Rules:
- Copy every purchased line item exactly as printed, in order. "name" is the item text as printed (fix only obvious OCR noise).
- "totalPrice" is the price printed on that line (the line total, not a per-unit price), as a string with exactly two decimals, e.g. "12.50". Do not include currency symbols.
- "quantity" only if a quantity is printed for that line (e.g. "2 x Beer"); otherwise null.
- Do NOT compute, add up, estimate, or invent anything. If a value is not printed, use null.
- Discounts, comps, coupons, voids and promotions: put their combined amount in "discount" (as printed, e.g. "5.00"), not in "items".
- "subtotal", "tax", "tip" (gratuity), "serviceFee" (service charge / delivery or other fees) and "total": copy as printed, two decimals, or null if absent.
- "merchant": the business name as printed, or null.
- "currency": the ISO 4217 code if you can tell (e.g. "USD"), else null.
- Never include personal data: no card numbers, card holder names, staff/server names, phone numbers, or addresses.
- If the image is not a receipt or is unreadable, return {"items": []}.`;

// JSON Schema mirroring RawReceiptSchema in src/core/receipt.ts.
const nullableString = { type: ["string", "null"] };
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    merchant: nullableString,
    currency: nullableString,
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: ["integer", "null"] },
          totalPrice: { type: "string" },
        },
        required: ["name", "totalPrice"],
      },
    },
    subtotal: nullableString,
    tax: nullableString,
    tip: nullableString,
    serviceFee: nullableString,
    discount: nullableString,
    total: nullableString,
  },
  required: ["items"],
};

function isQuotaError(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 429) return true;
  return err instanceof Error && /RESOURCE_EXHAUSTED/i.test(err.message);
}

// --- Retry policy -------------------------------------------------------------
// Receipt extraction is read-only, so retrying is safe. Only transient server
// errors are retried; 429 (quota), other 4xx, and our own validation results
// (UNREADABLE) are not.

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504]);
export const MAX_RETRIES = 2;
export const RETRY_BASE_MS = 400;
export const RETRY_CAP_MS = 2_500;
/** Don't start another attempt if less than this remains of the overall budget. */
export const MIN_ATTEMPT_BUDGET_MS = 3_000;

function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && RETRYABLE_STATUSES.has(err.status);
}

/** Full-jitter backoff: uniform in [0, min(cap, base * 2^retry)). */
function backoffMs(retry: number, random: () => number): number {
  return Math.floor(random() * Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** retry));
}

/** Injectable hooks so tests don't actually wait. Production uses the defaults. */
export interface ExtractOptions {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Finish reasons that still mean "the model finished writing normally".
const NORMAL_FINISH: ReadonlySet<string> = new Set([FinishReason.STOP, FinishReason.FINISH_REASON_UNSPECIFIED]);

/**
 * True if Gemini refused or cut off the answer: the prompt was blocked
 * (promptFeedback.blockReason, e.g. SAFETY) or the candidate stopped for a
 * non-normal reason (SAFETY, RECITATION, PROHIBITED_CONTENT, SPII,
 * MAX_TOKENS, ...). Either way there's no complete transcription to trust.
 */
function wasBlockedOrCutOff(response: GenerateContentResponse): boolean {
  if (response.promptFeedback?.blockReason) return true;
  const finishReason = response.candidates?.[0]?.finishReason;
  return finishReason !== undefined && !NORMAL_FINISH.has(finishReason);
}

function hasItemsArray(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("items" in value)) return false;
  const { items } = value as { items: unknown };
  return Array.isArray(items) && items.length > 0;
}

/**
 * Ask Gemini to transcribe a receipt image. Resolves with the parsed (but NOT
 * validated) JSON object, which has a non-empty `items` array.
 *
 * Rejects with ScanError:
 * - NO_API_KEY: GEMINI_API_KEY is not set
 * - QUOTA: 429 / RESOURCE_EXHAUSTED
 * - UNREADABLE: the model blocked or cut off its answer (promptFeedback
 *   blockReason, or a finishReason other than STOP such as SAFETY or
 *   MAX_TOKENS), or returned empty text, invalid JSON, or no items
 * - UPSTREAM: anything else (network, timeout, 5xx, bad key, safety block)
 *
 * Transient 500/502/503/504 errors are retried up to MAX_RETRIES times with
 * full-jitter exponential backoff, all within one GEMINI_TIMEOUT_MS budget.
 */
export async function extractReceipt(image: ReceiptImage, options: ExtractOptions = {}): Promise<unknown> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ScanError("NO_API_KEY");
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  const ai = new GoogleGenAI({ apiKey });

  const data = Buffer.from(image.bytes).toString("base64");
  const deadline = now() + GEMINI_TIMEOUT_MS;

  let response: GenerateContentResponse;
  let attempts = 0;
  for (;;) {
    const remaining = deadline - now();
    attempts += 1;
    try {
      response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: image.mimeType, data } }, { text: PROMPT }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
          temperature: 0,
          httpOptions: { timeout: remaining },
          abortSignal: AbortSignal.timeout(remaining),
        },
      });
      break;
    } catch (err) {
      const retry = attempts - 1;
      if (isRetryable(err) && retry < MAX_RETRIES) {
        const delay = backoffMs(retry, random);
        if (deadline - now() - delay >= MIN_ATTEMPT_BUDGET_MS) {
          await sleep(delay);
          continue;
        }
      }
      throw new ScanError(isQuotaError(err) ? "QUOTA" : "UPSTREAM", { cause: err, attempts });
    }
  }

  if (wasBlockedOrCutOff(response)) throw new ScanError("UNREADABLE");

  const text = response.text;
  if (text === undefined || text.trim() === "") throw new ScanError("UNREADABLE");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // No cause: SyntaxError messages can quote model output.
    throw new ScanError("UNREADABLE");
  }
  if (!hasItemsArray(parsed)) throw new ScanError("UNREADABLE");
  return parsed;
}
