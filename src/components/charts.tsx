"use client";

import { useState } from "react";

/**
 * Charts, hand-written as SVG.
 *
 * No charting library. This app has three dependencies and a library would add
 * more bundle than the whole panel, then need overriding to match the theme
 * tokens anyway.
 *
 * Everything draws with `currentColor` and CSS custom properties, so both
 * themes work without any component knowing which one is active.
 */

export interface Point {
  label: string;
  value: number;
}

/** Rounds an axis maximum up to something a person would choose. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * A time series, as a filled line or as bars.
 *
 * Line for continuous quantities — revenue over a month reads as a shape, a
 * slump, a weekend dip. Bars when the series is sparse or countable, where
 * thirty separate facts is exactly what it is and a line pretends there were
 * values in between.
 */
export function TrendChart({
  points,
  height = 200,
  format,
  mode = "line",
}: {
  points: Point[];
  height?: number;
  format: (value: number) => string;
  mode?: "line" | "bar";
}) {
  // Which point the pointer is nearest. An analytics chart you cannot
  // interrogate is a picture, not a tool — the whole question people bring to
  // one is "what happened on *that* day".
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-fg-faint py-8 text-center text-body">No data yet.</p>;
  }

  const width = 760;
  // Left padding carries the axis labels; without it they render outside the
  // viewBox and are simply invisible.
  const pad = { top: 16, right: 12, bottom: 22, left: 56 };
  const inner = {
    w: width - pad.left - pad.right,
    h: height - pad.top - pad.bottom,
  };

  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const x = (i: number) =>
    pad.left +
    (points.length === 1 ? inner.w / 2 : (i / (points.length - 1)) * inner.w);
  // Baseline is always zero. Starting an axis at the minimum makes a 2% change
  // look like a cliff, which is how a dashboard misleads without stating a
  // single false number.
  const y = (v: number) => pad.top + inner.h - (v / max) * inner.h;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  // At most six date labels, evenly spaced. Thirty-one would overlap into a
  // smear; two leaves a reader unable to place the middle of the chart.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const active = hover === null ? null : points[hover];
  const barWidth = Math.max(inner.w / points.length - 2, 1);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="text-accent h-auto w-full min-w-[34rem]"
        role="img"
        aria-label={`${points[0]?.label} to ${points[points.length - 1]?.label}`}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={pad.top + inner.h * (1 - t)}
              y2={pad.top + inner.h * (1 - t)}
              className="stroke-edge"
              strokeWidth="1"
            />
            {/* The values the grid lines stand for. Unlabelled gridlines are
                decoration — you cannot read a magnitude off them. */}
            <text
              x={pad.left - 8}
              y={pad.top + inner.h * (1 - t) + 3}
              textAnchor="end"
              // Axis ticks stay off the scale: `text-micro` bakes in 2px of
              // tracking and bold weight, which is right for a label and wrong
              // for a column of numbers meant to be compared down the axis.
              className="fill-fg-faint text-[9px] tabular-nums"
            >
              {format(max * t)}
            </text>
          </g>
        ))}

        {mode === "bar"
          ? points.map((p, i) => (
              <rect
                key={p.label}
                x={x(i) - barWidth / 2}
                y={p.value === 0 ? pad.top + inner.h - 1 : y(p.value)}
                width={barWidth}
                // Zero still draws a hairline, so "nothing happened" is visibly
                // a day rather than a gap in the chart.
                height={p.value === 0 ? 1 : pad.top + inner.h - y(p.value)}
                fill="currentColor"
                opacity={hover === null || hover === i ? 0.85 : 0.35}
              />
            ))
          : (() => {
              const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
              return (
                <>
                  <polygon
                    points={`${pad.left},${pad.top + inner.h} ${line} ${x(points.length - 1)},${pad.top + inner.h}`}
                    fill="currentColor"
                    opacity="0.12"
                  />
                  <polyline
                    points={line}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </>
              );
            })()}

        {/* Date labels, thinned so they never collide. */}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.label}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="fill-fg-faint text-[9px]"
            >
              {p.label}
            </text>
          ) : null,
        )}

        {active ? (
          <g>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={pad.top}
              y2={pad.top + inner.h}
              className="stroke-edge"
              strokeWidth="1"
            />
            <circle cx={x(hover!)} cy={y(active.value)} r="4" fill="currentColor" />
            {/* Anchored away from whichever edge it is near, so the readout is
                never half outside the chart. */}
            <text
              x={x(hover!)}
              y={Math.max(y(active.value) - 10, pad.top + 9)}
              textAnchor={
                hover! < points.length / 4
                  ? "start"
                  : hover! > (points.length * 3) / 4
                    ? "end"
                    : "middle"
              }
              className="fill-fg text-meta font-medium tabular-nums"
            >
              {format(active.value)} · {active.label}
            </text>
          </g>
        ) : null}

        {/* One hit area per point, sized to the gap between them. Invisible,
            and the only thing that makes hovering work at any width. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.label}`}
            x={x(i) - inner.w / points.length / 2}
            y={pad.top}
            width={inner.w / points.length}
            height={inner.h}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * A ranked horizontal bar list.
 *
 * Horizontal because the labels are words — zone names, vehicle types — and
 * vertical bars force them sideways or truncated. Ranked because the ordering
 * is the information.
 */
export function BarList({
  points,
  format,
  total,
}: {
  points: Point[];
  format: (value: number) => string;
  /** Shows each row's share when the parts make up a whole. */
  total?: number;
}) {
  if (points.length === 0) {
    return <p className="text-fg-faint py-4 text-body">No data yet.</p>;
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const sum = total ?? points.reduce((acc, p) => acc + p.value, 0);

  return (
    <ul className="space-y-2.5">
      {points.map((point) => {
        const empty = point.value === 0;
        return (
          <li key={point.label}>
            <div className="flex items-baseline justify-between gap-3 text-body">
              {/* A zero row is dimmed rather than hidden: knowing a vehicle
                  class earned nothing is a finding, and dropping it would make
                  the reader think it was never offered. */}
              <span className={`truncate ${empty ? "text-fg-faint" : ""}`}>
                {point.label}
              </span>
              <span
                className={`shrink-0 font-mono tabular-nums ${empty ? "text-fg-faint" : ""}`}
              >
                {format(point.value)}
                {sum > 0 && !empty ? (
                  <span className="text-fg-faint ml-2 text-meta">
                    {((point.value / sum) * 100).toFixed(0)}%
                  </span>
                ) : null}
              </span>
            </div>
            <div className="bg-edge mt-1.5 h-2 w-full overflow-hidden rounded-full">
              {/* No minimum width on an empty bar. A sliver of colour for zero
                  reads as "a little", which is the opposite of true. */}
              {!empty ? (
                <div
                  className="bg-accent h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${(point.value / max) * 100}%` }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A headline number with its change against the previous period.
 *
 * The comparison is the point — a figure on its own is trivia. `inverse` marks
 * metrics where down is good, so a falling cancellation rate reads green.
 */
export function Stat({
  label,
  value,
  previous,
  current,
  inverse = false,
  hint,
}: {
  label: string;
  value: string;
  previous?: number;
  current?: number;
  inverse?: boolean;
  hint?: string;
}) {
  const comparable =
    previous !== undefined && current !== undefined && previous !== 0;
  const change = comparable ? (current! - previous!) / previous! : null;
  const good = change === null ? null : inverse ? change < 0 : change > 0;

  return (
    <div className="border-edge bg-surface rounded border p-4">
      <p className="text-fg-faint text-meta">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums">{value}</p>
      {change !== null ? (
        <p
          className={`mt-1 text-meta ${good ? "text-ok" : "text-warn"}`}
          title="Against the previous period of the same length"
        >
          {change > 0 ? "▲" : "▼"} {Math.abs(change * 100).toFixed(1)}%
          <span className="text-fg-faint ml-1">vs previous</span>
        </p>
      ) : (
        // Said out loud rather than left blank. A card with nothing where a
        // comparison should be reads as a bug, and the page has just promised
        // every figure is measured against the previous period.
        <p className="text-fg-faint mt-1 text-meta">
          {hint ?? "No data for the previous period"}
        </p>
      )}
    </div>
  );
}
