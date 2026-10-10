import type { SupabaseClient } from "@supabase/supabase-js";

/** The Supabase client as used by this app. Rows are validated with zod, not generated types. */
export type LiveClient = SupabaseClient;
