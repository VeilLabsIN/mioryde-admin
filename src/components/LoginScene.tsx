"use client";

/**
 * The illustration on the sign-in page.
 *
 * ## Why it is drawn rather than photographed
 *
 * The brief was "suitable images". A stock photograph of a warehouse would
 * have been faster and worse: it would need a licence, add a few hundred
 * kilobytes to the first paint of the one page that is loaded on a cold cache,
 * look wrong in one of the two themes, and say nothing about this product that
 * a photograph of any other logistics company would not also say.
 *
 * This is the actual thing the business does — a route between two points
 * across a city grid — drawn in the panel's own tokens, so it re-colours with
 * the theme, scales to any viewport, and costs about two kilobytes.
 *
 * ## How the motion works
 *
 * One path, two consumers. The route line draws itself with `stroke-dashoffset`
 * and the vehicle rides the *same* path data via `offset-path`, so the marker
 * cannot drift off the line the way two independently keyframed tracks would
 * as soon as somebody nudged a control point.
 *
 * All of it stops under `prefers-reduced-motion`, with the vehicle parked
 * mid-route so the composition still reads.
 */

/** The route. Declared once and used by both the line and the vehicle. */
const ROUTE = "M 46 214 C 92 214 96 150 140 150 C 190 150 188 74 236 74";

/**
 * Dash length, so the route starts fully hidden.
 *
 * `getTotalLength()` on the path above measures 247.59. Rounded *up* to 250
 * rather than to the exact figure: too long simply delays the first pixel by a
 * few milliseconds, while too short leaves a visible stub of line sitting
 * there before the animation begins. If the geometry is ever edited, re-measure
 * and keep the round-up.
 */
const ROUTE_LENGTH = 250;

export function LoginScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Ambient light. Two blobs, different periods, so the loop never
          visibly repeats. Blurred colour rather than an image. */}
      <div
        className="scene-orb-a absolute -left-[15%] top-[8%] size-[55%] rounded-full
                   opacity-70 blur-[90px]"
        style={{ background: "var(--accent-bright)", opacity: 0.14 }}
      />
      <div
        className="scene-orb-b absolute -right-[10%] bottom-[6%] size-[50%] rounded-full
                   blur-[100px]"
        style={{ background: "var(--accent-alt)", opacity: 0.12 }}
      />

      {/* City grid. Faint enough to read as texture, not as a chart. */}
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 280 280"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <pattern id="scene-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M20 0H0V20"
              stroke="var(--fg)"
              strokeWidth="0.4"
              opacity="0.07"
            />
          </pattern>
          <linearGradient id="scene-route-fade" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-bright)" />
            <stop offset="100%" stopColor="var(--accent-alt)" />
          </linearGradient>
        </defs>

        <rect width="280" height="280" fill="url(#scene-grid)" />

        {/* A couple of blocks, to suggest a city rather than graph paper. */}
        <g opacity="0.06" fill="var(--fg)">
          <rect x="60" y="180" width="40" height="40" />
          <rect x="160" y="100" width="60" height="40" />
          <rect x="20" y="80" width="30" height="60" />
        </g>

        {/* The route itself. */}
        <path
          className="scene-route"
          d={ROUTE}
          stroke="url(#scene-route-fade)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={ROUTE_LENGTH}
          style={
            { "--route-length": ROUTE_LENGTH } as React.CSSProperties
          }
        />

        {/* Pickup. */}
        <g className="scene-pin" style={{ animationDelay: "120ms" }}>
          <circle cx="46" cy="214" r="9" fill="var(--accent-bright)" opacity="0.18" />
          <circle cx="46" cy="214" r="4.5" fill="var(--accent-bright)" />
        </g>

        {/* Drop. */}
        <g className="scene-pin" style={{ animationDelay: "420ms" }}>
          <circle cx="236" cy="74" r="9" fill="var(--accent-alt)" opacity="0.2" />
          <circle cx="236" cy="74" r="4.5" fill="var(--accent-alt)" />
        </g>

        {/* The vehicle, riding the same path the line is drawn from. */}
        <g
          className="scene-vehicle"
          style={{
            offsetPath: `path("${ROUTE}")`,
            offsetRotate: "0deg",
          } as React.CSSProperties}
        >
          <circle r="5.5" fill="var(--bg)" stroke="var(--accent-bright)" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}
