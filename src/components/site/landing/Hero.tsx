import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductShot } from "./ProductShot";

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="border-b border-border">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:gap-20 lg:pb-24 lg:pt-24">
        <div className="max-w-xl">
          <p className="inline-flex h-7 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            Free · No sign-up for friends
          </p>
          <h1
            id="hero-heading"
            className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] text-foreground sm:text-[56px] lg:text-[64px]"
          >
            Split the bill before the waiter comes back.
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
            Snap the receipt, everyone taps what they had, and tax and tip land on the right person to the cent.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/split" className={cn(buttonVariants({ size: "lg" }), "px-7")}>
              Split a bill <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/#how-it-works" className={buttonVariants({ size: "lg", variant: "outline" })}>
              See how it works
            </Link>
          </div>
          <p className="mt-8 flex items-center gap-2 text-[13px] text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Pay back with Venmo, PayPal or Cash App. We never touch the money.
          </p>
        </div>
        <ProductShot className="lg:mr-4" />
      </div>
    </section>
  );
}
