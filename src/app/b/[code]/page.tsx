import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveBillApp } from "@/features/live/LiveBillApp";
import { LiveLoading } from "@/features/live/LiveShell";

// Private, per-table pages: never indexed, and the share code in the URL is
// never sent as a Referer to other sites (e.g. when a pay link opens).
export const metadata: Metadata = {
  title: "Shared bill",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedBillPage({ params }: PageProps<"/b/[code]">) {
  return (
    <Suspense fallback={<LiveLoading />}>
      {params.then(({ code }) => (
        <LiveBillApp code={code} />
      ))}
    </Suspense>
  );
}
