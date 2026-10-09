import { useId, useState } from "react";
import type { PaymentLink } from "@/core/paymentLinks";
import type { ParticipantShare } from "@/core/split";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { MoneyText } from "@/components/ui/MoneyText";
import { cx } from "@/components/ui/cx";
import type { BillPerson, ItemShare } from "../state";

const appStyles: Record<PaymentLink["app"], string> = {
  venmo: "bg-[#008CFF] text-white hover:bg-[#0074d4]",
  paypal: "bg-[#FFC439] text-[#111] hover:bg-[#f2b622]",
  cashapp: "bg-[#00C244] text-white hover:bg-[#00a83b]",
};

function Row({ label, cents, sub }: { label: string; cents: number; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <dt className="min-w-0 truncate text-muted">
        {label}
        {sub ? <span className="ml-1.5 text-xs opacity-75">{sub}</span> : null}
      </dt>
      <dd className="tabular-nums text-fg">
        <MoneyText cents={cents} />
      </dd>
    </div>
  );
}

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
    <li className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <Avatar name={person.name} seed={person.tone} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-fg">{person.name}</span>
          <span className="block text-xs text-muted">
            {isHost ? "Paid the bill · own share" : owes ? `Owes ${hostName}` : "Nothing to pay"}
          </span>
        </span>
        <MoneyText cents={share.total.cents} className={cx("text-xl font-bold", owes ? "text-fg" : "text-muted")} />
        <Icon name="chevronDown" className={cx("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>

      <div id={panelId} hidden={!open} className="border-t border-line px-4 py-3">
        <dl>
          {items.map((i) => (
            <Row key={i.itemId} label={i.name} sub={i.ways > 1 ? `÷${i.ways}` : undefined} cents={i.cents} />
          ))}
          <div className="my-1.5 border-t border-dashed border-line" />
          <Row label="Tax" cents={share.tax.cents} />
          <Row label="Tip" cents={share.tip.cents} />
          {share.fees.cents !== 0 ? <Row label="Fees" cents={share.fees.cents} /> : null}
          {share.discount.cents !== 0 ? <Row label="Discount" cents={share.discount.cents} /> : null}
        </dl>
      </div>

      {owes ? (
        <div className="border-t border-line bg-sunken/60 px-4 py-3">
          {links.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <a
                    key={l.app}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cx(
                      "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors",
                      appStyles[l.app],
                    )}
                  >
                    {l.label}
                    <span className="sr-only"> (opens {l.label} to pay {hostName})</span>
                  </a>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted">Opens the app with the amount filled in. SplitSnap never handles your money.</p>
            </>
          ) : (
            <p className="text-xs text-muted">
              {hasHandles ? "No valid payment handles yet." : "Add your Venmo, PayPal or Cash App below to get pay buttons."}
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
