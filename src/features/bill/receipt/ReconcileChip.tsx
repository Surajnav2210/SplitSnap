import { formatCents } from "@/core/parse";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { Reconciliation } from "../state";

/** Green when our numbers match the printed total, amber with the gap when they don't. */
export function ReconcileChip({ reconciliation }: { reconciliation: Reconciliation }) {
  if (reconciliation.status === "unknown") return null;
  const match = reconciliation.status === "match";
  return (
    <div
      role="status"
      className={cx(
        "flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm",
        match ? "border-brand/30 bg-brand-soft text-brand-soft-fg" : "border-warning-line bg-warning-soft text-fg",
      )}
    >
      <Icon name={match ? "check" : "alert"} className={cx("mt-0.5 h-4 w-4 shrink-0", match ? "" : "text-warning")} />
      {reconciliation.status === "match" ? (
        <p>
          <span className="font-semibold">Matches receipt total {formatCents(reconciliation.receiptTotal)}</span>
          {reconciliation.addedTip.cents > 0 ? (
            <span className="opacity-80"> · plus {formatCents(reconciliation.addedTip)} tip you added</span>
          ) : null}
        </p>
      ) : (
        <p>
          <span className="font-semibold">
            Receipt says {formatCents(reconciliation.receiptTotal)}; items add up to{" "}
            {formatCents(reconciliation.computed)}
          </span>
          <span className="text-muted">
            {" "}
            ({reconciliation.difference.cents > 0 ? "over" : "under"} by{" "}
            {formatCents({ ...reconciliation.difference, cents: Math.abs(reconciliation.difference.cents) })}).
            Tap an item to fix it, or continue if you&apos;re sure.
          </span>
        </p>
      )}
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
    <ul className="space-y-2" aria-label="Scan notes">
      {warnings.map((w) => (
        <li key={w.id} className="flex items-start gap-2 rounded-2xl border border-warning-line bg-warning-soft py-1 pl-4 pr-1 text-sm text-fg">
          <Icon name="alert" className="mt-2.5 h-4 w-4 shrink-0 text-warning" />
          <p className="flex-1 py-2">{w.text}</p>
          <button
            type="button"
            aria-label="Dismiss note"
            onClick={() => onDismiss(w.id)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-fg"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
