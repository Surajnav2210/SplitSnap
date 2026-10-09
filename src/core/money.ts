// Core money type. Pure functions only: no I/O, no floats.
// Every amount is an integer number of minor units (cents) plus its currency.

export type Currency = "USD";

export interface Money {
  readonly cents: number;
  readonly currency: Currency;
}

export function money(cents: number, currency: Currency = "USD"): Money {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Money must be a safe integer number of cents, got ${cents}`);
  }
  return { cents, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: cannot add ${a.currency} to ${b.currency}`);
  }
  return money(a.cents + b.cents, a.currency);
}
