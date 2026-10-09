import { useId, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { PaymentLink } from "@/core/paymentLinks";
import type { ParticipantShare } from "@/core/split";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { cn } from "@/lib/utils";
import type { BillPerson, ItemShare } from "../state";

function Row({ label, cents, sub }: { label: string; cents: number; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <dt className="min-w-0 truncate text-muted-foreground">
        {label}
        {sub ? <span className="ml-1.5 font-mono text-xs">{sub}</span> : null}
      </dt>
      <dd className="text-foreground">
        <MoneyText cents={cents} mono />
      </dd>
    </div>
  );
}

/** One person's row on Settle: total, an expandable breakdown, and pay buttons. */
export function OweCard({
  person,
  share,
  isHost,
  hostName,
  items,
  links,
  hasHandles,
}: {
  person: BillPerson;
  share: ParticipantShare;
  isHost: boolean;
  hostName: string;
  items: readonly ItemShare[];
  links: readonly PaymentLink[];
  hasHandles: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const owes = !isHost && share.total.cents > 0;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[4.5rem] w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left hover:bg-muted/60"
      >
        <Avatar name={person.name} seed={person.tone} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-foreground">{person.name}</span>
          <span className="block text-[13px] text-muted-foreground">
            {isHost ? "Paid the bill · own share" : owes ? `Owes ${hostName}` : "Nothing to pay"}
          </span>
        </span>
        <MoneyText
          cents={share.total.cents}
          mono
          className={cn("text-xl font-semibold tracking-[-0.02em]", owes ? "text-foreground" : "text-muted-foreground")}
        />
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      <div id={panelId} hidden={!open} className="mx-4 mb-3 rounded-lg bg-muted px-3.5 py-2.5">
        <dl>
          {items.map((i) => (
            <Row key={i.itemId} label={i.name} sub={i.ways > 1 ? `÷${i.ways}` : undefined} cents={i.cents} />
          ))}
          <div className="my-1.5 border-t border-dashed border-input" />
          <Row label="Tax" cents={share.tax.cents} />
          <Row label="Tip" cents={share.tip.cents} />
          {share.fees.cents !== 0 ? <Row label="Fees" cents={share.fees.cents} /> : null}
          {share.discount.cents !== 0 ? <Row label="Discount" cents={share.discount.cents} /> : null}
        </dl>
      </div>

      {owes ? (
        <div className="px-4 pb-4">
          {links.length > 0 ? (
            <div className="flex flex-wrap gap-2 pl-[3.625rem]">
              {links.map((l) => (
                <a
                  key={l.app}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
                >
                  {l.label}
                  <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <span className="sr-only"> (opens {l.label} to pay {hostName})</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="pl-[3.625rem] text-[13px] text-muted-foreground">
              {hasHandles ? "No valid payment handles yet." : "Add a Venmo, PayPal or Cash App handle below to get pay buttons."}
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
