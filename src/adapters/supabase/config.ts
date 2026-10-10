// Supabase connection settings. Both values are public by design (the
// publishable/anon key only grants what Row Level Security allows). The
// service-role key must never be used by this app.
//
// NEXT_PUBLIC_* values are inlined at build time only when referenced
// literally, so each name is spelled out below.

export interface SupabaseConfig {
  url: string;
  /** Publishable key (newer projects) or legacy anon key. */
  key: string;
}

export interface SupabaseEnv {
  url?: string;
  publishableKey?: string;
  anonKey?: string;
}

function readEnv(): SupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Null when live bills aren't configured; solo mode keeps working without them. */
export function readSupabaseConfig(env: SupabaseEnv = readEnv()): SupabaseConfig | null {
  const url = env.url?.trim() ?? "";
  const key = (env.publishableKey?.trim() || env.anonKey?.trim()) ?? "";
  if (url === "" || key === "") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch (err) {
    if (err instanceof TypeError) return null; // not a URL
    throw err;
  }
  return { url: url.replace(/\/+$/, ""), key };
}

export function isLiveBillsConfigured(): boolean {
  return readSupabaseConfig() !== null;
}
