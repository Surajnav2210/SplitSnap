// Session refresh for live-bill pages (Next.js 16 "proxy", formerly
// middleware). Supabase access tokens are short-lived; this refreshes the
// auth cookies before the page loads so the browser client starts with a
// valid session. It never blocks a request: auth is enforced by RLS.

import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/adapters/supabase/liveBillApi";
import { createRequestClient } from "@/adapters/supabase/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createRequestClient(
    request,
    () => response,
    () => {
      // Rebuild so the refreshed cookies also reach this request's render.
      response = NextResponse.next({ request });
    },
  );
  if (client === null) return response; // live bills not configured
  await refreshSession(client);
  return response;
}

export const config = {
  matcher: ["/b/:path*", "/share"],
};
