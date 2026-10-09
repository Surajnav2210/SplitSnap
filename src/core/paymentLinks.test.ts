import { describe, expect, it } from "vitest";
import { money } from "./money";
import { buildPaymentLinks, formatAmountForUrl, normalizeHandle } from "./paymentLinks";

describe("formatAmountForUrl", () => {
  it("formats cents with integer math", () => {
    expect(formatAmountForUrl(money(1234))).toBe("12.34");
    expect(formatAmountForUrl(money(5))).toBe("0.05");
    expect(formatAmountForUrl(money(100))).toBe("1.00");
    expect(formatAmountForUrl(money(0))).toBe("0.00");
    expect(formatAmountForUrl(money(9_999_999))).toBe("99999.99");
  });

  it("rejects negative amounts", () => {
    expect(() => formatAmountForUrl(money(-1))).toThrow(RangeError);
  });
});

describe("normalizeHandle", () => {
  it("strips the app's prefix and whitespace", () => {
    expect(normalizeHandle("venmo", "  @alex-k ")).toBe("alex-k");
    expect(normalizeHandle("cashapp", "$alex")).toBe("alex");
    expect(normalizeHandle("paypal", "https://www.paypal.me/alex.k")).toBe("alex.k");
    expect(normalizeHandle("paypal", "paypal.me/alex_k")).toBe("alex_k");
  });

  it("only strips the prefix belonging to that app", () => {
    expect(normalizeHandle("venmo", "$alex")).toBeNull();
    expect(normalizeHandle("cashapp", "@alex")).toBeNull();
  });

  it("rejects empty, too long, or unsafe handles", () => {
    expect(normalizeHandle("venmo", "")).toBeNull();
    expect(normalizeHandle("venmo", "@")).toBeNull();
    expect(normalizeHandle("venmo", "a".repeat(65))).toBeNull();
    expect(normalizeHandle("venmo", "a".repeat(64))).toBe("a".repeat(64));
    for (const bad of ["al ex", "alex/../x", "alex?x=1", "alex#", "álex", "<script>", "a&b"]) {
      expect(normalizeHandle("venmo", bad)).toBeNull();
      expect(normalizeHandle("paypal", bad)).toBeNull();
      expect(normalizeHandle("cashapp", bad)).toBeNull();
    }
  });
});

describe("buildPaymentLinks", () => {
  const all = { venmo: "@alex", paypal: "alexk", cashapp: "$alexk" };

  it("builds Venmo, PayPal and Cash App links in a fixed order", () => {
    expect(buildPaymentLinks(all, money(3420), "SplitSnap: Corner Bistro")).toEqual([
      {
        app: "venmo",
        label: "Venmo",
        url: "https://venmo.com/alex?txn=pay&amount=34.20&note=SplitSnap%3A%20Corner%20Bistro",
      },
      { app: "paypal", label: "PayPal", url: "https://paypal.me/alexk/34.20USD" },
      { app: "cashapp", label: "Cash App", url: "https://cash.app/$alexk/34.20" },
    ]);
  });

  it("URL-encodes the Venmo note, including &, # and emoji", () => {
    const [venmo] = buildPaymentLinks({ venmo: "alex" }, money(1), "Tacos & beer #1 🌮");
    expect(venmo.url).toBe(
      "https://venmo.com/alex?txn=pay&amount=0.01&note=Tacos%20%26%20beer%20%231%20%F0%9F%8C%AE",
    );
  });

  it("returns only the handles provided", () => {
    const links = buildPaymentLinks({ cashapp: "sam" }, money(500), "x");
    expect(links.map((l) => l.app)).toEqual(["cashapp"]);
  });

  it("skips invalid handles without affecting valid ones", () => {
    const links = buildPaymentLinks(
      { venmo: "bad handle", paypal: "", cashapp: "sam" },
      money(500),
      "x",
    );
    expect(links.map((l) => l.app)).toEqual(["cashapp"]);
  });

  it("returns no links for a zero or negative amount", () => {
    expect(buildPaymentLinks(all, money(0), "x")).toEqual([]);
    expect(buildPaymentLinks(all, money(-100), "x")).toEqual([]);
  });

  it("returns no links when no handles are set", () => {
    expect(buildPaymentLinks({}, money(500), "x")).toEqual([]);
  });

  it("handles very large amounts exactly", () => {
    const [paypal] = buildPaymentLinks({ paypal: "a" }, money(9_999_999_999), "x");
    expect(paypal.url).toBe("https://paypal.me/a/99999999.99USD");
  });
});
