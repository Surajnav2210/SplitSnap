// Reminder text a host sends to one guest who hasn't paid yet. Pure and
// deterministic. Nothing here sends anything: the app hands the text to the
// share sheet (or clipboard) and the host decides whether to send it.

import type { Money } from "./money";
import { formatCents } from "./parse";
import { buildPaymentLinks, type PaymentHandles } from "./paymentLinks";
import { paymentNote } from "./summary";

export interface ReminderInput {
  guestName: string;
  amount: Money;
  /** Restaurant name; null/blank falls back to "dinner". */
  merchant: string | null;
  /** Host's handles snapshotted onto the bill at lock. */
  handles: PaymentHandles;
  /** Link back to the shared bill. */
  billUrl: string;
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * e.g.
 *   Hi Sam, you owe me $34.20 for Corner Bistro. Pay here: https://venmo.com/alex?...
 *   https://splitsnap.app/b/abcdefghjk
 * The pay link is the first valid one (Venmo, then PayPal, then Cash App);
 * with no usable handle (or nothing owed) the "Pay here" part is left out.
 */
export function reminderText(input: ReminderInput): string {
  const name = oneLine(input.guestName) || "there";
  const what = oneLine(input.merchant ?? "") || "dinner";
  const [link] = buildPaymentLinks(input.handles, input.amount, paymentNote(input.merchant));
  const pay = link ? ` Pay here: ${link.url}` : "";
  return `Hi ${name}, you owe me ${formatCents(input.amount)} for ${what}.${pay}\n${input.billUrl}`;
}
