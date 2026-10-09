import { createHash, randomUUID } from "crypto";
import { db } from "@/backend/db";
import { isSupabaseConfigured } from "@/backend/supabase";
import { pushWorldEvent } from "@/backend/worldRoutes";

/**
 * Admin panel backend.
 *
 * Access model: an operator redeems the admin code ("canjeos") once; the
 * server verifies it and issues a short-lived HttpOnly session cookie. The
 * code itself can be rotated via the ADMIN_REDEEM_CODE env var.
 */

const ADMIN_CODE = (process.env.ADMIN_REDEEM_CODE ?? "iamnevulex").trim();
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const COOKIE_NAME = "nerva_admin";

// Admin sessions live in their own SQLite table (created on first use).
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function readAdminCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name === COOKIE_NAME && value) return decodeURIComponent(value);
  }
  return null;
}

export function isAdmin(req: Request): boolean {
  const token = readAdminCookie(req);
  if (!token) return false;
  const row = db
    .prepare("SELECT 1 AS hit FROM admin_sessions WHERE token = ? AND expires_at > ?")
    .get(hashToken(token), Date.now());
  return !!row;
}

function requireAdmin(req: Request): Response | null {
  if (isAdmin(req)) return null;
  return Response.json({ error: "admin unauthorized" }, { status: 403 });
}

function setAdminCookie(token: string): string {
  const maxAge = Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

/** XOR constant-time string compare (length-leaks only). */
function safeEqual(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export const adminRoutes = {
  /** Redeem the admin code ("canjeos") → admin session cookie. */
  "/api/admin/redeem": async (req: Request) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: { code?: unknown };
    try {
      body = (await req.json()) as { code?: unknown };
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || !safeEqual(code, ADMIN_CODE)) {
      return Response.json({ error: "invalid code" }, { status: 401 });
    }

    const token = randomUUID() + randomUUID().replace(/-/g, "");
    const now = Date.now();
    db.prepare("INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)").run(
      hashToken(token),
      now,
      now + ADMIN_SESSION_TTL_MS,
    );

    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": setAdminCookie(token) } },
    );
  },

  "/api/admin/logout": async (req: Request) => {
    const token = readAdminCookie(req);
    if (token) db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(hashToken(token));
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` } },
    );
  },

  /** Session check for the admin UI. */
  "/api/admin/me": async (req: Request) => {
    if (isAdmin(req)) return Response.json({ admin: true });
    return Response.json({ admin: false }, { status: 401 });
  },

  /** Dashboard stats: users, saves, sessions, Supabase status. */
  "/api/admin/stats": async (req: Request) => {
    const deny = requireAdmin(req);
    if (deny) return deny;

    const users = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
    const sessions = (
      db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?").get(Date.now()) as { n: number }
    ).n;
    const saves = (db.prepare("SELECT COUNT(*) AS n FROM saves").get() as { n: number }).n;
    const adminSessions = (
      db.prepare("SELECT COUNT(*) AS n FROM admin_sessions WHERE expires_at > ?").get(Date.now()) as { n: number }
    ).n;

    return Response.json({
      users,
      activeSessions: sessions,
      saves,
      activeAdminSessions: adminSessions,
      supabaseConfigured: isSupabaseConfigured(),
      nodeEnv: process.env.NODE_ENV ?? "development",
    });
  },

  /** User list for the admin panel. */
  "/api/admin/users": async (req: Request) => {
    const deny = requireAdmin(req);
    if (deny) return deny;

    const rows = db
      .prepare("SELECT id, email, created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 200")
      .all() as { id: string; email: string; createdAt: number }[];

    const savesByUser = db
      .prepare("SELECT user_id AS userId, COUNT(*) AS n FROM saves GROUP BY user_id")
      .all() as { userId: string; n: number }[];
    const saveCount = new Map(savesByUser.map((r) => [r.userId, r.n]));

    return Response.json({
      users: rows.map((r) => ({ ...r, saveCount: saveCount.get(r.id) ?? 0 })),
    });
  },

  /** Broadcast a message into the shared world feed (Supabase). */
  "/api/admin/broadcast": async (req: Request) => {
    const deny = requireAdmin(req);
    if (deny) return deny;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });

    let body: { title?: unknown; body?: unknown };
    try {
      body = (await req.json()) as { title?: unknown; body?: unknown };
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : null;
    if (!title) return Response.json({ error: "title required" }, { status: 400 });
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "supabase not configured" }, { status: 503 });
    }

    await pushWorldEvent({ kind: "broadcast", title, body: text });
    return Response.json({ ok: true });
  },
} as const;

