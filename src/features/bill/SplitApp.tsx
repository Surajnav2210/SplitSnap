"use client";

// Client entry for /split. All bill state lives in memory in billReducer;
// only the receipt photo leaves the device (to the scan endpoint).

import { useCallback, useMemo, useReducer, useState } from "react";
import { ArrowRight, Share } from "lucide-react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import type { ScanResult } from "@/core/receipt";
import { buildSummary } from "@/core/summary";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader, BarStat, BottomBar, StepTitle } from "./AppShell";
import { ClaimStep } from "./claim/ClaimStep";
import { PeopleStep } from "./people/PeopleStep";
import { ReceiptStep } from "./receipt/ReceiptStep";
import { useReceiptScan } from "./receipt/useReceiptScan";
import { SettleStep } from "./settle/SettleStep";
import { celebrate } from "./settle/celebrate";
import { useShareSummary } from "./settle/useShareSummary";
import { billReducer, hostOf, hostWords, initialBillState, selectBillSplit } from "./state";

const TITLES = ["Add the receipt", "Who’s at the table?", "Tap what you had", "Who owes"];
const REVIEW_SUBTITLE = "Tap a line to fix it. Lines like “3× beer” can be split so people claim one each.";
const SUBTITLES = [
  "Scan it and we’ll pull out every item. You can fix anything after.",
  "Add everyone who’s splitting. Nobody needs an account.",
  "Pick a person, then tap what they had. Shared plates split evenly.",
  "Tax, tip and fees are split in proportion to what each person ordered.",
];

export function SplitApp() {
  const [state, dispatch] = useReducer(billReducer, initialBillState);
  const [step, setStep] = useState(0);
  // 0 until the first step change, so the server-rendered first step isn't hidden.
  const [direction, setDirection] = useState(0);
  const [activeId, setActiveId] = useState(initialBillState.hostId);
  const outcome = useMemo(() => selectBillSplit(state), [state]);
  const onReceipt = useCallback((receipt: ScanResult) => dispatch({ type: "loadScan", receipt }), []);
  const scan = useReceiptScan(onReceipt);
  const sharer = useShareSummary();
  const reduceMotion = useReducedMotion();

  const result = outcome.ok ? outcome.result : null;
  const host = hostOf(state);
  const hasReceipt = state.items.length > 0 && result !== null;
  const hasPeople = state.people.length >= 2;
  const canGoTo = (i: number) => i === 0 || (i === 1 && hasReceipt) || (i >= 2 && hasReceipt && hasPeople);

  function goTo(i: number) {
    if (!canGoTo(i)) return;
    setDirection(i >= step ? 1 : -1);
    setStep(i);
    sharer.reset();
    window.scrollTo({ top: 0 });
  }

  function startOver() {
    if (!window.confirm("Start a new bill? This clears the items and people.")) return;
    scan.cancel();
    scan.clearThumbnail();
    dispatch({ type: "reset" });
    setActiveId(initialBillState.hostId);
    setDirection(-1);
    setStep(0);
  }

  async function shareSummary(text: string) {
    const how = await sharer.share(text);
    if (how === "copied") toast("Copied. Paste it in your group chat.");
    if (how === "shared" || how === "copied") void celebrate();
  }

  const active = state.people.find((p) => p.id === activeId) ?? host;
  const activeTotal = result?.participants.find((p) => p.participantId === active.id)?.total.cents ?? 0;
  const scanning = scan.phase.kind === "scanning";
  const reviewing = step === 0 && state.source !== null;
  const title = step === 3 ? `Who owes ${hostWords(host.name).object}` : reviewing ? "Check the items" : TITLES[step];
  const sent = sharer.status.kind === "shared" || sharer.status.kind === "copied";

  let bar = null;
  if (reviewing && !scanning) {
    bar = (
      <>
        <BarStat label={`Total · ${state.items.length} ${state.items.length === 1 ? "item" : "items"}`}>
          {result ? <MoneyText cents={result.billTotal.cents} mono /> : "—"}
        </BarStat>
        <Button size="lg" disabled={!canGoTo(1)} onClick={() => goTo(1)}>
          Continue <ArrowRight aria-hidden="true" />
        </Button>
      </>
    );
  } else if (step === 1) {
    bar = (
      <>
        <BarStat label="At the table">
          <span className="tabular-nums">{state.people.length}</span> {state.people.length === 1 ? "person" : "people"}
        </BarStat>
        <Button size="lg" disabled={!canGoTo(2)} onClick={() => goTo(2)}>
          {hasPeople ? "Continue" : "Add a friend"} {hasPeople ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </>
    );
  } else if (step === 2) {
    bar = (
      <>
        <BarStat label={`${active.name}’s total`}>
          <MoneyText cents={activeTotal} mono />
        </BarStat>
        <Button size="lg" onClick={() => goTo(3)}>
          Settle up <ArrowRight aria-hidden="true" />
        </Button>
      </>
    );
  } else if (step === 3 && result) {
    const text = buildSummary({
      merchant: state.merchant,
      result,
      hostId: state.hostId,
      names: Object.fromEntries(state.people.map((p) => [p.id, p.name])),
      handles: state.handles,
    });
    bar = (
      <Button size="lg" className="w-full" onClick={() => void shareSummary(text)}>
        <Share aria-hidden="true" /> Share summary
      </Button>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col">
        <AppHeader step={step} canGoTo={canGoTo} onStep={goTo} onReset={startOver} showReset={state.source !== null} />
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-36 pt-7">
          <motion.div
            key={step}
            initial={reduceMotion || direction === 0 ? false : { opacity: 0, x: 16 * direction }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <StepTitle title={title} subtitle={reviewing ? REVIEW_SUBTITLE : SUBTITLES[step]} />
            <p className="sr-only" aria-live="polite">
              {sharer.status.kind === "copied" ? "Summary copied to the clipboard." : ""}
            </p>

            {step === 0 ? (
              <ReceiptStep
                state={state}
                dispatch={dispatch}
                scan={scan}
                tipCents={outcome.ok ? outcome.tipCents : 0}
                billTotalCents={result ? result.billTotal.cents : null}
                splitError={outcome.ok ? null : outcome.error}
              />
            ) : null}
            {step === 1 ? <PeopleStep state={state} dispatch={dispatch} /> : null}
            {step === 2 ? (
              <ClaimStep state={state} result={result} activeId={active.id} onActiveChange={setActiveId} dispatch={dispatch} />
            ) : null}
            {step === 3 && result ? <SettleStep state={state} result={result} dispatch={dispatch} sent={sent} /> : null}

            {step === 3 && sharer.status.kind === "manual" ? (
              <div className="mt-6">
                <label htmlFor="summary-text" className="mb-1.5 block text-[13px] font-medium text-foreground">
                  Copy this into your group chat
                </label>
                <textarea
                  id="summary-text"
                  readOnly
                  rows={8}
                  value={sharer.status.text}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-xl border border-border bg-card p-3.5 font-mono text-xs text-foreground"
                />
              </div>
            ) : null}
          </motion.div>
        </main>
        {bar ? <BottomBar>{bar}</BottomBar> : null}
        <Toaster position="bottom-center" offset={{ bottom: 96 }} mobileOffset={{ bottom: 96 }} />
      </div>
    </MotionConfig>
  );
}
