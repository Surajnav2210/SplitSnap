import type { ReactNode } from "react";
import { MiniClaimRows, MiniPay, MiniReceipt } from "./snippets";

const STEPS: { title: string; body: string; visual: ReactNode }[] = [
  {
    title: "Snap the receipt",
    body: "We read every line, the tax and the tip in a few seconds. Fix anything with a tap, or type it in.",
    visual: <MiniReceipt lines={4} className="w-full max-w-[15rem]" />,
  },
  {
    title: "Everyone taps what they had",
    body: "Shared plates split between whoever claims them. Anything left over is flagged, never guessed.",
    visual: <MiniClaimRows className="w-full max-w-[17rem]" />,
  },
  {
    title: "Pay back in one tap",
    body: "Each person gets Venmo, PayPal and Cash App buttons with their exact amount filled in.",
    visual: <MiniPay names={["Sam"]} className="w-full max-w-[17rem]" />,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-14 border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <p className="text-[13px] font-medium text-muted-foreground">How it works</p>
        <h2 id="how-heading" className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[40px]">
          From receipt to paid back in about a minute.
        </h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <div aria-hidden="true" className="flex h-64 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/50 px-6 dark:bg-card">
                {s.visual}
              </div>
              <p className="mt-6 font-mono text-[13px] text-muted-foreground">0{i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
