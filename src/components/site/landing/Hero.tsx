import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PhoneMockup } from "../PhoneMockup";

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[520px] max-w-4xl rounded-full bg-brand/10 blur-3xl" />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-14 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted shadow-card">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Free · No sign-up · Itemized
          </p>
          <h1 id="hero-heading" className="mt-5 text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-7xl">
            Split the bill before the waiter comes back.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            Snap the receipt. Everyone taps what they had. Pay in one tap.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/split" size="lg" className="px-7">
              Split a bill — free <Icon name="arrowRight" className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/#how-it-works" size="lg" variant="secondary">
              See how it works
            </ButtonLink>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <li className="flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-brand" /> AI reads every line</li>
            <li className="flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-brand" /> Fair tax &amp; tip, to the cent</li>
            <li className="flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-brand" /> Venmo, PayPal, Cash App</li>
          </ul>
        </div>
        <PhoneMockup className="lg:ml-auto" />
      </div>
    </section>
  );
}
