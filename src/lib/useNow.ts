"use client";

import { useSyncExternalStore } from "react";

/**
 * How often the clock advances.
 *
 * One second, which is more than a screen of whole minutes needs — but the
 * dispatch board reads out seconds under a minute, and that is exactly where
 * an operator is deciding whether an order is new or stuck. A board whose
 * youngest number does not move reads as frozen.
 */
export const TICK_MS = 1_000;

/**
 * The wall clock, as a subscription.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, because that is
 * what the clock actually is: an external source this component reads, not
 * state React owns. The practical difference is the server snapshot — the
 * panel's pages are client components but Next still renders them once on the
 * server, and a `Date.now()` computed there will not match the one computed a
 * moment later in the browser. Returning zero from both until the subscription
 * is live makes the two passes agree by construction rather than by luck.
 *
 * One interval is shared by every caller, and it stops when the last one
 * unmounts. A per-component timer would be a live timer per row on a board
 * whose whole point is having many rows.
 */
let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (timer === null) {
    // Seeded here rather than at module load: a module evaluated during the
    // server render would bake that instant into the bundle's first snapshot.
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Must return a cached value — computing `Date.now()` here re-renders forever. */
const getSnapshot = (): number => current;

/** Zero, meaning "no clock yet". Callers render a placeholder until it ticks. */
const getServerSnapshot = (): number => 0;

/**
 * Milliseconds since the epoch, advancing once a second.
 *
 * Zero until the first tick, on the server and for the first client render.
 * Callers must treat that as "unknown" rather than as 1970.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
