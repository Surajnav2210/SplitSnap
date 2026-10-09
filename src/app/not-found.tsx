import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
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
        <div aria-hidden="true" className="paper-edge w-64">
          <div className="receipt-paper px-6 py-7 font-mono text-[12px] text-foreground">
            <p className="text-center uppercase tracking-[0.18em]">SplitSnap</p>
            <div className="my-3 border-t border-dashed border-input" />
            <p className="flex justify-between"><span>Page not found</span><span>1×</span></p>
            <div className="my-3 border-t border-dashed border-input" />
            <p className="flex justify-between font-semibold"><span>TOTAL</span><span>$0.00</span></p>
          </div>
        </div>
        <h1 className="mt-10 text-[30px] font-semibold tracking-[-0.035em] text-foreground">This page isn&apos;t on the bill.</h1>
        <p className="mt-2 text-muted-foreground">The link may be old or mistyped.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/split" className={buttonVariants({ size: "lg" })}>Split a bill</Link>
          <Link href="/" className={buttonVariants({ size: "lg", variant: "outline" })}>Go home</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
