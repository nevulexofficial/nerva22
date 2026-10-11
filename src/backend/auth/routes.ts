import {
  requestLoginCode,
  verifyLoginCode,
  deleteSession,
  signInWithGoogleUser,
} from "@/backend/auth/AuthService";
import {
  getGoogleConfig,
  createOAuthState,
  consumeOAuthState,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  fetchGoogleUser,
} from "@/backend/auth/googleAuth";
import {
  setSessionCookieHeader,
  clearSessionCookieHeader,
  readSessionCookie,
} from "@/backend/auth/cookie";
import { getAuth } from "@/backend/auth/middleware";

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

  // ── Google OAuth (sign in with Google) ───────────────────────────────────
  // Step 1: bounce the browser to Google's consent screen with a one-time
  // CSRF state. Without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET configured the
  // login page hides the button, but this route also guards server-side.
  "/api/auth/google": (req: Request) => {
    const config = getGoogleConfig(req);
    if (!config) return oauthFail(req, "google_not_configured");
    return Response.redirect(buildGoogleAuthUrl(config, createOAuthState()), 302);
  },

  // Step 2: Google redirects back here with ?code&state — exchange the code for
  // the profile, sign the user in with the shared session system, and send them
  // to /start with the session cookie set.
  "/api/auth/google/callback": async (req: Request) => {
    const url = new URL(req.url);
    if (url.searchParams.get("error")) return oauthFail(req, "google_cancelled");

    const state = url.searchParams.get("state");
    const code  = url.searchParams.get("code");
    if (!state || !code) return oauthFail(req, "google_failed");
    if (!consumeOAuthState(state)) return oauthFail(req, "google_state");

    const config = getGoogleConfig(req);
    if (!config) return oauthFail(req, "google_not_configured");

    try {
      const accessToken = await exchangeGoogleCode(code, config);
      const googleUser  = await fetchGoogleUser(accessToken);
      if (!googleUser.emailVerified) return oauthFail(req, "google_email_not_verified");

      const { session } = signInWithGoogleUser(googleUser.email);
      return new Response(null, {
        status: 303,
        headers: {
          Location:     new URL("/start", req.url).href,
          "Set-Cookie": setSessionCookieHeader(session.token, session.expiresAt),
        },
      });
    } catch (e) {
      console.error("[auth] google oauth failed:", e);
      return oauthFail(req, "google_failed");
    }
  },
};

function oauthFail(req: Request, reason: string): Response {
  return Response.redirect(new URL(`/login?error=${reason}`, req.url), 303);
}
