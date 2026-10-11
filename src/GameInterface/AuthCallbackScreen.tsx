import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/supabaseClient";

/**
 * Landing page for the Supabase Google OAuth flow.
 *
 * supabase-js (PKCE) stored the code verifier in localStorage before the
 * redirect to Google, so a client created here can exchange the ?code that
 * Google's redirect brings back. The resulting access token is then swapped for
 * this app's own session cookie via /api/auth/supabase.
 */
export function AuthCallbackScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = await getBrowserSupabase();
        if (!supabase) {
          if (!cancelled) setError(t("common.supabaseNotConfigured"));
          return;
        }

        const { data, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(window.location.href);
        const accessToken = data.session?.access_token;
        if (exchangeError || !accessToken) {
          if (!cancelled) setError(t("common.googleSignInFailed"));
          return;
        }

        const res = await fetch("/api/auth/supabase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken }),
        });
        if (!res.ok) {
          if (!cancelled) setError(t("common.googleSignInFailed"));
          return;
        }

        if (!cancelled) window.location.href = "/start";
      } catch {
        if (!cancelled) setError(t("common.googleSignInFailed"));
      }
    })();

    return () => { cancelled = true; };
  }, [t]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-5xl md:text-7xl font-black tracking-tight font-display mb-6">
          <span className="text-foreground">NERV</span>
          <span className="text-primary glow-text">4</span>
        </h1>

        {!error && (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm tracking-[0.3em] text-muted-foreground uppercase font-medium">
              {t("common.checkingSignIn")}
            </p>
          </>
        )}

        {error && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-xs text-center text-destructive uppercase tracking-wider font-semibold max-w-sm">
              {error}
            </p>
            <a
              href="/login"
              className="flex items-center justify-center gap-3 w-full max-w-xs py-3 px-8 card-arcade text-secondary-foreground rounded-xl font-bold uppercase tracking-wider transition-all hover:border-primary/50 no-underline"
            >
              {t("common.back")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
