// Form fields shared by the /split steps. Inputs keep their own text drafts and
// report parsed integer cents upward only when the text is valid.

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { money } from "@/core/money";
import { formatCents, parseDollars } from "@/core/parse";
import { cx } from "@/components/ui/cx";

export const inputClass =
  "block w-full min-w-0 rounded-xl border border-line-strong bg-elevated px-3.5 py-2.5 text-base text-fg " +
  "placeholder:text-muted/70 transition-shadow focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/20 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

/** "1234.5" style text for an input: no "$", empty for zero. */
export function centsToInput(cents: number): string {
  return cents === 0 ? "" : formatCents(money(cents)).slice(1).replace(/,/g, "");
}

export type Parsed = { value: number; error: null } | { value: null; error: string };

/** Parse a field where empty means 0. Parser errors are RangeErrors with user-safe text. */
export function parseOrZero(text: string, parse: (s: string) => number): Parsed {
  if (text.trim() === "") return { value: 0, error: null };
  try {
    return { value: parse(text), error: null };
  } catch (err) {
    if (err instanceof RangeError) return { value: null, error: err.message };
    throw err;
  }
}

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

/** Text input with an inline prefix (e.g. "$" or "@") and an optional error. */
export function PrefixedInput({
  prefix,
  error,
  padClass = "pl-8",
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  prefix: ReactNode;
  error?: string | null;
  /** Left padding that clears the prefix, e.g. "pl-24" for "paypal.me/". */
  padClass?: string;
}) {
  const errorId = useId();
  return (
    <div>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-medium text-muted"
        >
          {prefix}
        </span>
        <input
          className={cx(inputClass, padClass, className)}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
      </div>
      <FieldError id={errorId} message={error ?? null} />
    </div>
  );
}

/** Dollar input that reports valid cents (empty = 0) via onValid. */
export function MoneyField({
  label,
  initialCents,
  onValid,
  hint,
}: {
  label: string;
  initialCents: number;
  onValid: (cents: number) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  const [text, setText] = useState(() => centsToInput(initialCents));
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-fg">
        {label}
        {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
      </label>
      <PrefixedInput
        id={id}
        prefix="$"
        value={text}
        inputMode="decimal"
        placeholder="0.00"
        error={error}
        className="tabular-nums"
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseOrZero(e.target.value, parseDollars);
          setError(parsed.error);
          if (parsed.value !== null) onValid(parsed.value);
        }}
      />
    </div>
  );
}
