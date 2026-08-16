"use client";

/**
 * Charts, hand-written as SVG.
 *
 * No charting library. This app has three dependencies and the charts it needs
 * are a trend line and a ranked bar list — a library would add more bundle
 * than the whole panel and still need overriding to match the theme tokens.
 *
 * Everything here draws with `currentColor` and CSS custom properties, so both
 * themes work without the components knowing which one is active.
 */

export interface Point {
  label: string;
  value: number;
}

/**
 * A filled trend line.
 *
 * Deliberately not a bar chart: revenue over time is a continuous quantity and
 * a line reads the shape of it — a slump, a weekend dip — where thirty bars
 * read as thirty separate facts.
 */
export function TrendChart({
  points,
  height = 160,
  format,
}: {
  points: Point[];
  height?: number;
  format: (value: number) => string;
}) {
  if (points.length === 0) {
    return (
      <p className="text-fg-faint py-8 text-center text-sm">No data yet.</p>
    );
  }

  const width = 720;
  const pad = { top: 8, right: 8, bottom: 20, left: 8 };
  const inner = {
    w: width - pad.left - pad.right,
    h: height - pad.top - pad.bottom,
  };

  const max = Math.max(...points.map((p) => p.value), 1);
  // Baseline is always zero. A chart that starts the axis at the minimum makes
  // a 2% change look like a cliff, which is how a dashboard misleads without
  // stating a single false number.
  const x = (i: number) =>
    pad.left + (points.length === 1 ? inner.w / 2 : (i / (points.length - 1)) * inner.w);
  const y = (v: number) => pad.top + inner.h - (v / max) * inner.h;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${pad.left},${pad.top + inner.h} ${line} ${x(points.length - 1)},${pad.top + inner.h}`;

  const peak = points.reduce(
    (best, p, i) => (p.value > points[best]!.value ? i : best),
    0,
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="text-accent h-auto w-full min-w-[32rem]"
        role="img"
        aria-label={`Trend from ${points[0]?.label} to ${points[points.length - 1]?.label}`}
      >
        {/* Quartile grid. Faint, because it is a reading aid and not data. */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + inner.h * f}
            y2={pad.top + inner.h * f}
            className="stroke-edge"
            strokeWidth="1"
          />
        ))}

        <polygon points={area} fill="currentColor" opacity="0.12" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* The peak is marked because "when was our best day" is the question
            people actually ask of a revenue chart. */}
        <circle cx={x(peak)} cy={y(points[peak]!.value)} r="3.5" fill="currentColor" />

        <text
          x={pad.left}
          y={height - 4}
          className="fill-fg-faint text-[10px]"
        >
          {points[0]?.label}
        </text>
        <text
          x={width - pad.right}
          y={height - 4}
          textAnchor="end"
          className="fill-fg-faint text-[10px]"
        >
          {points[points.length - 1]?.label}
        </text>
        <text
          x={x(peak)}
          y={y(points[peak]!.value) - 8}
          textAnchor="middle"
          className="fill-fg text-[10px]"
        >
          {format(points[peak]!.value)}
        </text>
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
}: {
  points: Point[];
  format: (value: number) => string;
}) {
  if (points.length === 0) {
    return <p className="text-fg-faint py-4 text-sm">No data yet.</p>;
  }

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <ul className="space-y-2">
      {points.map((point) => (
        <li key={point.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{point.label}</span>
            <span className="font-mono tabular-nums">{format(point.value)}</span>
          </div>
          <div
            className="bg-edge mt-1 h-1.5 w-full overflow-hidden rounded-full"
            role="presentation"
          >
            <div
              className="bg-accent h-full rounded-full"
              style={{ width: `${Math.max((point.value / max) * 100, 1)}%` }}
            />
          </div>
        </li>
      ))}
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
  const change =
    previous !== undefined && current !== undefined && previous !== 0
      ? (current - previous) / previous
      : null;

  const good = change === null ? null : inverse ? change < 0 : change > 0;

  return (
    <div className="border-edge bg-surface rounded border p-4">
      <p className="text-fg-faint text-xs">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums">{value}</p>
      {change !== null ? (
        <p
          className={`mt-1 text-xs ${good ? "text-ok" : "text-warn"}`}
          title="Against the previous period of the same length"
        >
          {change > 0 ? "▲" : "▼"} {Math.abs(change * 100).toFixed(1)}%
        </p>
      ) : hint ? (
        <p className="text-fg-faint mt-1 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
