import { useState, type Dispatch } from "react";
import { Icon } from "@/components/ui/Icon";
import { MoneyText } from "@/components/ui/MoneyText";
import { itemsSubtotal } from "@/features/demo/state";
import type { BillAction, BillState } from "../state";
import { ItemForm, ItemRow } from "./ItemRow";

function Line({ label, cents, negative }: { label: string; cents: number; negative?: boolean }) {
  return (
    <div className="flex justify-between py-0.5 text-sm text-paper-fg/75">
      <dt>{label}</dt>
      <dd className="font-mono tabular-nums">
        {negative && cents > 0 ? "−" : ""}
        <MoneyText cents={cents} />
      </dd>
    </div>
  );
}

/** Paper-receipt style, editable item list with the bill's totals at the bottom. */
export function ReceiptPaper({
  state,
  tipCents,
  billTotalCents,
  dispatch,
  startAdding,
}: {
  state: BillState;
  tipCents: number;
  billTotalCents: number | null;
  dispatch: Dispatch<BillAction>;
  startAdding: boolean;
}) {
  const [adding, setAdding] = useState(startAdding);
  const subtotal = itemsSubtotal(state.items).cents;

  return (
    <div className="paper-shadow">
      <div className="receipt-paper px-5 pb-8 pt-7 sm:px-6">
        <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-paper-fg/60">
          {state.merchant ?? "Your receipt"}
        </p>
        <div className="my-4 border-t border-dashed border-paper-fg/30" />

        {state.items.length === 0 && !adding ? (
          <p className="py-4 text-center text-sm text-paper-fg/60">No items yet. Add what you ordered.</p>
        ) : null}
        <ul aria-label="Receipt items" className="divide-y divide-dashed divide-paper-fg/15">
          {state.items.map((item) => (
            <ItemRow key={item.id} item={item} dispatch={dispatch} />
          ))}
        </ul>

        {adding ? (
          <div className="border-t border-dashed border-paper-fg/15">
            <ItemForm
              idPrefix="new-item"
              submitLabel="Add item"
              autoFocus
              onSubmit={(name, priceCents) => dispatch({ type: "addItem", name, priceCents })}
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          <Icon name={adding ? "minus" : "plus"} className="h-4 w-4" />
          {adding ? "Done adding" : "Add item"}
        </button>

        <div className="my-4 border-t border-dashed border-paper-fg/30" />
        <dl>
          <Line label="Subtotal" cents={subtotal} />
          <Line label="Tax" cents={state.taxCents} />
          <Line label="Tip" cents={tipCents} />
          {state.feeCents > 0 ? <Line label="Fees" cents={state.feeCents} /> : null}
          {state.discountCents > 0 ? <Line label="Discount" cents={state.discountCents} negative /> : null}
          <div className="mt-2 flex items-baseline justify-between border-t border-paper-fg/80 pt-2">
            <dt className="font-mono text-sm font-bold uppercase tracking-wider">Total</dt>
            <dd className="font-mono text-xl font-bold tabular-nums" aria-live="polite">
              {billTotalCents === null ? "—" : <MoneyText cents={billTotalCents} />}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
