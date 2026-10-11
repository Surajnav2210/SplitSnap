"use client";

// "Share with the table" on the solo Claim/Settle steps: park the local bill,
// sign in with Google if needed, then /share publishes it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { LiveBillError } from "@/adapters/supabase/errors";
import { signInWithGoogle } from "@/adapters/supabase/liveBillApi";
import { Button } from "@/components/ui/button";
import type { BillState } from "@/features/bill/state";
import { ActionError } from "./LiveShell";
import { loadPending, newClientKey, nextPending, savePending } from "./publish";
import { useBrowserClient } from "./useBrowserClient";
import { useSession } from "./useSession";

/**
 * `compact` is the one-line version shown under the Settle heading, kept
 * secondary to the per-person totals.
 */
export function ShareWithTable({ state, compact = false }: { state: BillState; compact?: boolean }) {
  const client = useBrowserClient();
  const session = useSession(client ?? null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setError(null);
    if (!client) {
      setError("Sharing isn't set up yet.");
      return;
    }
    if (state.items.length === 0) {
      setError("Add at least one item first.");
      return;
    }
    const store = window.sessionStorage;
    savePending(store, nextPending(loadPending(store), state, newClientKey()));
    if (session.status === "signed-in" && !session.user.isAnonymous) {
      router.push("/share");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle(client, `${window.location.origin}/auth/callback?next=/share`);
    } catch (err) {
      setBusy(false);
      if (err instanceof LiveBillError) setError(err.message);
      else throw err;
    }
  }

  const label = busy ? "Opening Google…" : "Share with the table";

  if (compact) {
    return (
      <section aria-label="Share with the table" className="mb-6 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-40 flex-1 text-sm text-muted-foreground">Let everyone claim from their own phone</p>
          <Button variant="outline" size="sm" className="shrink-0" disabled={busy} onClick={() => void start()}>
            <Users aria-hidden="true" /> {label}
          </Button>
        </div>
        {error ? (
          <div className="mt-2">
            <ActionError message={error} />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="live-share-heading" className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 id="live-share-heading" className="text-base font-semibold tracking-[-0.01em] text-foreground">
        Let everyone tap their own
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Share a live link. Everyone opens it on their phone, types their name and taps what they had. You sign in with
        Google so the bill stays yours.
      </p>
      <Button variant="outline" className="mt-4 w-full" disabled={busy} onClick={() => void start()}>
        <Users aria-hidden="true" /> {label}
      </Button>
      <div className="mt-3">
        <ActionError message={error} />
      </div>
    </section>
  );
}
