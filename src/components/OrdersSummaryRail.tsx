"use client";

import { useEffect, useState } from "react";
import { Card, SectionLabel, SkeletonRows } from "@/components/ui";
import { type OrdersSummary, api, formatMoney } from "@/lib/api";

/**
 * Aggregates beside the deliveries table, for whatever filter is applied.
 *
 * ## "For this filter" is the entire idea
 *
 * The Flup reference puts a totals column next to its order list, and the easy
 * version of that is a set of all-time figures that never change. Those are
 * already on the dashboard, and repeating them here would mean a rail that
 * ignores the filter the operator just set — worse than nothing, because it
 * sits next to rows that *do* respond and reads as though it describes them.
 *
 * So every number here moves when the filter or the search does, and the
 * heading says which filter it is describing. That is also why the figures
 * come from their own endpoint rather than from the rows already loaded: the
 * list is paginated at 25, and summing what is in hand would give page totals
 * wearing the appearance of set totals.
 *
 * ## Why it refetches with the list rather than sharing its response
 *
 * Two requests where one would nearly do. The alternative is folding the
 * aggregates into the list response, which couples a cheap paged read to a
 * full-table scan and pays for it on every page change. Separate, the rail can
 * be slower than the table without holding it up — and it does not need to
 * re-run when only the page changes, which is the common case.
 */
export function OrdersSummaryRail({
  status,
  search,
  filterLabel,
}: {
  status: string;
  search: string;
  /** What to call the current filter, in words. "All", "In transit". */
  filterLabel: string;
}) {
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cleared during render so the previous filter's totals are never shown
  // beside the new filter's rows — the one thing that would make the rail
  // actively misleading rather than merely stale.
  // JSON rather than a delimiter, so the key cannot collide with a search
  // string that happens to contain the separator.
  const key = JSON.stringify([status, search]);
  const [loadedFor, setLoadedFor] = useState(key);
  if (key !== loadedFor) {
    setLoadedFor(key);
    setSummary(null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;

    api
      .ordersSummary({ status, search })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load totals.");
        }
      });

    return () => {
      cancelled = true;
    };
    // Deliberately not depending on the page: these are set-level figures and
    // paging does not change the set.
  }, [status, search]);

  if (error) {
    // Stated rather than hidden. A rail that silently disappears on failure
    // leaves the operator unsure whether the filter matched nothing.
    return (
      <Card size="lg" className="p-4">
        <SectionLabel>Totals</SectionLabel>
        <p className="text-warn text-meta mt-2" role="alert">
          {error}
        </p>
      </Card>
    );
  }

  if (!summary) return <SkeletonRows rows={4} />;

  return (
    <div className="flex flex-col gap-3">
      <Card size="lg" className="bloom p-4 [box-shadow:var(--elev-2)]">
        <SectionLabel>Revenue · {filterLabel}</SectionLabel>
        <p className="text-figure mt-1 font-mono tabular-nums">
          {formatMoney(summary.revenue)}
        </p>
        {/*
          Named explicitly. This sits directly under a total count, and the two
          describe different rows — a reader who assumes otherwise concludes the
          business earns nothing on two-thirds of its orders.
        */}
        <p className="text-fg-faint text-meta mt-1">
          From {summary.delivered.toLocaleString("en-IN")} delivered of{" "}
          {summary.total.toLocaleString("en-IN")} matching.
        </p>
      </Card>

      <Card size="lg" className="p-4">
        <SectionLabel>Breakdown</SectionLabel>
        <StatusBar summary={summary} />

        <dl className="mt-3 flex flex-col gap-2">
          <Line label="Delivered" value={summary.delivered} tone="ok" />
          <Line label="In flight" value={summary.active} tone="accent" />
          <Line label="Cancelled" value={summary.cancelled} tone="danger" />
        </dl>

        {summary.cancelled > 0 ? (
          <p className="text-fg-faint text-meta mt-3">
            {formatMoney(summary.cancelledValue)} of cancelled value.
          </p>
        ) : null}
      </Card>

      <Card size="lg" className="p-4">
        <SectionLabel>Detail</SectionLabel>
        <dl className="mt-2 flex flex-col gap-2">
          <Line
            label="Cash on delivery"
            value={summary.cod}
            hint={
              summary.cod > 0
                ? "Each adds to the float partners carry"
                : undefined
            }
          />
          <Line
            label="Average trip"
            value={
              summary.averageDistanceMeters === null
                ? "—"
                : `${(summary.averageDistanceMeters / 1000).toFixed(1)} km`
            }
            // Null, not zero, when nothing has been delivered under this
            // filter — "0.0 km" is a claim about deliveries that did not
            // happen.
            hint={
              summary.averageDistanceMeters === null
                ? "Nothing delivered under this filter"
                : "Delivered orders only"
            }
          />
        </dl>
      </Card>
    </div>
  );
}

/**
 * The proportions, as one bar.
 *
 * Widths are percentages of the matched total rather than of a fixed scale, so
 * the bar always fills — it answers "what is the mix", not "how many". The
 * count beside each label answers the other question, so nothing is only
 * available as a length.
 */
function StatusBar({ summary }: { summary: OrdersSummary }) {
  if (summary.total === 0) {
    return (
      <p className="text-fg-muted text-meta mt-2">
        Nothing matches this filter.
      </p>
    );
  }

  const pct = (n: number) => `${(n / summary.total) * 100}%`;

  return (
    <div
      className="bg-panel mt-2 flex h-2 overflow-hidden rounded-xs"
      // One label for the whole bar. Three adjacent coloured divs announced
      // individually is noise; the counts below carry the detail.
      role="img"
      aria-label={`${summary.delivered} delivered, ${summary.active} in flight, ${summary.cancelled} cancelled, of ${summary.total}`}
    >
      <span className="bg-ok" style={{ width: pct(summary.delivered) }} />
      <span
        className="bg-accent-bright"
        style={{ width: pct(summary.active) }}
      />
      <span className="bg-danger" style={{ width: pct(summary.cancelled) }} />
    </div>
  );
}

function Line({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "accent" | "danger";
  hint?: string;
}) {
  const dot =
    tone === "ok"
      ? "bg-ok"
      : tone === "accent"
        ? "bg-accent-bright"
        : tone === "danger"
          ? "bg-danger"
          : null;

  return (
    <div className="flex items-baseline gap-2">
      {dot ? (
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      ) : null}
      <dt className="text-body text-fg-soft">
        {label}
        {hint ? (
          <span className="text-fg-faint text-meta block">{hint}</span>
        ) : null}
      </dt>
      <span aria-hidden className="border-line mx-1 flex-1 border-b border-dashed" />
      <dd className="text-fg font-mono text-body tabular-nums">
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </dd>
    </div>
  );
}
