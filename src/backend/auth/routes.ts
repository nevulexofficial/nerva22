import {
  requestLoginCode,
  verifyLoginCode,
  deleteSession,
  signInWithGoogleUser,
} from "@/backend/auth/AuthService";
import {
  setSessionCookieHeader,
  clearSessionCookieHeader,
  readSessionCookie,
} from "@/backend/auth/cookie";
import { getAuth } from "@/backend/auth/middleware";
import { getSupabase } from "@/backend/supabase";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const authRoutes = {
  "/api/auth/request-code": async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: { email?: unknown };
    try {
      body = (await req.json()) as { email?: unknown };
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !EMAIL_RE.test(email))
      return Response.json({ error: "invalid email" }, { status: 400 });
    try {
      const { devCode } = await requestLoginCode(email);
      // Dev mode: no SMTP configured, so the code is returned to be shown on
      // screen (never in production — SMTP2GO_API_KEY presence gates this).
      return Response.json(devCode ? { ok: true, devCode } : { ok: true });
    } catch (e) {
      console.error("[auth] failed to send login code:", e);
      return Response.json(
        { error: "could not send login code, please try again" },
        { status: 502 },
      );
    }
    return Response.json({ ok: true });
  },

  "/api/auth/verify": async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: { email?: unknown; code?: unknown };
    try {
      body = (await req.json()) as { email?: unknown; code?: unknown };
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const code  = typeof body.code  === "string" ? body.code.trim()  : "";
    if (!email || !code)
      return Response.json({ error: "email and code required" }, { status: 400 });

    const result = verifyLoginCode(email, code);
    if (!result)
      return Response.json({ error: "invalid or expired code" }, { status: 401 });

    return Response.json(
      { user: { id: result.user.id, email: result.user.email } },
      {
        headers: {
          "Set-Cookie": setSessionCookieHeader(
            result.session.token,
            result.session.expiresAt,
          ),
        },
      },
    );
  },

  "/api/auth/me": async (req: Request) => {
    const auth = getAuth(req);
    if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
    return Response.json({ id: auth.userId, email: auth.email });
  },

  "/api/auth/logout": async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });
    const token = readSessionCookie(req);
    if (token) deleteSession(token);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": clearSessionCookieHeader() } },
    );
  },

  // ── Sign in with Google (through Supabase Auth) ───────────────────────────
  // The browser runs supabase.auth.signInWithOAuth({ provider: "google" }) and
  // lands back on /auth/callback with an authorization code. That page posts
  // the resulting Supabase access token here; we validate it with Supabase and
  // mint this app's own session cookie, so every auth-gated route keeps working
  // unchanged.
  "/api/auth/supabase": async (req: Request) => {
    if (req.method !== "POST")
      return Response.json({ error: "method not allowed" }, { status: 405 });

    const body = (await req.json().catch(() => null)) as
      | { access_token?: string }
      | null;
    const accessToken = body?.access_token?.trim();
    if (!accessToken)
      return Response.json({ error: "missing access_token" }, { status: 400 });

    const supabase = getSupabase();
    if (!supabase)
      return Response.json({ error: "supabase not configured" }, { status: 503 });

    const { data, error } = await supabase.auth.getUser(accessToken);
    const supaUser = data?.user;
    if (error || !supaUser?.email)
      return Response.json({ error: "invalid token" }, { status: 401 });

    // Google identities are verified, but keep the guard for other providers.
    const emailVerified =
      !!supaUser.email_confirmed_at ||
      supaUser.user_metadata?.email_verified === true;
    if (!emailVerified)
      return Response.json({ error: "email not verified" }, { status: 403 });

    const { user, session } = signInWithGoogleUser(supaUser.email);
    return Response.json(
      { ok: true, user: { id: user.id, email: user.email } },
      {
        headers: {
          "Set-Cookie": setSessionCookieHeader(session.token, session.expiresAt),
        },
      },
    );
  },
};
