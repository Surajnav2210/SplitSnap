// Server-side Supabase client bound to one request/response pair. Used by the
// session-refresh proxy and the OAuth callback route. Create one per request;
// never share it.

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { readSupabaseConfig } from "./config";
import type { LiveClient } from "./types";

/**
 * Reads auth cookies from `request` and writes refreshed ones (plus the
 * no-store cache headers @supabase/ssr asks for) onto `getResponse()`.
 * `getResponse` is called lazily so the proxy can rebuild its response.
 */
export function createRequestClient(
  request: NextRequest,
  getResponse: () => NextResponse,
  onCookiesSet?: () => void,
): LiveClient | null {
  const config = readSupabaseConfig();
  if (config === null) return null;
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        onCookiesSet?.();
        const response = getResponse();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
}
