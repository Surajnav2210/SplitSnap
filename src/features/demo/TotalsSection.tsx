import { addMoney, money, type Money } from "@/core/money";
import { formatCents } from "@/core/parse";
import type { ParticipantShare, SplitResult } from "@/core/split";
import type { DemoItem, DemoPerson, SplitOutcome } from "./state";
import { EmptyNote, Section } from "./ui";

function Row({ label, value, strong }: { label: string; value: Money; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between pt-1 font-bold" : "flex justify-between"}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatCents(value)}</dd>
    </div>
  );
}

function ShareCard({ name, share }: { name: string; share: ParticipantShare }) {
  return (
    <li className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{name}</h3>
      <dl className="mt-1 space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
        <Row label="Items" value={share.itemsSubtotal} />
        <Row label="Tax" value={share.tax} />
        <Row label="Tip" value={share.tip} />
        <Row label="Fees" value={share.fees} />
        <Row label="Discount" value={share.discount} />
        <div className="border-t border-zinc-200 dark:border-zinc-800" />
        <div className="text-base text-zinc-900 dark:text-zinc-50">
          <Row label="Total" value={share.total} strong />
        </div>
      </dl>
    </li>
  );
}

function UnassignedCard({ result, items }: { result: SplitResult; items: readonly DemoItem[] }) {
  const names = result.unassigned.itemIds
    .map((id) => items.find((i) => i.id === id)?.name)
    .filter((n): n is string => n !== undefined);
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <h3 className="font-semibold">Unassigned</h3>
      <p className="mt-0.5">
        {names.length === 1 ? "1 item has" : `${names.length} items have`} no one yet:{" "}
        {names.join(", ")}.
      </p>
      <dl className="mt-1 space-y-0.5">
        <Row label="Items" value={result.unassigned.itemsSubtotal} />
        <Row label="With tax, tip & discount" value={result.unassigned.total} strong />
      </dl>
    </div>
  );
}

function Reconciliation({ result }: { result: SplitResult }) {
  const zero = money(0, result.currency);
  const everyone = result.participants.reduce((acc, p) => addMoney(acc, p.total), zero);
  const combined = addMoney(everyone, result.unassigned.total);
  const matches = combined.cents === result.billTotal.cents;
  if (!matches) {
    return (
      <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
        Totals ({formatCents(combined)}) do not match the bill total (
        {formatCents(result.billTotal)}).
      </p>
    );
  }
  return (
    <p className="text-sm text-emerald-700 dark:text-emerald-400">
      {result.isFullyClaimed
        ? "Everyone's totals add up to the bill total"
        : "Everyone's totals plus the unassigned amount add up to the bill total"}{" "}
      ({formatCents(combined)}).
    </p>
  );
}

export function TotalsSection({
  outcome,
  people,
  items,
}: {
  outcome: SplitOutcome;
  people: readonly DemoPerson[];
  items: readonly DemoItem[];
}) {
  if (!outcome.ok) {
    return (
      <Section id="totals" title="Totals">
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {outcome.error}
        </p>
      </Section>
    );
  }

  const { result, tipCents } = outcome;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <Section id="totals" title="Totals">
      <div className="space-y-3" aria-live="polite">
        {result.participants.length === 0 ? (
          <EmptyNote>Add people to see what everyone owes.</EmptyNote>
        ) : (
          <ul className="space-y-3">
            {result.participants.map((share) => (
              <ShareCard key={share.participantId} name={nameOf(share.participantId)} share={share} />
            ))}
          </ul>
        )}

        {result.isFullyClaimed ? null : <UnassignedCard result={result} items={items} />}

        <dl className="space-y-0.5 rounded-xl bg-zinc-100 p-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          <Row label="Tip on the bill" value={money(tipCents, result.currency)} />
          <div className="text-base text-zinc-900 dark:text-zinc-50">
            <Row label="Bill total" value={result.billTotal} strong />
          </div>
        </dl>

        <Reconciliation result={result} />
      </div>
    </Section>
  );
}
