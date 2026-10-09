// Payment deep links. Pure functions only: no I/O, no floats.
// SplitSnap never moves money: these URLs only open Venmo / PayPal.me /
// Cash App with an amount pre-filled; the payer confirms inside that app.
//
// URL formats (verified 2026-10; they change occasionally, see SPEC.md §11):
// - Venmo:    https://venmo.com/{username}?txn=pay&amount=12.34&note={urlencoded}
// - PayPal:   https://paypal.me/{handle}/12.34USD
// - Cash App: https://cash.app/${cashtag}/12.34

import { money, type Money } from "./money";

export type PaymentApp = "venmo" | "paypal" | "cashapp";

export interface PaymentHandles {
  venmo?: string;
  paypal?: string;
  cashapp?: string;
}

export interface PaymentLink {
  app: PaymentApp;
  label: string;
  url: string;
}

/** Order the buttons appear in, and their labels. */
export const PAYMENT_APPS: readonly { app: PaymentApp; label: string }[] = [
  { app: "venmo", label: "Venmo" },
  { app: "paypal", label: "PayPal" },
  { app: "cashapp", label: "Cash App" },
];

const MAX_HANDLE_LENGTH = 64;
const HANDLE_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Normalize what a host typed into a bare handle: trims whitespace and strips
 * the app's own prefix ("@alex" for Venmo, "$alex" for Cash App,
 * "paypal.me/alex" for PayPal). Returns null if the result is empty or contains
 * anything other than letters, digits, "-", "_" or ".".
 */
export function normalizeHandle(app: PaymentApp, raw: string): string | null {
  let handle = raw.trim();
  if (app === "venmo") handle = handle.replace(/^@/, "");
  if (app === "cashapp") handle = handle.replace(/^\$/, "");
  if (app === "paypal") handle = handle.replace(/^(?:https?:\/\/)?(?:www\.)?paypal\.me\//i, "");
  if (handle === "" || handle.length > MAX_HANDLE_LENGTH) return null;
  return HANDLE_RE.test(handle) ? handle : null;
}

/** Cents as a plain decimal string for URLs: 1234 -> "12.34", 5 -> "0.05". Integer math only. */
export function formatAmountForUrl(amount: Money): string {
  const cents = money(amount.cents, amount.currency).cents;
  if (cents < 0) throw new RangeError("Payment amounts can't be negative.");
  const centPart = cents % 100;
  const dollars = (cents - centPart) / 100;
  return `${dollars}.${String(centPart).padStart(2, "0")}`;
}

function buildUrl(app: PaymentApp, handle: string, amount: string, note: string): string {
  switch (app) {
    case "venmo":
      return `https://venmo.com/${handle}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`;
    case "paypal":
      return `https://paypal.me/${handle}/${amount}USD`;
    case "cashapp":
      return `https://cash.app/$${handle}/${amount}`;
  }
}

/**
 * Build pay buttons for the handles the host provided. Invalid handles are
 * skipped; a zero (or negative) amount yields no links. USD only.
 */
export function buildPaymentLinks(
  handles: PaymentHandles,
  amount: Money,
  note: string,
): PaymentLink[] {
  if (amount.currency !== "USD") throw new Error(`Unsupported currency: ${amount.currency}`);
  if (amount.cents <= 0) return [];
  const value = formatAmountForUrl(amount);
  const links: PaymentLink[] = [];
  for (const { app, label } of PAYMENT_APPS) {
    const raw = handles[app];
    if (raw === undefined) continue;
    const handle = normalizeHandle(app, raw);
    if (handle === null) continue;
    links.push({ app, label, url: buildUrl(app, handle, value, note) });
  }
  return links;
}
