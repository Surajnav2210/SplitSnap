// Share the summary text: native share sheet when available, else clipboard,
// else show the text so it can be copied by hand.

import { useCallback, useState } from "react";

export type ShareStatus =
  | { kind: "idle" }
  | { kind: "shared" }
  | { kind: "copied" }
  | { kind: "manual"; text: string };

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function useShareSummary() {
  const [status, setStatus] = useState<ShareStatus>({ kind: "idle" });

  /** Resolves to how the text was delivered, or "cancelled" if the user closed the share sheet. */
  const share = useCallback(async (text: string): Promise<ShareStatus["kind"] | "cancelled"> => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        setStatus({ kind: "shared" });
        return "shared";
      } catch (err) {
        if (isAbort(err)) return "cancelled"; // the user closed the share sheet on purpose
        // Otherwise (e.g. not allowed in this context) fall through to the clipboard.
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setStatus({ kind: "copied" });
        return "copied";
      } catch {
        // Clipboard blocked (permissions / insecure context): show the text instead.
      }
    }
    setStatus({ kind: "manual", text });
    return "manual";
  }, []);

  const reset = useCallback(() => setStatus({ kind: "idle" }), []);
  return { status, share, reset };
}
