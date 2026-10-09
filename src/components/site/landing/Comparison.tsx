import { Check, Minus } from "lucide-react";

type Cell = { yes: boolean; text: string };

// "Typical split apps" is a general description, not a named product; keep
// claims hedged ("often", "varies") unless verified against a specific app.
const ROWS: { feature: string; us: Cell; them: Cell }[] = [
  { feature: "Friends join without an account", us: { yes: true, text: "Yes" }, them: { yes: false, text: "Often required" } },
  { feature: "Everyone claims their own items", us: { yes: true, text: "Yes" }, them: { yes: false, text: "Host assigns, or split evenly" } },
  { feature: "Receipt scan", us: { yes: true, text: "Free" }, them: { yes: false, text: "Often a paid feature" } },
  { feature: "Tax and tip in proportion, to the cent", us: { yes: true, text: "Yes" }, them: { yes: false, text: "Varies" } },
  { feature: "Pay links with the amount filled in", us: { yes: true, text: "Venmo, PayPal, Cash App" }, them: { yes: false, text: "Rarely built in" } },
];

function Value({ cell, strong }: { cell: Cell; strong?: boolean }) {
  return (
    <span className={strong ? "flex items-center gap-2 text-foreground" : "flex items-center gap-2 text-muted-foreground"}>
      {cell.yes ? (
        <Check aria-hidden="true" className="size-4 shrink-0 text-foreground" strokeWidth={2.25} />
      ) : (
        <Minus aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />
      )}
      {cell.text}
    </span>
  );
}

export function Comparison() {
  return (
    <section id="compare" aria-labelledby="compare-heading" className="scroll-mt-14 border-b border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-6 lg:grid-cols-[1fr_1.5fr] lg:py-28">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground">Compare</p>
          <h2 id="compare-heading" className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[40px]">
            One receipt, one table, settled before you leave.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Running-balance apps are great for roommates. SplitSnap is for a single bill, where nobody wants to sign up for anything.
          </p>
        </div>
        <div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[34rem] text-left text-[14px]">
              <caption className="sr-only">SplitSnap compared with typical bill-splitting apps</caption>
              <thead>
                <tr className="border-b border-border text-[13px]">
                  <th scope="col" className="px-5 py-3.5 font-normal text-muted-foreground">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="px-4 py-3.5 font-semibold text-foreground">SplitSnap</th>
                  <th scope="col" className="px-4 py-3.5 font-medium text-muted-foreground">Typical split apps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ROWS.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row" className="px-5 py-4 font-normal text-foreground">{r.feature}</th>
                    <td className="px-4 py-4"><Value cell={r.us} strong /></td>
                    <td className="px-4 py-4"><Value cell={r.them} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            &ldquo;Typical&rdquo; describes common patterns, not any one app. Features change; check each app for details.
          </p>
        </div>
      </div>
    </section>
  );
}
