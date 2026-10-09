import { describe, expect, it } from "vitest";
import { money } from "./money";
import { formatCents, formatPercent, parseDollars, parsePercent, percentOf } from "./parse";

describe("parseDollars", () => {
  it.each([
    ["12", 1200],
    ["12.3", 1230],
    ["12.34", 1234],
    ["$12.34", 1234],
    [" 1,234.50 ", 123450],
    [".5", 50],
    ["0.05", 5],
    ["0", 0],
    ["007.10", 710],
    ["1,234,567.89", 123456789],
    ["9999999.99", 999999999],
    ["$9,999,999.99", 999999999],
  ])("parses %j as %i cents", (input, expected) => {
    expect(parseDollars(input)).toBe(expected);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(() => parseDollars("")).toThrow(RangeError);
    expect(() => parseDollars("   ")).toThrow(RangeError);
    expect(() => parseDollars("$")).toThrow(RangeError);
  });

  it("rejects negative amounts", () => {
    expect(() => parseDollars("-1")).toThrow(RangeError);
    expect(() => parseDollars("-0.50")).toThrow(RangeError);
    expect(() => parseDollars("$-5")).toThrow(RangeError);
  });

  it("rejects more than 2 decimal places", () => {
    expect(() => parseDollars("1.234")).toThrow(/2 decimal/);
    expect(() => parseDollars("0.001")).toThrow(RangeError);
  });

  it("rejects letters", () => {
    expect(() => parseDollars("abc")).toThrow(RangeError);
    expect(() => parseDollars("12a")).toThrow(RangeError);
    expect(() => parseDollars("1e3")).toThrow(RangeError);
    expect(() => parseDollars("USD 12")).toThrow(RangeError);
  });

  it("rejects multiple dots and a bare or trailing dot", () => {
    expect(() => parseDollars("1.2.3")).toThrow(RangeError);
    expect(() => parseDollars("12..3")).toThrow(RangeError);
    expect(() => parseDollars(".")).toThrow(RangeError);
    expect(() => parseDollars("12.")).toThrow(RangeError);
  });

  it("rejects badly grouped commas", () => {
    expect(() => parseDollars("1,23")).toThrow(RangeError);
    expect(() => parseDollars(",123")).toThrow(RangeError);
    expect(() => parseDollars("1234,567")).toThrow(RangeError);
  });

  it("rejects values above $9,999,999.99", () => {
    expect(() => parseDollars("10000000")).toThrow(/too large/);
    expect(() => parseDollars("10,000,000.00")).toThrow(/too large/);
    expect(() => parseDollars("99999999999999999999")).toThrow(/too large/);
  });
});

describe("percentOf", () => {
  it("18% of $50.00 is $9.00", () => {
    expect(percentOf(money(5000), 1800)).toEqual(money(900));
  });

  it("18% of $33.33 rounds 599.94 up to 600", () => {
    expect(percentOf(money(3333), 1800).cents).toBe(600);
  });

  it("rounds an exact half cent up", () => {
    // 2% of 25 cents = 0.5 cents -> 1
    expect(percentOf(money(25), 200).cents).toBe(1);
    // 10% of $1.05 = 10.5 cents -> 11
    expect(percentOf(money(105), 1000).cents).toBe(11);
  });

  it("rounds just below a half cent down", () => {
    // 18% of $0.02 = 0.36 cents -> 0; 18% of $0.03 = 0.54 -> 1
    expect(percentOf(money(2), 1800).cents).toBe(0);
    expect(percentOf(money(3), 1800).cents).toBe(1);
  });

  it("handles fractional percents (8.25% tax)", () => {
    // 8.25% of $110.49 = 911.5425 -> 912
    expect(percentOf(money(11049), 825).cents).toBe(912);
  });

  it("0% is always zero", () => {
    expect(percentOf(money(123456), 0)).toEqual(money(0));
  });

  it("100% returns the same amount", () => {
    expect(percentOf(money(12345), 10000).cents).toBe(12345);
  });

  it("handles large values without precision loss", () => {
    // 18% of $99,999,999.99 = 1,799,999,999.82 cents -> 1,800,000,000
    expect(percentOf(money(9_999_999_999), 1800).cents).toBe(1_800_000_000);
    // Product exceeds 2^53 but BigInt keeps it exact.
    expect(percentOf(money(Number.MAX_SAFE_INTEGER), 1).cents).toBe(900719925474);
  });

  it("rounds negative amounts symmetrically", () => {
    expect(percentOf(money(-105), 1000).cents).toBe(-11);
    expect(Object.is(percentOf(money(-2), 1800).cents, 0)).toBe(true);
  });

  it("rejects negative and non-integer percents", () => {
    expect(() => percentOf(money(100), -1)).toThrow(RangeError);
    expect(() => percentOf(money(100), 18.5)).toThrow(RangeError);
    expect(() => percentOf(money(100), Number.NaN)).toThrow(RangeError);
  });

  it("preserves currency", () => {
    expect(percentOf(money(100, "USD"), 5000).currency).toBe("USD");
  });
});

describe("parsePercent", () => {
  it.each([
    ["18", 1800],
    ["18.5", 1850],
    ["18.25", 1825],
    ["18%", 1800],
    [" 8.25 ", 825],
    ["0", 0],
    [".5", 50],
    ["100", 10000],
    ["100.00", 10000],
  ])("parses %j as %i hundredths", (input, expected) => {
    expect(parsePercent(input)).toBe(expected);
  });

  it("rejects empty input", () => {
    expect(() => parsePercent("")).toThrow(RangeError);
    expect(() => parsePercent("%")).toThrow(RangeError);
  });

  it("rejects more than 2 decimals", () => {
    expect(() => parsePercent("18.125")).toThrow(/2 decimal/);
  });

  it("rejects values outside 0–100%", () => {
    expect(() => parsePercent("-1")).toThrow(RangeError);
    expect(() => parsePercent("100.01")).toThrow(RangeError);
    expect(() => parsePercent("250")).toThrow(RangeError);
    expect(() => parsePercent("99999999999999999999")).toThrow(RangeError);
  });

  it("rejects letters, multiple dots, and a trailing dot", () => {
    expect(() => parsePercent("abc")).toThrow(RangeError);
    expect(() => parsePercent("1.2.3")).toThrow(RangeError);
    expect(() => parsePercent("18.")).toThrow(RangeError);
    expect(() => parsePercent("1e2")).toThrow(RangeError);
  });
});

describe("formatCents", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [50, "$0.50"],
    [100, "$1.00"],
    [123456, "$1,234.56"],
    [100000000, "$1,000,000.00"],
    [999999999, "$9,999,999.99"],
    [-100, "-$1.00"],
    [-123456, "-$1,234.56"],
    [Number.MAX_SAFE_INTEGER, "$90,071,992,547,409.91"],
  ])("formats %i as %s", (cents, expected) => {
    expect(formatCents(money(cents))).toBe(expected);
  });

  it("round-trips with parseDollars", () => {
    for (const c of [0, 1, 99, 100, 123456, 999999999]) {
      expect(parseDollars(formatCents(money(c)))).toBe(c);
    }
  });
});

describe("formatPercent", () => {
  it.each([
    [0, "0"],
    [1800, "18"],
    [1850, "18.5"],
    [1825, "18.25"],
    [825, "8.25"],
    [5, "0.05"],
    [10000, "100"],
  ])("formats %i as %s", (hundredths, expected) => {
    expect(formatPercent(hundredths)).toBe(expected);
  });

  it("round-trips with parsePercent", () => {
    for (const h of [0, 1, 50, 825, 1800, 1850, 9999, 10000]) {
      expect(parsePercent(formatPercent(h))).toBe(h);
    }
  });

  it("rejects negative and non-integer input", () => {
    expect(() => formatPercent(-1)).toThrow(RangeError);
    expect(() => formatPercent(1.5)).toThrow(RangeError);
  });
});
