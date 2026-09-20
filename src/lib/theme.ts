export const THEMES = ["daylight", "tokyo", "system"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * `daylight` by default, not `system`.
 *
 * The panel is designed light — warm off-white, yellow, a green second voice.
 * Deferring to the OS meant roughly half of new operators saw a dark panel they
 * never asked for as their first impression of the product, which is not the
 * product. Dark is a preference someone opts into, and it is remembered.
 */
export const DEFAULT_THEME: Theme = "daylight";
export const THEME_STORAGE_KEY = "mioryde-admin-theme";

/**
 * The sign-in page is always dark, whatever the operator's theme is.
 *
 * It is the one screen that is not the operator's workspace — it is the front
 * door, and it is the only page in the panel that is a composition rather than
 * a table. The dark ground is what the scene behind the form is drawn for: the
 * ambient light reads as light on it, and on the warm off-white of `daylight`
 * the same glow reads as a smudge on the paper.
 *
 * It does **not** touch the stored preference. Somebody whose panel is
 * `daylight` signs in on black and lands on their own light panel, and the
 * splash covers the change. Writing it down would be a page quietly changing
 * a setting nobody asked it to.
 */
export const LOGIN_PATH = "/login";
export const LOGIN_THEME: Theme = "tokyo";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * The operator's stored preference, normalised.
 *
 * The `midnight` line migrates the old pitch-black theme, whose key is still
 * sitting in localStorage for everyone who picked it. Without it those users
 * would silently be dropped back to daylight, which reads as the panel
 * forgetting their choice rather than as a redesign.
 *
 * Kept in step with `themeBootScript` below, which has to do the same thing
 * inline and cannot call this.
 */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "midnight") return "tokyo";
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private browsing throws on read, not only on write.
    return DEFAULT_THEME;
  }
}

/**
 * What `data-theme` should actually say, given the preference and the route.
 *
 * The distinction matters: `preference` is what the operator chose and what
 * the theme switcher shows, and this is what the document is painted with.
 * Collapsing the two is how the sign-in page would end up saving `tokyo` over
 * somebody's `daylight`.
 */
export function effectiveTheme(preference: Theme, pathname: string): Theme {
  // Next writes the route without a trailing slash, but a static export served
  // by something that adds one must not fall through to the light theme.
  const onLogin = pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`;
  return onLogin ? LOGIN_THEME : preference;
}

/**
 * Runs before first paint, injected into <head> as a blocking script.
 *
 * Without this the server renders the default theme, then the client corrects
 * it after hydration — a dark flash on every load for anyone using tokyo. It
 * has to be blocking and inline: a deferred or external script is already too
 * late.
 *
 * The "midnight" line migrates the old pitch-black theme, whose key is still
 * sitting in localStorage for everyone who picked it. Without it those users
 * would silently be dropped back to daylight, which reads as the panel
 * forgetting their choice rather than as a redesign.
 *
 * The route check is the sign-in page's dark ground, applied here rather than
 * only in React for the same reason as everything else in this script: React
 * corrects it after hydration, which is a light flash on the one page that is
 * always a cold load. It reads the preference and then ignores it, so nothing
 * is written and the operator's own theme is waiting on the other side.
 *
 * Kept deliberately tiny and dependency-free, because it is on the critical
 * path of every single page load.
 */
export const themeBootScript = `
(function(){
  var p = location.pathname;
  var login = p === ${JSON.stringify(LOGIN_PATH)} || p === ${JSON.stringify(LOGIN_PATH + "/")};
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t === "midnight") t = "tokyo";
    if (t !== "daylight" && t !== "tokyo" && t !== "system") t = ${JSON.stringify(DEFAULT_THEME)};
    document.documentElement.dataset.theme = login ? ${JSON.stringify(LOGIN_THEME)} : t;
  } catch (e) {
    document.documentElement.dataset.theme = login ? ${JSON.stringify(LOGIN_THEME)} : ${JSON.stringify(DEFAULT_THEME)};
  }
})();
`.trim();

/**
 * Reads the operating system's accent colour, if the browser exposes it.
 *
 * `AccentColor` is a CSS system colour keyword from Color Level 4. Firefox and
 * Safari 16.4+ resolve it to the real OS accent — on Windows that is the colour
 * chosen in Settings → Personalisation → Colours, the one used for the Start
 * menu and window chrome. **Chromium does not implement it**, and there is no
 * JavaScript API for it either.
 *
 * So this returns null more often than not, and the caller falls back to the
 * Mioryde gold. That fallback is not a failure mode — it is the common path,
 * and it has to look intentional rather than broken.
 */
export function readSystemAccent(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.CSS?.supports?.("color", "AccentColor")) return null;

  // Resolve the keyword by letting the browser compute it on a throwaway node.
  // `getComputedStyle` on a detached element returns empty in some engines, so
  // it must be in the document — but never painted.
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;color:AccentColor;pointer-events:none;";
  document.body.appendChild(probe);

  try {
    const resolved = getComputedStyle(probe).color;
    // A browser that does not really support it resolves to the inherited
    // colour, which is almost always black or white — not an accent.
    if (!resolved || resolved === "rgb(0, 0, 0)" || resolved === "rgb(255, 255, 255)") {
      return null;
    }
    return resolved;
  } catch {
    return null;
  } finally {
    probe.remove();
  }
}

/**
 * Picks readable foreground for a background, using WCAG relative luminance.
 *
 * A user's accent can be anything from near-black navy to bright yellow. Fixing
 * the text colour would make half of them unreadable, so it is derived.
 */
export function readableOn(cssColor: string): "#000000" | "#ffffff" {
  const match = cssColor.match(/-?\d+(\.\d+)?/g);
  if (!match || match.length < 3) return "#000000";

  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const [r = 0, g = 0, b = 0] = match.slice(0, 3).map(Number);
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  // 0.179 is where contrast against black and white is equal.
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

/** Darkens an accent for the gradient's second stop. */
export function deepen(cssColor: string, amount = 0.18): string {
  const match = cssColor.match(/-?\d+(\.\d+)?/g);
  if (!match || match.length < 3) return cssColor;
  const [r = 0, g = 0, b = 0] = match.slice(0, 3).map(Number);
  const scale = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `rgb(${scale(r)}, ${scale(g)}, ${scale(b)})`;
}
