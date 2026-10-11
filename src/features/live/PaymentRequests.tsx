"use client";

// Asking people to pay, after the bill is locked. Nothing here sends anything
// on its own: "Request on Venmo" opens Venmo (the host confirms there), and
// "Send a reminder" opens the share sheet or copies the text.

import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import type { LiveBill, SettlementLine } from "@/core/liveBill";
import { money } from "@/core/money";
import { formatCents } from "@/core/parse";
import { buildVenmoRequestLink, hasPaymentHandle, normalizeHandle, type PaymentHandles } from "@/core/paymentLinks";
import { reminderText } from "@/core/reminders";
import { paymentNote } from "@/core/summary";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { HandlesForm } from "@/features/bill/settle/HandlesForm";
import { useShareSummary } from "@/features/bill/settle/useShareSummary";
import { PrefixedInput } from "@/features/bill/fields";
import { cn } from "@/lib/utils";
import { ActionError } from "./LiveShell";
import { shareUrl } from "./ShareLinkCard";

/** Saves a Venmo username; resolves to an error message to show, or null on success. */
export type SaveVenmo = (participantId: string, raw: string) => Promise<string | null>;

const INVALID_VENMO = "Use only letters, numbers, - _ or .";

function venmoError(raw: string): string | null {
  return raw.trim() !== "" && normalizeHandle("venmo", raw) === null ? INVALID_VENMO : null;
}

/** One Venmo username field with Save. Used by the host (for a guest) and by a guest (for themself). */
function VenmoField({
  id,
  label,
  hint,
  initial,
  onSave,
  onDone,
}: {
  id: string;
  label: string;
  hint: string;
  initial: string;
  onSave: (raw: string) => Promise<string | null>;
  onDone?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const invalid = venmoError(value);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invalid !== null) return;
    setError(null);
    setSaving(true);
    const failure = await onSave(value);
    setSaving(false);
    if (failure !== null) {
      setError(failure);
      return;
    }
    onDone?.();
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-2">
      <label htmlFor={id} className="block text-[13px] font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PrefixedInput
            id={id}
            prefix="@"
            value={value}
            placeholder="sam-k"
            autoCapitalize="none"
            spellCheck={false}
            error={invalid}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={saving || invalid !== null}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <ActionError message={error} />
    </form>
  );
}

/**
 * Shown when the host locks without any payment username saved. Saving
 * stores them on the host's profile; the bill copies them when it locks.
 */
export function LockHandlesSheet({
  open,
  onSaveAndLock,
  onSkip,
  onClose,
}: {
  open: boolean;
  onSaveAndLock: (handles: PaymentHandles) => Promise<string | null>;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [handles, setHandles] = useState<PaymentHandles>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const anyInvalid = (["venmo", "paypal", "cashapp"] as const).some((app) => {
    const raw = handles[app] ?? "";
    return raw.trim() !== "" && normalizeHandle(app, raw) === null;
  });
  const canSave = !saving && !anyInvalid && hasPaymentHandle(handles);

  async function save() {
    setError(null);
    setSaving(true);
    const failure = await onSaveAndLock(handles);
    setSaving(false);
    setError(failure);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader className="pt-5">
          <DrawerTitle>How should people pay you?</DrawerTitle>
          <DrawerDescription>
            Add at least one so everyone gets a pay button with their amount filled in. You only do this once.
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <HandlesForm handles={handles} onChange={setHandles} framed={false} />
          <ActionError message={error} />
          <Button size="lg" className="w-full" disabled={!canSave} onClick={() => void save()}>
            {saving ? "Saving…" : "Save and lock"}
          </Button>
          <div className="flex justify-center">
            <Button variant="link" disabled={saving} onClick={onSkip}>
              Skip
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Host, after lock: ways to ask one guest for their share. */
export function RequestSheet({
  bill,
  line,
  open,
  onClose,
  onSaveVenmo,
}: {
  bill: LiveBill;
  /** The guest being asked (kept while the sheet animates closed). */
  line: SettlementLine | null;
  open: boolean;
  onClose: () => void;
  onSaveVenmo: SaveVenmo;
}) {
  const { status, share, reset } = useShareSummary();
  const [editing, setEditing] = useState(false);
  const settlement = line?.settlement ?? null;

  function close() {
    setEditing(false);
    reset();
    onClose();
  }

  let body = null;
  if (line !== null && settlement !== null) {
    const name = line.participant.name;
    const amount = money(settlement.amountCents);
    const venmoUrl = line.venmo === null ? null : buildVenmoRequestLink(line.venmo, amount, paymentNote(bill.merchant));

    const remind = async () => {
      const text = reminderText({
        guestName: name,
        amount,
        merchant: bill.merchant,
        handles: bill.handles,
        billUrl: shareUrl(bill.shareCode),
      });
      const how = await share(text);
      if (how === "copied") toast(`Copied. Paste it in a message to ${name}.`);
    };

    body = (
      <>
        <DrawerHeader className="pt-5">
          <DrawerTitle>
            Ask {name} for {formatCents(amount)}
          </DrawerTitle>
          <DrawerDescription>Nothing is sent until you send it.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {venmoUrl !== null && !editing ? (
            <div className="space-y-1.5">
              <a
                href={venmoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "w-full")}
              >
                Request on Venmo
                <ArrowUpRight aria-hidden="true" className="size-4" />
                <span className="sr-only"> (opens Venmo)</span>
              </a>
              <p className="text-center text-xs text-muted-foreground">
                Opens Venmo to request from @{line.venmo}. You confirm it there.{" "}
                <Button variant="link" size="sm" className="h-auto text-xs" onClick={() => setEditing(true)}>
                  Change
                </Button>
              </p>
            </div>
          ) : (
            <VenmoField
              key={line.participant.id}
              id="request-venmo"
              label={`${name}'s Venmo username`}
              hint={`Optional. Add it to request on Venmo, or just send ${name} a reminder.`}
              initial={line.venmo ?? ""}
              onSave={(raw) => onSaveVenmo(line.participant.id, raw)}
              onDone={() => setEditing(false)}
            />
          )}
          <Button size="lg" variant="outline" className="w-full" onClick={() => void remind()}>
            Send a reminder
          </Button>
          {status.kind === "manual" ? (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Copy this and send it to {name}:</p>
              <textarea
                readOnly
                value={status.text}
                rows={4}
                aria-label="Reminder text"
                className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-[13px] text-foreground"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <Drawer
      open={open && line !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DrawerContent>{body}</DrawerContent>
    </Drawer>
  );
}

/** Guest, after lock: optional, collapsed line to share their Venmo username with the host. */
export function GuestVenmoLine({
  hostName,
  participantId,
  venmo,
  onSave,
}: {
  hostName: string;
  participantId: string;
  venmo: string | null;
  onSave: SaveVenmo;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <VenmoField
          id="my-venmo"
          label="Your Venmo username"
          hint={`Only ${hostName} sees it, so they can request your share on Venmo.${venmo ? " Leave blank to remove it." : ""}`}
          initial={venmo ?? ""}
          onSave={(raw) => onSave(participantId, raw)}
          onDone={() => setOpen(false)}
        />
        <Button variant="link" className="mt-1" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <p className="text-center text-sm text-muted-foreground">
      {venmo ? (
        <>
          Your Venmo: @{venmo}.{" "}
          <Button variant="link" size="sm" className="h-auto" onClick={() => setOpen(true)}>
            Change
          </Button>
        </>
      ) : (
        <Button variant="link" onClick={() => setOpen(true)}>
          Add your Venmo so {hostName} can request it
        </Button>
      )}
    </p>
  );
}
