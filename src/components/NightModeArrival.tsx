"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";

/**
 * The moment the panel goes dark.
 *
 * ## What it is, and what it deliberately is not
 *
 * The design spec asked for a full-screen transition, the words "You have
 * entered Night Mode", and then a **reload** into the night build. Everything
 * here except the reload is implemented as asked.
 *
 * The reload is left out because an operations panel is not a marketing site.
 * A reload discards whatever is in flight — a half-typed cancellation reason,
 * a filtered delivery queue somebody spent a minute assembling, an unsaved
 * rate card. Losing that would be an odd price to pay for a flourish, and
 * nothing about the night theme needs a fresh document: it is CSS custom
 * properties, and they change instantly.
 *
 * So this plays *over* the panel while the theme swaps underneath it. By the
 * time the veil clears, the page behind it is already dark.
 *
 * ## Why it cannot swallow a click
 *
 * `pointer-events: none` on every layer. For two seconds there is something
 * covering the screen, and if an operator taps "Cancel delivery" in that
 * window the tap must reach the button. A decoration that intercepts input is
 * a bug wearing a costume.
 *
 * ## When it does not play
 *
 * On first load — arriving on a page with the theme already set to tokyo is
 * not *entering* night mode, and greeting somebody with a full-screen
 * announcement every time they open the panel would wear out in a day. Also
 * never under `prefers-reduced-motion`: the theme still changes instantly,
 * which is the part that was actually requested.
 */
export function NightModeArrival() {
  const { theme } = useTheme();
  const [playing, setPlaying] = useState(false);

  // `undefined` until the first effect runs, which is how "already dark on
  // arrival" is told apart from "just switched to dark".
  const previous = useRef<string | undefined>(undefined);

  useEffect(() => {
    const wasFirstRender = previous.current === undefined;
    const from = previous.current;
    previous.current = theme;

    if (wasFirstRender) return;
    if (theme !== "tokyo" || from === "tokyo") return;

    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    setPlaying(true);
    // Matches the 2200ms animation in globals.css. A timer rather than
    // `animationend` because three elements animate and the last one to finish
    // is not guaranteed to be the one a listener is attached to.
    const timer = setTimeout(() => setPlaying(false), 2200);
    return () => clearTimeout(timer);
  }, [theme]);

  if (!playing) return null;

  return (
    <div
      // Announced rather than silent: a screen-reader user gets the same
      // information as everyone else, without the animation.
      role="status"
      aria-live="polite"
      className="dusk-veil pointer-events-none fixed inset-0 z-[100] grid place-items-center"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 40%, #1f2233 0%, #16161e 55%, #0d0d13 100%)",
      }}
    >
      {/* Stars. Fixed positions rather than random, so it composes the same
          way every time and cannot land one on top of the moon. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-[#c0caf5]"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
            }}
          />
        ))}
      </div>

      <div className="dusk-rise relative flex flex-col items-center gap-5 px-6 text-center">
        <svg
          className="dusk-moon"
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          aria-hidden
        >
          <defs>
            <radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="#e0af68" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#e0af68" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="36" cy="36" r="34" fill="url(#moon-glow)" />
          {/* A crescent cut from one disc by another, rather than an arc path:
              the terminator stays a true circular edge at any size. */}
          <path
            d="M46 14a24 24 0 1 0 12 24 19 19 0 0 1-12-24Z"
            fill="#e0af68"
          />
        </svg>

        <div>
          <p
            className="font-sans text-[26px] font-medium leading-tight text-[#c0caf5]"
            style={{ letterSpacing: "-0.01em" }}
          >
            You have entered Night Mode
          </p>
          <p className="mt-2 font-mono text-micro uppercase tracking-[2px] text-[#8a92ba]">
            Tokyo Night · easier on the eyes after dark
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Hand-placed, and kept clear of the centre where the moon and the type sit.
 *
 * `Math.random()` would put one behind a letter every so often and there would
 * be no way to reproduce the one time it looked wrong.
 */
const STARS: { x: number; y: number; size: number; opacity: number }[] = [
  { x: 12, y: 18, size: 2, opacity: 0.55 },
  { x: 22, y: 62, size: 1.5, opacity: 0.4 },
  { x: 31, y: 28, size: 1, opacity: 0.35 },
  { x: 44, y: 12, size: 2, opacity: 0.5 },
  { x: 58, y: 22, size: 1.5, opacity: 0.45 },
  { x: 68, y: 68, size: 2, opacity: 0.5 },
  { x: 78, y: 34, size: 1, opacity: 0.3 },
  { x: 86, y: 16, size: 1.5, opacity: 0.42 },
  { x: 91, y: 58, size: 2, opacity: 0.48 },
  { x: 8, y: 78, size: 1.5, opacity: 0.38 },
  { x: 52, y: 84, size: 1, opacity: 0.32 },
  { x: 72, y: 88, size: 1.5, opacity: 0.4 },
];
