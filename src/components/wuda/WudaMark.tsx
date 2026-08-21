"use client";

import { useId } from "react";
import styles from "./WudaMark.module.css";

/**
 * WUDA's mark: three lit plates stacked in isometric space.
 *
 * ## Why it is drawn rather than dropped in
 *
 * An exported PNG or a 3D library would both have been quicker and both would
 * have been wrong here. The panel has two themes whose entire accent ramp
 * changes between them, so a baked image is correct in one and off-brand in
 * the other; and this thing renders on every answer in a transcript, where a
 * WebGL canvas per row is absurd. Drawn from the same custom properties as the
 * rest of the panel, it re-lights itself when the theme flips and costs
 * nothing to repeat.
 *
 * ## Why plates
 *
 * WUDA answers by retrieving entries and stacking them into a reply, and its
 * whole claim to being trustworthy is that it shows you the layers it used.
 * A stack of separable plates is that idea as an object. The chamfered east
 * corner is the brand's cut, carried onto the one moment on this page that is
 * about identity rather than furniture.
 *
 * ## Geometry
 *
 * Standard 2:1 isometric on a 120-box. Each plate is a top face (a diamond
 * with its east point cut flat) plus two side faces, and the three faces carry
 * three different gradients: a single fill would produce a flat hexagon, which
 * is exactly what this is not.
 */
export function WudaMark({
  size = 32,
  thinking = false,
  className = "",
}: {
  size?: number;
  /** Runs the same motion faster. See the note in the stylesheet. */
  thinking?: boolean;
  className?: string;
}) {
  // Unique per instance, because several of these share a document and SVG
  // gradient ids are global — a duplicate silently makes every later mark
  // reference the first one's gradients.
  const uid = useId().replace(/:/g, "");

  const plates = [
    { key: "top", cy: 40, w: 30, cls: styles.plateTop, light: 1 },
    { key: "mid", cy: 60, w: 34, cls: styles.plateMid, light: 0.86 },
    { key: "low", cy: 80, w: 38, cls: styles.plateLow, light: 0.72 },
  ];

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="WUDA"
      className={`${styles.mark} ${thinking ? styles.thinking : ""} ${className}`}
    >
      <defs>
        {/* Top face: the lit surface. Both stops stay bright — running bright
            down to deep reads as a dirty surface rather than a lit one, the
            same finding that shaped `grad-accent` in globals.css. */}
        <linearGradient id={`${uid}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent-bright)" />
          <stop offset="100%" stopColor="var(--accent-bright-deep)" />
        </linearGradient>
        {/* South-west face: turned away from the light. */}
        <linearGradient id={`${uid}-left`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-deep)" />
          <stop offset="100%" stopColor="var(--accent-deep)" stopOpacity="0.72" />
        </linearGradient>
        {/* South-east face: catches a little more. Without the difference
            between these two the depth reads as a single dark skirt. */}
        <linearGradient id={`${uid}-right`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-deep)" />
        </linearGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0%" stopColor="var(--accent-bright)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent-bright)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Behind everything, and the only part that brightens while thinking. */}
      <circle
        className={styles.halo}
        cx="60"
        cy="60"
        r="52"
        fill={`url(#${uid}-halo)`}
      />

      {/* Contact shadow. Flat on the ground plane, so it is an ellipse rather
          than a copy of the silhouette. */}
      <ellipse
        className={styles.shadow}
        cx="60"
        cy="104"
        rx="30"
        ry="7"
        fill="var(--accent-deep)"
        opacity="0.4"
      />

      <g className={styles.stack}>
        {/* Painted low to high: an isometric stack has no z-buffer, so draw
            order is the depth order. */}
        {[...plates].reverse().map((p) => (
          <Plate
            key={p.key}
            uid={uid}
            cy={p.cy}
            w={p.w}
            cls={p.cls}
            light={p.light}
          />
        ))}
      </g>

      {/* The spark. Offset from centre inside a rotating group, which is what
          makes it orbit rather than spin on the spot. */}
      <g className={styles.orbit}>
        <circle cx="60" cy="14" r="4" fill="var(--accent-bright)" />
        <circle cx="60" cy="14" r="8" fill="var(--accent-bright)" opacity="0.18" />
      </g>
    </svg>
  );
}

/** One plate: lit top, two shaded sides. */
function Plate({
  uid,
  cy,
  w,
  cls,
  light,
}: {
  uid: string;
  cy: number;
  w: number;
  /* Optional because CSS-module typings resolve every class to `string |
     undefined`; a missing one costs the animation, not the drawing. */
  cls: string | undefined;
  light: number;
}) {
  const h = w / 2; // 2:1 isometric.
  const d = 7; // Extrusion depth.
  const c = 9; // The chamfer on the east point — the brand's cut corner.
  const cx = 60;

  // North → the two points of the cut east corner → south → west.
  const top = [
    `${cx},${cy - h}`,
    `${cx + w - c},${cy - h / 2 + c / 2}`,
    `${cx + w - c},${cy + h / 2 - c / 2}`,
    `${cx},${cy + h}`,
    `${cx - w},${cy}`,
  ].join(" ");

  const left = [
    `${cx - w},${cy}`,
    `${cx},${cy + h}`,
    `${cx},${cy + h + d}`,
    `${cx - w},${cy + d}`,
  ].join(" ");

  const right = [
    `${cx + w - c},${cy + h / 2 - c / 2}`,
    `${cx},${cy + h}`,
    `${cx},${cy + h + d}`,
    `${cx + w - c},${cy + h / 2 - c / 2 + d}`,
  ].join(" ");

  return (
    <g className={cls} opacity={light}>
      <polygon points={left} fill={`url(#${uid}-left)`} />
      <polygon points={right} fill={`url(#${uid}-right)`} />
      <polygon points={top} fill={`url(#${uid}-top)`} />
    </g>
  );
}
