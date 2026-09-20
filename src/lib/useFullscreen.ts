"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useClientOnce } from "@/lib/clientValue";

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
 * ## Why it is not a preference
 *
 * It was a tick on the sign-in form, off by default. That put a decision in
 * front of somebody who has not seen the product yet, to answer a question
 * they cannot have an opinion about — and the answer they gave by not reading
 * it was "no", so the dispatch screen it was built for almost never got it.
 *
 * The panel is a dispatch console. Full screen is what it is *for*, so it is
 * simply what happens, and the top bar keeps the manual toggle as the escape
 * hatch for the shift that wants it beside a spreadsheet. Esc leaves it too,
 * because the browser says so and we do not fight that.
 *
 * ## Why the state is read from the document, not tracked
 *
 * Escape leaves fullscreen without telling the page through any code path we
 * control. A boolean we set ourselves would say "fullscreen" while the browser
 * disagreed, and the button would offer to do the thing it was already not
 * doing. `fullscreenchange` is the only honest source.
 */
/** Module-level so its identity is stable; see `clientValue`. */
function subscribeToFullscreen(listener: () => void): () => void {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

export function useFullscreen(): {
  isFullscreen: boolean;
  supported: boolean;
  toggle: () => Promise<void>;
} {
  // Both are false on the server, where there is no `document` — said
  // explicitly through a server snapshot rather than reached by rendering once
  // with a default and then setting state. A value that differs between the
  // server HTML and the first client render is still a hydration mismatch;
  // this states which value the server used instead of guessing.
  //
  // The two are different kinds of fact and are read differently. Whether the
  // browser *allows* fullscreen cannot change while the page is open. Whether
  // the document *is* fullscreen changes constantly, and `fullscreenchange` is
  // the only honest source for it — see the note above.
  const supported = useClientOnce(
    () => Boolean(document.fullscreenEnabled),
    false,
  );

  const isFullscreen = useSyncExternalStore(
    subscribeToFullscreen,
    () => Boolean(document.fullscreenElement),
    () => false,
  );

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
 * Takes the whole screen, from inside the sign-in gesture.
 *
 * Called by the submit handler and by nothing else, because that click is the
 * only moment the browser will allow it — see the note at the top.
 *
 * Deliberately **not** awaited by the caller: the navigation must not wait on
 * a display change, and a refusal must not stop somebody signing in. Every
 * failure here is silent by design. A browser that says no leaves a windowed
 * panel that works exactly as well, and an error dialog about it would be the
 * first thing an operator sees after typing their password.
 */
export function enterFullscreenOnSignIn(): void {
  try {
    // `fullscreenEnabled` is false in an iframe without `allow="fullscreen"`
    // and under some kiosk policies; `fullscreenElement` means an earlier
    // sign-in in this document already did it, and asking twice throws.
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen().catch(() => {
      // As above: a refused convenience is not an error worth showing.
    });
  } catch {
    // Older engines throw synchronously rather than rejecting.
  }
}
