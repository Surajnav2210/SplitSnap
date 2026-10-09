"use client";

// The real Claim screen, rendered with sample data inside a phone frame.
// Non-interactive (inert) and described for screen readers by its label.

import { ArrowRight } from "lucide-react";
import { money } from "@/core/money";
import { formatCents } from "@/core/parse";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { ClaimStep } from "@/features/bill/claim/ClaimStep";
import { cn } from "@/lib/utils";
import { SAMPLE_RESULT, SAMPLE_STATE, samplePerson } from "./sampleBill";

const noop = () => undefined;

export function ProductShot({ className }: { className?: string }) {
  const sam = samplePerson("Sam");
  return (
    <div
      role="img"
      aria-label={`SplitSnap's claim screen: Sam taps the items they had at Corner Bistro, each item shows who is sharing it, and Sam's total of ${formatCents(money(sam.totalCents))} updates live.`}
      className={cn("relative mx-auto w-full max-w-[340px]", className)}
    >
      <div className="rounded-[46px] border border-border bg-card p-[7px] shadow-[0_1px_2px_rgb(12_10_9/0.06),0_32px_64px_-32px_rgb(12_10_9/0.28)] dark:shadow-none">
        <div inert className="relative h-[660px] overflow-hidden rounded-[39px] border border-border bg-background">
          <div className="flex h-11 items-center justify-between px-7 text-[13px] font-semibold text-foreground">
            <span className="tabular-nums">9:41</span>
            <span aria-hidden="true" className="absolute left-1/2 top-2.5 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-4 rounded-[3px] border border-foreground/70" />
            </span>
          </div>
          <div className="px-4">
            <div className="grid grid-cols-4 gap-1.5 py-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("h-[3px] rounded-full", i < 2 ? "bg-foreground" : i === 2 ? "bg-accent" : "bg-border")} />
              ))}
            </div>
            <p className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-foreground">Tap what you had</p>
            <div className="mt-3 [&_ul]:text-[14px]">
              <ClaimStep
                state={SAMPLE_STATE}
                result={SAMPLE_RESULT}
                activeId={sam.id}
                onActiveChange={noop}
                dispatch={noop}
                stickyClassName=""
              />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-border bg-background px-4 pb-6 pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted-foreground">Sam&apos;s total</p>
              <MoneyText cents={sam.totalCents} mono className="text-lg font-semibold tracking-[-0.02em] text-foreground" />
            </div>
            <Button size="default" tabIndex={-1}>
              Settle up <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
