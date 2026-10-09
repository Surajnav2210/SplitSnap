import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FAQ } from "./faqData";

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-14 border-b border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[1fr_1.5fr] lg:py-28">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground">FAQ</p>
          <h2 id="faq-heading" className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[40px]">
            Questions, answered.
          </h2>
        </div>
        {/* hiddenUntilFound keeps answers in the HTML (find-in-page, crawlers) while collapsed. */}
        <Accordion className="border-t border-border" hiddenUntilFound>
          {FAQ.map(({ q, a }) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger>{q}</AccordionTrigger>
              <AccordionContent>
                <p>{a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
