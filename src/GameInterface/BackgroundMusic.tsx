import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Music2, Pause, Play, Volume2, VolumeX } from "lucide-react";

/**
 * Menu soundtrack for /start. Plays a YouTube track automatically.
 *
 * Browsers block unmuted autoplay until the user interacts with the page, so
 * the player retries once on the first pointer/keyboard gesture. The widget is
 * kept small and offers play/pause and mute controls; the mute preference is
 * remembered in localStorage.
 */

const VIDEO_ID = "UJxtuIz3W1g";
const MUTE_STORAGE_KEY = "nerva:music-muted";
const PLAYING = 1;

// ── Minimal YouTube IFrame API typings (the library ships no types) ─────────
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  getPlayerState(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string;
      width?: number | string;
      height?: number | string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

/** Loads the YouTube IFrame API once and resolves when it is ready to use. */
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const selector = 'script[src="https://www.youtube.com/iframe_api"]';
    if (!document.querySelector(selector)) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

function readMutedPreference(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function BackgroundMusic() {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const mutedRef = useRef(readMutedPreference());
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(mutedRef.current);

  useEffect(() => {
    let cancelled = false;

    function onFirstGesture() {
      const player = playerRef.current;
      if (!player) return;
      if (mutedRef.current) player.mute();
      else player.unMute();
      player.playVideo();
      document.removeEventListener("pointerdown", onFirstGesture);
      document.removeEventListener("keydown", onFirstGesture);
    }

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const yt = window.YT;
        if (!yt) return;

        new yt.Player(hostRef.current, {
          videoId: VIDEO_ID,
          width: 192,
          height: 108,
          playerVars: {
            autoplay: 1,
            controls: 0,
            loop: 1,
            playlist: VIDEO_ID,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              event.target.setVolume(60);
              if (mutedRef.current) event.target.mute();
              else event.target.unMute();
              event.target.playVideo();
              // Unmuted autoplay is usually blocked until the first user
              // gesture — if the player isn't running shortly after ready,
              // retry once the visitor interacts with the page.
              window.setTimeout(() => {
                if (cancelled) return;
                if (playerRef.current?.getPlayerState() === PLAYING) return;
                document.addEventListener("pointerdown", onFirstGesture);
                document.addEventListener("keydown", onFirstGesture);
              }, 1200);
            },
            onStateChange: (event) => {
              if (!cancelled) setPlaying(event.data === PLAYING);
            },
          },
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onFirstGesture);
      document.removeEventListener("keydown", onFirstGesture);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable (private mode) — preference stays in memory
    }
    if (next) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 select-none">
      <div className="w-48 h-[108px] overflow-hidden rounded-xl border border-border/40 bg-black shadow-lg [&_iframe]:size-full">
        <div ref={hostRef} className="h-full w-full" />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border/40 bg-background/90 backdrop-blur px-3 py-1.5">
        <Music2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("common.musicLabel")}
        </span>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? t("common.musicPause") : t("common.musicPlay")}
          className="p-1 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer bg-transparent border-0"
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? t("common.musicUnmute") : t("common.musicMute")}
          className="p-1 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer bg-transparent border-0"
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
