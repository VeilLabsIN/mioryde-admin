"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  deepen,
  isTheme,
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialised from the DOM, not from a default: the boot script in <head>
  // has already set data-theme, and re-deriving it here would overwrite the
  // user's choice for one frame.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === "undefined") return DEFAULT_THEME;
    const current = document.documentElement.dataset["theme"];
    return isTheme(current) ? current : DEFAULT_THEME;
  });
  const [usingSystemAccent, setUsingSystemAccent] = useState(false);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset["theme"] = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage — the theme still applies for
      // this session, it just will not be remembered.
    }
  }, []);

  /**
   * Adopts the OS accent colour under the `system` theme.
   *
   * Only meaningful in Firefox and Safari; Chromium does not expose the
   * keyword, so `readSystemAccent()` returns null and the CSS fallback (amber)
   * stays in place. See lib/theme.ts for why that is unavoidable.
   */
  useEffect(() => {
    const root = document.documentElement;

    if (theme !== "system") {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-deep");
      root.style.removeProperty("--on-accent");
      setUsingSystemAccent(false);
      return;
    }

    const apply = () => {
      const accent = readSystemAccent();
      if (!accent) {
        root.style.removeProperty("--accent");
        root.style.removeProperty("--accent-deep");
        root.style.removeProperty("--on-accent");
        setUsingSystemAccent(false);
        return;
      }
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-deep", deepen(accent));
      root.style.setProperty("--on-accent", readableOn(accent));
      setUsingSystemAccent(true);
    };

    apply();

    // The OS accent usually changes alongside light/dark, so re-read on that
    // signal. There is no dedicated "accent changed" event in any browser.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, usingSystemAccent }),
    [theme, setTheme, usingSystemAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
