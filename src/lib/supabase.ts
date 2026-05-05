import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return typeof url === "string" && url.length > 0 && typeof key === "string" && key.length > 0;
}

let _client: SupabaseClient | null = null;

/** Lazily created; throws if env vars are missing. */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (cloud mode only)");
  }
  if (!_client) {
    _client = createClient(url!, key!);
  }
  return _client;
}

/**
 * Non-null only when configured — use `isSupabaseConfigured()` before auth/session calls.
 * Adapter code may assume cloud mode implies configuration.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured() ? createClient(url!, key!) : null;
