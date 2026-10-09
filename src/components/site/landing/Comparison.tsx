import { Icon } from "@/components/ui/Icon";

const ROWS: { feature: string; us: string; them: string }[] = [
  { feature: "Scan & itemize receipts", us: "Free", them: "Pro only" },
  { feature: "Friends can join without an account", us: "Yes", them: "Account required" },
  { feature: "Everyone claims their own items", us: "Yes", them: "No" },
  { feature: "One-tap Venmo / PayPal / Cash App", us: "Yes", them: "Not built in" },
];

export function Comparison() {
  return (
    <section aria-labelledby="compare-heading" className="mx-auto w-full max-w-6xl px-5 py-20">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Why not Splitwise?</p>
          <h2 id="compare-heading" className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            Built for the dinner, not the spreadsheet.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Splitwise is great for running balances with roommates. SplitSnap is for the moment the check
            lands: one receipt, everyone at the table, settled before you leave.
          </p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">SplitSnap compared with Splitwise</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-4 font-semibold">Feature</th>
                <th scope="col" className="px-3 py-4 font-semibold text-brand">SplitSnap</th>
                <th scope="col" className="px-5 py-4 font-semibold">Splitwise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((r) => (
                <tr key={r.feature}>
                  <th scope="row" className="px-5 py-4 font-medium text-fg">{r.feature}</th>
                  <td className="px-3 py-4">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-brand">
                      <Icon name="check" className="h-4 w-4" /> {r.us}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted">{r.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
