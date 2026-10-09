// Small, static slices of the real app UI used as visuals on the landing page.
// All amounts come from the sample bill and the core split engine.

import { ArrowUpRight, Check } from "lucide-react";
import { addMoney, money } from "@/core/money";
import { splitEvenly } from "@/core/split";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { MoneyText } from "@/components/ui/money-text";
import { cn } from "@/lib/utils";
import { SAMPLE_RESULT, SAMPLE_STATE, samplePerson } from "./sampleBill";

const people = (names: readonly string[]) => names.map((n) => samplePerson(n));

/** A few receipt lines in mono with dotted leaders. */
export function MiniReceipt({ lines = 4, showScan = false, className }: { lines?: number; showScan?: boolean; className?: string }) {
  const items = SAMPLE_STATE.items.slice(0, lines);
  return (
    <div className={cn("paper-edge", className)}>
      <div className="receipt-paper relative px-5 pb-6 pt-6 font-mono text-[12px]">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.18em] text-foreground">{SAMPLE_STATE.merchant}</p>
        <div className="my-3 border-t border-dashed border-input" />
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex items-baseline gap-2">
              {i.quantity > 1 ? <span className="text-muted-foreground">{i.quantity}×</span> : null}
              <span className="truncate">{i.name}</span>
              <span aria-hidden="true" className="mb-1 min-w-3 flex-1 border-b border-dotted border-input" />
              <MoneyText cents={i.priceCents} />
            </li>
          ))}
        </ul>
        <div className="my-3 border-t border-dashed border-input" />
        <div className="flex justify-between font-semibold">
          <span className="uppercase tracking-[0.12em]">Total</span>
          <MoneyText cents={SAMPLE_RESULT.billTotal.cents} />
        </div>
        {showScan ? <span aria-hidden="true" className="absolute inset-x-3 top-[46%] h-px bg-accent" /> : null}
      </div>
    </div>
  );
}

/** Claim rows: check, name, who shares it, price. */
export function MiniClaimRows({ className }: { className?: string }) {
  const rows = [
    { name: "Truffle fries", by: ["Alex", "Sam", "Priya"], mine: true },
    { name: "Smash burger", by: ["Sam"], mine: true },
    { name: "Caesar salad", by: [], mine: false },
  ].map((r) => ({ ...r, cents: SAMPLE_STATE.items.find((i) => i.name === r.name)?.priceCents ?? 0 }));
  return (
    <ul className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border bg-card", className)}>
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-3 px-3.5 py-2.5">
          <span
            className={cn(
              "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
              r.mine ? "border-foreground bg-foreground text-background" : "border-input",
            )}
          >
            {r.mine ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-foreground">{r.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {r.by.length > 0 ? <AvatarStack people={people(r.by)} /> : null}
              {r.by.length === 0 ? (
                <>
                  <span className="size-1.5 rounded-full bg-warning" />
                  <span className="text-warning-foreground">Unclaimed</span>
                </>
              ) : r.by.length > 1 ? (
                `Split ${r.by.length} ways`
              ) : (
                "1 person"
              )}
            </span>
          </span>
          <MoneyText cents={r.cents} mono className="text-[13px] text-foreground" />
        </li>
      ))}
    </ul>
  );
}

/** Person switcher with the accent ring on the active person. */
export function MiniSwitcher({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {people(["Alex", "Sam", "Priya", "Jordan"]).map((p) => (
        <span
          key={p.id}
          className={cn(
            "flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-[13px] font-medium text-foreground",
            p.name === "Sam" ? "border-accent ring-1 ring-accent" : "border-border",
          )}
        >
          <Avatar name={p.name} seed={p.tone} size="sm" />
          {p.name}
        </span>
      ))}
    </div>
  );
}

/** Two people with what they owe and pay buttons. */
export function MiniPay({ names = ["Sam", "Priya"], className }: { names?: readonly string[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border bg-card", className)}>
      {people(names).map((p) => (
        <li key={p.id} className="px-3.5 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={p.name} seed={p.tone} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-foreground">{p.name}</span>
              <span className="block text-[11px] text-muted-foreground">Owes Alex</span>
            </span>
            <MoneyText cents={p.totalCents} mono className="text-base font-semibold text-foreground" />
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {["Venmo", "PayPal", "Cash App"].map((app) => (
              <span
                key={app}
                className="inline-flex h-7 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-input bg-card px-2 text-[11px] font-medium text-foreground"
              >
                {app}
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Uneven split shown cent by cent: $10.00 three ways. */
export function MiniCents({ className }: { className?: string }) {
  const total = money(1000);
  const shares = splitEvenly(total, 3);
  const trio = people(["Alex", "Sam", "Priya"]);
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 font-mono text-[12px]", className)}>
      <div className="flex justify-between text-muted-foreground">
        <span>Nachos ÷ 3</span>
        <MoneyText cents={total.cents} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {shares.map((s, i) => (
          <li key={trio[i].id} className="flex items-center gap-2 text-foreground">
            <Avatar name={trio[i].name} seed={trio[i].tone} size="xs" />
            <span className="flex-1 font-sans text-[13px]">{trio[i].name}</span>
            <MoneyText cents={s.cents} />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-input pt-2.5 text-foreground">
        <span className="flex items-center gap-1.5 font-sans text-[12px]">
          <Check className="size-3.5 text-success-foreground" strokeWidth={2.5} /> Adds up exactly
        </span>
        <MoneyText cents={shares.reduce(addMoney, money(0)).cents} />
      </div>
    </div>
  );
}
