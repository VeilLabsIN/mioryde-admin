"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile, wrapped so the login form deals with one thing: a
 * token, or null.
 *
 * ## Why a hand-rolled wrapper rather than a package
 *
 * The whole integration is one script tag and three callbacks, and the parts
 * that are easy to get wrong are the parts a package would hide — see the
 * reset note below. This is small enough to read, and the failure modes are
 * written down next to the code that causes them.
 *
 * ## The script is loaded here, not in the layout
 *
 * The panel is an authenticated operations console and every page except this
 * one is behind a session. Loading a third-party script into all of them to
 * serve a widget that appears on one would widen the CSP for the whole app —
 * and `script-src` is already the weakest line in that policy.
 *
 * ## Two callbacks that are not optional
 *
 * `expired-callback` and `error-callback` both exist because the token is not
 * a permanent property of the page. A solution expires after a few minutes; a
 * network blip fails the challenge outright. Without both, the form keeps a
 * token it believes is good, sends it, and the server answers with a security
 * failure for a form the operator filled in correctly.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme?: "auto" | "light" | "dark";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Loaded once per document, however many times this component mounts. */
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Cleared so a later mount retries. A cached rejected promise would mean
      // one flaky load left the widget permanently broken until a hard reload,
      // and the operator's only symptom is a sign-in button that never enables.
      scriptPromise = null;
      reject(new Error("Could not load the Cloudflare security check."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface TurnstileHandle {
  /** Discards the current token and asks for a fresh one. */
  reset: () => void;
}

export function Turnstile({
  siteKey,
  onToken,
  onUnavailable,
  handleRef,
}: {
  siteKey: string;
  /** Called with a token, or null whenever the current one stops being valid. */
  onToken: (token: string | null) => void;
  /** The script could not load at all. */
  onUnavailable: () => void;
  handleRef?: React.MutableRefObject<TurnstileHandle | null>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Held in a ref so the effect below does not re-run — and therefore does not
  // tear down and re-render the widget — every time the parent re-renders,
  // which on this page is every keystroke in the email field.
  //
  // Assigned in an effect rather than during render. Writing a ref while
  // rendering is a real correctness problem, not a lint preference: React may
  // render a component and discard the result, and the write would have
  // already happened.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const reset = useCallback(() => {
    onTokenRef.current(null);
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, []);

  // Published to the parent in an effect, for the same reason.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { reset };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, reset]);

  useEffect(() => {
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          // A solved challenge goes stale. Clearing the token rather than
          // keeping it means the form disables itself and Turnstile re-runs,
          // instead of sending something the server will reject.
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
          theme: "dark",
          // Only shows a visible challenge when Cloudflare actually wants one.
          // For staff signing in from an office this is invisible in practice,
          // which is the point: a control nobody notices is a control nobody
          // works around.
          appearance: "interaction-only",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        onUnavailable();
      });

    return () => {
      cancelled = true;
      // Removed on unmount. React 18 mounts effects twice in development, and
      // without this the second mount renders a second widget beside the
      // first — two challenges, one of which nothing is listening to.
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
    // siteKey is a build-time constant; onUnavailable is only read on the
    // failure path. Re-running this effect re-renders the widget, so the
    // dependency list is deliberately empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <p className="text-meta text-danger" role="alert">
        The security check could not load. Check your connection, or any
        extension blocking challenges.cloudflare.com, and reload.
      </p>
    );
  }

  // `interaction-only` renders nothing until a challenge is actually needed,
  // so this is usually a zero-height element. It still has to be in the tree.
  return <div ref={containerRef} className="flex justify-center" />;
}
