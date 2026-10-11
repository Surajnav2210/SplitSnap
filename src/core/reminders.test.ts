import { describe, expect, it } from "vitest";
import { money, type Money } from "./money";
import { reminderText, type ReminderInput } from "./reminders";

const URL = "https://splitsnap.example/b/abcdefghjk";
const base: ReminderInput = {
  guestName: "Sam",
  amount: money(3420),
  merchant: "Corner Bistro",
  handles: { venmo: "@alex", paypal: "alexk", cashapp: "$alexk" },
  billUrl: URL,
};

describe("reminderText", () => {
  it("uses the first available pay link (Venmo first) and the bill link", () => {
    expect(reminderText(base)).toBe(
      "Hi Sam, you owe me $34.20 for Corner Bistro. Pay here: " +
        "https://venmo.com/alex?txn=pay&amount=34.20&note=SplitSnap%3A%20Corner%20Bistro\n" +
        URL,
    );
  });

  it("falls back to PayPal, then Cash App, skipping invalid handles", () => {
    expect(reminderText({ ...base, handles: { venmo: "bad handle", paypal: "alexk" } })).toContain(
      "Pay here: https://paypal.me/alexk/34.20USD\n",
    );
    expect(reminderText({ ...base, handles: { cashapp: "alexk" } })).toContain("Pay here: https://cash.app/$alexk/34.20\n");
  });

  it("omits the pay line when the host has no usable handles", () => {
    expect(reminderText({ ...base, handles: {} })).toBe(`Hi Sam, you owe me $34.20 for Corner Bistro.\n${URL}`);
    expect(reminderText({ ...base, handles: { venmo: "", paypal: "a b" } })).toBe(
      `Hi Sam, you owe me $34.20 for Corner Bistro.\n${URL}`,
    );
  });

  it("says 'dinner' when there's no restaurant name", () => {
    expect(reminderText({ ...base, merchant: null, handles: {} })).toBe(`Hi Sam, you owe me $34.20 for dinner.\n${URL}`);
    expect(reminderText({ ...base, merchant: "   ", handles: {} })).toBe(`Hi Sam, you owe me $34.20 for dinner.\n${URL}`);
    expect(reminderText({ ...base, merchant: null, handles: { venmo: "alex" } })).toContain("note=SplitSnap\n");
  });

  it("keeps names and merchants on one line", () => {
    expect(reminderText({ ...base, guestName: " Sam\n K ", merchant: "Corner\tBistro", handles: {} })).toBe(
      `Hi Sam K, you owe me $34.20 for Corner Bistro.\n${URL}`,
    );
    expect(reminderText({ ...base, guestName: "  ", handles: {} })).toMatch(/^Hi there, /);
  });

  it("formats cents exactly at rounding boundaries and large values", () => {
    expect(reminderText({ ...base, amount: money(1), handles: {} })).toContain("you owe me $0.01 for");
    expect(reminderText({ ...base, amount: money(100), handles: {} })).toContain("you owe me $1.00 for");
    expect(reminderText({ ...base, amount: money(123_456_789) })).toContain(
      "you owe me $1,234,567.89 for Corner Bistro. Pay here: https://venmo.com/alex?txn=pay&amount=1234567.89&",
    );
  });

  it("leaves out the pay line for a zero amount (no link for $0)", () => {
    expect(reminderText({ ...base, amount: money(0) })).toBe(`Hi Sam, you owe me $0.00 for Corner Bistro.\n${URL}`);
  });

  it("is deterministic", () => {
    expect(reminderText(base)).toBe(reminderText({ ...base, handles: { ...base.handles } }));
  });

  it("rejects non-USD amounts", () => {
    const eur = { cents: 500, currency: "EUR" } as unknown as Money;
    expect(() => reminderText({ ...base, amount: eur })).toThrow(/currency/i);
  });
});
