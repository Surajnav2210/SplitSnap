import { useState, type Dispatch, type FormEvent } from "react";
import { money } from "@/core/money";
import { formatCents, parseDollars } from "@/core/parse";
import type { DemoAction, DemoItem } from "./state";
import {
  EmptyNote,
  FieldError,
  Section,
  errorMessage,
  inputClass,
  primaryButtonClass,
} from "./ui";

const MAX_ITEM_NAME_LENGTH = 60;

export function ItemsSection({
  items,
  dispatch,
}: {
  items: readonly DemoItem[];
  dispatch: Dispatch<DemoAction>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextNameError = name.trim() === "" ? "Enter an item name." : null;
    let priceCents: number | null = null;
    let nextPriceError: string | null = null;
    try {
      priceCents = parseDollars(price);
    } catch (err) {
      nextPriceError = errorMessage(err);
    }
    setNameError(nextNameError);
    setPriceError(nextPriceError);
    if (nextNameError || priceCents === null) return;

    dispatch({ type: "addItem", name, priceCents });
    setName("");
    setPrice("");
  }

  return (
    <Section id="items" title="Items" description="What's on the receipt?">
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="item-name" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Item
            </label>
            <input
              id="item-name"
              className={inputClass}
              value={name}
              maxLength={MAX_ITEM_NAME_LENGTH}
              placeholder="Margherita pizza"
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "item-name-error" : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
            />
          </div>
          <div className="w-28 shrink-0">
            <label htmlFor="item-price" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Price ($)
            </label>
            <input
              id="item-price"
              className={inputClass}
              value={price}
              inputMode="decimal"
              placeholder="18.50"
              autoComplete="off"
              aria-invalid={priceError ? true : undefined}
              aria-describedby={priceError ? "item-price-error" : undefined}
              onChange={(e) => {
                setPrice(e.target.value);
                setPriceError(null);
              }}
            />
          </div>
        </div>
        <FieldError id="item-name-error" message={nameError} />
        <FieldError id="item-price-error" message={priceError} />
        <button type="submit" className={`${primaryButtonClass} mt-2 w-full`}>
          Add item
        </button>
      </form>

      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyNote>No items yet.</EmptyNote>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800" aria-label="Receipt items">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-zinc-900 dark:text-zinc-100">
                {item.name}
              </span>
              <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                {formatCents(money(item.priceCents))}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                onClick={() => dispatch({ type: "removeItem", id: item.id })}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
