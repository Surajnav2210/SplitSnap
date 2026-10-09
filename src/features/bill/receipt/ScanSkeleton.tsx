import Image from "next/image";
import { Button } from "@/components/ui/Button";

const ROWS = ["w-3/5", "w-2/5", "w-4/5", "w-1/2", "w-3/5"];

/** Animated paper receipt shown while the scan is in flight. */
export function ScanSkeleton({ thumbnail, onCancel }: { thumbnail: string | null; onCancel: () => void }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="paper-shadow relative mx-auto max-w-sm">
        <div className="receipt-paper relative overflow-hidden px-6 py-8">
          {thumbnail ? (
            <Image
              unoptimized
              src={thumbnail}
              alt=""
              width={64}
              height={80}
              className="absolute right-4 top-6 h-20 w-16 rounded-md object-cover opacity-80 shadow"
            />
          ) : null}
          <div className="h-3 w-28 animate-shimmer rounded bg-paper-fg/30" />
          <div className="mt-2 h-2 w-20 animate-shimmer rounded bg-paper-fg/15" />
          <div className="my-5 border-t border-dashed border-paper-fg/25" />
          <ul className="space-y-3.5">
            {ROWS.map((w, i) => (
              <li key={i} className="flex items-center justify-between gap-6" style={{ animationDelay: `${i * 120}ms` }}>
                <span className={`h-2.5 ${w} animate-shimmer rounded bg-paper-fg/20`} />
                <span className="h-2.5 w-12 animate-shimmer rounded bg-paper-fg/20" />
              </li>
            ))}
          </ul>
          <div className="my-5 border-t border-dashed border-paper-fg/25" />
          <div className="flex justify-between">
            <span className="h-3 w-16 animate-shimmer rounded bg-paper-fg/30" />
            <span className="h-3 w-16 animate-shimmer rounded bg-paper-fg/30" />
          </div>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 h-10 animate-scan bg-gradient-to-b from-transparent via-brand/25 to-transparent"
          />
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-fg">Reading your receipt…</p>
        <p className="mt-1 text-sm text-muted">Finding items, tax and tip. Usually a few seconds.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
