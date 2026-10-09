import { useState, type Dispatch } from "react";
import { Plus } from "lucide-react";
import { MoneyText } from "@/components/ui/money-text";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { itemsSubtotal } from "@/features/demo/state";
import type { BillAction, BillItem, BillState } from "../state";
import { MAX_UNITS } from "../state";
import { AddItemForm, EditItemForm, ItemRow } from "./ItemRow";

function Line({ label, cents, negative }: { label: string; cents: number; negative?: boolean }) {
  return (
    <div className="flex justify-between py-0.5 font-mono text-[13px] text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">
        {negative && cents > 0 ? "−" : ""}
        <MoneyText cents={cents} />
      </dd>
    </div>
  );
}

/** Receipt-style, editable item list with the bill's totals at the bottom. Edits open a bottom sheet. */
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
  const [editingId, setEditingId] = useState<string | null>(null);
  // Keep the last edited item around while the sheet animates closed.
  const [sheetItem, setSheetItem] = useState<BillItem | null>(null);
  const subtotal = itemsSubtotal(state.items).cents;
  const editing = state.items.find((i) => i.id === editingId) ?? null;

  function openEditor(item: BillItem) {
    setSheetItem(item);
    setEditingId(item.id);
  }

  return (
    <>
      <div className="paper-edge">
        <div className="receipt-paper px-5 pb-8 pt-8 sm:px-7">
          <p className="text-center font-mono text-xs font-medium uppercase tracking-[0.18em] text-foreground">
            {state.merchant ?? "Your receipt"}
          </p>
          <p className="mt-1 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {state.items.length} {state.items.length === 1 ? "item" : "items"}
          </p>
          <div className="my-5 border-t border-dashed border-input" />

          {state.items.length === 0 && !adding ? (
            <p className="py-4 text-center font-mono text-[13px] text-muted-foreground">No items yet.</p>
          ) : null}
          <ul aria-label="Receipt items">
            {state.items.map((item) => (
              <ItemRow key={item.id} item={item} onEdit={() => openEditor(item)} dispatch={dispatch} />
            ))}
          </ul>

          {adding ? (
            <AddItemForm autoFocus onAdd={(name, priceCents) => dispatch({ type: "addItem", name, priceCents })} />
          ) : null}
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="-mx-2 mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent hover:bg-muted"
          >
            {adding ? null : <Plus aria-hidden="true" className="size-4" />}
            {adding ? "Done adding" : "Add item"}
          </button>

          <div className="my-5 border-t border-dashed border-input" />
          <dl>
            <Line label="Subtotal" cents={subtotal} />
            <Line label="Tax" cents={state.taxCents} />
            <Line label="Tip" cents={tipCents} />
            {state.feeCents > 0 ? <Line label="Fees" cents={state.feeCents} /> : null}
            {state.discountCents > 0 ? <Line label="Discount" cents={state.discountCents} negative /> : null}
            <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-input pt-3">
              <dt className="font-mono text-sm font-semibold uppercase tracking-[0.12em]">Total</dt>
              <dd className="font-mono text-2xl font-semibold tracking-[-0.02em]" aria-live="polite">
                {billTotalCents === null ? "—" : <MoneyText cents={billTotalCents} smallCents />}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <Drawer open={editing !== null} onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}>
        <DrawerContent>
          <DrawerHeader className="pt-5">
            <DrawerTitle>Edit item</DrawerTitle>
            <DrawerDescription>Fix the name or price. Changes update everyone&apos;s share.</DrawerDescription>
          </DrawerHeader>
          {sheetItem ? (
            <EditItemForm
              key={sheetItem.id}
              item={editing ?? sheetItem}
              onSave={(name, priceCents) => {
                dispatch({ type: "editItem", id: sheetItem.id, name, priceCents });
                setEditingId(null);
              }}
              onDelete={() => {
                dispatch({ type: "removeItem", id: sheetItem.id });
                setEditingId(null);
              }}
              onSplit={
                sheetItem.quantity > 1 && sheetItem.quantity <= MAX_UNITS
                  ? () => {
                      dispatch({ type: "splitItemIntoUnits", itemId: sheetItem.id });
                      setEditingId(null);
                    }
                  : null
              }
            />
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
