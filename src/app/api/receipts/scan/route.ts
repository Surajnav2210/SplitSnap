// POST /api/receipts/scan — multipart/form-data with field `image`.
//
// Returns ScanResponse (src/core/receipt.ts). The image is processed in memory
// only and never stored or logged. Logs contain only the error code (and the
// upstream HTTP status when there is one): no image bytes, model output, IPs,
// or keys.

import { extractReceipt } from "@/adapters/gemini";
import {
  normalizeReceipt,
  SCAN_ERROR_MESSAGES,
  ScanError,
  type ScanErrorCode,
  type ScanResponse,
} from "@/core/receipt";

// Runs on the default Node.js runtime (the adapter uses Buffer). A `runtime`
// segment config is not allowed with cacheComponents enabled.

// Vercel caps request bodies at 4.5 MB; 4 MB leaves room for multipart framing.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
// Multipart framing adds a little on top of the file itself.
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const STATUS_BY_CODE: Readonly<Record<ScanErrorCode, number>> = {
  NO_API_KEY: 503,
  QUOTA: 503,
  UNREADABLE: 422,
  UPSTREAM: 502,
  TOO_LARGE: 413,
  BAD_IMAGE: 415,
  RATE_LIMITED: 429,
};

// --- Rate limit -------------------------------------------------------------
// Best-effort only: this map lives in one server instance's memory, so on
// serverless (Vercel) each cold start / parallel instance has its own counter.
// Good enough to stop casual abuse of the shared free quota; replace with a
// shared store (e.g. a Supabase table keyed by user) once auth exists.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
/** Hard cap on tracked clients; when full, the least recently seen is evicted. */
const RATE_LIMIT_MAX_KEYS = 5_000;
const SWEEP_INTERVAL_MS = 60 * 1000;
// Map iteration order is insertion order; entries are re-inserted on every
// scan, so the first key is always the least recently active client.
const scansByClient = new Map<string, number[]>();
let lastSweepAt = 0;

/** Expand an IPv6 address into 8 hextets, or null if it isn't one we can parse. */
function ipv6Hextets(address: string): string[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail = halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const hextets = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!hextets.every((h) => /^[0-9a-f]{1,4}$/.test(h))) return null;
  return hextets.map((h) => h.replace(/^0+(?=.)/, ""));
}

/**
 * Rate-limit key for a client address. IPv6 clients usually control a whole
 * /64, so they're keyed by that prefix; IPv4 (incl. IPv4-mapped IPv6) by address.
 */
function addressKey(raw: string): string {
  let address = raw.trim().toLowerCase();
  // "[2001:db8::1]:443" -> "2001:db8::1"; drop any zone id ("fe80::1%eth0").
  if (address.startsWith("[")) address = address.slice(1).replace(/\].*$/, "");
  address = address.split("%")[0];
  if (!address.includes(":")) return address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1];
  const hextets = ipv6Hextets(address);
  return hextets ? `${hextets.slice(0, 4).join(":")}::/64` : address;
}

/** Prefer the platform-set x-real-ip, then the first x-forwarded-for hop. */
function clientKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = realIp || forwarded;
  return address ? addressKey(address) : "unknown";
}

function sweepExpired(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, times] of scansByClient) {
    if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) scansByClient.delete(key);
  }
}

/** Record a scan attempt; returns false if the client is over the limit. */
function allowScan(key: string, now: number): boolean {
  sweepExpired(now);
  const recent = (scansByClient.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  scansByClient.delete(key);
  if (recent.length >= RATE_LIMIT_MAX) {
    scansByClient.set(key, recent);
    return false;
  }
  recent.push(now);
  while (scansByClient.size >= RATE_LIMIT_MAX_KEYS) {
    const oldest = scansByClient.keys().next();
    if (oldest.done) break;
    scansByClient.delete(oldest.value);
  }
  scansByClient.set(key, recent);
  return true;
}

// --- Handler ----------------------------------------------------------------

function errorResponse(code: ScanErrorCode, status = STATUS_BY_CODE[code]): Response {
  const body: ScanResponse = { ok: false, code, message: SCAN_ERROR_MESSAGES[code] };
  return Response.json(body, { status });
}

function logScanFailure(err: ScanError): void {
  const cause = err.cause;
  const status =
    typeof cause === "object" && cause !== null && "status" in cause && typeof cause.status === "number"
      ? cause.status
      : undefined;
  console.error("receipt scan failed", { code: err.code, upstreamStatus: status });
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse("TOO_LARGE");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Not multipart/form-data (or a malformed body): the client sent no usable image.
    return errorResponse("BAD_IMAGE", 400);
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return errorResponse("BAD_IMAGE", 400);
  }
  if (image.size > MAX_IMAGE_BYTES) return errorResponse("TOO_LARGE");
  const mimeType = image.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return errorResponse("BAD_IMAGE");

  if (!allowScan(clientKey(request), Date.now())) return errorResponse("RATE_LIMITED");

  try {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const raw = await extractReceipt({ bytes, mimeType });
    const body: ScanResponse = { ok: true, receipt: normalizeReceipt(raw) };
    return Response.json(body, { status: 200 });
  } catch (err) {
    if (err instanceof ScanError) {
      logScanFailure(err);
      return errorResponse(err.code);
    }
    throw err;
  }
}
