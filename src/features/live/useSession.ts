"use client";

import { useEffect, useState } from "react";
import { watchSession, type SessionUser } from "@/adapters/supabase/liveBillApi";
import type { LiveClient } from "@/adapters/supabase/types";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: SessionUser };

/** Current Supabase user, kept up to date across sign-in/out and token refresh. */
export function useSession(client: LiveClient | null): SessionState {
  const [state, setState] = useState<SessionState>(client === null ? { status: "signed-out" } : { status: "loading" });

  useEffect(() => {
    if (client === null) return;
    return watchSession(client, (user) => {
      setState(user === null ? { status: "signed-out" } : { status: "signed-in", user });
    });
  }, [client]);

  return state;
}
