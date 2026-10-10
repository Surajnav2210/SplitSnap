// Browser Supabase client (session kept in cookies by @supabase/ssr so the
// auth callback route and proxy can read it). Null when not configured.

import { createBrowserClient } from "@supabase/ssr";
import { readSupabaseConfig } from "./config";
import type { LiveClient } from "./types";

let cached: LiveClient | null | undefined;

export function getBrowserClient(): LiveClient | null {
  if (cached !== undefined) return cached;
  const config = readSupabaseConfig();
  cached = config === null ? null : createBrowserClient(config.url, config.key);
  return cached;
}
