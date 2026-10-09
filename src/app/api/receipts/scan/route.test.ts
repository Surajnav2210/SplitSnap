import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanError, type ScanResponse } from "@/core/receipt";

const extractReceipt = vi.fn();
vi.mock("@/adapters/gemini", () => ({ extractReceipt }));

let ipCounter = 0;
/** A fresh client IP per test so the in-memory rate limit doesn't leak between tests. */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function loadRoute() {
  return import("./route");
}

function scanRequest(file: File | null, ip = freshIp()): Request {
  const form = new FormData();
  if (file) form.append("image", file);
  return new Request("http://localhost/api/receipts/scan", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": ip },
  });
}

function jpeg(size = 10): File {
  return new File([new Uint8Array(size)], "r.jpg", { type: "image/jpeg" });
}

async function body(res: Response): Promise<ScanResponse> {
  return (await res.json()) as ScanResponse;
}

describe("POST /api/receipts/scan", () => {
  beforeEach(() => {
    extractReceipt.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns 200 with the normalized receipt", async () => {
    extractReceipt.mockResolvedValue({ items: [{ name: "Tea", totalPrice: "2.00" }], tax: "0.20" });
    const { POST } = await loadRoute();
    const res = await POST(scanRequest(jpeg()));
    expect(res.status).toBe(200);
    const json = await body(res);
    expect(json).toEqual({
      ok: true,
      receipt: {
        merchant: null,
        currency: "USD",
        items: [{ name: "Tea", quantity: 1, priceCents: 200 }],
        taxCents: 20,
        tipCents: 0,
        feeCents: 0,
        discountCents: 0,
        receiptTotalCents: null,
        warnings: [],
      },
    });
    expect(extractReceipt.mock.calls[0][0].mimeType).toBe("image/jpeg");
  });

  it("returns 400 BAD_IMAGE when the image field is missing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(scanRequest(null));
    expect(res.status).toBe(400);
    expect(await body(res)).toMatchObject({ ok: false, code: "BAD_IMAGE" });
  });

  it("returns 415 BAD_IMAGE for an unsupported type", async () => {
    const { POST } = await loadRoute();
    const gif = new File([new Uint8Array(10)], "r.gif", { type: "image/gif" });
    const res = await POST(scanRequest(gif));
    expect(res.status).toBe(415);
    expect(await body(res)).toMatchObject({ ok: false, code: "BAD_IMAGE" });
    expect(extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 413 TOO_LARGE for images over 4 MB", async () => {
    const { POST } = await loadRoute();
    const res = await POST(scanRequest(jpeg(4 * 1024 * 1024 + 1)));
    expect(res.status).toBe(413);
    expect(await body(res)).toMatchObject({ ok: false, code: "TOO_LARGE" });
    expect(extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMITED after 10 scans from one client in an hour", async () => {
    extractReceipt.mockResolvedValue({ items: [{ name: "Tea", totalPrice: "2.00" }] });
    const { POST } = await loadRoute();
    const ip = freshIp();
    for (let i = 0; i < 10; i += 1) {
      expect((await POST(scanRequest(jpeg(), ip))).status).toBe(200);
    }
    const res = await POST(scanRequest(jpeg(), ip));
    expect(res.status).toBe(429);
    expect(await body(res)).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect((await POST(scanRequest(jpeg()))).status).toBe(200);
  });

  it.each([
    ["NO_API_KEY", 503, "Receipt scanning isn't set up yet — enter items manually."],
    ["QUOTA", 503, "Scanning is busy right now — try again in a minute or enter items manually."],
    ["UNREADABLE", 422, undefined],
    ["UPSTREAM", 502, undefined],
  ] as const)("maps ScanError %s to HTTP %i", async (code, status, message) => {
    extractReceipt.mockRejectedValue(new ScanError(code));
    const { POST } = await loadRoute();
    const res = await POST(scanRequest(jpeg()));
    expect(res.status).toBe(status);
    const json = await body(res);
    expect(json).toMatchObject({ ok: false, code });
    if (message !== undefined && !json.ok) expect(json.message).toBe(message);
  });

  it("returns 422 UNREADABLE when the model output has the wrong shape", async () => {
    extractReceipt.mockResolvedValue({ items: [{ name: "Tea", totalPrice: 2 }] });
    const { POST } = await loadRoute();
    const res = await POST(scanRequest(jpeg()));
    expect(res.status).toBe(422);
    expect(await body(res)).toMatchObject({ ok: false, code: "UNREADABLE" });
  });
});

describe("POST /api/receipts/scan rate limiting", () => {
  beforeEach(() => {
    // Fresh module = fresh in-memory limiter for every test.
    vi.resetModules();
    extractReceipt.mockReset();
    extractReceipt.mockResolvedValue({ items: [{ name: "Tea", totalPrice: "2.00" }] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function requestWith(headers: Record<string, string>): Request {
    const form = new FormData();
    form.append("image", jpeg());
    return new Request("http://localhost/api/receipts/scan", { method: "POST", body: form, headers });
  }

  async function exhaust(POST: (r: Request) => Promise<Response>, headers: Record<string, string>) {
    for (let i = 0; i < 10; i += 1) expect((await POST(requestWith(headers))).status).toBe(200);
  }

  it("prefers x-real-ip over x-forwarded-for", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 10; i += 1) {
      const res = await POST(requestWith({ "x-real-ip": "198.51.100.7", "x-forwarded-for": `10.0.0.${i}` }));
      expect(res.status).toBe(200);
    }
    const res = await POST(requestWith({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "10.0.0.99" }));
    expect(res.status).toBe(429);
  });

  it("uses the first x-forwarded-for hop when x-real-ip is absent", async () => {
    const { POST } = await loadRoute();
    for (let i = 0; i < 10; i += 1) {
      const res = await POST(requestWith({ "x-forwarded-for": `198.51.100.8, 10.0.0.${i}` }));
      expect(res.status).toBe(200);
    }
    expect((await POST(requestWith({ "x-forwarded-for": "198.51.100.8" }))).status).toBe(429);
  });

  it("keys IPv6 clients by their /64 prefix", async () => {
    const { POST } = await loadRoute();
    for (let i = 1; i <= 10; i += 1) {
      const res = await POST(requestWith({ "x-real-ip": `2001:db8:aa:bb::${i.toString(16)}` }));
      expect(res.status).toBe(200);
    }
    // Same /64, different spelling of the address.
    expect((await POST(requestWith({ "x-real-ip": "2001:0DB8:00aa:00bb:1:2:3:4" }))).status).toBe(429);
    // A different /64 has its own budget.
    expect((await POST(requestWith({ "x-real-ip": "2001:db8:aa:bc::1" }))).status).toBe(200);
  });

  it("treats IPv4-mapped IPv6 like the IPv4 address", async () => {
    const { POST } = await loadRoute();
    await exhaust(POST, { "x-real-ip": "::ffff:198.51.100.9" });
    expect((await POST(requestWith({ "x-real-ip": "198.51.100.9" }))).status).toBe(429);
  });

  it("allows a client again once its scans are an hour old", async () => {
    const { POST } = await loadRoute();
    const headers = { "x-real-ip": "198.51.100.10" };
    await exhaust(POST, headers);
    expect((await POST(requestWith(headers))).status).toBe(429);
    vi.setSystemTime(new Date("2026-01-01T01:00:00.001Z"));
    expect((await POST(requestWith(headers))).status).toBe(200);
  });

  it("caps tracked clients at 5,000 by evicting the least recently seen", async () => {
    const { POST } = await loadRoute();
    const limited = { "x-real-ip": "198.51.100.11" };
    await exhaust(POST, limited);
    expect((await POST(requestWith(limited))).status).toBe(429);
    // 4,999 more clients fill the map to 5,000 without evicting the limited one...
    for (let i = 0; i < 4_999; i += 1) {
      await POST(requestWith({ "x-real-ip": `10.${(i >> 8) & 255}.${i & 255}.1` }));
    }
    expect((await POST(requestWith(limited))).status).toBe(429);
    // ...and 5,000 more evict it (it was touched last, so it's evicted last).
    for (let i = 0; i < 5_000; i += 1) {
      await POST(requestWith({ "x-real-ip": `10.${(i >> 8) & 255}.${i & 255}.2` }));
    }
    expect((await POST(requestWith(limited))).status).toBe(200);
  }, 60_000);
});
