import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Shared shell for plain-language legal pages. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-14">
        <article>
          <h1 className="text-4xl font-bold tracking-tight text-fg">{title}</h1>
          <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
          <p className="mt-6 text-lg leading-relaxed text-fg">{intro}</p>
          <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
