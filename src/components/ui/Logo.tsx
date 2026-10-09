import { cx } from "./cx";

/** Brand mark: a receipt with a split line. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-flex items-center justify-center rounded-[10px] bg-brand text-brand-fg", className)}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" />
        <path d="M9 9h6M9 13h6" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-[17px] font-bold tracking-tight text-fg", className)}>
      <LogoMark />
      SplitSnap
    </span>
  );
}
