"use client";

// "Paid for this bill? Sign in" link for /b/[code]. A host who opens their own
// link where they have no session (new device, browser or preview URL) would
// otherwise only be offered the guest join form. Google sign-in brings them
// back to this same bill, which then resolves to the host view.

import { useState } from "react";
import { LiveBillError } from "@/adapters/supabase/errors";
import { signInWithGoogle } from "@/adapters/supabase/liveBillApi";
import type { LiveClient } from "@/adapters/supabase/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HostSignIn({
  client,
  shareCode,
  prompt,
  action,
  className,
}: {
  client: LiveClient;
  shareCode: string;
  prompt: string;
  action: string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setError(null);
    setBusy(true);
    const next = `/b/${encodeURIComponent(shareCode)}`;
    try {
      await signInWithGoogle(client, `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`);
    } catch (err) {
      setBusy(false);
      if (err instanceof LiveBillError) setError(err.message);
      else throw err;
    }
  }

  return (
    <div className={cn("text-center text-sm text-muted-foreground", className)}>
      <p>
        {prompt}{" "}
        <Button type="button" variant="link" size="sm" className="h-auto" disabled={busy} onClick={() => void go()}>
          {busy ? "Opening Google…" : action}
        </Button>
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
