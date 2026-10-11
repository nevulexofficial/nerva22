import { randomUUID } from "crypto";
import { db } from "@/backend/db";

const STATE_TTL_MS = 10 * 60 * 1000;
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleConfig {
  clientId:     string;
  clientSecret: string;
  redirectUri:  string;
}

export interface GoogleUser {
  sub:            string;
  email:          string;
  emailVerified:  boolean;
}

export function isGoogleAuthConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID?.trim() && !!process.env.GOOGLE_CLIENT_SECRET?.trim();
}

/**
 * Resolves the OAuth credentials. `redirectUri` prefers GOOGLE_REDIRECT_URI and
 * falls back to the current request origin, so local dev works with no extra
 * configuration.
 */
export function getGoogleConfig(req?: Request): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() || defaultRedirectUri(req);

  return { clientId, clientSecret, redirectUri };
}

function defaultRedirectUri(req?: Request): string {
  if (!req) return "/api/auth/google/callback";
  return `${new URL(req.url).origin}/api/auth/google/callback`;
}

/** Stores a one-time state value that the callback must echo back (CSRF guard). */
export function createOAuthState(): string {
  const state = randomUUID();
  db.prepare(
    "INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)",
  ).run(state, Date.now() + STATE_TTL_MS);
  return state;
}

/** Consumes a state value: fails if unknown or expired, deletes it on success. */
export function consumeOAuthState(state: string): boolean {
  const row = db
    .prepare("SELECT state FROM oauth_states WHERE state = ? AND expires_at > ?")
    .get(state, Date.now()) as { state: string } | undefined;
  if (!row) return false;
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(Date.now());
  return true;
}

export function buildGoogleAuthUrl(config: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id:     config.clientId,
    redirect_uri:  config.redirectUri,
    response_type: "code",
    scope:         "openid email profile",
    state,
    prompt:        "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchanges the authorization code for an access token. */
export async function exchangeGoogleCode(
  code: string,
  config: GoogleConfig,
): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id:     config.clientId,
    client_secret: config.clientSecret,
    redirect_uri:  config.redirectUri,
    grant_type:    "authorization_code",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!res.ok) throw new Error(`google token exchange failed: HTTP ${res.status}`);

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("google token response missing access_token");
  return data.access_token;
}

/** Loads the Google profile for the authenticated user. */
export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`google userinfo failed: HTTP ${res.status}`);

  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (!data.sub || !data.email) throw new Error("google userinfo missing sub/email");

  return {
    sub:           data.sub,
    email:         data.email,
    emailVerified: data.email_verified === true,
  };
}
