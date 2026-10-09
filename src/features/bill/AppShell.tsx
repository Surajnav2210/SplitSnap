import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

export const STEPS = ["Receipt", "People", "Claim", "Settle"] as const;

/** Four thin segments: done = ink, current = accent, upcoming = hairline. Done steps are tappable. */
function StepProgress({
  current,
  canGoTo,
  onSelect,
}: {
  current: number;
  canGoTo: (index: number) => boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Progress">
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((label, i) => {
          const active = i === current;
          const enabled = canGoTo(i) && !active;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!enabled}
                aria-current={active ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}`}
                onClick={() => onSelect(i)}
                className="group flex h-6 w-full cursor-pointer items-center rounded-sm disabled:cursor-default"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-[3px] w-full rounded-full transition-colors duration-200",
                    active ? "bg-accent" : i < current ? "bg-foreground" : "bg-border",
                    enabled && "group-hover:bg-foreground/60",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Compact header for the /split flow: back or home, step label, start over, progress. */
export function AppHeader({
  step,
  canGoTo,
  onStep,
  onReset,
  showReset,
}: {
  step: number;
  canGoTo: (i: number) => boolean;
  onStep: (i: number) => void;
  onReset: () => void;
  showReset: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto w-full max-w-xl px-4">
        <div className="flex h-14 items-center gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => onStep(step - 1)}
              aria-label={`Back to ${STEPS[step - 1]}`}
              className="-ml-2.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : (
            <Link href="/" aria-label="SplitSnap home" className="-ml-1 inline-flex h-11 items-center rounded-md px-1">
              <LogoMark />
            </Link>
          )}
          <p className="flex-1 text-center text-[13px] font-medium text-muted-foreground">
            <span className="tabular-nums">Step {step + 1} of 4</span>
            <span aria-hidden="true"> · </span>
            <span className="text-foreground">{STEPS[step]}</span>
          </p>
          {showReset ? (
            <button
              type="button"
              onClick={onReset}
              aria-label="Start over"
              className="-mr-2.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          ) : (
            <span aria-hidden="true" className="-mr-2.5 size-11" />
          )}
        </div>
        <div className="pb-2">
          <StepProgress current={step} canGoTo={canGoTo} onSelect={onStep} />
        </div>
      </div>
    </header>
  );
}

/** Sticky action bar pinned to the bottom of the viewport (safe-area aware). */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_24px_-20px_rgb(12_10_9/0.18)]">
      <div className="mx-auto flex w-full max-w-xl items-center gap-4 px-4">{children}</div>
    </div>
  );
}

export function BarStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1" aria-live="polite">
      <p className="truncate text-[13px] text-muted-foreground">{label}</p>
      <p className="truncate text-xl font-semibold tracking-[-0.02em] text-foreground">{children}</p>
    </div>
  );
}

/** Step title + one-line subtitle. */
export function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[34px]">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}
