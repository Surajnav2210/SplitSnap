import { Check, X } from "lucide-react";
import { formatCents } from "@/core/parse";
import type { Reconciliation } from "../state";

/** One quiet line: green check when our numbers match the printed total, amber dot with the gap when they don't. */
export function ReconcileChip({ reconciliation }: { reconciliation: Reconciliation }) {
  if (reconciliation.status === "unknown") return null;
  if (reconciliation.status === "match") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-foreground">
        <span className="flex size-5 items-center justify-center rounded-full bg-success/12 text-success-foreground">
          <Check aria-hidden="true" className="size-3" strokeWidth={3} />
        </span>
        <span>
          Matches the receipt total of <span className="font-mono tabular-nums">{formatCents(reconciliation.receiptTotal)}</span>
          {reconciliation.addedTip.cents > 0 ? (
            <span className="text-muted-foreground"> · plus <span className="font-mono tabular-nums">{formatCents(reconciliation.addedTip)}</span> tip</span>
          ) : null}
        </span>
      </p>
    );
  }
  const gap = formatCents({ ...reconciliation.difference, cents: Math.abs(reconciliation.difference.cents) });
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
      <p>
        <span className="font-medium text-foreground">
          Items add up to <span className="font-mono tabular-nums">{formatCents(reconciliation.computed)}</span>, receipt says{" "}
          <span className="font-mono tabular-nums">{formatCents(reconciliation.receiptTotal)}</span>
        </span>
        <span className="block text-muted-foreground">
          {reconciliation.difference.cents > 0 ? "Over" : "Under"} by {gap}. Tap a line to fix it, or continue if you&apos;re sure.
        </span>
      </p>
    </div>
  );
}

export function WarningNotes({
  warnings,
  onDismiss,
}: {
  warnings: readonly { id: string; text: string }[];
  onDismiss: (id: string) => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card" aria-label="Scan notes">
      {warnings.map((w) => (
        <li key={w.id} className="flex items-start gap-3 py-1 pl-4 pr-1 text-sm text-foreground">
          <span aria-hidden="true" className="mt-[1.05rem] size-2 shrink-0 rounded-full bg-warning" />
          <p className="flex-1 py-2.5">{w.text}</p>
          <button
            type="button"
            aria-label="Dismiss note"
            onClick={() => onDismiss(w.id)}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
