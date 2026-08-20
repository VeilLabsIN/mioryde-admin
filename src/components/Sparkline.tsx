/**
 * Fourteen days of a figure, at the width of a card.
 *
 * ## Why there are no axes, labels or gridlines
 *
 * Because it is not a chart. A sparkline answers one question — is this
 * normal — and it answers it pre-attentively, in the moment the eye lands on
 * the number beside it. Adding a scale invites people to read values off it,
 * which at this size they would read wrong. The Analytics page is where you go
 * to read values.
 *
 * ## Why it is drawn from a fixed viewBox and stretched
 *
 * The SVG is 100×32 in its own coordinates and scales to whatever the card is
 * wide. That means no measuring, no resize observer, and no second render — it
 * simply fits. `vector-effect` keeps the stroke one pixel however far it is
 * stretched, which is the one thing that otherwise gives the trick away.
 *
 * ## The flat-series case
 *
 * A series that never changes has no range to normalise against, and dividing
 * by that zero would put every point at NaN and draw nothing. It is drawn as a
 * centre line instead: "steady" is a real answer and deserves to look like one.
 */
export function Sparkline({
  values,
  className = "",
  tone = "accent",
}: {
  values: number[];
  className?: string;
  /** `accent` for ordinary figures, `alt` where green already means healthy. */
  tone?: "accent" | "alt";
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;

  const stroke = tone === "alt" ? "var(--accent-alt)" : "var(--accent)";

  const points = values.map((value, i) => {
    const x = (i / (values.length - 1)) * 100;
    // Inset by 3 top and bottom so the stroke is not clipped at the extremes.
    const y = range === 0 ? 16 : 29 - ((value - min) / range) * 26;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `0,32 ${line} 100,32`;
  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      // Decorative: the figure it sits beside is the accessible content, and
      // announcing fourteen unlabelled numbers would be noise.
      aria-hidden
      className={`h-8 w-full ${className}`}
    >
      <polygon points={area} fill={stroke} opacity="0.10" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Today, marked. Without it the eye has to work out which end is now. */}
      <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Period-over-period change, as a rendered arrow and a percentage.
 *
 * Returns null when the previous value was zero. A rise from nothing is not
 * "up 100%", it is the first one — and printing an infinite or invented
 * percentage next to a real figure is how a dashboard loses its credibility on
 * day one of a new business.
 */
export function Delta({
  current,
  previous,
  /** True when a rise is bad — cancellations, unassigned deliveries. */
  inverted = false,
}: {
  current: number;
  previous: number;
  inverted?: boolean;
}) {
  if (previous === 0) return null;

  const change = ((current - previous) / previous) * 100;
  const flat = Math.abs(change) < 1;
  const up = change > 0;
  const good = inverted ? !up : up;

  const tone = flat
    ? "text-fg-faint"
    : good
      ? "text-accent-alt"
      : "text-danger";

  return (
    <span className={`font-mono text-micro tabular-nums ${tone}`}>
      <span aria-hidden>{flat ? "→" : up ? "↑" : "↓"}</span>{" "}
      {Math.abs(change).toFixed(0)}%
      <span className="sr-only">
        {flat ? "no change" : up ? "up" : "down"} versus the same time yesterday
      </span>
    </span>
  );
}
