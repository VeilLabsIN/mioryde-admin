"use client";

import { formatElapsed } from "@/lib/elapsed";
import { useNow } from "@/lib/useNow";

/**
 * How old what you are looking at is.
 *
 * Several pages poll on a timer, and a polled page that does not say when it
 * last succeeded is indistinguishable from a page whose polling has silently
 * stopped — a dead tab and a quiet city look identical. The monitoring page
 * worked this out first; this is that badge made shared, because the pages
 * that needed it most were the ones that did not have it.
 *
 * **Local time only.** This measures "how long since this browser received a
 * response", which is a purely local question and needs no clock-skew
 * correction. Anything measured against a *server* instant — how long a
 * delivery has been unassigned — must go through `clockSkewMs` instead, or a
 * workstation four minutes fast ages every row on the dispatch board by four
 * minutes, uniformly and plausibly.
 */
export function Freshness({
  at,
  className = "",
}: {
  /** When the last successful response landed, from `Date.now()`. */
  at: number | null;
  className?: string;
}) {
  const now = useNow();
  if (at === null || now <= 0) return null;

  return (
    <span
      className={`rounded-xs border border-edge px-2 py-1 font-mono text-meta tabular-nums text-fg-faint ${className}`}
      // The badge reads "12s old", which is the useful phrasing at a glance
      // and a fragment out of context; the title is the whole sentence.
      title="Time since the last successful update"
    >
      {formatElapsed(Math.max(0, now - at))} old
    </span>
  );
}
