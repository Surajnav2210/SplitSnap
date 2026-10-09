import type { Metadata } from "next";
import Link from "next/link";
import { DemoApp } from "@/features/demo/DemoApp";

export const metadata: Metadata = {
  title: "Demo · SplitSnap",
  description: "Try splitting a bill with SplitSnap. Demo mode: nothing is saved.",
};

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
      <p
        role="note"
        className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/50 dark:bg-sky-950/40 dark:text-sky-200"
      >
        Demo mode — nothing is saved. Receipt scanning and sharing links are coming next.
      </p>
      <header className="mt-4 mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Split a bill
        </h1>
        <Link href="/" className="text-sm text-emerald-700 underline dark:text-emerald-400">
          SplitSnap home
        </Link>
      </header>
      <DemoApp />
      <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        SplitSnap never holds or moves your money.
      </p>
    </main>
  );
}
