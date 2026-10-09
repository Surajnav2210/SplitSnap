// Share-summary text for the group chat. Pure and deterministic: the same
// split, names and handles always produce the same text.

import { formatCents } from "./parse";
import { buildPaymentLinks, type PaymentHandles } from "./paymentLinks";
import type { SplitResult } from "./split";

export interface SummaryInput {
  /** Restaurant name; null/blank falls back to "Our bill". */
  merchant: string | null;
  result: SplitResult;
  /** The person who paid. Their share is not owed to anyone. */
  hostId: string;
  names: Readonly<Record<string, string>>;
  handles: PaymentHandles;
}

/** Note attached to payment requests, e.g. "SplitSnap: Corner Bistro". */
export function paymentNote(merchant: string | null): string {
  const name = merchant?.trim();
  return name ? `SplitSnap: ${name}` : "SplitSnap";
}

/** Strip characters that would break the one-line-per-person layout. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Build the text people paste into their group chat, e.g.
 *   🧾 Corner Bistro — $139.50
 *   Alex paid
 *   Sam owes $34.20 · Venmo https://venmo.com/alex?...
 */
export function buildSummary(input: SummaryInput): string {
  const { result, hostId, names, handles } = input;
  const title = oneLine(input.merchant ?? "") || "Our bill";
  const nameOf = (id: string) => oneLine(names[id] ?? "") || "Someone";
  const note = paymentNote(input.merchant);

  const lines = [`🧾 ${title} — ${formatCents(result.billTotal)}`];
  const host = result.participants.find((p) => p.participantId === hostId);
  if (host) lines.push(`${nameOf(hostId)} paid`);

  for (const share of result.participants) {
    if (share.participantId === hostId) continue;
    const name = nameOf(share.participantId);
    if (share.total.cents <= 0) {
      lines.push(`${name} owes nothing`);
      continue;
    }
    const links = buildPaymentLinks(handles, share.total, note);
    const pay = links.map((l) => ` · ${l.label} ${l.url}`).join("");
    lines.push(`${name} owes ${formatCents(share.total)}${pay}`);
  }

  if (!result.isFullyClaimed) {
    lines.push(`Unclaimed: ${formatCents(result.unassigned.total)}`);
  }
  lines.push("", "Split with SplitSnap. It never holds or moves your money.");
  return lines.join("\n");
}
