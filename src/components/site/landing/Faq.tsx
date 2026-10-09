import { Icon } from "@/components/ui/Icon";
import { FAQ } from "./faqData";

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mx-auto w-full max-w-3xl scroll-mt-20 px-5 py-20">
      <h2 id="faq-heading" className="text-center text-3xl font-bold tracking-tight text-fg sm:text-4xl">
        Questions, answered
      </h2>
      <div className="mt-10 divide-y divide-line rounded-3xl border border-line bg-surface shadow-card">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group px-5">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-semibold text-fg [&::-webkit-details-marker]:hidden">
              {q}
              <Icon name="plus" className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-45" />
            </summary>
            <p className="pb-5 text-[15px] leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
