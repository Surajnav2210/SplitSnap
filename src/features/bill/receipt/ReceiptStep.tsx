import Image from "next/image";
import type { Dispatch } from "react";
import { Camera, CircleAlert, ReceiptText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reconcile, type BillAction, type BillState } from "../state";
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
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 pr-2">
        <span className="relative flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
          {thumbnail ? (
            <Image unoptimized src={thumbnail} alt="Your receipt photo" width={40} height={48} className="h-full w-full object-cover" />
          ) : (
            <ReceiptText aria-hidden="true" className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="merchant" className="block text-xs text-muted-foreground">
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
            className="w-full min-w-0 rounded-sm bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        <label
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "focus-within:outline-2 focus-within:outline-ring",
          )}
        >
          <Camera aria-hidden="true" />
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
        <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
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
        <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
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
