// Form fields shared by the /split steps. Inputs keep their own text drafts and
// report parsed integer cents upward only when the text is valid.

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { money } from "@/core/money";
import { formatCents, parseDollars } from "@/core/parse";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-destructive">
      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
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
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[15px] text-muted-foreground"
        >
          {prefix}
        </span>
        <Input
          className={cn(padClass, className)}
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
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-foreground">
        {label}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </label>
      <PrefixedInput
        id={id}
        prefix="$"
        padClass="pl-7"
        value={text}
        inputMode="decimal"
        placeholder="0.00"
        error={error}
        className="font-mono tabular-nums"
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
