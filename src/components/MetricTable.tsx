import { Card, SectionLabel } from "@/components/ui";

/**
 * A block of metrics compared against the previous period, as a table.
 *
 * ## The problem this solves
 *
 * `Stat` computes `(current - previous) / previous` and then shows only the
 * percentage. The previous value — which it had in its hand — is discarded.
 * So an operator reading "Orders 1,247 ▲12.4%" who wants to know what it was
 * before has to do arithmetic on a number the page already knew.
 *
 * That is fine for four hero figures at the top of a page, where the delta is
 * the headline and space is expensive. It is wrong for the eight-to-twelve
 * secondary metrics underneath, where the *comparison* is the whole point and
 * a grid of cards spends a card's worth of padding on each one.
 *
 * A table is the right shape for that: one row per metric, three aligned
 * numeric columns, and the eye reads down a column instead of hopping between
 * boxes. Twelve metrics fit in the height four cards used to take.
 *
 * ## Why the change column is not just a coloured percentage
 *
 * Direction is not the same as good. A rising cancellation rate and a rising
 * revenue figure are both "up", and colouring them the same trains people to
 * ignore the colour. `inverse` says which way is healthy for this row, so the
 * arrow shows *movement* and the colour shows *judgement*.
 *
 * They are also separable for a reason a screenshot does not show: colour is
 * not available to everyone. The arrow carries the direction, the sign carries
 * it again in text, and the colour is the third channel rather than the only
 * one.
 */

export interface Metric {
  label: string;
  /** Already formatted — this component does not know about money or units. */
  value: string;
  /** The same measure for the previous period, formatted the same way. */
  previous?: string;
  /** Raw numbers, for computing the delta. Omit either and the row shows a dash. */
  currentRaw?: number;
  previousRaw?: number;
  /** True when *down* is the healthy direction — cancellations, refunds, latency. */
  inverse?: boolean;
  /** One short line under the label. Use it for the definition, not for prose. */
  hint?: string;
}

export function MetricTable({
  label,
  metrics,
  periodLabel = "previous period",
  note,
}: {
  label: string;
  metrics: Metric[];
  /** Names what the comparison is against, in the column header. */
  periodLabel?: string;
  /** One line under the table — a caveat about how the numbers are measured. */
  note?: React.ReactNode;
}) {
  /*
   * The comparison columns appear only when something in this set can fill
   * them.
   *
   * Several groups here are point-in-time rather than periodic — partners
   * currently online, cash currently outstanding — and there is no meaningful
   * "previous" for those. Rendering the columns anyway gives a table of
   * dashes, which looks like data that failed to load rather than a measure
   * that has no previous value. Dropping them turns the same component into a
   * plain dense list, which is what those groups actually want.
   */
  const comparative = metrics.some(
    (metric) => metric.previous !== undefined || metric.previousRaw !== undefined,
  );

  return (
    <Card size="lg" className="p-4">
      <SectionLabel>{label}</SectionLabel>

      {/*
        `overflow-x-auto` rather than letting the table shrink. Three numeric
        columns collapsing on a narrow window is how a comparison stops being
        readable exactly when somebody is checking it on a laptop in a meeting.
      */}
      <div className={`mt-3 ${comparative ? "overflow-x-auto" : ""}`}>
        <table
          className={`w-full border-collapse ${comparative ? "min-w-[26rem]" : ""}`}
        >
          <thead>
            <tr className="border-line border-b">
              <th className="text-fg-muted font-mono text-micro py-2 pr-3 text-left uppercase">
                Metric
              </th>
              <th className="text-fg-muted font-mono text-micro py-2 px-3 text-right uppercase">
                {comparative ? "Current" : "Value"}
              </th>
              {comparative ? (
                <>
                  <th className="text-fg-muted font-mono text-micro py-2 px-3 text-right uppercase">
                    {periodLabel}
                  </th>
                  <th className="text-fg-muted font-mono text-micro py-2 pl-3 text-right uppercase">
                    Change
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <MetricRow
                key={metric.label}
                metric={metric}
                comparative={comparative}
              />
            ))}
          </tbody>
        </table>
      </div>

      {note ? (
        <p className="text-fg-faint text-meta mt-3 leading-relaxed">{note}</p>
      ) : null}
    </Card>
  );
}

function MetricRow({
  metric,
  comparative,
}: {
  metric: Metric;
  comparative: boolean;
}) {
  const { currentRaw, previousRaw, inverse = false } = metric;

  // Guarded on zero as well as undefined: dividing by a previous period with
  // no activity yields Infinity, which renders as "∞%" and looks like a bug
  // rather than like the first week of trading that it usually is.
  const comparable =
    currentRaw !== undefined && previousRaw !== undefined && previousRaw !== 0;
  const change = comparable ? (currentRaw - previousRaw) / previousRaw : null;
  const healthy = change === null ? null : inverse ? change < 0 : change > 0;

  return (
    <tr className="border-line/60 border-b last:border-0">
      <td className="py-2.5 pr-3">
        <span className="text-body text-fg-soft">{metric.label}</span>
        {metric.hint ? (
          <span className="text-fg-faint text-meta block">{metric.hint}</span>
        ) : null}
      </td>

      <td className="text-fg px-3 py-2.5 text-right font-mono text-body tabular-nums">
        {metric.value}
      </td>

      {comparative ? (
        <>
          <td className="text-fg-faint px-3 py-2.5 text-right font-mono text-body tabular-nums">
            {metric.previous ?? "—"}
          </td>

          <td className="py-2.5 pl-3 text-right font-mono text-body tabular-nums">
            {change === null ? (
              <span className="text-fg-faint">—</span>
            ) : (
              <span className={healthy ? "text-ok" : "text-warn"}>
                {/*
                  aria-hidden on the glyph, and the sign spelled out for a
                  screen reader. "▲ 12.4%" announced literally is "black
                  up-pointing triangle 12.4%", which is noise on every row of
                  a twelve-row table.
                */}
                <span aria-hidden>{change > 0 ? "▲" : "▼"}</span>
                <span className="sr-only">{change > 0 ? "up" : "down"} </span>
                {Math.abs(change * 100).toFixed(1)}%
              </span>
            )}
          </td>
        </>
      ) : null}
    </tr>
  );
}
