import { useState, type Dispatch } from "react";
import { money } from "@/core/money";
import { formatCents, formatPercent, parseDollars, parsePercent } from "@/core/parse";
import { DEFAULT_TIP_HUNDREDTHS, type DemoAction, type DemoTip } from "./state";
import { FieldError, Section, errorMessage, inputClass } from "./ui";

/** "1234.5" style text for an input: no "$", empty for zero. */
function centsToInput(cents: number): string {
  return cents === 0 ? "" : formatCents(money(cents)).slice(1);
}

/** Parse a field where empty means 0. Returns the value or an error message. */
function parseOrEmpty(
  text: string,
  parse: (s: string) => number,
): { value: number; error: null } | { value: null; error: string } {
  if (text.trim() === "") return { value: 0, error: null };
  try {
    return { value: parse(text), error: null };
  } catch (err) {
    return { value: null, error: errorMessage(err) };
  }
}

function DollarField({
  id,
  label,
  initialCents,
  onValid,
}: {
  id: string;
  label: string;
  initialCents: number;
  onValid: (cents: number) => void;
}) {
  const [text, setText] = useState(() => centsToInput(initialCents));
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500"
        >
          $
        </span>
        <input
          id={id}
          className={`${inputClass} pl-7`}
          value={text}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const parsed = parseOrEmpty(next, parseDollars);
            setError(parsed.error);
            if (parsed.value !== null) onValid(parsed.value);
          }}
        />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function TipField({ tip, dispatch }: { tip: DemoTip; dispatch: Dispatch<DemoAction> }) {
  const [percentText, setPercentText] = useState(() =>
    formatPercent(tip.mode === "percent" ? tip.hundredths : DEFAULT_TIP_HUNDREDTHS),
  );
  const [amountText, setAmountText] = useState(() =>
    tip.mode === "amount" ? centsToInput(tip.cents) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const isPercent = tip.mode === "percent";

  function applyPercent(text: string) {
    const parsed = parseOrEmpty(text, parsePercent);
    setError(parsed.error);
    dispatch({ type: "setTip", tip: { mode: "percent", hundredths: parsed.value ?? 0 } });
  }

  function applyAmount(text: string) {
    const parsed = parseOrEmpty(text, parseDollars);
    setError(parsed.error);
    dispatch({ type: "setTip", tip: { mode: "amount", cents: parsed.value ?? 0 } });
  }

  const modeButton = (active: boolean) =>
    "min-w-10 px-3 py-1 text-sm font-semibold rounded-md " +
    (active
      ? "bg-emerald-600 text-white"
      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800");

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor="tip-value" className="text-sm text-zinc-700 dark:text-zinc-300">
          Tip {isPercent ? "(% of items, before tax)" : "($)"}
        </label>
        <div
          role="group"
          aria-label="Tip type"
          className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
        >
          <button
            type="button"
            aria-pressed={isPercent}
            aria-label="Tip as a percentage"
            className={modeButton(isPercent)}
            onClick={() => applyPercent(percentText)}
          >
            %
          </button>
          <button
            type="button"
            aria-pressed={!isPercent}
            aria-label="Tip as a dollar amount"
            className={modeButton(!isPercent)}
            onClick={() => applyAmount(amountText)}
          >
            $
          </button>
        </div>
      </div>
      <input
        id="tip-value"
        className={inputClass}
        value={isPercent ? percentText : amountText}
        inputMode="decimal"
        placeholder={isPercent ? "18" : "0.00"}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "tip-value-error" : undefined}
        onChange={(e) => {
          const next = e.target.value;
          if (isPercent) {
            setPercentText(next);
            applyPercent(next);
          } else {
            setAmountText(next);
            applyAmount(next);
          }
        }}
      />
      <FieldError id="tip-value-error" message={error} />
    </div>
  );
}

/**
 * Tax, tip, and discount inputs. Inputs keep their own text drafts; the parent
 * remounts this section (via `key`) when the whole bill is replaced.
 */
export function AdjustmentsSection({
  taxCents,
  tip,
  discountCents,
  dispatch,
}: {
  taxCents: number;
  tip: DemoTip;
  discountCents: number;
  dispatch: Dispatch<DemoAction>;
}) {
  return (
    <Section id="adjustments" title="Tax, tip & discount">
      <div className="space-y-3">
        <DollarField
          id="tax"
          label="Tax ($)"
          initialCents={taxCents}
          onValid={(cents) => dispatch({ type: "setTax", cents })}
        />
        <TipField tip={tip} dispatch={dispatch} />
        <DollarField
          id="discount"
          label="Discount ($)"
          initialCents={discountCents}
          onValid={(cents) => dispatch({ type: "setDiscount", cents })}
        />
      </div>
    </Section>
  );
}
