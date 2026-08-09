export const THEMES = ["midnight", "daylight", "system"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * `system` by default: a new operator gets whatever their OS is already set to,
 * and their accent colour where the browser exposes it. Someone who prefers a
 * fixed look picks midnight or daylight, and that choice is remembered.
 */
export const DEFAULT_THEME: Theme = "system";
export const THEME_STORAGE_KEY = "mioryde-admin-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs before first paint, injected into <head> as a blocking script.
 *
 * Without this the server renders the default theme, then the client corrects
 * it after hydration — a white flash on every load for anyone using midnight.
 * It has to be blocking and inline: a deferred or external script is already
 * too late.
 *
 * Kept deliberately tiny and dependency-free, because it is on the critical
 * path of every single page load.
 */
export const themeBootScript = `
(function(){
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t !== "midnight" && t !== "daylight" && t !== "system") t = ${JSON.stringify(DEFAULT_THEME)};
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
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
 * Mioryde amber. That fallback is not a failure mode — it is the common path,
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
