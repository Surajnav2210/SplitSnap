import { describe, expect, it } from "vitest";
import { money, type Money } from "./money";
import { buildVenmoRequestLink, hasPaymentHandle } from "./paymentLinks";

describe("buildVenmoRequestLink", () => {
  it("builds a Venmo charge link with the amount and an encoded note", () => {
    expect(buildVenmoRequestLink("sam-k", money(1234), "SplitSnap: Corner Bistro")).toBe(
      "https://venmo.com/sam-k?txn=charge&amount=12.34&note=SplitSnap%3A%20Corner%20Bistro",
    );
  });

  it("strips a leading @ and surrounding whitespace", () => {
    expect(buildVenmoRequestLink("  @sam ", money(500), "x")).toBe("https://venmo.com/sam?txn=charge&amount=5.00&note=x");
  });

  it("formats small and large amounts with integer math", () => {
    expect(buildVenmoRequestLink("sam", money(1), "x")).toBe("https://venmo.com/sam?txn=charge&amount=0.01&note=x");
    expect(buildVenmoRequestLink("sam", money(100), "x")).toBe("https://venmo.com/sam?txn=charge&amount=1.00&note=x");
    expect(buildVenmoRequestLink("sam", money(9_999_999_999), "x")).toBe(
      "https://venmo.com/sam?txn=charge&amount=99999999.99&note=x",
    );
  });

  it("URL-encodes &, #, ? and emoji in the note so they can't add parameters", () => {
    expect(buildVenmoRequestLink("sam", money(1), "Tacos & beer #1? 🌮")).toBe(
      "https://venmo.com/sam?txn=charge&amount=0.01&note=Tacos%20%26%20beer%20%231%3F%20%F0%9F%8C%AE",
    );
  });

  it("returns null for a zero or negative amount", () => {
    expect(buildVenmoRequestLink("sam", money(0), "x")).toBeNull();
    expect(buildVenmoRequestLink("sam", money(-100), "x")).toBeNull();
  });

  it("returns null for an empty or unsafe username", () => {
    for (const bad of ["", "   ", "@", "sam k", "sam/../x", "sam?txn=pay", "sam#", "$sam", "a".repeat(65)]) {
      expect(buildVenmoRequestLink(bad, money(500), "x")).toBeNull();
    }
    expect(buildVenmoRequestLink("a".repeat(64), money(500), "x")).toBe(
      `https://venmo.com/${"a".repeat(64)}?txn=charge&amount=5.00&note=x`,
    );
  });

  it("rejects non-USD amounts", () => {
    const eur = { cents: 500, currency: "EUR" } as unknown as Money;
    expect(() => buildVenmoRequestLink("sam", eur, "x")).toThrow(/currency/i);
  });
});

describe("hasPaymentHandle", () => {
  it("is true only when some handle is usable", () => {
    expect(hasPaymentHandle({})).toBe(false);
    expect(hasPaymentHandle({ venmo: "", paypal: "  ", cashapp: undefined })).toBe(false);
    expect(hasPaymentHandle({ venmo: "bad handle" })).toBe(false);
    expect(hasPaymentHandle({ cashapp: "$alex" })).toBe(true);
    expect(hasPaymentHandle({ venmo: "bad handle", paypal: "alexk" })).toBe(true);
  });
});
