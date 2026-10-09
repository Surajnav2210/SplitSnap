import { money } from "@/core/money";
import { formatCents } from "@/core/parse";
import { cx } from "./cx";

/** Integer cents rendered as "$1,234.56" with tabular figures. */
export function MoneyText({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx("tabular-nums", className)}>{formatCents(money(cents))}</span>;
}
