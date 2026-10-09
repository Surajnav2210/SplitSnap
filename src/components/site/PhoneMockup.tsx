import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

const PEOPLE = [
  { id: "a", name: "Alex", tone: 0 },
  { id: "s", name: "Sam", tone: 1 },
  { id: "p", name: "Priya", tone: 2 },
  { id: "j", name: "Jordan", tone: 3 },
];

const ITEMS: { name: string; price: string; by: number[]; mine?: boolean }[] = [
  { name: "Truffle fries", price: "$12.00", by: [0, 1, 2, 3], mine: true },
  { name: "Smash burger", price: "$17.25", by: [1], mine: true },
  { name: "Margherita pizza", price: "$18.50", by: [0] },
  { name: "Draft IPA", price: "$7.00", by: [1, 2], mine: true },
  { name: "Caesar salad", price: "$13.99", by: [] },
];

/** CSS-only phone showing the Claim screen. Decorative; described by its label. */
export function PhoneMockup({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="SplitSnap on a phone: Sam taps the items they had, each item shows who is sharing it, and Sam's total updates live."
      className={cx("relative mx-auto w-[300px]", className)}
    >
      <div aria-hidden="true" className="absolute -inset-10 -z-10 rounded-full bg-brand/25 blur-3xl" />
      <div className="rounded-[46px] border border-line-strong bg-fg p-2.5 shadow-pop">
        <div className="relative overflow-hidden rounded-[38px] bg-bg">
          <div className="absolute left-1/2 top-2 h-6 w-24 -translate-x-1/2 rounded-full bg-fg" />
          <div className="px-4 pb-4 pt-11">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cx("h-1 flex-1 rounded-full", i <= 2 ? "bg-brand" : "bg-line")} />
              ))}
            </div>
            <p className="mt-3 text-[17px] font-bold tracking-tight text-fg">Tap what you had</p>
            <p className="mt-1 text-[11px] text-muted">
              Tapping as <span className="font-semibold text-fg">Sam</span>
            </p>
            <div className="mt-2 flex gap-1.5">
              {PEOPLE.map((p) => (
                <span
                  key={p.id}
                  className={cx(
                    "flex items-center gap-1 rounded-xl border py-1 pl-1 pr-2 text-[10px] font-semibold text-fg",
                    p.id === "s" ? "border-brand bg-brand-soft" : "border-line bg-surface",
                  )}
                >
                  <Avatar name={p.name} seed={p.tone} size="xs" />
                  {p.name}
                </span>
              ))}
            </div>
            <ul className="mt-3 space-y-1.5">
              {ITEMS.map((item) => (
                <li
                  key={item.name}
                  className={cx(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-2",
                    item.mine ? "border-brand bg-brand-soft" : item.by.length === 0 ? "border-warning-line bg-warning-soft" : "border-line bg-surface",
                  )}
                >
                  <span
                    className={cx(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                      item.mine ? "border-brand bg-brand text-brand-fg" : "border-line-strong",
                    )}
                  >
                    {item.mine ? <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3.5} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-fg">{item.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted">
                      <span className="flex -space-x-1">
                        {item.by.map((i) => (
                          <Avatar key={i} name={PEOPLE[i].name} seed={PEOPLE[i].tone} size="xs" ring className="h-3.5! w-3.5! text-[7px]!" />
                        ))}
                      </span>
                      {item.by.length === 0 ? <span className="font-semibold text-warning">Nobody yet</span> : item.by.length > 1 ? `split ${item.by.length} ways` : "1 person"}
                    </span>
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-fg">{item.price}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-surface px-3 py-2">
              <span>
                <span className="block text-[9px] text-muted">Sam&apos;s total</span>
                <span className="block text-[15px] font-bold tabular-nums text-fg">$31.42</span>
              </span>
              <span className="rounded-xl bg-brand px-3 py-1.5 text-[11px] font-semibold text-brand-fg">Settle up</span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-6 top-24 hidden animate-float rounded-2xl border border-line bg-surface px-3 py-2 text-xs shadow-pop sm:block">
        <span className="font-semibold text-fg">Venmo</span> <span className="tabular-nums text-muted">$31.42 →</span>
      </div>
    </div>
  );
}
