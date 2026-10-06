import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Monitor, Smartphone } from "lucide-react";

export type DisplayMode = "desktop" | "phone";

const STORAGE_KEY = "touchlines.displayMode";
const PHONE_MAX_WIDTH = 767;

interface DisplayModeContextValue {
  /** Current effective display mode. */
  mode: DisplayMode;
  /** True while the mode still follows the viewport (no explicit user choice stored). */
  isAuto: boolean;
  /** Explicitly choose a mode (persisted). */
  setMode: (mode: DisplayMode) => void;
  /** Flip between desktop and phone (persisted). */
  toggle: () => void;
}

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

function readStoredMode(): DisplayMode | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "desktop" || raw === "phone" ? raw : null;
  } catch {
    return null;
  }
}

function detectMode(): DisplayMode {
  if (typeof window === "undefined") return "desktop";
  const stored = readStoredMode();
  if (stored) return stored;
  return window.innerWidth <= PHONE_MAX_WIDTH ? "phone" : "desktop";
}

/**
 * Provides the desktop/phone display mode for the whole app.
 * - Auto-detects small viewports (≤767px) until the user explicitly toggles.
 * - Persists an explicit choice in localStorage.
 * - Mirrors the mode onto <html data-display-mode="…"> so CSS can adapt the chrome.
 */
export function DisplayModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DisplayMode>(detectMode);
  const [isAuto, setIsAuto] = useState<boolean>(() => readStoredMode() === null);

  useLayoutEffect(() => {
    document.documentElement.dataset.displayMode = mode;
  }, [mode]);

  // While the user hasn't chosen a mode, keep following the viewport size.
  useEffect(() => {
    if (!isAuto) return;
    const apply = () => {
      const next: DisplayMode =
        window.innerWidth <= PHONE_MAX_WIDTH ? "phone" : "desktop";
      setModeState((prev) => (prev === next ? prev : next));
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [isAuto]);

  const setMode = useCallback((next: DisplayMode) => {
    setIsAuto(false);
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode) — mode still applies in-memory.
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "phone" ? "desktop" : "phone");
  }, [mode, setMode]);

  return (
    <DisplayModeContext.Provider value={{ mode, isAuto, setMode, toggle }}>
      {children}
      <DisplayModeToggle />
    </DisplayModeContext.Provider>
  );
}

export function useDisplayMode(): DisplayModeContextValue {
  const ctx = useContext(DisplayModeContext);
  if (!ctx) throw new Error("useDisplayMode must be used within DisplayModeProvider");
  return ctx;
}

function DisplayModeToggle() {
  const { t } = useTranslation();
  const { mode, toggle } = useDisplayMode();
  const switchingToPhone = mode === "desktop";
  const label = switchingToPhone
    ? t("displayMode.switchToPhone")
    : t("displayMode.switchToDesktop");

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      data-ui="display-mode-toggle"
      className="fixed right-3 bottom-16 z-[60] w-10 h-10 rounded-full card-arcade border-glow flex items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-pointer backdrop-blur-md shadow-lg"
    >
      {switchingToPhone ? (
        <Smartphone className="w-5 h-5" />
      ) : (
        <Monitor className="w-5 h-5" />
      )}
    </button>
  );
}