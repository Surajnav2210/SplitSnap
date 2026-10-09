import { useState, type Dispatch } from "react";
import { formatPercent, parseDollars, parsePercent } from "@/core/parse";
import { MoneyText } from "@/components/ui/money-text";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

  const activePreset = tip.mode === "percent" && TIP_PRESETS.includes(tip.hundredths) ? [String(tip.hundredths)] : [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor="tip-value" className="text-[13px] font-medium text-foreground">
          Tip <span className="font-normal text-muted-foreground">· <MoneyText cents={tipCents} mono /></span>
        </label>
        <ToggleGroup
          aria-label="Tip type"
          value={[isPercent ? "percent" : "amount"]}
          onValueChange={(v) => {
            if (v[0] === "percent") applyPercent(percentText);
            else if (v[0] === "amount") applyAmount(amountText);
          }}
        >
          <ToggleGroupItem value="percent" aria-label="Tip as a percentage">%</ToggleGroupItem>
          <ToggleGroupItem value="amount" aria-label="Tip as a dollar amount">$</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {isPercent ? (
        <ToggleGroup
          aria-label="Tip presets"
          variant="outline"
          size="lg"
          className="mb-2 grid w-full grid-cols-4"
          value={activePreset}
          onValueChange={(v) => {
            if (v[0] !== undefined) applyPercent(formatPercent(Number(v[0])));
          }}
        >
          {TIP_PRESETS.map((h) => (
            <ToggleGroupItem key={h} value={String(h)} className="w-full font-mono tabular-nums">
              {formatPercent(h)}%
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      <PrefixedInput
        id="tip-value"
        prefix={isPercent ? "%" : "$"}
        padClass="pl-8"
        value={isPercent ? percentText : amountText}
        inputMode="decimal"
        placeholder={isPercent ? "18" : "0.00"}
        error={error}
        className="font-mono tabular-nums"
        onChange={(e) => (isPercent ? applyPercent(e.target.value) : applyAmount(e.target.value))}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">Percent tips are on the pre-tax subtotal.</p>
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
    <section aria-labelledby="adjustments-heading" className="rounded-xl border border-border bg-card p-5">
      <h2 id="adjustments-heading" className="text-base font-semibold tracking-[-0.01em] text-foreground">Tax, tip &amp; fees</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Split in proportion to what each person ordered.</p>
      <div className="mt-5 space-y-5">
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
