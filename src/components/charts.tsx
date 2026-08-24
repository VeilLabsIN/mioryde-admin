"use client";

import { useEffect, useRef, useState } from "react";

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
/**
 * The largest number of axis divisions that produces distinct labels.
 *
 * Returns fractions of the maximum, not values, so the caller keeps control of
 * formatting. Falls back to two ticks — a floor and a ceiling — which is the
 * fewest that still lets somebody read a magnitude off the chart.
 */
function chooseTicks(max: number, format: (value: number) => string): number[] {
  for (const divisions of [4, 3, 2]) {
    const fractions = Array.from(
      { length: divisions + 1 },
      (_, i) => i / divisions,
    );
    const labels = fractions.map((f) => format(max * f));
    if (new Set(labels).size === labels.length) return fractions;
  }
  return [0, 1];
}

export type ChartMode = "line" | "bar" | "area";

/**
 * Lets a reader change how a series is drawn without changing what it says.
 *
 * The three modes answer different questions about the same numbers, which is
 * why one chart is not enough: a **line** shows shape and direction, **bars**
 * show that each value is a separate countable fact, and an **area** shows
 * accumulation and makes a run of low values legible where a line vanishes
 * into the axis.
 *
 * Presented as a control rather than chosen per chart in code, because which
 * question somebody is asking is not knowable when the page is written. A
 * month of revenue is a shape until you are trying to see which single day
 * went wrong.
 */
export function ChartModeSwitch({
  mode,
  onChange,
}: {
  mode: ChartMode;
  onChange: (mode: ChartMode) => void;
}) {
  const options: { value: ChartMode; label: string; hint: string }[] = [
    { value: "line", label: "Line", hint: "Shape and direction over time" },
    { value: "area", label: "Area", hint: "Emphasises volume and low values" },
    { value: "bar", label: "Bars", hint: "Each period as a separate figure" },
  ];

  return (
    <div
      role="group"
      aria-label="Chart type"
      className="border-edge flex overflow-hidden rounded-xs border"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={mode === option.value}
          title={option.hint}
          className={`px-2 py-1 font-mono text-micro uppercase transition-colors duration-150 ${
            mode === option.value
              ? "bg-panel text-fg"
              : "text-fg-faint hover:text-fg-mid"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TrendChart({
  points,
  height = 200,
  format,
  mode = "line",
}: {
  points: Point[];
  height?: number;
  format: (value: number) => string;
  mode?: ChartMode;
}) {
  // Which point the pointer is nearest. An analytics chart you cannot
  // interrogate is a picture, not a tool — the whole question people bring to
  // one is "what happened on *that* day".
  const [hover, setHover] = useState<number | null>(null);

  const box = useRef<HTMLDivElement>(null);
  // 760 until measured — the width this chart was designed at, so the first
  // paint is a sensible chart rather than a collapsed one.
  const [measuredWidth, setMeasuredWidth] = useState(760);

  useEffect(() => {
    const element = box.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0;
      // Floored so a chart in a hidden tab does not collapse to zero and
      // divide by it.
      if (next > 0) setMeasuredWidth(Math.max(320, Math.round(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) {
    return <p className="text-fg-faint py-8 text-center text-body">No data yet.</p>;
  }

  /*
   * The viewBox tracks the measured width, so one SVG unit is one CSS pixel.
   *
   * The chart used to be a fixed 760-unit viewBox drawn with `h-auto w-full`,
   * which makes the *rendered height* proportional to the container: the same
   * chart was 200px tall in a narrow column and 370px tall on a wide monitor,
   * where a flat line at zero filled half the screen. That is the "everything
   * is enormous" problem, and it is not fixable by choosing a better height —
   * any fixed height is wrong at some width.
   *
   * `preserveAspectRatio="none"` would hold the height but stretch every glyph
   * horizontally. Measuring costs one observer and distorts nothing.
   */
  const width = measuredWidth;
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

  /*
   * Tick count chosen so no two labels read the same.
   *
   * This was a fixed `[0, .25, .5, .75, 1]`, which on a chart whose maximum is
   * 2 produced the axis **0, 1, 1, 2, 2** — two pairs of duplicates, because
   * the count formatter rounds 0.5 to 1 and 1.5 to 2. It looked like the chart
   * could not count.
   *
   * Rather than special-casing small integers, try progressively fewer
   * divisions and take the first that yields distinct labels. That works for
   * money and percentages too, and needs to know nothing about the formatter
   * beyond what it returns.
   */
  const ticks = chooseTicks(max, format);

  // At most six date labels, evenly spaced. Thirty-one would overlap into a
  // smear; two leaves a reader unable to place the middle of the chart.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const active = hover === null ? null : points[hover];
  const barWidth = Math.max(inner.w / points.length - 2, 1);

  return (
    <div ref={box} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="text-accent block"
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
                    // Area is the same geometry with the fill carrying the
                    // meaning instead of the stroke — so switching between the
                    // two never moves a single data point, which is what makes
                    // it a view control rather than a different chart.
                    opacity={mode === "area" ? "0.3" : "0.12"}
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
                  className="bg-accent-bright h-full rounded-full transition-[width] duration-500"
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
/**
 * A headline figure, its movement, and what it moved from.
 *
 * Three changes from the version this replaces, each answering something the
 * old one made the reader work out for themselves:
 *
 * 1. **The previous value is shown, not just the delta.** It was already being
 *    computed and then thrown away, so "▲12.4%" left an operator doing
 *    arithmetic on a number the component had in its hand.
 * 2. **`hero` promotes one figure per group.** Every card being the same weight
 *    means a page of nine has no entry point; the eye has to read all of them
 *    to find the one that matters. One raised, bloomed card and eight quiet
 *    ones is a hierarchy rather than a grid.
 * 3. **Direction and judgement are separated.** The arrow says which way it
 *    moved; the colour says whether that is good. `inverse` marks the measures
 *    where down is healthy, so a rising cancellation rate is not green for the
 *    same reason rising revenue is.
 */
export function Stat({
  label,
  value,
  previous,
  current,
  previousLabel,
  inverse = false,
  hint,
  hero = false,
}: {
  label: string;
  value: string;
  previous?: number;
  current?: number;
  /** The previous period's value, already formatted the same way as `value`. */
  previousLabel?: string;
  inverse?: boolean;
  hint?: string;
  /** Raises and blooms this card. One per group, or the hierarchy is back to flat. */
  hero?: boolean;
}) {
  // Zero is guarded as well as undefined: a previous period with no activity
  // divides to Infinity, which renders "∞%" and reads as a bug rather than as
  // the first week of trading it usually is.
  const comparable =
    previous !== undefined && current !== undefined && previous !== 0;
  const change = comparable ? (current! - previous!) / previous! : null;
  const good = change === null ? null : inverse ? change < 0 : change > 0;

  return (
    <div
      className={
        hero
          ? "border-edge bloom rounded-lg border p-4 [box-shadow:var(--elev-2)]"
          : "border-edge bg-surface rounded border p-4 [box-shadow:var(--elev-1)]"
      }
    >
      <p className="text-fg-faint text-meta">{label}</p>
      <p
        className={`mt-1 font-mono tabular-nums ${
          hero ? "text-figure text-fg" : "text-2xl"
        }`}
      >
        {value}
      </p>

      {change !== null ? (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-meta">
          <span
            className={good ? "text-ok" : "text-warn"}
            title="Against the previous period of the same length"
          >
            {/*
              The glyph is hidden from assistive tech and the direction spelled
              out instead: "▲" is announced as "black up-pointing triangle",
              which is noise once per card and unbearable down a column.
            */}
            <span aria-hidden>{change > 0 ? "▲" : "▼"}</span>
            <span className="sr-only">{change > 0 ? "up" : "down"} </span>
            {Math.abs(change * 100).toFixed(1)}%
          </span>
          <span className="text-fg-faint">
            {previousLabel ? `from ${previousLabel}` : "vs previous"}
          </span>
        </p>
      ) : (
        // Said out loud rather than left blank. A card with nothing where a
        // comparison should be reads as a bug, and the page has just promised
        // every figure is measured against the previous period.
        <p className="text-fg-faint mt-1.5 text-meta">
          {hint ?? "No data for the previous period"}
        </p>
      )}
    </div>
  );
}
