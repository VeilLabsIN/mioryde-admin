import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enterFullscreenIfPreferred,
  prefersFullscreenOnLogin,
  setFullscreenOnLogin,
} from "./useFullscreen";

/**
 * The preference is opt-in and lives in `localStorage`, which means it can be
 * absent, be nonsense, or throw outright — Safari in a private window throws
 * on `getItem`, not just on write.
 */
function stubStorage(store: Record<string, string>, throws = false) {
  const storage = {
    getItem: (k: string) => {
      if (throws) throw new Error("denied");
      return k in store ? store[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error("denied");
      store[k] = v;
    },
  };
  vi.stubGlobal("localStorage", storage);
}

afterEach(() => vi.unstubAllGlobals());

describe("opening the panel fullscreen", () => {
  it("is off unless somebody asked for it", () => {
    // A panel that seizes the whole display on every sign-in is hostile to the
    // operator running it beside a spreadsheet and a phone.
    stubStorage({});
    expect(prefersFullscreenOnLogin()).toBe(false);
  });

  it("remembers a yes", () => {
    const store: Record<string, string> = {};
    stubStorage(store);
    setFullscreenOnLogin(true);
    expect(prefersFullscreenOnLogin()).toBe(true);
    setFullscreenOnLogin(false);
    expect(prefersFullscreenOnLogin()).toBe(false);
  });

  it("treats unreadable storage as no, rather than throwing", () => {
    // Safari in a private window throws on read. An exception here would take
    // out the sign-in page over a convenience setting.
    stubStorage({}, true);
    expect(() => prefersFullscreenOnLogin()).not.toThrow();
    expect(prefersFullscreenOnLogin()).toBe(false);
    expect(() => setFullscreenOnLogin(true)).not.toThrow();
  });

  it("does not ask the browser when the answer is no", () => {
    stubStorage({});
    const request = vi.fn();
    vi.stubGlobal("document", {
      fullscreenEnabled: true,
      fullscreenElement: null,
      documentElement: { requestFullscreen: request },
    });
    enterFullscreenIfPreferred();
    expect(request).not.toHaveBeenCalled();
  });

  it("asks once when the answer is yes", () => {
    stubStorage({ "mioryde-fullscreen-on-login": "true" });
    const request = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("document", {
      fullscreenEnabled: true,
      fullscreenElement: null,
      documentElement: { requestFullscreen: request },
    });
    enterFullscreenIfPreferred();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when already fullscreen", () => {
    stubStorage({ "mioryde-fullscreen-on-login": "true" });
    const request = vi.fn();
    vi.stubGlobal("document", {
      fullscreenEnabled: true,
      fullscreenElement: {},
      documentElement: { requestFullscreen: request },
    });
    enterFullscreenIfPreferred();
    expect(request).not.toHaveBeenCalled();
  });

  it("survives a browser that refuses", () => {
    // The request rejects when there is no user gesture, or in an iframe
    // without `allow="fullscreen"`. A rejected convenience must never stop
    // somebody signing in, so the rejection is swallowed rather than surfaced.
    stubStorage({ "mioryde-fullscreen-on-login": "true" });
    vi.stubGlobal("document", {
      fullscreenEnabled: true,
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: () => Promise.reject(new Error("no gesture")),
      },
    });
    expect(() => enterFullscreenIfPreferred()).not.toThrow();
  });

  it("does nothing where the browser does not allow it at all", () => {
    stubStorage({ "mioryde-fullscreen-on-login": "true" });
    const request = vi.fn();
    vi.stubGlobal("document", {
      fullscreenEnabled: false,
      fullscreenElement: null,
      documentElement: { requestFullscreen: request },
    });
    enterFullscreenIfPreferred();
    expect(request).not.toHaveBeenCalled();
  });
});
