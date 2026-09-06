"use client";

import { useCallback, useEffect, useState } from "react";

const PREFERENCE_KEY = "mioryde-fullscreen-on-login";

/**
 * Whether the operator asked for the panel to open fullscreen.
 *
 * Read outside React as well as in it, because the login form needs the answer
 * inside a submit handler rather than at render.
 */
export function prefersFullscreenOnLogin(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setFullscreenOnLogin(next: boolean): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, String(next));
  } catch {
    // Not remembering is survivable; the toggle in the bar still works.
  }
}

/**
 * Enter and leave browser fullscreen, and know which one you are in.
 *
 * ## The constraint that shapes this whole feature
 *
 * `requestFullscreen()` is refused unless it happens during a user gesture.
 * That is a browser rule, not a preference, and it means **"open the panel
 * fullscreen after signing in" cannot work the obvious way** — by the time the
 * dashboard has mounted, the click that caused it is long over and the request
 * is rejected with a bare `TypeError`.
 *
 * So the request is made from the sign-in submit itself, which *is* a gesture,
 * and it survives the navigation because fullscreen belongs to the document and
 * the panel is a client-side route change rather than a page load.
 *
 * ## Why it is a preference rather than a behaviour
 *
 * A panel that seizes the whole display every time somebody signs in is hostile
 * to the operator who runs it beside a spreadsheet and a phone. It is opt-in,
 * remembered, and there is a manual toggle in the top bar either way — which is
 * also the escape hatch for anyone who turned it on and regretted it.
 *
 * ## Why the state is read from the document, not tracked
 *
 * Escape leaves fullscreen without telling the page through any code path we
 * control. A boolean we set ourselves would say "fullscreen" while the browser
 * disagreed, and the button would offer to do the thing it was already not
 * doing. `fullscreenchange` is the only honest source.
 */
export function useFullscreen(): {
  isFullscreen: boolean;
  supported: boolean;
  toggle: () => Promise<void>;
} {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    // Read in an effect rather than during render: `document` does not exist
    // on the server, and a value that differs between the server HTML and the
    // first client render is a hydration mismatch.
    setSupported(Boolean(document.fullscreenEnabled));
    setIsFullscreen(Boolean(document.fullscreenElement));

    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Refused — no gesture, an iframe without `allow="fullscreen"`, or a
      // browser policy. Swallowed deliberately: the operator asked for a
      // convenience and did not get it, which is not worth an error dialog
      // over. `fullscreenchange` never fires, so the button stays honest
      // about the state the document is actually in.
    }
  }, []);

  return { isFullscreen, supported, toggle };
}

/**
 * Requests fullscreen from inside a user gesture, if the operator asked for it.
 *
 * Called by the sign-in handler. Deliberately **not** awaited by the caller:
 * the navigation must not wait on a display change, and a refusal must not
 * stop somebody signing in.
 */
export function enterFullscreenIfPreferred(): void {
  if (!prefersFullscreenOnLogin()) return;
  try {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen().catch(() => {
      // As above: a refused convenience is not an error worth showing.
    });
  } catch {
    // Older engines throw synchronously rather than rejecting.
  }
}
