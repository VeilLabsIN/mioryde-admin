"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  deepen,
  effectiveTheme,
  readStoredTheme,
  readSystemAccent,
  readableOn,
  type Theme,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** True when the OS accent was readable and is actually in use. */
  usingSystemAccent: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/**
 * The OS accent, read once and held.
 *
 * `useSyncExternalStore` calls its snapshot on every render, and reading this
 * costs a DOM insertion plus a forced style resolve (see `readSystemAccent`) —
 * so the answer is cached and only thrown away when the browser says the
 * colour scheme changed, which is the sole signal any engine gives that the
 * accent may have moved with it. There is no "accent changed" event anywhere.
 */
let cachedAccent: string | null = null;
let accentIsRead = false;

function accentSnapshot(): string | null {
  if (!accentIsRead) {
    cachedAccent = readSystemAccent();
    accentIsRead = true;
  }
  return cachedAccent;
}

function subscribeAccent(listener: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    accentIsRead = false;
    listener();
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /*
   * The operator's choice — not necessarily what is on screen.
   *
   * Initialised from storage rather than from `data-theme`, which used to be
   * the source. It cannot be any more: the boot script writes `tokyo` there on
   * the sign-in page whatever the preference is, so reading the DOM back would
   * mean signing in on black and having black saved as your theme the next
   * time you touched the switcher.
   */
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? DEFAULT_THEME : readStoredTheme(),
  );

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage — the theme still applies for
      // this session, it just will not be remembered.
    }
  }, []);

  /*
   * What the document is actually painted with.
   *
   * The sign-in page is always dark; everywhere else is the preference. The
   * document is an external system, so this is a real effect rather than a
   * write buried inside `setTheme` — which is also what makes a *route*
   * change repaint, since nobody calls `setTheme` when you sign in.
   *
   * The boot script has already written the same value for the first paint,
   * so this is a no-op on mount rather than a correction.
   */
  const applied = effectiveTheme(theme, pathname ?? "");
  useEffect(() => {
    document.documentElement.dataset["theme"] = applied;
  }, [applied]);

  /*
   * Adopts the OS accent colour under the `system` theme.
   *
   * Only meaningful in Firefox and Safari; Chromium does not expose the
   * keyword, so `readSystemAccent()` returns null and the CSS fallback (amber)
   * stays in place. See lib/theme.ts for why that is unavoidable.
   *
   * "Whether the OS accent is in use" is not a fact to be remembered — it is
   * what the theme and the browser jointly say, so it is derived. It was a
   * piece of state written from inside the same effect that wrote the CSS
   * variables, which meant the two could be a render apart and a consumer
   * could be told the accent was in use before it had been applied.
   */
  const systemAccent = useSyncExternalStore(
    subscribeAccent,
    accentSnapshot,
    () => null,
  );
  const accent = applied === "system" ? systemAccent : null;
  const usingSystemAccent = accent !== null;

  // The one thing here that is genuinely a side effect: the document is an
  // external system, and this is what keeps it in step with the value above.
  useEffect(() => {
    const root = document.documentElement;
    if (accent === null) {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-deep");
      root.style.removeProperty("--on-accent");
      return;
    }
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-deep", deepen(accent));
    root.style.setProperty("--on-accent", readableOn(accent));
  }, [accent]);

  const value = useMemo(
    () => ({ theme, setTheme, usingSystemAccent }),
    [theme, setTheme, usingSystemAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
