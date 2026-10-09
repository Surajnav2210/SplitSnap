// Parsing and formatting helpers for user-entered money and percentages.
// Pure functions only: no I/O, no floats. Strings are parsed digit-by-digit
// with regexes, and all arithmetic is on integers (BigInt where products can
// get large).

import { money, type Money } from "./money";

/** Largest amount a single input field accepts: $9,999,999.99. */
export const MAX_INPUT_CENTS = 999_999_999;

/** 100% expressed in hundredths of a percent. */
export const MAX_PERCENT_HUNDREDTHS = 10_000;

// Either plain digits ("1234") or correctly grouped thousands ("1,234"),
// optionally followed by 1–2 decimal digits. The integer part may be empty
// (".5"), but the whole string must contain at least one digit.
const DOLLARS_RE = /^\$?(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d+))?$/;

/** Convert a 0–2 digit fraction string to an integer: "" -> 0, "5" -> 50, "05" -> 5. */
function fractionToHundredths(fraction: string): number {
  return Number((fraction + "00").slice(0, 2));
}

/**
 * Parse a user-entered dollar amount into integer cents.
 * Accepts "12", "12.3", "12.34", "$12.34", " 1,234.50 ", ".5".
 * Throws RangeError (with a message safe to show the user) on anything else.
 */
export function parseDollars(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") throw new RangeError("Enter an amount.");
  if (trimmed.startsWith("-") || trimmed.startsWith("$-")) {
    throw new RangeError("Amount can't be negative.");
  }
  const match = DOLLARS_RE.exec(trimmed);
  if (!match) throw new RangeError("Enter an amount like 12.34.");

  const intPart = match[1].replace(/,/g, "");
  const fraction = match[2];
  if (fraction !== undefined && fraction.length === 0) {
    throw new RangeError("Enter an amount like 12.34.");
  }
  if (fraction !== undefined && fraction.length > 2) {
    throw new RangeError("Use at most 2 decimal places.");
  }
  if (intPart === "" && fraction === undefined) {
    throw new RangeError("Enter an amount like 12.34.");
  }
  // Reject before Number() so huge digit strings never become imprecise.
  const digits = intPart.replace(/^0+(?=\d)/, "");
  if (digits.length > 7) throw new RangeError("Amount is too large (max $9,999,999.99).");

  const cents = Number(digits === "" ? "0" : digits) * 100 + fractionToHundredths(fraction ?? "");
  if (cents > MAX_INPUT_CENTS) throw new RangeError("Amount is too large (max $9,999,999.99).");
  return cents;
}

const PERCENT_RE = /^(\d*)(?:\.(\d*))?%?$/;

/**
 * Parse a user-entered percentage into hundredths of a percent.
 * "18" -> 1800, "18.5" -> 1850, "18.25" -> 1825. Range 0–100%, max 2 decimals.
 */
export function parsePercent(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") throw new RangeError("Enter a percentage.");
  if (trimmed.startsWith("-")) throw new RangeError("Percentage can't be negative.");
  const match = PERCENT_RE.exec(trimmed);
  if (!match) throw new RangeError("Enter a percentage like 18 or 18.5.");

  const intPart = match[1];
  const fraction = match[2];
  if (intPart === "" && (fraction === undefined || fraction === "")) {
    throw new RangeError("Enter a percentage like 18 or 18.5.");
  }
  if (fraction !== undefined && fraction.length === 0) {
    throw new RangeError("Enter a percentage like 18 or 18.5.");
  }
  if (fraction !== undefined && fraction.length > 2) {
    throw new RangeError("Use at most 2 decimal places.");
  }
  const digits = intPart.replace(/^0+(?=\d)/, "");
  if (digits.length > 3) throw new RangeError("Percentage must be between 0 and 100.");

  const hundredths =
    Number(digits === "" ? "0" : digits) * 100 + fractionToHundredths(fraction ?? "");
  if (hundredths > MAX_PERCENT_HUNDREDTHS) {
    throw new RangeError("Percentage must be between 0 and 100.");
  }
  return hundredths;
}

/**
 * `percentHundredths` hundredths-of-a-percent of `amount`, rounded half-up to
 * the cent (18% = 1800). Uses BigInt so amount * percent can't lose precision.
 * Negative amounts round symmetrically (half away from zero).
 */
export function percentOf(amount: Money, percentHundredths: number): Money {
  if (!Number.isSafeInteger(percentHundredths) || percentHundredths < 0) {
    throw new RangeError(
      `percentHundredths must be a non-negative integer, got ${percentHundredths}`,
    );
  }
  const cents = money(amount.cents, amount.currency).cents;
  const negative = cents < 0;
  const product = BigInt(Math.abs(cents)) * BigInt(percentHundredths);
  const divisor = BigInt(MAX_PERCENT_HUNDREDTHS);
  let quotient = product / divisor;
  const remainder = product % divisor;
  if (remainder * BigInt(2) >= divisor) quotient += BigInt(1);
  const result = Number(quotient);
  return money(negative && result !== 0 ? -result : result, amount.currency);
}

/** Format integer cents as "$1,234.56" (negative: "-$1.00"). USD only for now. */
export function formatCents(m: Money): string {
  const cents = money(m.cents, m.currency).cents;
  const abs = Math.abs(cents);
  const centPart = abs % 100;
  const dollars = (abs - centPart) / 100; // exact: abs - centPart is a multiple of 100
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${grouped}.${String(centPart).padStart(2, "0")}`;
}

/** Format hundredths of a percent without the sign: 1800 -> "18", 1850 -> "18.5", 825 -> "8.25". */
export function formatPercent(percentHundredths: number): string {
  if (!Number.isSafeInteger(percentHundredths) || percentHundredths < 0) {
    throw new RangeError(
      `percentHundredths must be a non-negative integer, got ${percentHundredths}`,
    );
  }
  const fraction = percentHundredths % 100;
  const whole = (percentHundredths - fraction) / 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}
