import Image from "next/image";
import { Button } from "@/components/ui/button";

const ROWS = ["w-3/5", "w-2/5", "w-4/5", "w-1/2", "w-3/5"];

/** Receipt-shaped placeholder shown while the scan is in flight. */
export function ScanSkeleton({ thumbnail, onCancel }: { thumbnail: string | null; onCancel: () => void }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="paper-edge relative mx-auto max-w-sm">
        <div className="receipt-paper relative overflow-hidden px-6 py-8">
          {thumbnail ? (
            <Image
              unoptimized
              src={thumbnail}
              alt=""
              width={56}
              height={72}
              className="absolute right-5 top-6 h-[72px] w-14 rounded-md border border-border object-cover"
            />
          ) : null}
          <div className="h-2.5 w-28 animate-shimmer rounded-sm bg-foreground/15" />
          <div className="mt-2 h-2 w-20 animate-shimmer rounded-sm bg-foreground/10" />
          <div className="my-5 border-t border-dashed border-border" />
          <ul className="space-y-3.5">
            {ROWS.map((w, i) => (
              <li key={i} className="flex items-center justify-between gap-6">
                <span className={`h-2 ${w} animate-shimmer rounded-sm bg-foreground/10`} style={{ animationDelay: `${i * 120}ms` }} />
                <span className="h-2 w-12 animate-shimmer rounded-sm bg-foreground/10" style={{ animationDelay: `${i * 120}ms` }} />
              </li>
            ))}
          </ul>
          <div className="my-5 border-t border-dashed border-border" />
          <div className="flex justify-between">
            <span className="h-2.5 w-16 animate-shimmer rounded-sm bg-foreground/15" />
            <span className="h-2.5 w-16 animate-shimmer rounded-sm bg-foreground/15" />
          </div>
          <span aria-hidden="true" className="absolute inset-x-4 h-px animate-scan bg-accent" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-foreground">Reading your receipt…</p>
        <p className="mt-1 text-sm text-muted-foreground">Finding items, tax and tip. Usually a few seconds.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
