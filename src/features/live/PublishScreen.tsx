"use client";

// /share: after Google sign-in, confirm the host's name and turn the parked
// local bill into a live one. Saves the host's payment handles to their
// profile first (lock_bill snapshots them from there), then publishes.

import { useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiveBillError } from "@/adapters/supabase/errors";
import { publishBill, signInWithGoogle, upsertProfile, type SessionUser } from "@/adapters/supabase/liveBillApi";
import type { LiveClient } from "@/adapters/supabase/types";
import { buildPublishPayload, MAX_DISPLAY_NAME_LENGTH } from "@/core/liveBill";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepTitle } from "@/features/bill/AppShell";
import { ActionError, LiveHeader, LiveLoading, LiveMessage } from "./LiveShell";
import { clearPending, parsePending, readPendingRaw, type PendingPublish } from "./publish";
import { useBrowserClient } from "./useBrowserClient";
import { useSession } from "./useSession";

const noopSubscribe = () => () => {};

/** Raw parked bill + ?error= from the URL, read only in the browser. */
function useBrowserInputs(): { raw: string | null; authError: string | null } | undefined {
  const raw = useSyncExternalStore(noopSubscribe, () => readPendingRaw(window.sessionStorage), () => undefined);
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => undefined);
  if (raw === undefined || search === undefined) return undefined;
  return { raw, authError: new URLSearchParams(search).get("error") };
}

export function PublishScreen() {
  const client = useBrowserClient();
  const inputs = useBrowserInputs();
  const session = useSession(client ?? null);
  const pending = useMemo(() => (inputs ? parsePending(inputs.raw) : null), [inputs]);

  let content;
  if (client === undefined || inputs === undefined) {
    content = <LiveLoading label="Loading…" />;
  } else if (client === null || inputs.authError === "config") {
    content = <LiveMessage title="Sharing isn't set up yet" body="This copy of SplitSnap isn't connected to a database. You can still split solo and share a summary." />;
  } else if (pending === null) {
    content = (
      <LiveMessage title="Nothing to share yet" body="Start a bill, then tap “Share with the table” on the People, Claim or Settle step." />
    );
  } else if (session.status === "loading") {
    content = <LiveLoading label="Checking your sign-in…" />;
  } else if (session.status === "signed-out" || session.user.isAnonymous) {
    content = <SignIn client={client} failed={inputs.authError === "auth"} />;
  } else {
    content = <ConfirmAndPublish client={client} pending={pending} user={session.user} />;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <LiveHeader label="Share with the table" />
      {content}
    </div>
  );
}

function SignIn({ client, failed }: { client: LiveClient; failed: boolean }) {
  const [error, setError] = useState<string | null>(failed ? "Google sign-in didn't finish. Try again." : null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(client, `${window.location.origin}/auth/callback?next=/share`);
    } catch (err) {
      setBusy(false);
      if (err instanceof LiveBillError) setError(err.message);
      else throw err;
    }
  }

  return (
    <LiveMessage title="Sign in to share" body="Hosts sign in with Google so only you can lock the bill. Guests never need an account." showHomeLinks={false}>
      <div className="mt-6 w-full space-y-3">
        <ActionError message={error} />
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void go()}>
          {busy ? "Opening Google…" : "Continue with Google"}
        </Button>
        <Link href="/split" className={buttonVariants({ variant: "ghost", className: "w-full" })}>Back to my bill</Link>
      </div>
    </LiveMessage>
  );
}

function ConfirmAndPublish({ client, pending, user }: { client: LiveClient; pending: PendingPublish; user: SessionUser }) {
  const router = useRouter();
  const [name, setName] = useState(pending.bill.hostName || user.suggestedName?.split(/\s+/)[0] || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a double tap must never publish twice

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    let payload;
    try {
      // Same key on every retry: a repeated publish returns the existing bill.
      payload = buildPublishPayload({ ...pending.bill, hostName: name }, pending.clientKey);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      throw err;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await upsertProfile(client, { displayName: payload.host_display_name, handles: pending.handles });
      const { shareCode } = await publishBill(client, payload);
      clearPending(window.sessionStorage);
      router.replace(`/b/${shareCode}`);
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      if (err instanceof LiveBillError) setError(err.message);
      else throw err;
    }
  }

  const items = pending.bill.items.length;
  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-7">
      <StepTitle
        title="Share with the table"
        subtitle={`${pending.bill.merchant ?? "Your bill"} · ${items} ${items === 1 ? "item" : "items"}. People join with the link and tap their own items.`}
      />
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <div>
          <label htmlFor="host-name" className="mb-1.5 block text-[13px] font-medium text-foreground">
            Your name (everyone at the table sees it)
          </label>
          <Input
            id="host-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="e.g. Alex"
          />
        </div>
        <ActionError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Creating link…" : "Create the link"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Your Venmo, PayPal and Cash App handles from this bill are saved to your profile and shown to guests once you lock
          the bill. Shared bills are archived after 30 days.
        </p>
      </form>
    </main>
  );
}
