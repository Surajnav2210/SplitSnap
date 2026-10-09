// Receipt scan contract: validate what the AI model returned and convert it
// into integer cents. Pure functions only: no I/O, no floats.
//
// AI drafts, code computes: the model only transcribes the receipt (prices as
// strings). Every number we trust is parsed here with parseDollars, and every
// sum is done here on integer cents.

import { z } from "zod";
import { money } from "./money";
import { formatCents, parseDollars } from "./parse";

// ---------------------------------------------------------------------------
// Errors and API contract (shared by the adapter, the route, and the UI)
// ---------------------------------------------------------------------------

export type ScanErrorCode =
  | "NO_API_KEY"
  | "QUOTA"
  | "UNREADABLE"
  | "UPSTREAM"
  | "TOO_LARGE"
  | "BAD_IMAGE"
  | "RATE_LIMITED";

/** User-safe message for each error code. Never includes model output or PII. */
export const SCAN_ERROR_MESSAGES: Readonly<Record<ScanErrorCode, string>> = {
  NO_API_KEY: "Receipt scanning isn't set up yet — enter items manually.",
  QUOTA: "Scanning is busy right now — try again in a minute or enter items manually.",
  UNREADABLE: "We couldn't read that receipt — try a clearer photo or enter items manually.",
  UPSTREAM: "Scanning failed — try again or enter items manually.",
  TOO_LARGE: "That photo is too large (max 4 MB) — try a smaller one.",
  BAD_IMAGE: "Please upload a JPEG, PNG, WebP, or HEIC photo of the receipt.",
  RATE_LIMITED: "You've scanned a lot of receipts recently — try again later or enter items manually.",
};

/**
 * Typed error for every receipt-scan failure. `message` is always the
 * user-safe text for `code`; diagnostic detail (if any) lives in `cause` and
 * must never be logged in full (it may contain model output).
 */
export class ScanError extends Error {
  readonly code: ScanErrorCode;

  constructor(code: ScanErrorCode, options?: { cause?: unknown }) {
    super(SCAN_ERROR_MESSAGES[code], options);
    this.name = "ScanError";
    this.code = code;
  }
}

export interface ScanItem {
  name: string;
  quantity: number;
  /** Line total in cents (the printed price for the whole line, not per unit). */
  priceCents: number;
}

export interface ScanResult {
  merchant: string | null;
  currency: "USD";
  items: ScanItem[];
  taxCents: number;
  tipCents: number;
  feeCents: number;
  /** Positive number of cents taken off the bill. */
  discountCents: number;
  receiptTotalCents: number | null;
  warnings: string[];
}

/** JSON body of POST /api/receipts/scan. */
export type ScanResponse =
  | { ok: true; receipt: ScanResult }
  | { ok: false; code: ScanErrorCode; message: string };

// ---------------------------------------------------------------------------
// Raw model output schema
// ---------------------------------------------------------------------------

const optionalString = z.string().nullish();

export const RawReceiptSchema = z.object({
  merchant: optionalString,
  currency: optionalString,
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().nullish(),
      totalPrice: z.string(),
    }),
  ),
  subtotal: optionalString,
  tax: optionalString,
  tip: optionalString,
  serviceFee: optionalString,
  discount: optionalString,
  total: optionalString,
});

export type RawReceipt = z.infer<typeof RawReceiptSchema>;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 100;

// Item names that are really discounts/comps even if printed without a minus.
const DISCOUNT_NAME_RE = /\b(discount|comp|comped|coupon|promo|voucher)\b/i;

// Currency markers we accept as USD without a warning.
const USD_MARKERS = new Set(["USD", "US$", "$", "US DOLLAR", "US DOLLARS", "DOLLAR", "DOLLARS"]);

interface SignedCents {
  cents: number;
  negative: boolean;
}

/**
 * Parse a printed amount that may be negative: "-2.00", "−2.00", "-$2.00",
 * "$-2.00", "(2.00)", "2.00-". Returns the magnitude in cents plus a sign flag.
 * Throws RangeError if the magnitude isn't a valid amount.
 */
function parseSignedDollars(input: string): SignedCents {
  let s = input.trim().replace(/−/g, "-");
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith("$-")) {
    negative = true;
    s = "$" + s.slice(2).trim();
  }
  return { cents: parseDollars(s), negative };
}

/** parseSignedDollars, but returns null for an unparseable amount (RangeError only). */
function tryParseSigned(input: string): SignedCents | null {
  try {
    return parseSignedDollars(input);
  } catch (err) {
    if (err instanceof RangeError) return null;
    throw err;
  }
}

const ISO_CURRENCY_RE = /^[A-Z]{3}$/;

// Control characters and bidi embedding/override/isolate marks: model output
// is untrusted and these can disguise text shown to the people splitting.
const UNSAFE_TEXT_RE = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;

/** Strip unsafe characters, trim, and cap length. "" means "no usable text". */
function cleanText(value: string): string {
  return value.replace(UNSAFE_TEXT_RE, "").trim().slice(0, MAX_NAME_LENGTH).trim();
}

/**
 * Warning for a model-reported currency, or null if it's USD / absent. Only a
 * plain 3-letter code is ever echoed back, so model text can't reach the UI
 * unbounded.
 */
function currencyWarning(raw: string | null | undefined): string | null {
  const currency = (raw ?? "").trim().toUpperCase();
  if (currency === "" || USD_MARKERS.has(currency)) return null;
  if (ISO_CURRENCY_RE.test(currency)) {
    return `Receipt looks like ${currency}; amounts treated as USD for now`;
  }
  return "Receipt may not be in USD; amounts treated as USD for now";
}

/**
 * Parse an optional charge (tax/tip/fee). Missing or blank -> 0. Unparseable
 * or negative -> 0 plus a warning, so the host knows to check it.
 */
function parseCharge(value: string | null | undefined, label: string, warnings: string[]): number {
  if (value === null || value === undefined || value.trim() === "") return 0;
  const signed = tryParseSigned(value);
  if (signed === null) {
    warnings.push(`Couldn't read the ${label} amount; set to $0.00 — please check`);
    return 0;
  }
  if (signed.negative) {
    warnings.push(`The ${label} on the receipt looks negative; set to $0.00 — please check`);
    return 0;
  }
  return signed.cents;
}

function normalizeQuantity(
  quantity: number | null | undefined,
  name: string,
  warnings: string[],
): number {
  if (quantity === null || quantity === undefined) return 1;
  if (Number.isSafeInteger(quantity) && quantity > 0) return quantity;
  warnings.push(`Quantity for "${name}" looked wrong; set to 1 — please check`);
  return 1;
}

/**
 * Validate raw model output and convert it to integer cents.
 *
 * Throws ScanError("UNREADABLE") (with the ZodError as `cause`) if `raw`
 * doesn't match RawReceiptSchema. Everything else is best-effort: bad lines
 * are dropped or adjusted with a warning so the host can review and fix.
 */
export function normalizeReceipt(raw: unknown): ScanResult {
  const parsed = RawReceiptSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScanError("UNREADABLE", { cause: parsed.error });
  }
  const r = parsed.data;
  const warnings: string[] = [];

  const merchantText = cleanText(r.merchant ?? "");
  const merchant = merchantText === "" ? null : merchantText;

  const currencyNote = currencyWarning(r.currency);
  if (currencyNote !== null) warnings.push(currencyNote);

  const items: ScanItem[] = [];
  let discountCents = 0;
  let discountFromItems = false;

  for (const rawItem of r.items) {
    const name = cleanText(rawItem.name);
    if (name === "") continue;

    const signed = tryParseSigned(rawItem.totalPrice);
    if (signed === null) {
      warnings.push(`Couldn't read the price for "${name}"; it was left out — please add it`);
      continue;
    }

    if (signed.negative || DISCOUNT_NAME_RE.test(name)) {
      discountCents += signed.cents;
      discountFromItems = true;
      warnings.push(
        `"${name}" looks like a discount; ${formatCents(money(signed.cents))} moved to discount`,
      );
      continue;
    }

    items.push({
      name,
      quantity: normalizeQuantity(rawItem.quantity, name, warnings),
      priceCents: signed.cents,
    });
  }

  const taxCents = parseCharge(r.tax, "tax", warnings);
  const tipCents = parseCharge(r.tip, "tip", warnings);
  const feeCents = parseCharge(r.serviceFee, "service fee", warnings);

  // Receipts print discounts as either "5.00" or "-5.00"; both mean 5.00 off.
  if (r.discount !== null && r.discount !== undefined && r.discount.trim() !== "") {
    const signed = tryParseSigned(r.discount);
    if (signed === null) {
      warnings.push("Couldn't read the discount amount; set to $0.00 — please check");
    } else {
      discountCents += signed.cents;
      if (discountFromItems && signed.cents > 0) {
        warnings.push("Discount may be counted twice — please check");
      }
    }
  }

  let receiptTotalCents: number | null = null;
  if (r.total !== null && r.total !== undefined && r.total.trim() !== "") {
    const signed = tryParseSigned(r.total);
    if (signed === null) {
      warnings.push("Couldn't read the receipt total — please check");
    } else if (signed.negative) {
      warnings.push("The receipt total looks negative — please check");
    } else {
      receiptTotalCents = signed.cents;
    }
  }

  if (items.length === 0) warnings.push("No items found");

  const itemsCents = items.reduce((sum, item) => sum + item.priceCents, 0);

  // The split engine rejects a discount larger than the items subtotal, so
  // never hand one to the UI: cap it and let the host fix it.
  if (discountCents > itemsCents) {
    warnings.push(
      `Discount of ${formatCents(money(discountCents))} is more than the items (${formatCents(money(itemsCents))}); reduced to ${formatCents(money(itemsCents))} — please check`,
    );
    discountCents = itemsCents;
  }

  const computedCents = itemsCents + taxCents + tipCents + feeCents - discountCents;
  if (receiptTotalCents !== null && computedCents !== receiptTotalCents) {
    warnings.push(
      `Items and charges add up to ${formatCents(money(computedCents))} but the receipt total says ${formatCents(money(receiptTotalCents))} — please check`,
    );
  }

  return {
    merchant,
    currency: "USD",
    items,
    taxCents,
    tipCents,
    feeCents,
    discountCents,
    receiptTotalCents,
    warnings,
  };
}
