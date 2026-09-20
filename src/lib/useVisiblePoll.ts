"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `tick` on an interval, but only while the tab is actually being looked
 * at — and once immediately when it becomes visible again.
 *
 * ## Why this exists
 *
 * A dispatcher keeps this panel open all day, usually across several tabs.
 * Every polled page was spending its requests whether or not anybody could see
 * it: overnight, six background tabs at twenty seconds each is tens of
 * thousands of requests against an API that runs on half a CPU, for numbers
 * nobody read.
 *
 * Two pages already solved this by hand and three did not, which is the usual
 * shape of a bug that comes back. One hook, adopted everywhere, is the fix.
 *
 * ## Why it fires on becoming visible
 *
 * Skipping the hidden ticks means the first thing an operator sees on
 * returning is stale. Waiting out the remaining interval to correct it makes
 * the page look frozen at exactly the moment attention comes back, so the
 * refresh is immediate and the interval restarts from there.
 *
 * `tick` is read from a ref, so a fresh closure each render does not restart
 * the interval — the same reasoning as `useAsync`.
 */
export function useVisiblePoll(tick: () => void, everyMs: number): void {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      stop();
      timer = setInterval(() => latest.current(), everyMs);
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      latest.current();
      start();
    };

    // Started only if the tab is visible now: a page opened in a background
    // tab — a middle-click from the dispatch board, say — should not poll
    // until it is looked at.
    if (!document.hidden) start();

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [everyMs]);
}
