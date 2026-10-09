import { getSupabase, isSupabaseConfigured } from "@/backend/supabase";
import { requireAuth } from "@/backend/auth/middleware";
import { saveService } from "@/backend/SaveService";

export interface WorldPlayer {
  userId: string;
  email: string | null;
  clubId: string | null;
  clubName: string;
  leagueSlug: string | null;
  leagueName: string | null;
  budget: number | null;
  currentDate: string | null;
  updatedAt: string;
}

export interface WorldFeedItem {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  leagueSlug: string | null;
  clubName: string | null;
  createdAt: string;
}

const WORLD_OFFLINE = {
  configured: false,
  players: [] as WorldPlayer[],
  feed: [] as WorldFeedItem[],
} as const;

/**
 * Publishes the manager's club snapshot into the shared world (world_players).
 * Fire-and-forget safe: silently no-ops when Supabase is not configured.
 */
export async function syncWorldPlayer(input: {
  userId: string;
  email?: string | null;
  saveId: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const meta = await saveService.getMeta(input.saveId);
    if (!meta) return;

    await supabase.from("world_players").upsert(
      {
        user_id: input.userId,
        email: input.email ?? null,
        club_id: meta.clubId ?? null,
        club_name: meta.clubName,
        league_slug: meta.leagueSlug ?? null,
        league_name: meta.leagueName ?? null,
        current_date: meta.currentDate ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch (err) {
    console.warn("[world] sync failed:", err);
  }
}

/** Appends an entry to the shared world feed. No-op when unconfigured. */
export async function pushWorldEvent(entry: {
  kind?: string;
  title: string;
  body?: string | null;
  leagueSlug?: string | null;
  clubName?: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("world_feed").insert({
      kind: entry.kind ?? "event",
      title: entry.title,
      body: entry.body ?? null,
      league_slug: entry.leagueSlug ?? null,
      club_name: entry.clubName ?? null,
    });
  } catch (err) {
    console.warn("[world] feed push failed:", err);
  }
}

export const worldRoutes = {
  /**
   * Public shared-world snapshot: who else is in the universe + latest feed.
   * Returns configured:false when Supabase env vars are missing.
   */
  "/api/world": async (req: Request) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    if (!isSupabaseConfigured()) return Response.json(WORLD_OFFLINE);

    const supabase = getSupabase()!;

    const [playersRes, feedRes] = await Promise.all([
      supabase
        .from("world_players")
        .select("user_id,email,club_id,club_name,league_slug,league_name,current_date,updated_at")
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("world_feed")
        .select("id,kind,title,body,league_slug,club_name,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const players: WorldPlayer[] = (playersRes.data ?? []).map((r) => ({
      userId: r.user_id,
      email: r.email,
      clubId: r.club_id,
      clubName: r.club_name,
      leagueSlug: r.league_slug,
      leagueName: r.league_name,
      budget: null,
      currentDate: r.current_date,
      updatedAt: r.updated_at,
    }));

    const feed: WorldFeedItem[] = (feedRes.data ?? []).map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      title: r.title,
      body: r.body,
      leagueSlug: r.league_slug,
      clubName: r.club_name,
      createdAt: r.created_at,
    }));

    return Response.json({ configured: true, players, feed });
  },

  /**
   * Signed-in manager publishes their club into the shared world.
   * Body: { saveId }
   */
  "/api/world/sync": async (req: Request) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;

    let body: { saveId?: unknown };
    try {
      body = (await req.json()) as { saveId?: unknown };
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    if (typeof body.saveId !== "string" || !body.saveId) {
      return Response.json({ error: "saveId required" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return Response.json({ ok: true, configured: false });
    }

    await syncWorldPlayer({ userId: auth.userId, email: auth.email, saveId: body.saveId });
    return Response.json({ ok: true, configured: true });
  },
} as const;
