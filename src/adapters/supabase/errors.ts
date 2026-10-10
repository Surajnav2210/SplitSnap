// Turn database / network errors into one typed error with a message that is
// safe to show. The original error is kept as `cause` for debugging and is
// never logged here (it can contain names or ids).

export type LiveErrorCode =
  | "NETWORK"
  | "AUTH"
  | "FORBIDDEN"
  | "CLOSED"
  | "STATE"
  | "UNCLAIMED"
  | "AMOUNTS_CHANGED"
  | "ALREADY_PAID"
  | "FULL"
  | "HOST_CANNOT_LEAVE"
  | "BAD_TRANSITION"
  | "DISCOUNT"
  | "INVALID"
  | "MALFORMED"
  | "UNKNOWN";

export const LIVE_ERROR_MESSAGES: Readonly<Record<LiveErrorCode, string>> = {
  NETWORK: "You seem to be offline. Check your connection and try again.",
  AUTH: "Your sign-in expired. Reload the page and try again.",
  FORBIDDEN: "You don't have permission to do that.",
  CLOSED: "This bill isn't open anymore.",
  STATE: "This bill just changed (it may have been locked or reopened). Take another look.",
  UNCLAIMED: "Every item needs someone before you can lock the bill.",
  AMOUNTS_CHANGED: "Claims changed while you were locking. Check the totals and try again.",
  ALREADY_PAID: "Someone already marked paid, so the bill can't be reopened.",
  FULL: "This bill is full (50 people).",
  HOST_CANNOT_LEAVE: "The host can't leave or be removed from their own bill.",
  BAD_TRANSITION: "That payment status can't be changed right now.",
  DISCOUNT: "The discount is larger than the items subtotal.",
  INVALID: "Some details weren't valid. Check them and try again.",
  MALFORMED: "We got an unexpected response. Reload the page and try again.",
  UNKNOWN: "Something went wrong. Try again.",
};

export class LiveBillError extends Error {
  readonly code: LiveErrorCode;

  constructor(code: LiveErrorCode, options?: { cause?: unknown; message?: string }) {
    super(options?.message ?? LIVE_ERROR_MESSAGES[code], options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LiveBillError";
    this.code = code;
  }
}

const SQLSTATE_TO_CODE: Readonly<Record<string, LiveErrorCode>> = {
  "28000": "AUTH",
  "42501": "FORBIDDEN",
  P0002: "CLOSED",
  SS001: "STATE",
  SS002: "STATE",
  SS003: "STATE",
  SS004: "UNCLAIMED",
  SS005: "AMOUNTS_CHANGED",
  SS006: "AMOUNTS_CHANGED",
  SS007: "ALREADY_PAID",
  SS008: "FULL",
  SS009: "HOST_CANNOT_LEAVE",
  SS010: "BAD_TRANSITION",
  SS011: "DISCOUNT",
  SS012: "STATE",
  "22023": "INVALID",
  "23514": "INVALID",
  // PostgREST: JWT expired / invalid.
  PGRST301: "AUTH",
  PGRST303: "AUTH",
};

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
}

function asErrorLike(err: unknown): ErrorLike | null {
  return typeof err === "object" && err !== null ? (err as ErrorLike) : null;
}

/** True for "the request never reached the server" failures. */
export function isNetworkError(err: unknown): boolean {
  const e = asErrorLike(err);
  if (e === null) return false;
  const message = typeof e.message === "string" ? e.message : "";
  if (e.name === "AuthRetryableFetchError") return true;
  if (err instanceof TypeError && /fetch|network|load failed/i.test(message)) return true;
  return (e.code === "" || e.code === undefined) && /(fetch|network|load failed|ECONNREFUSED|ENOTFOUND)/i.test(message);
}

/** Map any error from supabase-js (PostgrestError, AuthError, TypeError) to LiveBillError. */
export function toLiveBillError(err: unknown): LiveBillError {
  if (err instanceof LiveBillError) return err;
  if (isNetworkError(err)) return new LiveBillError("NETWORK", { cause: err });
  const e = asErrorLike(err);
  const code = e !== null && typeof e.code === "string" ? SQLSTATE_TO_CODE[e.code] : undefined;
  if (code !== undefined) return new LiveBillError(code, { cause: err });
  if (e !== null && (e.status === 401 || e.status === 403)) return new LiveBillError("AUTH", { cause: err });
  return new LiveBillError("UNKNOWN", { cause: err });
}
