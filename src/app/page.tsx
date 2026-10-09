import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { JsonLd } from "@/components/site/JsonLd";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Comparison } from "@/components/site/landing/Comparison";
import { Faq } from "@/components/site/landing/Faq";
import { faqJsonLd } from "@/components/site/landing/faqData";
import { Hero } from "@/components/site/landing/Hero";
import { HowItWorks } from "@/components/site/landing/HowItWorks";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

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
        <Comparison />
        <Faq />
        <section aria-labelledby="cta-heading" className="px-5 pb-24">
          <div className="mx-auto max-w-4xl rounded-[32px] bg-brand px-6 py-14 text-center text-brand-fg shadow-pop">
            <h2 id="cta-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
              Next dinner, you&apos;re the hero.
            </h2>
            <p className="mx-auto mt-3 max-w-md opacity-90">No app to install. No accounts. Just snap and split.</p>
            <ButtonLink href="/split" size="lg" variant="secondary" className="mt-8 border-transparent px-8">
              Split a bill — free
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
