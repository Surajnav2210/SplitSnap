import Link from "next/link";

const steps = ["Snap the receipt", "Everyone taps what they had", "Pay the host"];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 py-16">
      <div className="flex-1">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          SplitSnap
        </h1>
        <p className="mt-3 text-lg text-zinc-700 dark:text-zinc-300">
          Split the bill before the waiter comes back.
        </p>

        <ol className="mt-10 space-y-4">
          {steps.map((step, i) => (
            <li key={step} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-semibold text-white"
              >
                {i + 1}
              </span>
              <span className="text-base text-zinc-900 dark:text-zinc-100">{step}</span>
            </li>
          ))}
        </ol>

        <Link
          href="/demo"
          className="mt-10 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
        >
          Try the demo
        </Link>
      </div>

      <footer className="mt-16 text-sm text-zinc-500 dark:text-zinc-400">
        SplitSnap never holds or moves your money.
      </footer>
    </main>
  );
}
