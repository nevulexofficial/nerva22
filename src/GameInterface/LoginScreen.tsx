import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getBrowserSupabase } from "@/supabaseClient";

// Full-screen background behind the login screen.
const BACKGROUND_IMAGE_URL =
  "https://i.postimg.cc/Qdg50qcZ/Picsart-26-10-11-09-23-50-485.jpg";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

interface SupabaseState {
  enabled:  boolean;
  checking: boolean;
}

export function LoginScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The only sign-in method is Google through Supabase Auth, so the button
  // stays disabled until the backend confirms credentials exist (a failed
  // check fails open and lets Supabase report the problem).
  const [supabase, setSupabase] = useState<SupabaseState>({ enabled: false, checking: true });

  useEffect(() => {
    let cancelled = false;
    getBrowserSupabase()
      .then((client) => {
        if (!cancelled) setSupabase({ enabled: client !== null, checking: false });
      })
      .catch(() => {
        if (!cancelled) setSupabase({ enabled: true, checking: false });
      });
    return () => { cancelled = true; };
  }, []);

  async function signInWithGoogle() {
    setSubmitting(true);
    setError(null);
    const client = await getBrowserSupabase();
    if (!client) {
      setSubmitting(false);
      setError(t("common.supabaseNotConfigured"));
      return;
    }

    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    // On success the browser is navigating away to Google; only surface errors.
    if (oauthError) {
      setSubmitting(false);
      setError(t("common.googleSignInFailed"));
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Background image */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${BACKGROUND_IMAGE_URL})` }}
        />
        {/* Dark overlay so the title and button stay readable */}
        <div className="absolute inset-0 bg-background/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center mb-12">
          <h1 className="text-6xl md:text-8xl font-black tracking-tight font-display">
            <span className="text-foreground">NERV</span>
            <span className="text-primary glow-text">4</span>
          </h1>
          <p className="mt-4 text-sm md:text-base tracking-[0.4em] text-muted-foreground uppercase font-medium">
            {t("common.signInTitle")}
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          {error && (
            <p className="text-xs text-center text-destructive uppercase tracking-wider font-semibold">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!supabase.enabled || submitting}
            onClick={() => { void signInWithGoogle(); }}
            className="flex items-center justify-center gap-3 w-full py-4 px-8 bg-white text-[#1f1f1f] rounded-xl font-bold text-lg uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] border-0 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            <GoogleIcon className="w-6 h-6" />
            {t("common.googleSignIn")}
          </button>

          {supabase.checking && (
            <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
              {t("common.checkingSignIn")}
            </p>
          )}
          {!supabase.checking && !supabase.enabled && (
            <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
              {t("common.supabaseNotConfigured")}
            </p>
          )}
        </div>

        <div className="absolute bottom-6 text-xs text-muted-foreground/50 font-mono">
          {t("common.version")}
        </div>
      </div>
    </div>
  );
}
