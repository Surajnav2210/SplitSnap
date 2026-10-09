import { useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, CircleAlert, Lock, PenLine, ReceiptText, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanPhase } from "./useReceiptScan";

function FileButton({
  label,
  icon,
  capture,
  variant,
  onFile,
}: {
  label: string;
  icon: "camera" | "upload";
  capture?: boolean;
  variant: "default" | "outline";
  onFile: (file: File) => void;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same photo again
    if (file) onFile(file);
  }
  const Icon = icon === "camera" ? Camera : Upload;
  return (
    <label
      className={cn(
        buttonVariants({ variant, size: "lg" }),
        "w-full focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
      )}
    >
      <Icon aria-hidden="true" />
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
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) onFile(file);
  }

  return (
    <div className="space-y-4">
      {phase.kind === "error" ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Couldn&apos;t read that photo</p>
            <p className="mt-0.5 text-muted-foreground">{phase.message}</p>
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

      <section
        aria-labelledby="scan-heading"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-2xl border border-dashed bg-card px-5 py-8 text-center transition-colors sm:px-8",
          dragging ? "border-accent" : "border-input",
        )}
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-background text-foreground">
          <ReceiptText aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <h2 id="scan-heading" className="mt-4 text-lg font-semibold tracking-[-0.02em] text-foreground">
          Scan the receipt
        </h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          We&apos;ll read every line, plus tax and tip. <span className="hidden sm:inline">Or drop a photo here.</span>
        </p>
        <div className="mx-auto mt-6 grid max-w-sm gap-2.5">
          <FileButton label="Take photo" icon="camera" capture variant="default" onFile={onFile} />
          <FileButton label="Upload image" icon="upload" variant="outline" onFile={onFile} />
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="size-3" />
          Read by Google Gemini, then discarded.
        </p>
      </section>

      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" onClick={onManual} className="w-full">
          <PenLine aria-hidden="true" />
          Type it in
        </Button>
        <Button variant="outline" onClick={onSample} className="w-full">
          <ReceiptText aria-hidden="true" />
          Try a sample
        </Button>
      </div>
    </div>
  );
}
