import { Icon, type IconName } from "@/components/ui/Icon";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "camera",
    title: "Snap the receipt",
    body: "AI pulls out every item, the tax and the tip in seconds. Fix anything with a tap, or type it in yourself.",
  },
  {
    icon: "tap",
    title: "Everyone taps what they had",
    body: "Shared fries? Tap it for everyone who ate them. Tax and tip are split in proportion, down to the cent.",
  },
  {
    icon: "send",
    title: "Pay in one tap",
    body: "Each person gets a Venmo, PayPal or Cash App button with their exact amount. Or share the summary to the group chat.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-20">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
        <h2 id="how-heading" className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          From receipt to paid back in under a minute.
        </h2>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border border-line bg-bg p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
                <Icon name={s.icon} className="h-6 w-6" />
              </span>
              <span aria-hidden="true" className="absolute right-6 top-6 font-mono text-sm font-semibold tabular-nums text-muted">
                0{i + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-fg">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
