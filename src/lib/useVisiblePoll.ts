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
export function useVisiblePoll(
  tick: () => void,
  everyMs: number,
  options: {
    /**
     * Run once on mount even if the tab is hidden.
     *
     * Off by default, because the hook's whole point is that a page opened in
     * a background tab costs nothing. The exception is a page that renders
     * *nothing* without its first response: the live map opened in a
     * background pane showed an empty map, and kept showing one until somebody
     * switched to the tab — or longer, since browsers throttle timers in
     * background tabs. That was a real bug, found by loading the page in a
     * pane the browser reported as hidden and watching it stay blank.
     *
     * So: the first load is about having something to show, and the interval
     * is about staying current. Only the second is worth gating on attention.
     */
    loadOnMount?: boolean;
  } = {},
): void {
  const { loadOnMount = false } = options;
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

  /*
   * The one-off load, in its own effect.
   *
   * Separate from the interval above because that effect re-runs whenever
   * `everyMs` changes — and a caller whose rate follows what it is watching,
   * like the live map backing off when the city goes quiet, changes it often.
   * Folding this in there would fire an extra request at every one of those
   * transitions, which is the opposite of the point.
   *
   * Empty deps, so it is genuinely once per mount, hidden or not.
   */
  useEffect(() => {
    if (loadOnMount) latest.current();
    // Deliberately once. `loadOnMount` is a constant at every call site; if it
    // ever were not, re-running would mean re-fetching for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
