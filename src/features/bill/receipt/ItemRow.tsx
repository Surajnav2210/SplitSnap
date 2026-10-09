import { useId, useState, type Dispatch, type FormEvent } from "react";
import { ChevronRight, Plus, Scissors, Trash2 } from "lucide-react";
import { parseDollars } from "@/core/parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyText } from "@/components/ui/money-text";
import { FieldError, centsToInput } from "../fields";
import { MAX_ITEM_NAME_LENGTH, MAX_UNITS, type BillAction, type BillItem } from "../state";

/** Parse the price text; empty means $0.00. Returns an error message instead of throwing for bad input. */
function readPrice(text: string): { cents: number; error: null } | { cents: null; error: string } {
  try {
    return { cents: parseDollars(text === "" ? "0" : text), error: null };
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    return { cents: null, error: err.message };
  }
}

/** Quick-add row at the bottom of the receipt: name + price + add. */
export function AddItemForm({ onAdd, autoFocus }: { onAdd: (name: string, cents: number) => void; autoFocus?: boolean }) {
  const id = useId();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === "") return setError("Enter an item name.");
    const parsed = readPrice(price);
    if (parsed.error !== null) return setError(parsed.error);
    setError(null);
    onAdd(name, parsed.cents);
    setName("");
    setPrice("");
    document.getElementById(`${id}-name`)?.focus();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="pt-3">
      <div className="flex gap-2">
        <label htmlFor={`${id}-name`} className="sr-only">Item name</label>
        <Input
          id={`${id}-name`}
          className="flex-1 font-mono"
          value={name}
          maxLength={MAX_ITEM_NAME_LENGTH}
          placeholder="Item"
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor={`${id}-price`} className="sr-only">Price in dollars</label>
        <Input
          id={`${id}-price`}
          className="w-24 shrink-0 text-right font-mono tabular-nums"
          value={price}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Button type="submit" size="icon" aria-label="Add item" className="shrink-0">
          <Plus />
        </Button>
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </form>
  );
}

/** Edit form shown in the bottom sheet. */
export function EditItemForm({
  item,
  onSave,
  onDelete,
  onSplit,
}: {
  item: BillItem;
  onSave: (name: string, cents: number) => void;
  onDelete: () => void;
  onSplit: (() => void) | null;
}) {
  const id = useId();
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(centsToInput(item.priceCents));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === "") return setError("Enter an item name.");
    const parsed = readPrice(price);
    if (parsed.error !== null) return setError(parsed.error);
    setError(null);
    onSave(name, parsed.cents);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 px-5 pt-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>Item</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={MAX_ITEM_NAME_LENGTH}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-price`}>Price{item.quantity > 1 ? ` (all ${item.quantity})` : ""}</Label>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted-foreground">$</span>
          <Input
            id={`${id}-price`}
            className="pl-7 font-mono tabular-nums"
            value={price}
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <FieldError id={`${id}-error`} message={error} />
      </div>
      {onSplit ? (
        <button
          type="button"
          onClick={onSplit}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[10px] border border-border px-3.5 text-left text-sm hover:bg-muted"
        >
          <Scissors aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="flex-1">
            Split into {item.quantity} separate lines
            <span className="block text-xs text-muted-foreground">So people can claim one each</span>
          </span>
        </button>
      ) : null}
      <div className="flex flex-col gap-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <Button type="submit" size="lg" className="w-full">Save</Button>
        <Button type="button" variant="destructive" className="w-full" onClick={onDelete}>
          <Trash2 aria-hidden="true" /> Delete item
        </Button>
      </div>
    </form>
  );
}

/** One receipt line. Tapping it opens the edit sheet. */
export function ItemRow({
  item,
  onEdit,
  dispatch,
}: {
  item: BillItem;
  onEdit: () => void;
  dispatch: Dispatch<BillAction>;
}) {
  const canSplit = item.quantity > 1 && item.quantity <= MAX_UNITS;
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${item.name}`}
        className="group -mx-2 flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-baseline gap-2 rounded-md px-2 py-2.5 text-left font-mono text-[14px] hover:bg-muted"
      >
        {item.quantity > 1 ? (
          <span className="shrink-0 tabular-nums text-muted-foreground">{item.quantity}×</span>
        ) : null}
        <span className="min-w-0 truncate">{item.name}</span>
        <span aria-hidden="true" className="mb-1 min-w-4 flex-1 border-b border-dotted border-input" />
        <MoneyText cents={item.priceCents} className="shrink-0" />
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 self-center text-muted-foreground/60 group-hover:text-foreground" />
      </button>
      {canSplit ? (
        <button
          type="button"
          onClick={() => dispatch({ type: "splitItemIntoUnits", itemId: item.id })}
          className="-mt-1 mb-1 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md text-[13px] font-medium text-accent hover:underline"
        >
          <Scissors aria-hidden="true" className="size-3.5" />
          Split into {item.quantity} so people can claim one each
        </button>
      ) : null}
    </li>
  );
}
