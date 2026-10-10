import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { settlementActions, type LiveBill, type LiveBillView, type SettlementStatus } from "@/core/liveBill";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<SettlementStatus, string> = {
  unpaid: "Not paid yet",
  marked_paid: "Says they paid",
  confirmed: "Received",
};

/**
 * Everyone's running total, live. The host also gets a "Remove" action on each
 * guest (with a confirm step) while the bill is open.
 */
export function EveryoneTotals({
  bill,
  view,
  busy = false,
  onRemove,
}: {
  bill: LiveBill;
  view: LiveBillView;
  busy?: boolean;
  onRemove?: (participantId: string) => void;
}) {
  if (!view.split) return null;
  const canRemove = onRemove !== undefined && view.role === "host" && bill.status === "open";
  return (
    <section aria-labelledby="everyone-heading">
      <h2 id="everyone-heading" className="mb-2 text-[13px] font-medium text-muted-foreground">
        {view.role === "host" ? "People at the table" : "Everyone so far"}
      </h2>
      <ul aria-live="polite" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {bill.participants.map((p) => {
          const total = view.split?.participants.find((s) => s.participantId === p.id)?.total.cents ?? 0;
          return (
            <li key={p.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <Avatar name={p.name} seed={p.tone} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
                {p.name}
                {p.isHost ? <span className="text-muted-foreground"> · paid</span> : null}
                {p.id === view.me?.id ? <span className="text-muted-foreground"> · you</span> : null}
              </span>
              <MoneyText cents={total} mono className="text-[15px] text-foreground" />
              {canRemove && !p.isHost ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Remove ${p.name} from this bill`}
                  onClick={() => {
                    if (window.confirm(`Remove ${p.name} from this bill? Their claims will be removed too.`)) onRemove(p.id);
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {view.unclaimedItemIds.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <MoneyText cents={view.split.unassigned.total.cents} mono /> is still unclaimed.
        </p>
      ) : null}
    </section>
  );
}

function PayDisclaimer() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
      <ShieldCheck aria-hidden="true" className="size-3.5" />
      Pay links open the app with the amount filled in. SplitSnap never holds or moves money.
    </p>
  );
}

/** Guest after lock: what they owe, pay buttons, "I've paid". */
export function GuestSettle({
  view,
  merchant,
  busy,
  onStatus,
}: {
  view: LiveBillView;
  merchant: string | null;
  busy: boolean;
  onStatus: (settlementId: string, status: SettlementStatus) => void;
}) {
  const host = view.host.name;
  const s = view.mySettlement;
  if (s === null || s.amountCents === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-[15px] font-medium text-foreground">You don&apos;t owe anything on this bill.</p>
        <p className="mt-1 text-sm text-muted-foreground">Nothing was claimed for you{merchant ? ` at ${merchant}` : ""}.</p>
      </section>
    );
  }
  const actions = settlementActions("guest", s);
  return (
    <div className="space-y-6">
      <section aria-labelledby="owe-heading" className="rounded-xl border border-border bg-card p-5">
        <h2 id="owe-heading" className="text-[13px] text-muted-foreground">You owe {host}</h2>
        <MoneyText
          cents={s.amountCents}
          smallCents
          className="mt-1 text-[48px] font-semibold leading-none tracking-[-0.04em] text-foreground"
        />
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-foreground">
          {s.status === "unpaid" ? (
            <>
              <span aria-hidden="true" className="size-2 rounded-full bg-warning" /> Not paid yet
            </>
          ) : (
            <>
              <span className="flex size-5 items-center justify-center rounded-full bg-success/12 text-success-foreground">
                <Check aria-hidden="true" className="size-3" strokeWidth={3} />
              </span>
              {s.status === "confirmed" ? `${host} confirmed they got it` : `Marked paid. Waiting for ${host} to confirm.`}
            </>
          )}
        </p>
      </section>

      {s.status === "unpaid" ? (
        view.myPaymentLinks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {view.myPaymentLinks.map((l) => (
              <a
                key={l.app}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
              >
                {l.label}
                <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                <span className="sr-only"> (opens {l.label} to pay {host})</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{host} didn&apos;t add a payment app. Pay them however you usually do.</p>
        )
      ) : null}

      {actions.map((a) => (
        <Button
          key={a.next}
          size="lg"
          variant={a.next === "marked_paid" ? "default" : "outline"}
          className="w-full"
          disabled={busy}
          onClick={() => onStatus(s.id, a.next)}
        >
          {a.label}
        </Button>
      ))}
      <PayDisclaimer />
    </div>
  );
}

/** Host after lock: who has paid, who hasn't, confirm "Received". */
export function HostSettle({
  view,
  busy,
  onStatus,
}: {
  view: LiveBillView;
  busy: boolean;
  onStatus: (settlementId: string, status: SettlementStatus) => void;
}) {
  return (
    <div className="space-y-6">
      <ul aria-live="polite" aria-label="Who has paid" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {view.settlementLines.length === 0 ? (
          <li className="px-4 py-4 text-sm text-muted-foreground">Nobody else joined this bill.</li>
        ) : null}
        {view.settlementLines.map(({ participant, settlement }) => {
          const actions = settlement ? settlementActions("host", settlement) : [];
          return (
            <li key={participant.id} className="flex min-h-[4.5rem] items-center gap-3.5 px-4 py-3">
              <Avatar name={participant.name} seed={participant.tone} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-foreground">{participant.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {settlement ? STATUS_TEXT[settlement.status] : "Nothing to pay"}
                </span>
              </span>
              <MoneyText
                cents={settlement?.amountCents ?? 0}
                mono
                className={cn("text-lg font-semibold", settlement ? "text-foreground" : "text-muted-foreground")}
              />
              {settlement === null
                ? null
                : actions.map((a) => (
                <Button
                  key={a.next}
                  size="sm"
                  variant={a.next === "confirmed" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => onStatus(settlement.id, a.next)}
                  aria-label={`${a.label}: ${participant.name}`}
                >
                  {a.label}
                </Button>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Use &ldquo;Mark received&rdquo; when someone pays you in cash or another way. These are self-reported markers;
        SplitSnap can&apos;t see payments.
      </p>
      {!view.canUnlock ? (
        <p className="text-xs text-muted-foreground">Someone has marked paid, so the bill can&apos;t be unlocked.</p>
      ) : null}
    </div>
  );
}
