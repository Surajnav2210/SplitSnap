import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-soft text-brand-soft-fg">
          <Icon name="receipt" className="h-8 w-8" />
        </span>
        <p className="mt-6 font-mono text-sm font-semibold text-muted">404</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">This page isn&apos;t on the receipt</h1>
        <p className="mt-3 text-muted">The link may be old or mistyped. Let&apos;s get you back to splitting.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/split" size="lg">Split a bill</ButtonLink>
          <ButtonLink href="/" size="lg" variant="secondary">Go home</ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
