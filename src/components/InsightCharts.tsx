"use client";

import { useEffect, useRef, useState } from "react";
import { chooseTicks, niceMax } from "@/components/charts";

/**
 * The charts the analytics page needed and did not have.
 *
 * ## Why these are hand-written SVG like the others
 *
 * The panel has no charting library and does not want one: every chart here is
 * a few dozen lines of arithmetic, a library would be 40-plus kilobytes of
 * JavaScript on an internal tool, and its default styling would have to be
 * overridden token by token to stop it looking like somebody else's dashboard.
 *
 * ## What they have in common
 *
 * Each one is keyboard-reachable and readable by a screen reader, because the
 * existing `TrendChart` is neither — it hangs its interaction off
 * `onPointerEnter` on invisible rectangles, so the only way to read a value is
 * with a mouse. Every chart below carries a real text alternative.
 */

/** One line or bar series. */
export interface Series {
  key: string;
  label: string;
  values: number[];
  /** Drawn as a line when true, as bars otherwise. */
  line?: boolean;
  /** A CSS colour, usually a token: `var(--accent-bright)`. */
  colour: string;
  /** Formats a value for the readout and the axis. */
  format: (value: number) => string;
  /** The same series over the previous period, drawn as a ghost. */
  comparison?: number[];
}

const PAD = { top: 14, right: 12, bottom: 22, left: 52 };

/**
 * Several series over the same days, with the comparison period behind them.
 *
 * The page's premise is that every figure is shown against the previous period
 * — and until now the chart was the one thing on it that did not compare. The
 * ghost line is that comparison, drawn behind and dimmed, so the shape of last
 * month is legible without competing with this one.
 */
export function MultiSeriesChart({
  labels,
  series,
  height = 260,
}: {
  labels: string[];
  series: Series[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0;
      if (next > 0) setWidth(Math.max(280, Math.round(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (labels.length === 0 || series.length === 0) {
    return <p className="text-fg-faint py-8 text-center text-body">No data yet.</p>;
  }

  // Below this the axis labels take more room than the chart. Shorter ticks and
  // a narrower gutter, rather than a chart that overflows its card on a phone.
  const compact = width < 480;
  const pad = compact ? { ...PAD, left: 34, bottom: 18 } : PAD;

  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const max = niceMax(
    Math.max(
      1,
      ...series.flatMap((s) => [...s.values, ...(s.comparison ?? [])]),
    ),
  );
  const ticks = chooseTicks(max, series[0]?.format ?? String);

  const x = (index: number) =>
    pad.left +
    (labels.length === 1
      ? plotWidth / 2
      : (index / (labels.length - 1)) * plotWidth);
  const y = (value: number) => pad.top + plotHeight - (value / max) * plotHeight;

  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  const bars = series.filter((s) => !s.line);
  const barWidth = Math.max(
    2,
    (plotWidth / Math.max(labels.length, 1) / Math.max(bars.length, 1)) * 0.7,
  );

  const labelEvery = Math.ceil(labels.length / (compact ? 4 : 6));

  return (
    <div ref={box} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`${series.map((s) => s.label).join(", ")} from ${labels[0]} to ${labels[labels.length - 1]}. Use the arrow keys to read each day.`}
        className="focus-visible:outline-accent overflow-visible focus-visible:outline-2 focus-visible:outline-offset-2"
        /*
         * Focusable, and driven by the keyboard.
         *
         * The chart this replaces hung its whole interaction off
         * `onPointerEnter` on invisible rectangles, so the only way to read a
         * value off it was with a mouse — and the values are the reason the
         * chart exists. Arrow keys walk the days; the readout below is an
         * aria-live region, so each step is announced.
         */
        tabIndex={0}
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

          if (step !== 0) {
            event.preventDefault();
            setHover((current) => {
              const next = (current ?? -1) + step;
              return Math.max(0, Math.min(labels.length - 1, next));
            });
            return;
          }
          if (event.key === "Home") {
            event.preventDefault();
            setHover(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setHover(labels.length - 1);
          } else if (event.key === "Escape") {
            // Back to the period total, which is what the readout shows with
            // nothing selected.
            setHover(null);
          }
        }}
        onBlur={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            <text
              x={pad.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-fg-faint text-micro"
            >
              {(series[0]?.format ?? String)(tick)}
            </text>
          </g>
        ))}

        {/* Comparison first, so this period is drawn over its own past. */}
        {series.map((s) =>
          s.comparison ? (
            <path
              key={`${s.key}-was`}
              d={path(s.comparison)}
              fill="none"
              stroke={s.colour}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.38}
            />
          ) : null,
        )}

        {bars.map((s, seriesIndex) =>
          s.values.map((value, index) => (
            <rect
              key={`${s.key}-${index}`}
              x={x(index) - (barWidth * bars.length) / 2 + seriesIndex * barWidth}
              y={y(value)}
              width={barWidth}
              height={Math.max(0, pad.top + plotHeight - y(value))}
              fill={s.colour}
              opacity={hover === null || hover === index ? 1 : 0.45}
            />
          )),
        )}

        {series
          .filter((s) => s.line)
          .map((s) => (
            <path
              key={s.key}
              d={path(s.values)}
              fill="none"
              stroke={s.colour}
              strokeWidth={2}
            />
          ))}

        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.top}
            y2={pad.top + plotHeight}
            stroke="var(--color-edge)"
            strokeWidth={1}
          />
        )}

        {labels.map((label, index) =>
          index % labelEvery === 0 ? (
            <text
              key={label + index}
              x={x(index)}
              y={height - 4}
              textAnchor="middle"
              className="fill-fg-faint text-micro"
            >
              {label}
            </text>
          ) : null,
        )}

        {/* One hit area per day, covering the full height. */}
        {labels.map((label, index) => (
          <rect
            key={`hit-${label}-${index}`}
            x={x(index) - plotWidth / Math.max(labels.length, 1) / 2}
            y={pad.top}
            width={plotWidth / Math.max(labels.length, 1)}
            height={plotHeight}
            fill="transparent"
            onPointerEnter={() => setHover(index)}
          />
        ))}
      </svg>

      {/*
        The readout is HTML rather than an SVG <text>, so it can list every
        series at once and be read aloud. The old chart put a single number
        inside the drawing, which a screen reader never reaches.
      */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1" aria-live="polite">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-meta">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: s.colour }}
            />
            <span className="text-fg-muted">{s.label}</span>
            <span className="text-fg font-mono">
              {s.format(
                hover === null
                  ? s.values.reduce((a, b) => a + b, 0)
                  : (s.values[hover] ?? 0),
              )}
            </span>
          </span>
        ))}
        <span className="text-fg-faint text-meta">
          {hover === null ? "total for the period" : labels[hover]}
        </span>
      </div>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Demand as day of week against hour.
 *
 * The flat 24-bar series this replaces averages every Tuesday with every
 * Sunday, which describes no day anybody actually staffs. A Saturday evening
 * peak and a Wednesday lunchtime one are different facts and need different
 * partners on duty.
 */
export function DemandHeatmap({
  cells,
  height = 200,
}: {
  cells: { dow: number; hour: number; placed: number }[];
  height?: number;
}) {
  const busiest = Math.max(1, ...cells.map((c) => c.placed));
  const total = cells.reduce((sum, c) => sum + c.placed, 0);

  if (total === 0) {
    return (
      <p className="text-fg-faint py-8 text-center text-body">
        Nothing was ordered in this period.
      </p>
    );
  }

  const byKey = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.placed]));
  const peak = cells.reduce((best, c) => (c.placed > best.placed ? c : best), cells[0]!);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-[2px]">
        <caption className="sr-only">
          Orders placed by day of week and hour. Busiest: {DAYS[peak.dow]} at{" "}
          {String(peak.hour).padStart(2, "0")}:00, {peak.placed} orders.
        </caption>
        <thead>
          <tr>
            <th className="w-8" />
            {Array.from({ length: 24 }, (_, hour) => (
              <th key={hour} scope="col" className="text-fg-faint text-micro font-normal">
                {/* Every third hour: 24 labels at this size is a grey smear. */}
                {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, dow) => (
            <tr key={day} style={{ height: `${Math.round(height / 7)}px` }}>
              <th scope="row" className="text-fg-muted pr-1 text-right text-micro font-normal">
                {day}
              </th>
              {Array.from({ length: 24 }, (_, hour) => {
                const value = byKey.get(`${dow}-${hour}`) ?? 0;
                return (
                  <td
                    key={hour}
                    // Title rather than a tooltip component: the cell is one
                    // number, and a hover card for it would be more chrome
                    // than content.
                    title={`${day} ${String(hour).padStart(2, "0")}:00 — ${value} placed`}
                    className="rounded-[2px]"
                    style={{
                      // Opacity against the accent rather than a colour ramp:
                      // one hue keeps it readable for the ~8% of men with a
                      // red/green deficiency, and it survives both themes.
                      backgroundColor:
                        value === 0
                          ? "var(--color-panel)"
                          : `color-mix(in oklab, var(--color-accent-bright) ${Math.round((value / busiest) * 100)}%, var(--color-panel))`,
                    }}
                  >
                    <span className="sr-only">
                      {day} {hour}:00, {value} orders
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Where orders stop.
 *
 * Drawn as proportional bars rather than a tapering funnel shape: a trapezoid
 * distorts the very differences it is supposed to show, and the number that
 * matters — the drop between two steps — is easier to read off aligned bars.
 */
export function FunnelBar({
  steps,
}: {
  steps: { label: string; count: number; note?: string }[];
}) {
  const first = steps[0]?.count ?? 0;
  if (first === 0) {
    return (
      <p className="text-fg-faint py-8 text-center text-body">
        Nothing was placed in this period.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {steps.map((step, index) => {
        const share = step.count / first;
        const previous = steps[index - 1]?.count;
        const dropped = previous === undefined ? 0 : previous - step.count;

        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-body">{step.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-body tabular-nums">{step.count}</span>
                <span className="text-fg-faint text-meta">
                  {Math.round(share * 100)}%
                </span>
              </span>
            </div>
            <div className="bg-edge mt-1 h-2 w-full overflow-hidden rounded-[2px]">
              <div
                className="bg-accent-bright h-full transition-[width] duration-500"
                style={{ width: `${Math.max(share * 100, step.count > 0 ? 1 : 0)}%` }}
              />
            </div>
            {(dropped > 0 || step.note) && (
              <p className="text-fg-faint mt-0.5 text-meta">
                {dropped > 0 ? `${dropped} did not reach this step` : null}
                {dropped > 0 && step.note ? " · " : null}
                {step.note}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One bar, split by share.
 *
 * Replaces three separate lists that could not be compared with each other:
 * zone, vehicle and payment mix are the same question asked three ways, and
 * the answer people want is "what proportion", which a stacked bar states
 * directly and a list of counts makes the reader compute.
 */
export function StackedShareBar({
  segments,
  format,
}: {
  segments: { label: string; value: number; colour: string }[];
  format: (value: number) => string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return <p className="text-fg-faint py-6 text-center text-body">No data yet.</p>;
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-[2px]" role="img" aria-hidden>
        {segments.map((s) => (
          <div
            key={s.label}
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor: s.colour,
            }}
            className="transition-[width] duration-500"
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: s.colour }}
              />
              <span className="truncate text-body">{s.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="font-mono text-body tabular-nums">{format(s.value)}</span>
              <span className="text-fg-faint text-meta tabular-nums">
                {Math.round((s.value / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The palette charts draw from.
 *
 * Ordered so the first two are the most distinguishable pair — most charts
 * here show two series, and the common case should be the clearest one.
 */
export const SERIES_COLOURS = [
  "var(--color-accent-bright)",
  "var(--color-accent-alt)",
  "var(--color-accent)",
  "var(--color-warn)",
  "var(--color-fg-muted)",
] as const;
