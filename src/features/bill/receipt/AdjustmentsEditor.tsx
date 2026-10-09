import { useState, type Dispatch } from "react";
import { formatPercent, parseDollars, parsePercent } from "@/core/parse";
import { cx } from "@/components/ui/cx";
import { MoneyText } from "@/components/ui/MoneyText";
import { DEFAULT_TIP_HUNDREDTHS, type DemoTip } from "@/features/demo/state";
import { MoneyField, PrefixedInput, centsToInput, parseOrZero } from "../fields";
import type { BillAction } from "../state";

const TIP_PRESETS = [1500, 1800, 2000, 2200];

function TipEditor({ tip, tipCents, dispatch }: { tip: DemoTip; tipCents: number; dispatch: Dispatch<BillAction> }) {
  const [percentText, setPercentText] = useState(() =>
    formatPercent(tip.mode === "percent" ? tip.hundredths : DEFAULT_TIP_HUNDREDTHS),
  );
  const [amountText, setAmountText] = useState(() => (tip.mode === "amount" ? centsToInput(tip.cents) : ""));
  const [error, setError] = useState<string | null>(null);
  const isPercent = tip.mode === "percent";

  function applyPercent(text: string) {
    setPercentText(text);
    const parsed = parseOrZero(text, parsePercent);
    setError(parsed.error);
    if (parsed.value !== null) dispatch({ type: "setTip", tip: { mode: "percent", hundredths: parsed.value } });
  }
  function applyAmount(text: string) {
    setAmountText(text);
    const parsed = parseOrZero(text, parseDollars);
    setError(parsed.error);
    if (parsed.value !== null) dispatch({ type: "setTip", tip: { mode: "amount", cents: parsed.value } });
  }

  const seg = (active: boolean) =>
    cx(
      "min-h-9 min-w-11 rounded-lg px-3 text-sm font-semibold transition-colors",
      active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
    );

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor="tip-value" className="text-sm font-medium text-fg">
          Tip <span className="font-normal text-muted">· <MoneyText cents={tipCents} /></span>
        </label>
        <div role="group" aria-label="Tip type" className="inline-flex rounded-xl bg-sunken p-1">
          <button type="button" aria-pressed={isPercent} aria-label="Tip as a percentage" className={seg(isPercent)} onClick={() => applyPercent(percentText)}>
            %
          </button>
          <button type="button" aria-pressed={!isPercent} aria-label="Tip as a dollar amount" className={seg(!isPercent)} onClick={() => applyAmount(amountText)}>
            $
          </button>
        </div>
      </div>
      <PrefixedInput
        id="tip-value"
        prefix={isPercent ? "%" : "$"}
        value={isPercent ? percentText : amountText}
        inputMode="decimal"
        placeholder={isPercent ? "18" : "0.00"}
        error={error}
        className="tabular-nums"
        onChange={(e) => (isPercent ? applyPercent(e.target.value) : applyAmount(e.target.value))}
      />
      {isPercent ? (
        <div className="mt-2 flex gap-1.5" role="group" aria-label="Tip presets">
          {TIP_PRESETS.map((h) => {
            const active = tip.mode === "percent" && tip.hundredths === h;
            return (
              <button
                key={h}
                type="button"
                aria-pressed={active}
                onClick={() => applyPercent(formatPercent(h))}
                className={cx(
                  "min-h-11 flex-1 rounded-xl border text-sm font-semibold tabular-nums transition-colors",
                  active ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                {formatPercent(h)}%
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="mt-1.5 text-xs text-muted">Percent tips are on the pre-tax subtotal.</p>
    </div>
  );
}

/** Tax, tip, fees and discount. Remounted (via key) when the bill is replaced. */
export function AdjustmentsEditor({
  taxCents,
  tip,
  tipCents,
  feeCents,
  discountCents,
  dispatch,
}: {
  taxCents: number;
  tip: DemoTip;
  tipCents: number;
  feeCents: number;
  discountCents: number;
  dispatch: Dispatch<BillAction>;
}) {
  return (
    <section aria-labelledby="adjustments-heading" className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <h2 id="adjustments-heading" className="text-base font-semibold text-fg">Tax, tip &amp; fees</h2>
      <p className="mt-0.5 text-sm text-muted">Split in proportion to what each person ordered.</p>
      <div className="mt-4 space-y-4">
        <TipEditor tip={tip} tipCents={tipCents} dispatch={dispatch} />
        <div className="grid grid-cols-3 gap-3">
          <MoneyField label="Tax" initialCents={taxCents} onValid={(cents) => dispatch({ type: "setTax", cents })} />
          <MoneyField label="Fees" initialCents={feeCents} onValid={(cents) => dispatch({ type: "setFee", cents })} />
          <MoneyField label="Discount" initialCents={discountCents} onValid={(cents) => dispatch({ type: "setDiscount", cents })} />
        </div>
      </div>
    </section>
  );
}
