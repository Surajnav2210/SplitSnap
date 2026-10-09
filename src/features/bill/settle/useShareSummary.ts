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

  const share = useCallback(async (text: string) => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        setStatus({ kind: "shared" });
        return;
      } catch (err) {
        if (isAbort(err)) return; // the user closed the share sheet on purpose
        // Otherwise (e.g. not allowed in this context) fall through to the clipboard.
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setStatus({ kind: "copied" });
        return;
      } catch {
        // Clipboard blocked (permissions / insecure context): show the text instead.
      }
    }
    setStatus({ kind: "manual", text });
  }, []);

  const reset = useCallback(() => setStatus({ kind: "idle" }), []);
  return { status, share, reset };
}
