import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client, used for "Sign in with Google" via Supabase Auth.
 *
 * The project URL and anon key are public by design (the anon key is a client
 * token), so they are served at runtime by /api/config instead of being baked
 * into the bundle. Returns null when the backend has no Supabase credentials,
 * which lets the login screen hide the button instead of failing on click.
 */
export interface SupabasePublicConfig {
  url:     string;
  anonKey: string;
}

let cached: SupabaseClient | null | undefined;

export async function getBrowserSupabase(): Promise<SupabaseClient | null> {
  if (cached !== undefined) return cached;

  let config: SupabasePublicConfig | null = null;
  try {
    const res = await fetch("/api/config");
    const data = res.ok
      ? ((await res.json()) as { supabase?: SupabasePublicConfig })
      : null;
    if (data?.supabase?.url && data.supabase.anonKey) config = data.supabase;
  } catch {
    // network failure — treated as "not configured" so the UI can explain it
  }

  cached = config
    ? createClient(config.url, config.anonKey, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: false,
        },
      })
    : null;

  return cached;
}
