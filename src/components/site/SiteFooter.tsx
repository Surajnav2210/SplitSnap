import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/split", label: "Split a bill" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#features", label: "Features" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">Split the bill before the waiter comes back.</p>
          <p className="mt-6 flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Never holds your money
          </p>
          <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Pay buttons only open Venmo, PayPal or Cash App with the amount filled in. You confirm the payment there.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-[13px] font-medium text-foreground">{col.title}</h2>
            <ul className="mt-3 space-y-1">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-9 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 text-[13px] text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>© 2026 SplitSnap</p>
          <p>Not affiliated with Venmo, PayPal, or Cash App.</p>
        </div>
      </div>
    </footer>
  );
}
