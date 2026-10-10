// Only ever redirect to a path on this site after sign-in. Anything else
// (absolute URLs, protocol-relative "//evil.com", backslash tricks) falls back.

const DEFAULT_PATH = "/share";

export function safeNextPath(raw: string | null | undefined, fallback: string = DEFAULT_PATH): string {
  if (typeof raw !== "string" || raw === "") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  // Reject control characters (header splitting, hidden whitespace).
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return fallback;
  }
  return raw;
}
