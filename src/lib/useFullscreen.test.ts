import { afterEach, describe, expect, it, vi } from "vitest";
import { enterFullscreenOnSignIn } from "./useFullscreen";

/**
 * Taking the whole screen on sign-in.
 *
 * It used to be a stored preference and these tests covered the storage. It is
 * now unconditional, so what is left to be wrong about is entirely the
 * browser's half of it — and every one of those failures has to be *silent*.
 * This runs inside the submit handler of the sign-in form: anything that
 * throws here throws instead of logging somebody in, which would turn a
 * display convenience into an outage.
 */

function stubDocument({
  enabled = true,
  element = null as object | null,
  request = vi.fn().mockResolvedValue(undefined),
}) {
  vi.stubGlobal("document", {
    fullscreenEnabled: enabled,
    fullscreenElement: element,
    documentElement: { requestFullscreen: request },
  });
  return request;
}

afterEach(() => vi.unstubAllGlobals());

describe("opening the panel fullscreen on sign-in", () => {
  it("asks, without being asked to", () => {
    // The panel is a dispatch console and this is what it is for. There is no
    // longer a tick to opt in with, so signing in has to be enough.
    const request = stubDocument({});
    enterFullscreenOnSignIn();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when the document is already fullscreen", () => {
    // A second sign-in in the same document — a session that expired and was
    // renewed. Asking again throws in some engines rather than being a no-op.
    const request = stubDocument({ element: {} });
    enterFullscreenOnSignIn();
    expect(request).not.toHaveBeenCalled();
  });

  it("does nothing where the browser does not allow it at all", () => {
    // False in an iframe without `allow="fullscreen"`, and under some kiosk
    // policies. The panel is windowed and works exactly as well.
    const request = stubDocument({ enabled: false });
    enterFullscreenOnSignIn();
    expect(request).not.toHaveBeenCalled();
  });

  it("survives a browser that refuses asynchronously", () => {
    // Rejects when the gesture has already ended. A refused convenience must
    // never stop somebody signing in, so it is swallowed rather than surfaced.
    stubDocument({
      request: vi.fn().mockRejectedValue(new Error("no gesture")),
    });
    expect(() => enterFullscreenOnSignIn()).not.toThrow();
  });

  it("survives an engine that throws synchronously", () => {
    // Older WebKit throws rather than returning a rejected promise, which a
    // bare `.catch()` would not have caught.
    stubDocument({
      request: vi.fn(() => {
        throw new Error("denied");
      }),
    });
    expect(() => enterFullscreenOnSignIn()).not.toThrow();
  });
});
