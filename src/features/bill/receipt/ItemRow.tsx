import { useState, type Dispatch, type FormEvent } from "react";
import { parseDollars } from "@/core/parse";
import { Icon } from "@/components/ui/Icon";
import { MoneyText } from "@/components/ui/MoneyText";
import { FieldError, centsToInput, inputClass } from "../fields";
import { MAX_ITEM_NAME_LENGTH, MAX_UNITS, type BillAction, type BillItem } from "../state";

const iconButton =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-paper-fg/60 hover:bg-paper-fg/5 hover:text-paper-fg";
const paperInput = `${inputClass} border-paper-fg/20 bg-white text-paper-fg`;

/** Shared add/edit form: name + price. */
export function ItemForm({
  idPrefix,
  initialName = "",
  initialCents,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  autoFocus,
}: {
  idPrefix: string;
  initialName?: string;
  initialCents?: number;
  submitLabel: string;
  onSubmit: (name: string, cents: number) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(initialCents === undefined ? "" : centsToInput(initialCents));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === "") return setError("Enter an item name.");
    let cents: number;
    try {
      cents = parseDollars(price === "" ? "0" : price);
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      return setError(err.message);
    }
    setError(null);
    onSubmit(name, cents);
    if (!onCancel) {
      setName("");
      setPrice("");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
      noValidate
      className="py-2"
    >
      <div className="flex gap-2">
        <label htmlFor={`${idPrefix}-name`} className="sr-only">Item name</label>
        <input
          id={`${idPrefix}-name`}
          className={`${paperInput} flex-1`}
          value={name}
          maxLength={MAX_ITEM_NAME_LENGTH}
          placeholder="Item"
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor={`${idPrefix}-price`} className="sr-only">Price in dollars</label>
        <input
          id={`${idPrefix}-price`}
          className={`${paperInput} w-24 shrink-0 text-right font-mono tabular-nums`}
          value={price}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <FieldError id={`${idPrefix}-error`} message={error} />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" className="min-h-11 rounded-xl bg-paper-fg px-4 text-sm font-semibold text-paper">
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-paper-fg/70 hover:bg-paper-fg/5">
            Cancel
          </button>
        ) : null}
        {onDelete ? (
          <button type="button" onClick={onDelete} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
            <Icon name="trash" className="h-4 w-4" /> Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ItemRow({ item, dispatch }: { item: BillItem; dispatch: Dispatch<BillAction> }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <ItemForm
          idPrefix={`edit-${item.id}`}
          initialName={item.name}
          initialCents={item.priceCents}
          submitLabel="Save"
          autoFocus
          onSubmit={(name, priceCents) => {
            dispatch({ type: "editItem", id: item.id, name, priceCents });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={() => dispatch({ type: "removeItem", id: item.id })}
        />
      </li>
    );
  }

  const canSplit = item.quantity > 1 && item.quantity <= MAX_UNITS;
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${item.name}`}
        className="flex min-h-12 min-w-0 flex-1 items-baseline gap-2 rounded-lg py-2 pr-1 text-left hover:bg-paper-fg/[0.04]"
      >
        {item.quantity > 1 ? (
          <span className="font-mono text-sm text-paper-fg/60 tabular-nums">{item.quantity}×</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[15px]">{item.name}</span>
        <span className="font-mono text-[15px] tabular-nums">
          <MoneyText cents={item.priceCents} />
        </span>
      </button>
      {canSplit ? (
        <button
          type="button"
          onClick={() => dispatch({ type: "splitItemIntoUnits", itemId: item.id })}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          <Icon name="scissors" className="h-4 w-4" />
          Split into {item.quantity}
        </button>
      ) : (
        <button type="button" aria-label={`Remove ${item.name}`} onClick={() => dispatch({ type: "removeItem", id: item.id })} className={iconButton}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
