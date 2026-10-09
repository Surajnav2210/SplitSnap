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
    generateContent.mockRejectedValueOnce(new ApiError({ message: "boom", status: 500 }));
    expect(await scanErrorCode(extractReceipt(image))).toBe("UPSTREAM");
    generateContent.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await scanErrorCode(extractReceipt(image))).toBe("UPSTREAM");
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
