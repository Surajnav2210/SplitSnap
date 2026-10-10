import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Connection } from "./useLiveBill";

/** Header for /b/[code] and /share: home mark, title, live/reconnecting status. */
export function LiveHeader({ label, connection }: { label: string; connection?: Connection }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2 px-4">
        <Link href="/" aria-label="SplitSnap home" className="-ml-1 inline-flex h-11 items-center rounded-md px-1">
          <LogoMark />
        </Link>
        <p className="min-w-0 flex-1 truncate text-center text-[13px] font-medium text-foreground">{label}</p>
        <span className="flex w-24 justify-end">
          {connection ? <ConnectionBadge connection={connection} /> : null}
        </span>
      </div>
    </header>
  );
}

function ConnectionBadge({ connection }: { connection: Connection }) {
  const text = connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          connection === "live" ? "bg-success" : connection === "connecting" ? "bg-border" : "animate-pulse bg-warning",
        )}
      />
      {text}
    </span>
  );
}

/** Full-screen message (closed link, not configured, loading). */
export function LiveMessage({
  title,
  body,
  children,
  showHomeLinks = true,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  showHomeLinks?: boolean;
}) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-20 text-center">
      <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-foreground">{title}</h1>
      {body ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p> : null}
      {children}
      {showHomeLinks ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/split" className={buttonVariants({ size: "lg" })}>Split a bill</Link>
          <Link href="/" className={buttonVariants({ size: "lg", variant: "outline" })}>Go home</Link>
        </div>
      ) : null}
    </main>
  );
}

export function LiveLoading({ label = "Loading the bill…" }: { label?: string }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-20">
      <p role="status" className="text-[15px] text-muted-foreground">{label}</p>
    </main>
  );
}

/** Inline error for a failed action. Never hidden: the person must see it. */
export function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
