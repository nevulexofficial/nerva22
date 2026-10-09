import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for the shared NERV4 world (multiplayer).
 *
 * Configuration (read from env, set in Vercel project env vars):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — server-only key (preferred; bypasses RLS)
 *   SUPABASE_ANON_KEY         — fallback if service role key is absent
 *
 * Returns null when unconfigured so every caller degrades gracefully to
 * local/offline mode instead of crashing.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  cached =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  return cached;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}
