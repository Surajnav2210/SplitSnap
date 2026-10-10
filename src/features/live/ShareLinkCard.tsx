"use client";

import { useMemo, useState } from "react";
import { Copy, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeQr, qrPath } from "@/lib/qr";

/** Public link for a share code. NEXT_PUBLIC_SITE_URL when set, else this origin. */
export function shareUrl(shareCode: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  const origin = configured || window.location.origin;
  return `${origin}/b/${shareCode}`;
}

function QrImage({ text }: { text: string }) {
  const qr = useMemo(() => {
    try {
      return encodeQr(text);
    } catch (err) {
      if (err instanceof RangeError) return null; // too long; the link is still shown
      throw err;
    }
  }, [text]);
  if (qr === null) return null;
  const dim = qr.size + 8;
  return (
    <svg
      role="img"
      aria-label="QR code for the bill link"
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      className="size-44 rounded-lg bg-white"
    >
      <path d={qrPath(qr)} fill="#0c0a09" />
    </svg>
  );
}

/** Link + QR + copy + native share, shown to the host. */
export function ShareLinkCard({ shareCode, merchant }: { shareCode: string; merchant: string | null }) {
  const url = shareUrl(shareCode);
  const [note, setNote] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    if (!navigator.clipboard?.writeText) {
      setNote("Copying isn't available here. Press and hold the link to copy it.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied.");
    } catch (err) {
      if (err instanceof DOMException) {
        setNote("Couldn't copy. Press and hold the link to copy it.");
        return;
      }
      throw err;
    }
  }

  async function share() {
    try {
      await navigator.share({ title: merchant ?? "Our bill", text: "Tap what you had:", url });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed the share sheet on purpose
      await copy();
    }
  }

  return (
    <section aria-labelledby="share-heading" className="rounded-xl border border-border bg-card p-5">
      <h2 id="share-heading" className="text-base font-semibold tracking-[-0.01em] text-foreground">Invite the table</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">They scan or open the link, type their name, and tap what they had.</p>
      <div className="mt-4 flex flex-col items-center gap-4">
        <QrImage text={url} />
        <p className="w-full break-all rounded-lg bg-muted px-3 py-2 text-center font-mono text-[13px] text-foreground">{url}</p>
        <div className="flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={() => void copy()}>
            <Copy aria-hidden="true" /> Copy link
          </Button>
          {canShare ? (
            <Button className="flex-1" onClick={() => void share()}>
              <Share aria-hidden="true" /> Share
            </Button>
          ) : null}
        </div>
        <p aria-live="polite" className="min-h-5 text-[13px] text-muted-foreground">{note}</p>
      </div>
    </section>
  );
}
