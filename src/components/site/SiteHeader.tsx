import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5">
        <Link href="/" aria-label="SplitSnap home" className="rounded-xl">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <Link href="/#how-it-works" className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-fg sm:inline-flex">
            How it works
          </Link>
          <Link href="/#faq" className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-fg sm:inline-flex">
            FAQ
          </Link>
          <ButtonLink href="/split" size="sm" className="ml-2">
            Split a bill
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
