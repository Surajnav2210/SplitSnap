"use client";

// Client entry for /b/[code]. Works out who is looking (host, joined guest,
// or someone new), asks a new guest only for their name, then shows the live
// bill. Guests get a silent anonymous session; nobody needs an account.

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { LiveBillError } from "@/adapters/supabase/errors";
import { findBillIdByShareCode, joinBill, signInAnonymously } from "@/adapters/supabase/liveBillApi";
import type { LiveClient } from "@/adapters/supabase/types";
import { cleanDisplayName, MAX_DISPLAY_NAME_LENGTH, normalizeShareCode } from "@/core/liveBill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepTitle } from "@/features/bill/AppShell";
import { FieldError } from "@/features/bill/fields";
import { LiveBillScreen } from "./LiveBillScreen";
import { ActionError, LiveHeader, LiveLoading, LiveMessage } from "./LiveShell";
import { useBrowserClient } from "./useBrowserClient";
import { useLiveBill } from "./useLiveBill";
import { useSession, type SessionState } from "./useSession";

const CLOSED_TITLE = "This bill isn't open anymore";
const CLOSED_BODY = "The link may be old or mistyped, or the bill was locked before you joined. Ask whoever paid for a new link.";

export function LiveBillApp({ code: rawCode }: { code: string }) {
  const code = normalizeShareCode(rawCode);
  const client = useBrowserClient();

  let body;
  if (code === null) {
    body = <LiveMessage title={CLOSED_TITLE} body={CLOSED_BODY} />;
  } else if (client === undefined) {
    body = <LiveLoading />;
  } else if (client === null) {
    body = <LiveMessage title="Sharing isn't set up yet" body="This copy of SplitSnap isn't connected to a database, so shared bills can't open." />;
  } else {
    return <WithClient client={client} code={code} />;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <LiveHeader label="Shared bill" />
      {body}
    </div>
  );
}

type Lookup = { userId: string; billId: string | null } | { userId: string; error: string };

function WithClient({ client, code }: { client: LiveClient; code: string }) {
  const session = useSession(client);
  const userId = session.status === "signed-in" ? session.user.id : null;
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [joined, setJoined] = useState<{ userId: string; billId: string } | null>(null);
  const [closed, setClosed] = useState(false);

  // Signed in already? Then RLS lets us see the bill only if we host or joined it.
  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    findBillIdByShareCode(client, code).then(
      (billId) => {
        if (!cancelled) setLookup({ userId, billId });
      },
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof LiveBillError) setLookup({ userId, error: err.message });
        else throw err;
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, code, userId]);

  const current = lookup !== null && lookup.userId === userId ? lookup : null;
  const billId =
    (joined !== null && joined.userId === userId ? joined.billId : null) ??
    (current !== null && "billId" in current ? current.billId : null);

  let content;
  if (closed) {
    content = <LiveMessage title={CLOSED_TITLE} body={CLOSED_BODY} />;
  } else if (session.status === "loading" || (userId !== null && current === null && billId === null)) {
    content = <LiveLoading />;
  } else if (current !== null && "error" in current) {
    content = (
      <LiveMessage title="Couldn't load this bill" body={current.error} showHomeLinks={false}>
        <Button className="mt-6" size="lg" onClick={() => window.location.reload()}>Try again</Button>
      </LiveMessage>
    );
  } else if (billId !== null && userId !== null) {
    return <LiveBill client={client} billId={billId} userId={userId} onGone={() => setClosed(true)} />;
  } else {
    content = (
      <JoinForm
        client={client}
        code={code}
        session={session}
        onJoined={(j) => setJoined(j)}
        onClosed={() => setClosed(true)}
      />
    );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <LiveHeader label="Shared bill" />
      {content}
    </div>
  );
}

function JoinForm({
  client,
  code,
  session,
  onJoined,
  onClosed,
}: {
  client: LiveClient;
  code: string;
  session: SessionState;
  onJoined: (joined: { userId: string; billId: string }) => void;
  onClosed: () => void;
}) {
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = cleanDisplayName(name);
    if (clean === null) {
      setFieldError(`Enter your name (up to ${MAX_DISPLAY_NAME_LENGTH} characters).`);
      return;
    }
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      const user = session.status === "signed-in" ? session.user : await signInAnonymously(client);
      const { billId } = await joinBill(client, code, clean);
      onJoined({ userId: user.id, billId });
    } catch (err) {
      setBusy(false);
      if (err instanceof LiveBillError && err.code === "CLOSED") {
        onClosed();
        return;
      }
      if (err instanceof LiveBillError) {
        setError(err.message);
        return;
      }
      throw err;
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-7">
      <StepTitle title="Join the bill" subtitle="Type your name, then tap what you had. No account or app needed." />
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <div>
          <label htmlFor="join-name" className="mb-1.5 block text-[13px] font-medium text-foreground">
            Your name
          </label>
          <Input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            autoFocus
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="e.g. Sam"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "join-name-error" : undefined}
          />
          <FieldError id="join-name-error" message={fieldError} />
        </div>
        <ActionError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Everyone on this bill sees the name you enter. See our <Link className="text-accent underline underline-offset-4" href="/privacy">privacy note</Link>.
        </p>
      </form>
    </main>
  );
}

function LiveBill({
  client,
  billId,
  userId,
  onGone,
}: {
  client: LiveClient;
  billId: string;
  userId: string;
  onGone: () => void;
}) {
  const { state, connection, refetch } = useLiveBill(client, billId);
  const gone = state.kind === "gone" || (state.kind === "ready" && state.bill.status === "archived");

  useEffect(() => {
    if (gone) onGone();
  }, [gone, onGone]);

  let content;
  if (state.kind === "loading" || gone) {
    content = <LiveLoading />;
  } else if (state.kind === "error") {
    content = (
      <LiveMessage title="Couldn't load this bill" body={state.message} showHomeLinks={false}>
        <Button className="mt-6" size="lg" onClick={() => void refetch()}>Try again</Button>
      </LiveMessage>
    );
  } else if (state.bill.status === "draft") {
    content = <LiveMessage title="This bill isn't open yet" />;
  } else {
    content = <LiveBillScreen client={client} bill={state.bill} viewerUserId={userId} refetch={refetch} />;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <LiveHeader label={state.kind === "ready" ? (state.bill.merchant ?? "Shared bill") : "Shared bill"} connection={connection} />
      {content}
    </div>
  );
}
