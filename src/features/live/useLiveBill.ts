"use client";

// Live snapshot of one bill: fetch everything, then refetch on any Realtime
// event for the bill (simple and always consistent), when the tab becomes
// visible again, and when the network comes back. Stale responses are dropped.

import { useCallback, useEffect, useRef, useState } from "react";
import { toLiveBillError } from "@/adapters/supabase/errors";
import { fetchBillRows, subscribeToBill } from "@/adapters/supabase/liveBillApi";
import type { LiveClient } from "@/adapters/supabase/types";
import { isRelevantDelete, toLiveBill, type LiveBill } from "@/core/liveBill";

export type LiveBillState =
  | { kind: "loading" }
  | { kind: "ready"; bill: LiveBill }
  /** The bill is gone or no longer visible to this user (archived, left, removed). */
  | { kind: "gone" }
  | { kind: "error"; message: string };

export type Connection = "connecting" | "live" | "reconnecting";

const DEBOUNCE_MS = 120;

export function useLiveBill(client: LiveClient, billId: string) {
  const [state, setState] = useState<LiveBillState>({ kind: "loading" });
  const [channel, setChannel] = useState<"connecting" | "live" | "down">("connecting");
  const [fetchOk, setFetchOk] = useState(true);
  const seq = useRef(0);
  const latest = useRef<LiveBill | null>(null);

  const refetch = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const rows = await fetchBillRows(client, billId);
      if (mine !== seq.current) return;
      setFetchOk(true);
      if (rows === null) {
        latest.current = null;
        setState({ kind: "gone" });
        return;
      }
      const bill = toLiveBill(rows);
      latest.current = bill;
      setState({ kind: "ready", bill });
    } catch (err) {
      if (mine !== seq.current) return;
      const error = toLiveBillError(err);
      if (error.code === "NETWORK") {
        setFetchOk(false); // keep showing the last snapshot
        if (latest.current === null) setState({ kind: "error", message: error.message });
        return;
      }
      setState({ kind: "error", message: error.message });
    }
  }, [client, billId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refetch();
      }, DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToBill(
      client,
      billId,
      (change) => {
        if (change.type === "DELETE") {
          const bill = latest.current;
          if (bill !== null && !isRelevantDelete(bill, change.table, change.old)) return;
        }
        schedule();
      },
      (status) => {
        setChannel(status);
        // (Re)joined: fetch anything missed while the channel was down.
        if (status === "live") schedule();
      },
    );

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    const onOffline = () => setFetchOk(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", schedule);
    window.addEventListener("offline", onOffline);
    schedule();

    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", onOffline);
    };
  }, [client, billId, refetch]);

  const connection: Connection =
    channel === "connecting" && fetchOk ? "connecting" : channel === "live" && fetchOk ? "live" : "reconnecting";
  return { state, connection, refetch };
}
