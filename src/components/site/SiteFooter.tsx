import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1fr_auto]">
        <div>
          <Logo />
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-fg">
            <Icon name="shield" className="h-4 w-4 text-brand" />
            Never holds your money.
          </p>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted">
            Pay buttons only open Venmo, PayPal or Cash App with the amount filled in. SplitSnap is not
            affiliated with Venmo, PayPal, or Cash App.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-1 text-sm sm:flex-col sm:items-end">
          <Link href="/split" className="inline-flex min-h-11 items-center rounded-xl px-2 text-muted hover:text-fg">Split a bill</Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center rounded-xl px-2 text-muted hover:text-fg">Privacy</Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center rounded-xl px-2 text-muted hover:text-fg">Terms</Link>
        </nav>
      </div>
      <p className="pb-8 text-center text-xs text-muted">© 2026 SplitSnap. Made for group dinners.</p>
    </footer>
  );
}
