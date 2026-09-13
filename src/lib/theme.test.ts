import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  LOGIN_PATH,
  effectiveTheme,
  readStoredTheme,
  themeBootScript,
} from "./theme";

/**
 * The preference, and what the document is actually painted with.
 *
 * These are two different things and the whole point of the split is that they
 * can disagree: the sign-in page is dark for everybody, including the operator
 * whose panel is light. What must never happen is the disagreement leaking
 * back into storage — signing in on black and finding black saved as your
 * theme is the panel changing a setting nobody touched.
 */

function stubStorage(store: Record<string, string>, throws = false) {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (throws) throw new Error("denied");
      return k in store ? store[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error("denied");
      store[k] = v;
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("readStoredTheme", () => {
  it("returns a stored choice", () => {
    stubStorage({ "mioryde-admin-theme": "tokyo" });
    expect(readStoredTheme()).toBe("tokyo");
  });

  it("migrates the retired pitch-black theme rather than forgetting it", () => {
    // `midnight` is still in localStorage for everyone who picked it. Dropping
    // them to daylight reads as the panel forgetting their choice.
    stubStorage({ "mioryde-admin-theme": "midnight" });
    expect(readStoredTheme()).toBe("tokyo");
  });

  it("falls back for nothing stored and for nonsense", () => {
    stubStorage({});
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
    stubStorage({ "mioryde-admin-theme": "neon" });
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });

  it("survives storage that throws on read", () => {
    // Safari in a private window throws on `getItem`, not only on write. An
    // exception here would take out every page in the panel.
    stubStorage({}, true);
    expect(() => readStoredTheme()).not.toThrow();
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });
});

describe("effectiveTheme", () => {
  it("paints the sign-in page dark whatever the preference is", () => {
    expect(effectiveTheme("daylight", LOGIN_PATH)).toBe("tokyo");
    expect(effectiveTheme("system", LOGIN_PATH)).toBe("tokyo");
    expect(effectiveTheme("tokyo", LOGIN_PATH)).toBe("tokyo");
  });

  it("does the same for a trailing slash", () => {
    // Next writes the route without one, but a static export served by
    // something that adds one must not fall through to the light theme.
    expect(effectiveTheme("daylight", `${LOGIN_PATH}/`)).toBe("tokyo");
  });

  it("hands every other page back the operator's own theme", () => {
    expect(effectiveTheme("daylight", "/")).toBe("daylight");
    expect(effectiveTheme("daylight", "/payouts")).toBe("daylight");
    expect(effectiveTheme("system", "/riders/abc")).toBe("system");
  });

  it("does not treat a page that merely starts with the path as sign-in", () => {
    // A future /login-help would otherwise be forced dark by a prefix match.
    expect(effectiveTheme("daylight", "/login-help")).toBe("daylight");
  });
});

describe("themeBootScript", () => {
  it("names the sign-in path and the dark theme, so there is no light flash", () => {
    // It runs blocking in <head>, before React exists. If it did not know
    // about the route, the sign-in page would paint light and be corrected
    // after hydration — a flash on the one page that is always a cold load.
    expect(themeBootScript).toContain(JSON.stringify(LOGIN_PATH));
    expect(themeBootScript).toContain('"tokyo"');
  });

  it("still reads the preference, and does not write anything", () => {
    // The preference decides every other page, and the sign-in page must
    // leave it exactly as it found it.
    expect(themeBootScript).toContain("getItem");
    expect(themeBootScript).not.toContain("setItem");
  });

  it("falls back to a theme even when storage throws", () => {
    expect(themeBootScript).toContain("catch");
  });
});
