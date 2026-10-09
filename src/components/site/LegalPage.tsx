import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Shared shell for plain-language legal pages. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[42rem] flex-1 px-5 py-16 sm:py-20">
        <article>
          <p className="text-[13px] text-muted-foreground">Last updated {updated}</p>
          <h1 className="mt-2 text-[40px] font-semibold leading-tight tracking-[-0.04em] text-foreground">{title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-foreground">{intro}</p>
          <div className="mt-10 space-y-10 text-[16px] leading-[1.75] text-muted-foreground [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
