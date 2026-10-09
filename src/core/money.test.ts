import { describe, expect, it } from "vitest";
import { addMoney, money, type Money } from "./money";

describe("money", () => {
  it("creates an amount from integer cents, defaulting to USD", () => {
    expect(money(1234)).toEqual({ cents: 1234, currency: "USD" });
  });

  it("allows zero and negative amounts", () => {
    expect(money(0).cents).toBe(0);
    expect(money(-500).cents).toBe(-500);
  });

  it("rejects fractional cents", () => {
    expect(() => money(10.5)).toThrow(RangeError);
  });

  it("rejects NaN, Infinity, and unsafe integers", () => {
    expect(() => money(Number.NaN)).toThrow(RangeError);
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe("addMoney", () => {
  it("adds amounts in the same currency exactly", () => {
    expect(addMoney(money(10), money(20))).toEqual(money(30));
  });

  it("handles large bills without precision loss", () => {
    expect(addMoney(money(9_999_999), money(1)).cents).toBe(10_000_000);
  });

  it("refuses to add different currencies", () => {
    const eur = { cents: 100, currency: "EUR" } as unknown as Money;
    expect(() => addMoney(money(100), eur)).toThrow(/Currency mismatch/);
  });

  it("throws if the sum leaves the safe integer range", () => {
    expect(() => addMoney(money(Number.MAX_SAFE_INTEGER), money(1))).toThrow(RangeError);
  });
});
