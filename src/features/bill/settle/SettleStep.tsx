import type { Dispatch } from "react";
import { buildPaymentLinks, normalizeHandle, PAYMENT_APPS } from "@/core/paymentLinks";
import type { SplitResult } from "@/core/split";
import { paymentNote } from "@/core/summary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { MoneyText } from "@/components/ui/MoneyText";
import { hostOf, hostWords, itemSharesFor, type BillAction, type BillState } from "../state";
import { HandlesForm } from "./HandlesForm";
import { OweCard } from "./OweCard";

export function SettleStep({
  state,
  result,
  dispatch,
}: {
  state: BillState;
  result: SplitResult;
  dispatch: Dispatch<BillAction>;
}) {
  const host = hostOf(state);
  const note = paymentNote(state.merchant);
  const hasHandles = PAYMENT_APPS.some(({ app }) => (state.handles[app] ?? "").trim() !== "");
  const anyValid = PAYMENT_APPS.some(({ app }) => normalizeHandle(app, state.handles[app] ?? "") !== null);
  const owedToHost = result.participants
    .filter((p) => p.participantId !== state.hostId)
    .reduce((acc, p) => acc + p.total.cents, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-brand p-5 text-brand-fg shadow-pop">
        <p className="text-sm font-medium opacity-85">{state.merchant ?? "This bill"} · total</p>
        <MoneyText cents={result.billTotal.cents} className="mt-1 block text-4xl font-bold tracking-tight" />
        <p className="mt-2 text-sm opacity-90">
          {hostWords(host.name).getsBack} <MoneyText cents={owedToHost} className="font-semibold" />
        </p>
      </div>

      {!result.isFullyClaimed ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-warning-line bg-warning-soft p-4 text-sm">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="font-semibold text-fg">
              <MoneyText cents={result.unassigned.total.cents} /> isn&apos;t claimed yet
            </p>
            <p className="mt-0.5 text-muted">It&apos;s not in anyone&apos;s total. Split it between everyone?</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => dispatch({ type: "assignUnclaimedToAll" })}>
              Everyone split the rest
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-3" aria-live="polite" aria-label="What everyone owes">
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
              hostName={hostWords(host.name).object}
              items={itemSharesFor(state, person.id)}
              links={isHost ? [] : buildPaymentLinks(state.handles, share.total, note)}
              hasHandles={hasHandles && anyValid}
            />
          );
        })}
      </ul>

      <HandlesForm handles={state.handles} dispatch={dispatch} />

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Icon name="shield" className="h-3.5 w-3.5" />
        SplitSnap never holds or moves your money.
      </p>
    </div>
  );
}
