// OAuth callback for Google sign-in (Supabase PKCE flow). Exchanges the
// one-time code for a session cookie, then returns to a same-site path
// (by default /share, which finishes publishing the bill).

import { NextResponse, type NextRequest } from "next/server";
import { LiveBillError } from "@/adapters/supabase/errors";
import { exchangeCodeForSession } from "@/adapters/supabase/liveBillApi";
import { createRequestClient } from "@/adapters/supabase/server";
import { safeNextPath } from "@/lib/safeRedirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const failure = (reason: "auth" | "config") => NextResponse.redirect(new URL(`/share?error=${reason}`, origin));

  const code = searchParams.get("code");
  if (code === null || code === "" || searchParams.has("error")) return failure("auth");

  const response = NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), origin));
  const client = createRequestClient(request, () => response);
  if (client === null) return failure("config");

  try {
    await exchangeCodeForSession(client, code);
  } catch (err) {
    // Expired/used code or a network failure: send the host back to retry.
    if (err instanceof LiveBillError) return failure("auth");
    throw err;
  }
  return response;
}
