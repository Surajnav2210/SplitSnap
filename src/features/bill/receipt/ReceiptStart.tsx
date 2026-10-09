import type { ChangeEvent } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { ScanPhase } from "./useReceiptScan";

function FileButton({
  label,
  icon,
  capture,
  variant,
  onFile,
}: {
  label: string;
  icon: "camera" | "image";
  capture?: boolean;
  variant: "primary" | "secondary";
  onFile: (file: File) => void;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same photo again
    if (file) onFile(file);
  }
  return (
    <label
      className={cx(
        buttonClass(variant, "lg"),
        "w-full cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand",
      )}
    >
      <Icon name={icon} className="h-5 w-5" />
      {label}
      <input
        type="file"
        accept="image/*"
        capture={capture ? "environment" : undefined}
        className="sr-only"
        onChange={handleChange}
      />
    </label>
  );
}

export function ReceiptStart({
  phase,
  onFile,
  onManual,
  onSample,
  onDismissError,
}: {
  phase: ScanPhase;
  onFile: (file: File) => void;
  onManual: () => void;
  onSample: () => void;
  onDismissError: () => void;
}) {
  return (
    <div className="space-y-4">
      {phase.kind === "error" ? (
        <div role="alert" className="flex gap-3 rounded-2xl border border-warning-line bg-warning-soft p-4 text-sm">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-fg">Couldn&apos;t scan that one</p>
            <p className="mt-0.5 text-muted">{phase.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={onManual}>
                Enter items manually
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismissError}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-[28px] border border-line bg-surface p-6 shadow-card">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand/15 blur-3xl"
        />
        <div className="relative">
          <div aria-hidden="true" className="paper-shadow mx-auto mb-5 w-24 rotate-[-4deg]">
          <div className="receipt-paper flex h-28 flex-col gap-1.5 p-3">
            <span className="h-1.5 w-10 rounded bg-paper-fg/70" />
            <span className="mt-1 h-1 w-full rounded bg-paper-fg/20" />
            <span className="h-1 w-4/5 rounded bg-paper-fg/20" />
            <span className="h-1 w-full rounded bg-paper-fg/20" />
            <span className="h-1 w-3/5 rounded bg-paper-fg/20" />
            <span className="mt-auto h-1.5 w-full rounded bg-brand/70" />
          </div>
          </div>
          <p className="text-center text-sm text-muted">
            AI reads every line, so you don&apos;t have to type it.
          </p>
          <div className="mt-5 space-y-2.5">
            <FileButton label="Scan receipt" icon="camera" capture variant="primary" onFile={onFile} />
            <FileButton label="Upload from photos" icon="image" variant="secondary" onFile={onFile} />
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <Icon name="lock" className="h-3.5 w-3.5" />
            Photos are read by Google Gemini to find items, then discarded.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={onManual} className="w-full">
          <Icon name="pencil" className="h-4 w-4" />
          Enter manually
        </Button>
        <Button variant="secondary" onClick={onSample} className="w-full">
          <Icon name="sparkle" className="h-4 w-4" />
          Try a sample
        </Button>
      </div>
    </div>
  );
}
