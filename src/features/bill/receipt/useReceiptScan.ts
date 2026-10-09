// Scan lifecycle as an explicit state machine:
//   idle ──scan──▶ scanning ──ok──▶ idle (receipt loaded into the bill)
//                     │ └──fail──▶ error ──scan / dismiss──▶ …
//                     └──cancel──▶ idle
// Only the latest request can update state; older ones are aborted.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanResult } from "@/core/receipt";
import { makeThumbnail, scanReceipt, type ScanClientErrorCode } from "../scanClient";

export type ScanPhase =
  | { kind: "idle" }
  | { kind: "scanning"; thumbnail: string | null }
  | { kind: "error"; code: ScanClientErrorCode; message: string };

export interface ReceiptScan {
  phase: ScanPhase;
  /** Thumbnail of the last successfully scanned photo. */
  thumbnail: string | null;
  scan: (file: File) => void;
  cancel: () => void;
  dismissError: () => void;
  clearThumbnail: () => void;
}

export function useReceiptScan(onReceipt: (receipt: ScanResult) => void): ReceiptScan {
  const [phase, setPhase] = useState<ScanPhase>({ kind: "idle" });
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const scan = useCallback(
    (file: File) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setPhase({ kind: "scanning", thumbnail: null });

      void (async () => {
        let thumb: string | null;
        let result;
        try {
          thumb = await makeThumbnail(file);
          if (controller.signal.aborted) return;
          setPhase({ kind: "scanning", thumbnail: thumb });
          result = await scanReceipt(file, controller.signal);
        } catch {
          if (controller.signal.aborted) return; // cancelled by the user or a newer scan
          setPhase({
            kind: "error",
            code: "NETWORK",
            message: "Something went wrong while scanning. You can enter the items by hand.",
          });
          return;
        }
        if (controller.signal.aborted) return;
        if (result.ok) {
          setThumbnail(thumb);
          setPhase({ kind: "idle" });
          onReceipt(result.receipt);
        } else {
          setPhase({ kind: "error", code: result.code, message: result.message });
        }
      })();
    },
    [onReceipt],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPhase({ kind: "idle" });
  }, []);

  const dismissError = useCallback(() => setPhase({ kind: "idle" }), []);
  const clearThumbnail = useCallback(() => setThumbnail(null), []);

  return { phase, thumbnail, scan, cancel, dismissError, clearThumbnail };
}
