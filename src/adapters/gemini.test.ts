import { ApiError, BlockedReason, FinishReason } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanError } from "@/core/receipt";

const generateContent = vi.fn();
const constructedWith = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  class FakeGoogleGenAI {
    models = { generateContent };
    constructor(options: unknown) {
      constructedWith(options);
    }
  }
  return { ...actual, GoogleGenAI: FakeGoogleGenAI };
});

const { extractReceipt, DEFAULT_GEMINI_MODEL } = await import("./gemini");

const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };

async function scanErrorCode(promise: Promise<unknown>): Promise<string> {
  const err: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ScanError);
  return (err as ScanError).code;
}

describe("extractReceipt", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    generateContent.mockReset();
    constructedWith.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns parsed JSON and sends the image inline with a JSON schema", async () => {
    const payload = { merchant: "Cafe", items: [{ name: "Tea", totalPrice: "2.00" }] };
    generateContent.mockResolvedValue({ text: JSON.stringify(payload) });

    await expect(extractReceipt(image)).resolves.toEqual(payload);

    expect(constructedWith).toHaveBeenCalledWith({ apiKey: "test-key" });
    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(request.contents[0].parts[0].inlineData).toEqual({
      mimeType: "image/jpeg",
      data: Buffer.from([1, 2, 3]).toString("base64"),
    });
    expect(request.config.responseMimeType).toBe("application/json");
    expect(request.config.responseJsonSchema.required).toEqual(["items"]);
  });

  it("uses GEMINI_MODEL when set", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-custom");
    generateContent.mockResolvedValue({ text: '{"items":[{"name":"A","totalPrice":"1.00"}]}' });
    await extractReceipt(image);
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-custom");
  });

  it("maps a missing API key to NO_API_KEY without calling Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await scanErrorCode(extractReceipt(image))).toBe("NO_API_KEY");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("maps HTTP 429 to QUOTA", async () => {
    generateContent.mockRejectedValue(new ApiError({ message: "Too many requests", status: 429 }));
    expect(await scanErrorCode(extractReceipt(image))).toBe("QUOTA");
  });

  it("maps RESOURCE_EXHAUSTED to QUOTA", async () => {
    generateContent.mockRejectedValue(new Error('{"error":{"status":"RESOURCE_EXHAUSTED"}}'));
    expect(await scanErrorCode(extractReceipt(image))).toBe("QUOTA");
  });

  it("maps other API errors and network failures to UPSTREAM", async () => {
    const hooks = { sleep: async () => {}, random: () => 0, now: () => 0 };
    generateContent.mockRejectedValue(new ApiError({ message: "boom", status: 500 }));
    expect(await scanErrorCode(extractReceipt(image, hooks))).toBe("UPSTREAM");
    generateContent.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await scanErrorCode(extractReceipt(image, hooks))).toBe("UPSTREAM");
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["empty text", ""],
    ["no items", '{"items":[]}'],
    ["items not an array", '{"items":"Tea 2.00"}'],
    ["a JSON array", "[]"],
  ])("maps %s to UNREADABLE", async (_label, text) => {
    generateContent.mockResolvedValue({ text });
    expect(await scanErrorCode(extractReceipt(image))).toBe("UNREADABLE");
  });

  it("maps a blocked prompt (promptFeedback.blockReason) to UNREADABLE", async () => {
    generateContent.mockResolvedValue({
      text: undefined,
      promptFeedback: { blockReason: BlockedReason.SAFETY },
    });
    expect(await scanErrorCode(extractReceipt(image))).toBe("UNREADABLE");
  });

  it.each([[FinishReason.SAFETY], [FinishReason.MAX_TOKENS], [FinishReason.RECITATION], [FinishReason.SPII]])(
    "maps finishReason %s to UNREADABLE even if text parses",
    async (finishReason) => {
      generateContent.mockResolvedValue({
        text: '{"items":[{"name":"A","totalPrice":"1.00"}]}',
        candidates: [{ finishReason }],
      });
      expect(await scanErrorCode(extractReceipt(image))).toBe("UNREADABLE");
    },
  );

  it("accepts finishReason STOP", async () => {
    generateContent.mockResolvedValue({
      text: '{"items":[{"name":"A","totalPrice":"1.00"}]}',
      candidates: [{ finishReason: FinishReason.STOP }],
    });
    await expect(extractReceipt(image)).resolves.toEqual({ items: [{ name: "A", totalPrice: "1.00" }] });
  });

  it("maps an undefined response text to UNREADABLE", async () => {
    generateContent.mockResolvedValue({ text: undefined });
    expect(await scanErrorCode(extractReceipt(image))).toBe("UNREADABLE");
  });
});

describe("extractReceipt retries", () => {
  const ok = { text: '{"items":[{"name":"A","totalPrice":"1.00"}]}' };
  const apiError = (status: number) => new ApiError({ message: `status ${status}`, status });

  // Fake clock: sleep advances time instead of waiting.
  let clock = 0;
  const sleeps: number[] = [];
  const hooks = {
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
    random: () => 0.5,
  };

  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    generateContent.mockReset();
    clock = 0;
    sleeps.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retries a 503 and succeeds on the second call", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(ok);
    await expect(extractReceipt(image, hooks)).resolves.toEqual({ items: [{ name: "A", totalPrice: "1.00" }] });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("retries 504 twice and succeeds on the third call with exponential full-jitter backoff", async () => {
    generateContent.mockRejectedValueOnce(apiError(504)).mockRejectedValueOnce(apiError(504)).mockResolvedValueOnce(ok);
    await expect(extractReceipt(image, hooks)).resolves.toEqual({ items: [{ name: "A", totalPrice: "1.00" }] });
    expect(generateContent).toHaveBeenCalledTimes(3);
    // random() = 0.5 → half of min(cap, 400 * 2^retry)
    expect(sleeps).toEqual([200, 400]);
  });

  it.each([[500], [502], [503], [504]])("maps a persistent %i to UPSTREAM after 3 calls", async (status) => {
    generateContent.mockRejectedValue(apiError(status));
    const err: unknown = await extractReceipt(image, hooks).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ScanError);
    expect((err as ScanError).code).toBe("UPSTREAM");
    expect((err as ScanError).attempts).toBe(3);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not retry 429: QUOTA after exactly 1 call", async () => {
    generateContent.mockRejectedValue(apiError(429));
    expect(await scanErrorCode(extractReceipt(image, hooks))).toBe("QUOTA");
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it.each([[400], [401], [403], [404]])("does not retry %i", async (status) => {
    generateContent.mockRejectedValue(apiError(status));
    expect(await scanErrorCode(extractReceipt(image, hooks))).toBe("UPSTREAM");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("does not retry network errors or UNREADABLE results", async () => {
    generateContent.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await scanErrorCode(extractReceipt(image, hooks))).toBe("UPSTREAM");
    expect(generateContent).toHaveBeenCalledTimes(1);

    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: '{"items":[]}' });
    expect(await scanErrorCode(extractReceipt(image, hooks))).toBe("UNREADABLE");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when the remaining budget is too small", async () => {
    // The first call takes 23s of the 25s budget, leaving < 3s.
    generateContent.mockImplementationOnce(async () => {
      clock += 23_000;
      throw apiError(503);
    });
    generateContent.mockResolvedValue(ok);
    expect(await scanErrorCode(extractReceipt(image, hooks))).toBe("UPSTREAM");
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("gives each attempt the remaining budget as its timeout", async () => {
    generateContent.mockImplementationOnce(async () => {
      clock += 10_000;
      throw apiError(503);
    });
    generateContent.mockResolvedValueOnce(ok);
    await extractReceipt(image, hooks);
    expect(generateContent.mock.calls[0][0].config.httpOptions.timeout).toBe(25_000);
    // 25s - 10s elapsed - 200ms backoff
    expect(generateContent.mock.calls[1][0].config.httpOptions.timeout).toBe(14_800);
  });
});
