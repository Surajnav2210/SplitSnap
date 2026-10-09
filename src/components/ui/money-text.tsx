import { money } from "@/core/money";
import { formatCents } from "@/core/parse";
import { cn } from "@/lib/utils";

/**
 * Integer cents rendered as "$1,234.56" with tabular figures.
 * `smallCents` renders the ".56" smaller and raised, for big totals; screen
 * readers still get the plain string.
 */
export function MoneyText({
  cents,
  className,
  smallCents = false,
  mono = false,
}: {
  cents: number;
  className?: string;
  smallCents?: boolean;
  /** Geist Mono, for receipt lines and money columns. */
  mono?: boolean;
}) {
  const text = formatCents(money(cents));
  const base = cn("tabular-nums", mono && "font-mono", className);
  if (!smallCents) return <span className={base}>{text}</span>;

  const dot = text.lastIndexOf(".");
  const whole = dot === -1 ? text : text.slice(0, dot);
  const frac = dot === -1 ? "" : text.slice(dot);
  return (
    <span className={cn(base, "inline-flex items-start")}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{whole}</span>
      <span aria-hidden="true" className="ml-[0.04em] mt-[0.12em] text-[0.5em] leading-none font-[inherit] opacity-60">
        {frac}
      </span>
    </span>
  );
}
