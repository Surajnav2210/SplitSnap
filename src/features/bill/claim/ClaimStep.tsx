import type { Dispatch } from "react";
import { Check } from "lucide-react";
import type { SplitResult } from "@/core/split";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { cn } from "@/lib/utils";
import type { BillAction, BillState } from "../state";

function claimNote(count: number): string {
  if (count === 1) return "1 person";
  return `Split ${count} ways`;
}

export function ClaimStep({
  state,
  result,
  activeId,
  onActiveChange,
  dispatch,
  stickyClassName = "sticky top-[89px]",
}: {
  state: BillState;
  result: SplitResult | null;
  activeId: string;
  onActiveChange: (id: string) => void;
  dispatch: Dispatch<BillAction>;
  /** Where the person switcher sticks (below the app header). Empty to disable. */
  stickyClassName?: string;
}) {
  const active = state.people.find((p) => p.id === activeId) ?? state.people[0];
  const totalOf = (id: string) => result?.participants.find((p) => p.participantId === id)?.total.cents ?? 0;
  const claimersOf = (itemId: string) => {
    const ids = new Set(state.claims.filter((c) => c.itemId === itemId).map((c) => c.personId));
    return state.people.filter((p) => ids.has(p.id));
  };
  const unclaimedCount = state.items.filter((i) => claimersOf(i.id).length === 0).length;

  return (
    <div className="space-y-5">
      <div className={cn("z-10 -mx-4 bg-background px-4 py-2", stickyClassName)}>
        <p className="mb-2 text-[13px] text-muted-foreground">
          Tapping as <span className="font-medium text-foreground">{active.name}</span>
        </p>
        <div role="group" aria-label="Who is tapping" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none]">
          {state.people.map((p) => {
            const pressed = p.id === active.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onActiveChange(p.id)}
                className={cn(
                  "flex min-h-12 shrink-0 cursor-pointer items-center gap-2.5 rounded-full border bg-card py-1.5 pl-1.5 pr-4 text-left transition-[border-color,box-shadow] duration-150",
                  pressed ? "border-accent ring-1 ring-accent" : "border-border hover:border-input",
                )}
              >
                <Avatar name={p.name} seed={p.tone} size="md" />
                <span className="leading-tight">
                  <span className="block max-w-[7rem] truncate text-sm font-medium text-foreground">
                    {p.name}
                    {p.id === state.hostId ? <span className="font-normal text-muted-foreground"> · paid</span> : null}
                  </span>
                  <MoneyText cents={totalOf(p.id)} mono className="text-xs text-muted-foreground" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {unclaimedCount > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 whitespace-nowrap text-foreground">
            <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
            <span>
              <span className="tabular-nums">{unclaimedCount}</span> unclaimed
            </span>
          </span>
          <Button size="sm" variant="outline" onClick={() => dispatch({ type: "assignUnclaimedToAll" })}>
            Split the rest evenly
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-success/12 text-success-foreground">
            <Check aria-hidden="true" className="size-3" strokeWidth={3} />
          </span>
          Every item is claimed
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" aria-label="Items">
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
                className="flex min-h-16 w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-[22px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                    mine ? "border-foreground bg-foreground text-background" : "border-input",
                  )}
                >
                  {mine ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[15px] text-foreground", mine && "font-medium")}>{item.name}</span>
                  <span className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                    {claimers.length > 0 ? <AvatarStack people={claimers} /> : null}
                    {unclaimed ? (
                      <>
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
                        <span className="text-warning-foreground">Unclaimed</span>
                      </>
                    ) : (
                      claimNote(claimers.length)
                    )}
                  </span>
                </span>
                <MoneyText cents={item.priceCents} mono className="shrink-0 text-right text-[15px] text-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
