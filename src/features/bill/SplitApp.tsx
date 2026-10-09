"use client";

// Client entry for /split. All bill state lives in memory in billReducer;
// only the receipt photo leaves the device (to the scan endpoint).

import { useCallback, useMemo, useReducer, useState } from "react";
import type { ScanResult } from "@/core/receipt";
import { buildSummary } from "@/core/summary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { MoneyText } from "@/components/ui/MoneyText";
import { AppHeader, BarStat, BottomBar } from "./AppShell";
import { ClaimStep } from "./claim/ClaimStep";
import { PeopleStep } from "./people/PeopleStep";
import { ReceiptStep } from "./receipt/ReceiptStep";
import { useReceiptScan } from "./receipt/useReceiptScan";
import { SettleStep } from "./settle/SettleStep";
import { useShareSummary } from "./settle/useShareSummary";
import { billReducer, hostOf, hostWords, initialBillState, selectBillSplit } from "./state";

const TITLES = ["Add your receipt", "Who’s at the table?", "Tap what you had", "Who owes"];
const REVIEW_SUBTITLE = "Tap any line to fix it. Lines like “3× beer” can be split so people claim one each.";
const SUBTITLES = [
  "Scan it and we’ll find every item. You can fix anything after.",
  "Add everyone splitting the bill. No accounts needed.",
  "Pick a person, then tap everything they had. Shared plates split evenly.",
  "Tax, tip and fees are split in proportion to what each person ordered.",
];

export function SplitApp() {
  const [state, dispatch] = useReducer(billReducer, initialBillState);
  const [step, setStep] = useState(0);
  const [activeId, setActiveId] = useState(initialBillState.hostId);
  const outcome = useMemo(() => selectBillSplit(state), [state]);
  const onReceipt = useCallback((receipt: ScanResult) => dispatch({ type: "loadScan", receipt }), []);
  const scan = useReceiptScan(onReceipt);
  const sharer = useShareSummary();

  const result = outcome.ok ? outcome.result : null;
  const host = hostOf(state);
  const hasReceipt = state.items.length > 0 && result !== null;
  const hasPeople = state.people.length >= 2;
  const canGoTo = (i: number) => i === 0 || (i === 1 && hasReceipt) || (i >= 2 && hasReceipt && hasPeople);

  function goTo(i: number) {
    if (!canGoTo(i)) return;
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
    setStep(0);
  }

  const active = state.people.find((p) => p.id === activeId) ?? host;
  const activeTotal = result?.participants.find((p) => p.participantId === active.id)?.total.cents ?? 0;
  const scanning = scan.phase.kind === "scanning";
  const title = step === 3 ? `Who owes ${hostWords(host.name).object}` : step === 0 && state.source !== null ? "Check the items" : TITLES[step];

  let bar = null;
  if (step === 0 && state.source !== null && !scanning) {
    bar = (
      <>
        <BarStat label={`${state.items.length} ${state.items.length === 1 ? "item" : "items"}`}>
          {result ? <MoneyText cents={result.billTotal.cents} /> : "—"}
        </BarStat>
        <Button size="lg" disabled={!canGoTo(1)} onClick={() => goTo(1)}>
          Next: People <Icon name="arrowRight" className="h-4 w-4" />
        </Button>
      </>
    );
  } else if (step === 1) {
    bar = (
      <>
        <BarStat label="At the table">{state.people.length} people</BarStat>
        <Button size="lg" disabled={!canGoTo(2)} onClick={() => goTo(2)}>
          {hasPeople ? "Next: Claim" : "Add a friend"} {hasPeople ? <Icon name="arrowRight" className="h-4 w-4" /> : null}
        </Button>
      </>
    );
  } else if (step === 2) {
    bar = (
      <>
        <BarStat label={`${active.name}’s total`}>
          <MoneyText cents={activeTotal} />
        </BarStat>
        <Button size="lg" onClick={() => goTo(3)}>
          Settle up <Icon name="arrowRight" className="h-4 w-4" />
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
      <Button size="lg" className="w-full" onClick={() => void sharer.share(text)}>
        <Icon name="share" /> {sharer.status.kind === "copied" ? "Copied — paste in your group chat" : "Share summary"}
      </Button>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader step={step} canGoTo={canGoTo} onStep={goTo} onReset={startOver} showReset={state.source !== null} />
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-36 pt-5">
        <div key={step} className="animate-step-in">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-fg">{title}</h1>
          <p className="mb-5 mt-1.5 text-[15px] text-muted">{step === 0 && state.source !== null ? REVIEW_SUBTITLE : SUBTITLES[step]}</p>
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
          {step === 3 && result ? <SettleStep state={state} result={result} dispatch={dispatch} /> : null}

          {step === 3 && sharer.status.kind === "manual" ? (
            <div className="mt-4">
              <label htmlFor="summary-text" className="mb-1.5 block text-sm font-medium text-fg">
                Copy this into your group chat
              </label>
              <textarea
                id="summary-text"
                readOnly
                rows={8}
                value={sharer.status.text}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-2xl border border-line bg-elevated p-3 font-mono text-xs text-fg"
              />
            </div>
          ) : null}
        </div>
      </main>
      {bar ? <BottomBar>{bar}</BottomBar> : null}
    </div>
  );
}
