import type { Dispatch } from "react";
import type { SplitResult } from "@/core/split";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { MoneyText } from "@/components/ui/MoneyText";
import { cx } from "@/components/ui/cx";
import type { BillAction, BillState } from "../state";

function claimNote(count: number): string {
  if (count === 0) return "Nobody yet";
  if (count === 1) return "1 person";
  return `split ${count} ways`;
}

export function ClaimStep({
  state,
  result,
  activeId,
  onActiveChange,
  dispatch,
}: {
  state: BillState;
  result: SplitResult | null;
  activeId: string;
  onActiveChange: (id: string) => void;
  dispatch: Dispatch<BillAction>;
}) {
  const active = state.people.find((p) => p.id === activeId) ?? state.people[0];
  const totalOf = (id: string) => result?.participants.find((p) => p.participantId === id)?.total.cents ?? 0;
  const claimersOf = (itemId: string) => {
    const ids = new Set(state.claims.filter((c) => c.itemId === itemId).map((c) => c.personId));
    return state.people.filter((p) => ids.has(p.id));
  };
  const unclaimedCount = state.items.filter((i) => claimersOf(i.id).length === 0).length;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 bg-bg/90 px-4 pb-2 pt-1 backdrop-blur">
        <p className="mb-2 text-sm text-muted">
          Tapping as <span className="font-semibold text-fg">{active.name}</span>
        </p>
        <div role="group" aria-label="Who is tapping" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {state.people.map((p) => {
            const pressed = p.id === active.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onActiveChange(p.id)}
                className={cx(
                  "flex min-h-14 shrink-0 items-center gap-2 rounded-2xl border py-1.5 pl-1.5 pr-3 text-left transition-colors",
                  pressed ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <Avatar name={p.name} seed={p.tone} size="md" />
                <span className="leading-tight">
                  <span className="block max-w-[7rem] truncate text-sm font-semibold text-fg">
                    {p.id === state.hostId ? `${p.name} (paid)` : p.name}
                  </span>
                  <MoneyText cents={totalOf(p.id)} className="text-xs text-muted" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {unclaimedCount > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-warning-line bg-warning-soft px-4 py-2.5 text-sm">
          <span className="text-fg">
            <span className="font-semibold tabular-nums">{unclaimedCount}</span> unclaimed{" "}
            {unclaimedCount === 1 ? "item" : "items"}
          </span>
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "assignUnclaimedToAll" })}>
            Everyone split the rest
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-soft-fg">
          <Icon name="check" className="h-4 w-4" /> Every item is claimed
        </p>
      )}

      <ul className="space-y-2.5" aria-label="Items">
        {state.items.map((item) => {
          const claimers = claimersOf(item.id);
          const mine = claimers.some((p) => p.id === active.id);
          const unclaimed = claimers.length === 0;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={mine}
                onClick={() => dispatch({ type: "toggleClaim", itemId: item.id, personId: active.id })}
                className={cx(
                  "flex min-h-[4.25rem] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99]",
                  mine && "border-brand bg-brand-soft shadow-card",
                  !mine && unclaimed && "border-warning-line bg-warning-soft shadow-[0_0_0_4px_var(--warning-soft)]",
                  !mine && !unclaimed && "border-line bg-surface",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    mine ? "animate-pop border-brand bg-brand text-brand-fg" : "border-line-strong",
                  )}
                >
                  {mine ? <Icon name="check" className="h-4 w-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{item.name}</span>
                  <span className={cx("mt-0.5 flex items-center gap-2 text-xs", unclaimed ? "font-semibold text-warning" : "text-muted")}>
                    {claimers.length > 0 ? <AvatarStack people={claimers} /> : null}
                    {claimNote(claimers.length)}
                  </span>
                </span>
                <MoneyText cents={item.priceCents} className="font-semibold text-fg" />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-muted">
        <Icon name="bolt" className="h-3.5 w-3.5" />
        Soon: everyone claims from their own phone via a link.
      </p>
    </div>
  );
}
