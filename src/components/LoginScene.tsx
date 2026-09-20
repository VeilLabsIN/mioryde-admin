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
 * ## Why the grid and the route are two SVGs
 *
 * They want opposite things from the viewport and they were sharing one.
 *
 * The grid is a **texture**: it has to reach every edge, so it is drawn with
 * `slice`, which scales the viewBox until it covers the viewport and lets the
 * overflow fall off. On a 1920x1080 screen that is a scale factor of nearly
 * seven.
 *
 * The route is a **drawing**, and at that scale it was 1300px wide with both
 * pins hanging off the edges — the pickup half-cut at the bottom left, the drop
 * clipped at the top right. It is its own SVG now with `meet`, which scales
 * until the whole thing *fits* instead, so no part of it can ever leave the
 * screen at any window size. The viewBox is padded well beyond the path so the
 * route lands at a little over half the viewport height rather than filling it.
 *
 * ## It happens once
 *
 * The route used to redraw itself every seven seconds for as long as the page
 * was open. Nothing on a sign-in page takes seven seconds, so what that
 * actually did was replay the same three seconds behind somebody typing a
 * password — motion with no cause, which is what makes a background read as a
 * looping GIF rather than as a page.
 *
 * It is a sequence now, and it ends: the pickup registers, the route draws,
 * the vehicle runs it, the drop registers on the vehicle's arrival, and the
 * scene stops at 2.2 seconds. What is left is a *completed* delivery rather
 * than one permanently in progress — the better still image, and the more
 * honest one for a page whose whole job is to be waited on.
 *
 * The only thing still moving afterwards is the ambient light, on 18 and 24
 * second periods. That is slow enough to read as light rather than as
 * animation, and it is what keeps the page from looking like a screenshot.
 *
 * All of it stops under `prefers-reduced-motion`, with the route drawn and the
 * vehicle parked so the composition still reads.
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

      {/*
        City grid. Faint enough to read as texture, not as a chart.

        `slice` because a texture has to reach every edge — it scales the
        viewBox until it covers the viewport and lets the overflow fall off.
      */}
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 280 280"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          {/*
            14, not 20.

            `slice` scales this viewBox by ~6.9 at 1920x1080, which turned a
            20-unit cell into a 137px square — big enough to read as *boxes*
            drawn on the page rather than as the texture of a city underneath
            it. At 14 the cell lands near 96px, which is a grid you stop
            noticing, and the block shapes below finally look like blocks
            sitting on streets rather than four cells of the same size.

            The stroke thins with it. A 0.4 stroke at 6.9x is nearly 3px, and a
            3px line is a drawn border; 0.3 keeps it a hairline.
          */}
          <pattern id="scene-grid" width="14" height="14" patternUnits="userSpaceOnUse">
            <path
              d="M14 0H0V14"
              stroke="var(--fg)"
              strokeWidth="0.3"
              opacity="0.07"
            />
          </pattern>
        </defs>

        <rect width="280" height="280" fill="url(#scene-grid)" />

        {/* A couple of blocks, to suggest a city rather than graph paper. */}
        <g opacity="0.06" fill="var(--fg)">
          <rect x="60" y="180" width="40" height="40" />
          <rect x="160" y="100" width="60" height="40" />
          <rect x="20" y="80" width="30" height="60" />
        </g>
      </svg>

      {/*
        The delivery, in its own SVG.

        `meet` rather than `slice`: this is a drawing, and it has to fit. Under
        `slice` at 1920x1080 it was 1300px across with the pickup half-cut at
        the bottom left and the drop clipped off the top right.

        The viewBox does two jobs, and both are done by moving its edges rather
        than by transforming the art:

          - **size.** It is far larger than the 280 square the path lives in,
            and `meet` scales until the *box* fits — so the extra is margin.
            More padding, smaller route. This lands it at roughly a third of
            the viewport width.
          - **placement.** It is wider than it is tall and the path sits in the
            left of it, which pushes the drawing left of centre when the box is
            centred. That is what keeps the drop pin clear of the sign-in card
            on the right instead of vanishing behind it — the route arrives at
            something visible, which is the whole point of drawing it.

        Both are aspect-ratio safe: nothing can leave the screen at any window
        size, because `meet` fits the box and the art is inside the box.
      */}
      <svg
        className="absolute inset-0 size-full"
        viewBox="-60 -60 520 460"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
      >
        <defs>
          <linearGradient id="scene-route-fade" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-bright)" />
            <stop offset="100%" stopColor="var(--accent-alt)" />
          </linearGradient>
        </defs>

        {/*
          Everything that happens, in one group.

          The group is what recedes when the delivery is done — see
          `.scene-settle`. Doing it here rather than as a tail on each of the
          four animations is what stops the route, the two pins and the
          vehicle drifting out of agreement about how bright "at rest" is.
        */}
        <g className="scene-settle">
        {/* The route itself. */}
        <path
          className="scene-route"
          d={ROUTE}
          stroke="url(#scene-route-fade)"
          // 2.1, not 2.5. `meet` scales this by ~2.3 at 1920x1080, so 2.5 drew
          // a 6px ribbon — heavy enough to read as a UI element rather than as
          // a line on a map. The pins are sized against it below.
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeDasharray={ROUTE_LENGTH}
          style={
            { "--route-length": ROUTE_LENGTH } as React.CSSProperties
          }
        />

        {/* Pickup. First thing to land — the route is drawn *from* it. */}
        <g className="scene-pin" style={{ animationDelay: "200ms" }}>
          <circle cx="46" cy="214" r="9" fill="var(--accent-bright)" opacity="0.18" />
          <circle cx="46" cy="214" r="4.5" fill="var(--accent-bright)" />
        </g>

        {/*
          Drop. Timed to the vehicle's arrival rather than to a beat of its
          own: 400ms of delay plus 88% of a 1500ms run is 1720ms, and the
          vehicle fades out over the last 12% as this lands on the same
          coordinate. The two are a handover, so the numbers have to agree —
          if the run timing in `globals.css` changes, this changes with it.
        */}
        <g className="scene-pin" style={{ animationDelay: "1700ms" }}>
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
        </g>
      </svg>
    </div>
  );
}
