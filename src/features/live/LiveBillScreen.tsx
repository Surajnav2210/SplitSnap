"use client";

// One live bill on screen, for whoever is looking (host or guest). Renders
// from a snapshot (plus an optimistic overlay for the viewer's own taps) and
// sends every change through the adapter. Failures are shown, never hidden.

import { useState, type Dispatch } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { LiveBillError } from "@/adapters/supabase/errors";
import {
  addClaims,
  leaveBill,
  lockBill,
  removeClaim,
  removeParticipant,
  setSettlementStatus,
  unlockBill,
} from "@/adapters/supabase/liveBillApi";
import type { LiveClient } from "@/adapters/supabase/types";
import {
  buildLockPayload,
  claimsForSplittingRest,
  deriveLiveView,
  hasClaim,
  withClaimToggled,
  withClaimsAdded,
  type LiveBill,
  type LiveBillView,
  type SettlementStatus,
} from "@/core/liveBill";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { BarStat, BottomBar, StepTitle } from "@/features/bill/AppShell";
import { ClaimStep } from "@/features/bill/claim/ClaimStep";
import type { BillAction } from "@/features/bill/state";
import { toClaimState } from "./claimState";
import { ActionError } from "./LiveShell";
import { HostSignIn } from "./HostSignIn";
import { EveryoneTotals, GuestSettle, HostSettle } from "./SettleViews";
import { ShareLinkCard } from "./ShareLinkCard";

interface Props {
  client: LiveClient;
  bill: LiveBill;
  viewerUserId: string;
  /** Anonymous guest session: offer "Are you the host? Sign in" (host on a new device). */
  viewerIsAnonymous: boolean;
  refetch: () => Promise<void>;
}

/** Message for an action failure. Non-Error throws are bugs and are re-thrown. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  throw err;
}

export function LiveBillScreen({ client, bill: snapshot, viewerUserId, viewerIsAnonymous, refetch }: Props) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<{ base: LiveBill; bill: LiveBill } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An optimistic overlay only applies to the snapshot it was built on.
  const bill = optimistic !== null && optimistic.base === snapshot ? optimistic.bill : snapshot;
  const view: LiveBillView = deriveLiveView(bill, viewerUserId);
  const [activeId, setActiveId] = useState(view.me?.id ?? view.host.id);

  /** Run a write, show any failure, then re-read the bill either way. */
  async function act(write: () => Promise<void>, opts: { quietCodes?: LiveBillError["code"][] } = {}) {
    setError(null);
    setBusy(true);
    try {
      await write();
    } catch (err) {
      if (!(err instanceof LiveBillError && opts.quietCodes?.includes(err.code))) setError(messageOf(err));
    } finally {
      setBusy(false);
      await refetch();
    }
  }

  function optimisticly(next: LiveBill) {
    setOptimistic({ base: snapshot, bill: next });
  }

  const dispatch: Dispatch<BillAction> = (action) => {
    if (!view.canClaim) return;
    if (action.type === "toggleClaim") {
      const key = { billId: bill.id, itemId: action.itemId, participantId: action.personId };
      const had = hasClaim(bill, action.itemId, action.personId);
      optimisticly(withClaimToggled(bill, action.itemId, action.personId));
      void act(() => (had ? removeClaim(client, key) : addClaims(client, [key])));
    } else if (action.type === "assignUnclaimedToAll" && view.role === "host") {
      const added = claimsForSplittingRest(bill);
      optimisticly(withClaimsAdded(bill, added));
      void act(() => addClaims(client, added.map((c) => ({ billId: bill.id, itemId: c.itemId, participantId: c.participantId }))));
    }
  };

  function lock() {
    let payload;
    try {
      payload = buildLockPayload(bill);
    } catch (err) {
      setError(messageOf(err));
      return;
    }
    // STATE = already locked (e.g. a retry after a lost response): the refetch shows the real state.
    void act(() => lockBill(client, bill.id, payload), { quietCodes: ["STATE"] });
  }

  function unlock() {
    void act(() => unlockBill(client, bill.id), { quietCodes: ["STATE"] });
  }

  function leave() {
    if (!window.confirm("Leave this bill? Your claims will be removed.")) return;
    setError(null);
    setBusy(true);
    leaveBill(client, bill.id).then(
      () => router.push("/"),
      (err: unknown) => {
        setBusy(false);
        setError(messageOf(err));
      },
    );
  }

  function remove(participantId: string) {
    if (activeId === participantId) setActiveId(view.host.id);
    void act(() => removeParticipant(client, participantId));
  }

  function setStatus(settlementId: string, status: SettlementStatus) {
    void act(() => setSettlementStatus(client, settlementId, status));
  }

  const hostName = view.host.name;
  const myTotal = view.split?.participants.find((p) => p.participantId === view.me?.id)?.total.cents ?? 0;
  const claimState = toClaimState(bill, view.host.id);
  const title = bill.merchant ?? `${hostName}’s bill`;
  const hostSignIn =
    view.role !== "host" && viewerIsAnonymous ? (
      <HostSignIn client={client} shareCode={bill.shareCode} prompt="Are you the host?" action="Sign in" />
    ) : null;

  if (bill.status === "locked") {
    return (
      <>
        <main id="main" className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pb-36 pt-7">
          <StepTitle
            title={view.role === "host" ? "Who owes you" : title}
            subtitle={view.role === "host" ? "The bill is locked. Amounts are final." : `${hostName} locked the bill. Here’s your share.`}
          />
          <ActionError message={error} />
          {view.role === "host" ? (
            <HostSettle view={view} busy={busy} onStatus={setStatus} />
          ) : (
            <GuestSettle view={view} merchant={bill.merchant} busy={busy} onStatus={setStatus} />
          )}
          {hostSignIn}
        </main>
        {view.role === "host" ? (
          <BottomBar>
            <BarStat label="Still owed to you">
              <MoneyText cents={view.outstandingCents} mono />
            </BarStat>
            <Button size="lg" variant="outline" disabled={!view.canUnlock || busy} onClick={unlock}>
              <LockOpen aria-hidden="true" /> Unlock
            </Button>
          </BottomBar>
        ) : null}
      </>
    );
  }

  const isHost = view.role === "host";
  return (
    <>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pb-36 pt-7">
        <StepTitle
          title={isHost ? title : "Tap what you had"}
          subtitle={
            isHost
              ? "Totals update live as people tap. Tap a person to claim for them."
              : `Shared plates split evenly. Totals update live. ${hostName} paid and locks the bill when everyone's done.`
          }
        />
        <ActionError message={error ?? view.splitError} />
        {isHost ? <ShareLinkCard shareCode={bill.shareCode} merchant={bill.merchant} /> : null}
        <ClaimStep
          state={claimState}
          result={view.split}
          activeId={isHost ? activeId : (view.me?.id ?? "")}
          onActiveChange={setActiveId}
          dispatch={dispatch}
          stickyClassName="sticky top-14"
          showSwitcher={isHost}
          canSplitRest={isHost}
        />
        <EveryoneTotals bill={bill} view={view} busy={busy} onRemove={isHost ? remove : undefined} />
        {!isHost ? (
          <div className="flex justify-center">
            <Button variant="destructive" size="sm" disabled={busy} onClick={leave}>
              Leave bill
            </Button>
          </div>
        ) : null}
        {hostSignIn}
      </main>
      <BottomBar>
        {isHost ? (
          <>
            <BarStat label={view.unclaimedItemIds.length > 0 ? `${view.unclaimedItemIds.length} unclaimed` : "Everything’s claimed"}>
              {view.split ? <MoneyText cents={view.split.billTotal.cents} mono /> : "—"}
            </BarStat>
            <Button size="lg" disabled={!view.canLock || busy} onClick={lock} aria-describedby="lock-hint">
              <Lock aria-hidden="true" /> Lock bill
            </Button>
            <span id="lock-hint" className="sr-only">
              {view.canLock ? "Freezes everyone's amounts." : "Every item needs someone before you can lock."}
            </span>
          </>
        ) : (
          <BarStat label="Your total so far">
            <MoneyText cents={myTotal} mono />
          </BarStat>
        )}
      </BottomBar>
    </>
  );
}
