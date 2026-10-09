import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { LogoMark } from "@/components/ui/Logo";
import { Stepper } from "@/components/ui/Stepper";

export const STEPS = ["Receipt", "People", "Claim", "Settle"] as const;

/** Compact header for the /split flow: back, brand, start over, progress. */
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
    <header className="mx-auto w-full max-w-xl px-4 pt-3">
      <div className="flex h-12 items-center gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => onStep(step - 1)}
            aria-label={`Back to ${STEPS[step - 1]}`}
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-fg hover:bg-sunken"
          >
            <Icon name="chevronLeft" />
          </button>
        ) : (
          <Link href="/" aria-label="SplitSnap home" className="-ml-1 inline-flex h-11 items-center gap-2 rounded-xl pr-2 font-bold tracking-tight text-fg">
            <LogoMark className="h-7 w-7" />
            <span>SplitSnap</span>
          </Link>
        )}
        <span className="flex-1" />
        {showReset ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-sunken hover:text-fg"
          >
            <Icon name="refresh" className="h-4 w-4" />
            Start over
          </button>
        ) : null}
      </div>
      <div className="mt-1">
        <Stepper steps={STEPS} current={step} canGoTo={canGoTo} onSelect={onStep} />
      </div>
    </header>
  );
}

/** Sticky action bar pinned to the bottom of the viewport (safe-area aware). */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4">{children}</div>
    </div>
  );
}

export function BarStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1" aria-live="polite">
      <p className="truncate text-xs font-medium text-muted">{label}</p>
      <p className="truncate text-xl font-bold tracking-tight text-fg">{children}</p>
    </div>
  );
}
