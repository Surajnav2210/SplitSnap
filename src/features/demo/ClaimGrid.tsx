import type { Dispatch } from "react";
import { money } from "@/core/money";
import { formatCents } from "@/core/parse";
import type { DemoAction, DemoClaim, DemoItem, DemoPerson } from "./state";
import { EmptyNote, Section } from "./ui";

function claimNote(count: number): string {
  if (count === 0) return "Unclaimed";
  if (count === 1) return "1 person";
  return `split ${count} ways`;
}

export function ClaimGrid({
  items,
  people,
  claims,
  dispatch,
}: {
  items: readonly DemoItem[];
  people: readonly DemoPerson[];
  claims: readonly DemoClaim[];
  dispatch: Dispatch<DemoAction>;
}) {
  const claimed = new Set(claims.map((c) => `${c.itemId}|${c.personId}`));

  let body;
  if (items.length === 0 || people.length === 0) {
    body = <EmptyNote>Add people and items, then tap who had what.</EmptyNote>;
  } else {
    body = (
      <ul className="space-y-3">
        {items.map((item) => {
          const count = people.filter((p) => claimed.has(`${item.id}|${p.id}`)).length;
          const unclaimed = count === 0;
          return (
            <li
              key={item.id}
              className={
                unclaimed
                  ? "rounded-xl border border-amber-400 bg-amber-50 p-3 dark:border-amber-500/60 dark:bg-amber-950/40"
                  : "rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              }
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {item.name}
                </span>
                <span className="tabular-nums text-sm text-zinc-700 dark:text-zinc-300">
                  {formatCents(money(item.priceCents))}
                </span>
              </div>
              <p
                className={
                  unclaimed
                    ? "mt-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
                    : "mt-0.5 text-xs text-zinc-500 dark:text-zinc-400"
                }
              >
                {claimNote(count)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Who had ${item.name}`}>
                {people.map((p) => {
                  const pressed = claimed.has(`${item.id}|${p.id}`);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() =>
                        dispatch({ type: "toggleClaim", itemId: item.id, personId: p.id })
                      }
                      className={
                        "min-h-9 rounded-full border px-3 py-1 text-sm font-medium transition-colors " +
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 " +
                        (pressed
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800")
                      }
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Section id="claims" title="Who had what" description="Tap names to claim. Shared items split evenly.">
      {body}
    </Section>
  );
}
