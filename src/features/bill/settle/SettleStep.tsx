import type { Dispatch } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { buildPaymentLinks, normalizeHandle, PAYMENT_APPS } from "@/core/paymentLinks";
import type { SplitResult } from "@/core/split";
import { paymentNote } from "@/core/summary";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { hostOf, hostWords, itemSharesFor, type BillAction, type BillState } from "../state";
import { HandlesForm } from "./HandlesForm";
import { OweCard } from "./OweCard";

export function SettleStep({
  state,
  result,
  dispatch,
  sent,
}: {
  state: BillState;
  result: SplitResult;
  dispatch: Dispatch<BillAction>;
  /** True once the summary was shared or copied. */
  sent: boolean;
}) {
  const host = hostOf(state);
  const words = hostWords(host.name);
  const note = paymentNote(state.merchant);
  const hasHandles = PAYMENT_APPS.some(({ app }) => (state.handles[app] ?? "").trim() !== "");
  const anyValid = PAYMENT_APPS.some(({ app }) => normalizeHandle(app, state.handles[app] ?? "") !== null);
  const owedToHost = result.participants
    .filter((p) => p.participantId !== state.hostId)
    .reduce((acc, p) => acc + p.total.cents, 0);

  return (
    <div className="space-y-6">
      {sent ? (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <Check aria-hidden="true" className="size-4" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-foreground">Summary ready. You&apos;re all square.</p>
            <p className="text-[13px] text-muted-foreground">Everyone sees exactly what they owe and how to pay.</p>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="total-heading" className="rounded-xl border border-border bg-card p-5">
        <h2 id="total-heading" className="text-[13px] text-muted-foreground">
          {state.merchant ?? "This bill"} · {state.people.length} people
        </h2>
        <MoneyText
          cents={result.billTotal.cents}
          smallCents
          className="mt-1 text-[48px] font-semibold leading-none tracking-[-0.04em] text-foreground"
        />
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">{words.getsBack}</span>
          <MoneyText cents={owedToHost} mono className="text-base font-semibold text-accent" />
        </div>
      </section>

      {!result.isFullyClaimed ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              <MoneyText cents={result.unassigned.total.cents} mono /> isn&apos;t claimed yet
            </p>
            <p className="mt-0.5 text-muted-foreground">It&apos;s not in anyone&apos;s total.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => dispatch({ type: "assignUnclaimedToAll" })}>
              Split the rest evenly
            </Button>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="owes-heading">
        <h2 id="owes-heading" className="mb-2 text-[13px] font-medium text-muted-foreground">Everyone&apos;s share</h2>
        <ul
          className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
          aria-live="polite"
          aria-label="What everyone owes"
        >
          {result.participants.map((share) => {
            const person = state.people.find((p) => p.id === share.participantId);
            if (!person) return null;
            const isHost = person.id === state.hostId;
            return (
              <OweCard
                key={person.id}
                person={person}
                share={share}
                isHost={isHost}
                hostName={words.object}
                items={itemSharesFor(state, person.id)}
                links={isHost ? [] : buildPaymentLinks(state.handles, share.total, note)}
                hasHandles={hasHandles && anyValid}
              />
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Tax and tip are split in proportion to what each person ordered.</p>
      </section>

      <HandlesForm handles={state.handles} dispatch={dispatch} />

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-3.5" />
        Pay links open the app with the amount filled in. SplitSnap never holds or moves money.
      </p>
    </div>
  );
}
