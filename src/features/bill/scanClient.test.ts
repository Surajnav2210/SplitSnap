import { describe, expect, it } from "vitest";
import { fitWithin, parseScanResponse } from "./scanClient";

const receipt = {
  merchant: "Corner Bistro",
  currency: "USD",
  items: [{ name: "Beer", quantity: 3, priceCents: 1800 }],
  taxCents: 150,
  tipCents: 0,
  feeCents: 0,
  discountCents: 0,
  receiptTotalCents: 1950,
  warnings: [],
};

describe("parseScanResponse", () => {
  it("accepts a valid success body", () => {
    expect(parseScanResponse({ ok: true, receipt })).toEqual({ ok: true, receipt });
  });

  it("accepts a valid failure body and keeps its message", () => {
    const body = { ok: false, code: "QUOTA", message: "Scanning is busy, try later." };
    expect(parseScanResponse(body)).toEqual(body);
  });

  it("rejects float cents, negative cents, and bad quantities", () => {
    for (const bad of [
      { ...receipt, taxCents: 1.5 },
      { ...receipt, tipCents: -1 },
      { ...receipt, items: [{ name: "x", quantity: 0, priceCents: 1 }] },
      { ...receipt, currency: "EUR" },
    ]) {
      const result = parseScanResponse({ ok: true, receipt: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("BAD_RESPONSE");
    }
  });

  it("rejects unknown codes and junk", () => {
    for (const body of [null, "hello", 42, {}, { ok: false, code: "NOPE", message: "x" }]) {
      const result = parseScanResponse(body);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("BAD_RESPONSE");
    }
  });
});

describe("fitWithin", () => {
  it("leaves small images alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales the long edge down to the max, keeping aspect ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(10000, 10)).toEqual({ width: 1600, height: 2 });
    expect(fitWithin(100000, 1)).toEqual({ width: 1600, height: 1 });
  });

  it("rejects empty images", () => {
    expect(() => fitWithin(0, 100)).toThrow(RangeError);
  });
});
