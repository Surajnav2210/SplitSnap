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
 */
export async function extractReceipt(image: ReceiptImage): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ScanError("NO_API_KEY");
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  const ai = new GoogleGenAI({ apiKey });

  let response: GenerateContentResponse;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: image.mimeType,
                data: Buffer.from(image.bytes).toString("base64"),
              },
            },
            { text: PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        temperature: 0,
        httpOptions: { timeout: GEMINI_TIMEOUT_MS },
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    });
  } catch (err) {
    throw new ScanError(isQuotaError(err) ? "QUOTA" : "UPSTREAM", { cause: err });
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
