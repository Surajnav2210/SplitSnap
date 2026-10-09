import Image from "next/image";
import type { Dispatch } from "react";
import { Icon } from "@/components/ui/Icon";
import { reconcile, type BillAction, type BillState } from "../state";
import { inputClass } from "../fields";
import { AdjustmentsEditor } from "./AdjustmentsEditor";
import { ReceiptPaper } from "./ReceiptPaper";
import { ReceiptStart } from "./ReceiptStart";
import { ReconcileChip, WarningNotes } from "./ReconcileChip";
import { ScanSkeleton } from "./ScanSkeleton";
import type { ReceiptScan } from "./useReceiptScan";

export function ReceiptStep({
  state,
  dispatch,
  scan,
  tipCents,
  billTotalCents,
  splitError,
}: {
  state: BillState;
  dispatch: Dispatch<BillAction>;
  scan: ReceiptScan;
  tipCents: number;
  billTotalCents: number | null;
  splitError: string | null;
}) {
  if (scan.phase.kind === "scanning") {
    return <ScanSkeleton thumbnail={scan.phase.thumbnail} onCancel={scan.cancel} />;
  }

  if (state.source === null) {
    return (
      <ReceiptStart
        phase={scan.phase}
        onFile={scan.scan}
        onManual={() => {
          scan.dismissError();
          dispatch({ type: "start", source: "manual" });
        }}
        onSample={() => {
          scan.dismissError();
          scan.clearThumbnail();
          dispatch({ type: "loadSample" });
        }}
        onDismissError={scan.dismissError}
      />
    );
  }

  const thumbnail = state.source === "scan" ? scan.thumbnail : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-3 shadow-card">
        <span className="relative flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sunken text-muted">
          {thumbnail ? (
            <Image unoptimized src={thumbnail} alt="Your receipt photo" width={44} height={56} className="h-full w-full object-cover" />
          ) : (
            <Icon name="receipt" className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="merchant" className="text-xs font-medium text-muted">
            {state.source === "scan" ? "Scanned from" : "Restaurant"}
          </label>
          <input
            key={state.session}
            id="merchant"
            defaultValue={state.merchant ?? ""}
            placeholder="Where did you eat?"
            maxLength={40}
            autoComplete="off"
            onChange={(e) => dispatch({ type: "setMerchant", name: e.target.value })}
            className={`${inputClass} mt-0.5 border-transparent! bg-transparent! px-0! py-0.5! text-base font-semibold`}
          />
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand hover:bg-brand-soft focus-within:outline-2 focus-within:outline-brand">
          <Icon name="camera" className="h-4 w-4" />
          Rescan
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) scan.scan(file);
            }}
          />
        </label>
      </div>

      {scan.phase.kind === "error" ? (
        <p role="alert" className="rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-fg">
          {scan.phase.message}
        </p>
      ) : null}
      <WarningNotes warnings={state.warnings} onDismiss={(id) => dispatch({ type: "dismissWarning", id })} />
      <ReconcileChip reconciliation={reconcile(state)} />

      <ReceiptPaper
        key={`paper-${state.session}`}
        state={state}
        tipCents={tipCents}
        billTotalCents={billTotalCents}
        dispatch={dispatch}
        startAdding={state.source === "manual" && state.items.length === 0}
      />

      {splitError ? (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {splitError}
        </p>
      ) : null}

      <AdjustmentsEditor
        key={`adj-${state.session}`}
        taxCents={state.taxCents}
        tip={state.tip}
        tipCents={tipCents}
        feeCents={state.feeCents}
        discountCents={state.discountCents}
        dispatch={dispatch}
      />
    </div>
  );
}
