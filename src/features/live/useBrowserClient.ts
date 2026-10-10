"use client";

import { useSyncExternalStore } from "react";
import { getBrowserClient } from "@/adapters/supabase/browser";
import type { LiveClient } from "@/adapters/supabase/types";

const noopSubscribe = () => () => {};

/**
 * The browser Supabase client, created only in the browser.
 * undefined = still rendering on the server / hydrating; null = not configured.
 */
export function useBrowserClient(): LiveClient | null | undefined {
  return useSyncExternalStore(noopSubscribe, getBrowserClient, () => undefined);
}
