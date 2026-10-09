import { useState, type Dispatch } from "react";
import { normalizeHandle, type PaymentApp, type PaymentHandles } from "@/core/paymentLinks";
import { PrefixedInput } from "../fields";
import type { BillAction } from "../state";

const FIELDS: readonly { app: PaymentApp; label: string; prefix: string; pad: string; placeholder: string }[] = [
  { app: "venmo", label: "Venmo username", prefix: "@", pad: "pl-8", placeholder: "alex-k" },
  { app: "paypal", label: "PayPal.me handle", prefix: "paypal.me/", pad: "pl-[5.6rem]", placeholder: "alexk" },
  { app: "cashapp", label: "Cash App $cashtag", prefix: "$", pad: "pl-8", placeholder: "alexk" },
];

/** Host's payment handles. All optional; invalid ones are flagged and skipped. */
export function HandlesForm({ handles, dispatch }: { handles: PaymentHandles; dispatch: Dispatch<BillAction> }) {
  const [draft, setDraft] = useState<PaymentHandles>(handles);

  return (
    <section aria-labelledby="handles-heading" className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <h2 id="handles-heading" className="text-base font-semibold text-fg">How should people pay you?</h2>
      <p className="mt-0.5 text-sm text-muted">All optional. We only use these to build pay links.</p>
      <div className="mt-4 space-y-3">
        {FIELDS.map((f) => {
          const value = draft[f.app] ?? "";
          const invalid = value.trim() !== "" && normalizeHandle(f.app, value) === null;
          return (
            <div key={f.app}>
              <label htmlFor={`handle-${f.app}`} className="mb-1.5 block text-sm font-medium text-fg">
                {f.label}
              </label>
              <PrefixedInput
                id={`handle-${f.app}`}
                prefix={f.prefix}
                padClass={f.pad}
                value={value}
                placeholder={f.placeholder}
                autoCapitalize="none"
                spellCheck={false}
                error={invalid ? "Use only letters, numbers, - _ or ." : null}
                onChange={(e) => {
                  const next = { ...draft, [f.app]: e.target.value };
                  setDraft(next);
                  dispatch({ type: "setHandles", handles: next });
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
