import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd } from "@/components/site/JsonLd";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Comparison } from "@/components/site/landing/Comparison";
import { Faq } from "@/components/site/landing/Faq";
import { faqJsonLd } from "@/components/site/landing/faqData";
import { Features } from "@/components/site/landing/Features";
import { Hero } from "@/components/site/landing/Hero";
import { HowItWorks } from "@/components/site/landing/HowItWorks";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  // Uses the layout's default title and Open Graph; only the canonical is page-specific.
  alternates: { canonical: "/" },
};

const appJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires a modern web browser with JavaScript.",
  description: SITE_DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Home() {
  return (
    <>
      <JsonLd data={appJsonLd} />
      <JsonLd data={faqJsonLd} />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
        <Comparison />
        <Faq />
        <section aria-labelledby="cta-heading" className="border-b border-border px-5 py-20 sm:px-6 lg:py-24">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 rounded-2xl bg-foreground px-8 py-12 text-background sm:px-12 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="cta-heading" className="text-[28px] font-semibold leading-tight tracking-[-0.035em] sm:text-[34px]">
                Dinner&apos;s over. Settle up in a minute.
              </h2>
              <p className="mt-2 text-[15px] text-background/65">Free, no app to install, nobody signs up.</p>
            </div>
            <Link
              href="/split"
              className={cn(buttonVariants({ size: "lg" }), "bg-background px-7 text-foreground hover:bg-background/90")}
            >
              Split a bill <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
