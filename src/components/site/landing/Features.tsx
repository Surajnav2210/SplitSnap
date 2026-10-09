import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MiniCents, MiniPay, MiniReceipt, MiniSwitcher } from "./snippets";

function Cell({
  title,
  body,
  visual,
  className,
  visualClassName,
}: {
  title: string;
  body: string;
  visual: ReactNode;
  className?: string;
  visualClassName?: string;
}) {
  return (
    <li className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="p-6 sm:p-7">
        <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div aria-hidden="true" className={cn("mt-auto flex justify-center px-6 pb-6 sm:px-7 sm:pb-7", visualClassName)}>
        {visual}
      </div>
    </li>
  );
}

export function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-14 border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <p className="text-[13px] font-medium text-muted-foreground">Features</p>
        <h2 id="features-heading" className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[40px]">
          Built for the moment the check lands.
        </h2>
        <ul className="mt-14 grid gap-4 lg:grid-cols-3">
          <Cell
            className="lg:col-span-2"
            title="Receipt scan"
            body="Point your camera at the receipt. Items, quantities, tax and tip come back as editable lines, checked against the printed total."
            visual={<MiniReceipt lines={5} showScan className="w-full max-w-sm" />}
          />
          <Cell
            title="Tap to claim"
            body="Pick who you are, tap what you had. Totals update as you go."
            visual={<MiniSwitcher className="w-full max-w-[18rem]" />}
            visualClassName="items-end"
          />
          <Cell
            title="Exact to the cent"
            body="Shared items and tax split with integer math. Leftover cents are assigned, never lost or invented."
            visual={<MiniCents className="w-full max-w-[17rem]" />}
          />
          <Cell
            className="lg:col-span-2"
            title="Pay in one tap"
            body="Add your Venmo, PayPal or Cash App handle once. Everyone gets a button that opens the app with their amount filled in."
            visual={<MiniPay className="w-full max-w-sm" />}
          />
        </ul>
      </div>
    </section>
  );
}
