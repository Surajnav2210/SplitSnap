import { cn } from "@/lib/utils";

/** Brand mark: a receipt split down the middle, ink on paper (inverts in dark mode). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-6 items-center justify-center rounded-[7px] bg-foreground text-background", className)}
    >
      <svg viewBox="0 0 24 24" className="size-[70%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 3.5h11v17l-1.84-1.2-1.83 1.2L12 19.3l-1.83 1.2-1.83-1.2-1.84 1.2z" />
        <path d="M12 7v9" />
      </svg>
    </span>
  );
}

/** Wordmark: mark + "SplitSnap", tight tracking. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[16px] font-semibold tracking-[-0.03em] text-foreground", className)}>
      <LogoMark />
      SplitSnap
    </span>
  );
}
