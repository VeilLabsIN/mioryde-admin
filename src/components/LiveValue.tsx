"use client";

import { useState } from "react";

/**
 * A number that flashes when it changes.
 *
 * ## Why
 *
 * Several pages poll. A figure that snaps from 6 to 7 between two paints is
 * invisible unless somebody happens to be looking directly at that cell — and
 * a dispatcher watching a city is not looking at one cell. Peripheral vision
 * is very good at motion and hopeless at reading, so a brief wash of colour
 * behind the number is the whole signal: *something moved, look here*.
 *
 * ## Why a flash and not a count-up
 *
 * A tween from 6 to 7 renders values that were never true. On a dashboard of
 * live counts that is a lie for 300ms, and the one time it matters is the one
 * time somebody screenshots it.
 *
 * `motion-value-changed` has existed in `globals.css` since the motion pass,
 * with a comment saying the dispatch board and the monitoring page used it.
 * Nothing did — `grep` found the definition and no callers. This is that
 * utility acquiring the callers its comment already claimed.
 *
 * Reduced motion is handled globally: `globals.css` neutralises every
 * animation under `prefers-reduced-motion`, so nothing here needs to check.
 */
export function LiveValue({
  value,
  children,
  className = "",
}: {
  /**
   * What is being watched. A change to this triggers the flash — pass the
   * underlying number, not its formatted string, so `₹1,240` and `₹1,240`
   * from two polls do not count as a change when the paise differ.
   */
  value: number | string | undefined;
  /** What to draw. Defaults to the value itself. */
  children?: React.ReactNode;
  className?: string;
}) {
  // Adjusting state during render, which React supports for exactly this: a
  // value derived from a prop change. The alternative — an effect — paints the
  // new number once without the flash and only then animates it.
  const [seen, setSeen] = useState(value);
  const [flashes, setFlashes] = useState(0);

  if (seen !== value) {
    setSeen(value);
    // Not on the first value. Everything on a freshly loaded page is new, and
    // a dashboard that flashes all four cards on arrival has told the operator
    // nothing except that it loaded.
    if (seen !== undefined) setFlashes((n) => n + 1);
  }

  return (
    <span
      // Remounts on each change, which is what restarts a CSS animation. The
      // same element with a re-applied class does not replay it.
      key={flashes}
      className={`${flashes > 0 ? "motion-value-changed" : ""} ${className}`}
    >
      {children ?? value}
    </span>
  );
}
