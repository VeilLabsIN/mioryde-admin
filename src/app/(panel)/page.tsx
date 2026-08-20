"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAttention } from "@/components/Banner";
import { Delta, Sparkline } from "@/components/Sparkline";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionLabel,
  StatusPill,
} from "@/components/ui";
import {
  type AdminOrder,
  type DashboardSnapshot,
  api,
  formatMoney,
} from "@/lib/api";

/**
 * The landing page.
 *
 * ## What changed, and why
 *
 * It used to be eight figures with no context: "Delivered 1,284" is a number
 * you cannot act on, because it is every delivery since the company started
 * and it will be larger tomorrow whatever happens today. Four of the eight
 * were all-time totals that only ever go up, which is a scoreboard, not a
 * dashboard.
 *
 * Now each card carries the fourteen days behind it and its change against the
 * same slice of yesterday. The point is not decoration — it is that a figure
 * without a baseline cannot tell you whether to do anything, and the person
 * most likely to be looking is the one who has not yet built the intuition to
 * supply one.
 *
 * ## Every card goes somewhere
 *
 * A number that raises a question and then refuses to answer it wastes the
 * attention it just captured. Each one links to the page where the underlying
 * rows live.
 *
 * ## Why the counts refresh and the recent list does not
 *
 * The figures poll; the recent-deliveries list is fetched once. A table whose
 * rows reshuffle under the cursor while somebody is reading it is worse than a
 * table that is thirty seconds stale, and the Live board exists for the case
 * where currency actually matters.
 */
const POLL_MS = 20_000;

export default function OverviewPage() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [recent, setRecent] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { items: alerts } = useAttention();

  useEffect(() => {
    let cancelled = false;

    const loadCounts = async () => {
      try {
        const next = await api.dashboard();
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load data.");
        }
      }
    };

    void loadCounts();
    void api
      .orders({})
      .then((o) => {
        if (!cancelled) setRecent(o.results.slice(0, 6));
      })
      .catch(() => {
        // The list is secondary. Losing it should not blank the figures.
      });

    const timer = setInterval(() => {
      if (!document.hidden) void loadCounts();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (error && !data) {
    return <EmptyState title="Could not load the dashboard" hint={error} />;
  }

  const trend = data?.trend ?? [];

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6">
        <PageHeader
          title="Overview"
          subtitle="What is moving right now, and how today compares."
        />
      </div>

      {/* Anything already wrong, before the numbers. The banner strip shows
          these too, but somebody landing here should not have to have seen it
          scroll past on another page. */}
      {alerts.length > 0 && (
        <Card tone="warning" size="lg" className="mb-6 p-4">
          <SectionLabel>Needs attention</SectionLabel>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={`text-body font-medium ${
                    a.tone === "critical" ? "text-danger" : "text-warn"
                  }`}
                >
                  {a.title}
                </span>
                <Link
                  href={a.action.href}
                  className="motion-change font-mono text-micro uppercase text-accent
                             transition-colors hover:underline"
                >
                  {a.action.label} →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="stagger mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Active now"
          value={data?.activeOrders}
          href="/live"
          hint="In flight across every zone"
          series={trend.map((t) => t.placed)}
        />
        <Kpi
          label="Unassigned"
          value={data?.unassignedOrders}
          href="/live?status=pending"
          hint="Nobody has accepted these"
          alarm={(data?.unassignedOrders ?? 0) > 0}
          series={trend.map((t) => t.placed - t.delivered - t.cancelled)}
        />
        <Kpi
          label="Riders on duty"
          value={data?.ridersOnDuty}
          href="/map"
          hint="Reporting a position in the last 90s"
          series={trend.map((t) => t.delivered)}
          tone="alt"
        />
        <Kpi
          label="Revenue today"
          value={data ? formatMoney(data.revenueToday) : undefined}
          href="/analytics"
          hint="Delivered orders only"
          series={trend.map((t) => t.revenueMinor)}
          delta={
            data
              ? {
                  current: data.revenueToday.minor,
                  previous: data.revenueYesterday.minor,
                }
              : undefined
          }
        />
      </div>

      <div className="flex items-end justify-between">
        <SectionLabel>Recent deliveries</SectionLabel>
        <Link
          href="/orders"
          className="motion-change mb-3 font-mono text-micro uppercase text-fg-muted
                     transition-colors hover:text-accent"
        >
          View all →
        </Link>
      </div>

      <Card className="overflow-hidden">
        {recent.length === 0 ? (
          <EmptyState title="No deliveries yet" hint="Bookings will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((order) => (
              <li key={order.id}>
                <Link
                  // Encoded, and honoured: the deliveries page reads `search`
                  // from the URL.
                  href={`/orders?search=${encodeURIComponent(order.code)}`}
                  className="motion-change flex items-center gap-4 px-4 py-3
                             transition-colors hover:bg-panel"
                >
                  <span className="w-[104px] shrink-0 font-mono text-meta text-fg-mid">
                    {order.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-fg-soft">
                    {order.pickupAddress}
                    <span className="mx-2 text-fg-faint">→</span>
                    {order.dropAddress}
                  </span>
                  <StatusPill status={order.status} />
                  <span className="w-[88px] shrink-0 text-right font-mono text-meta">
                    {formatMoney(order.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  href,
  hint,
  series,
  delta,
  alarm = false,
  tone = "accent",
}: {
  label: string;
  value?: number | string;
  href: string;
  hint: string;
  series: number[];
  delta?: { current: number; previous: number };
  alarm?: boolean;
  tone?: "accent" | "alt";
}) {
  const loading = value === undefined;

  return (
    <Link href={href} className="group block">
      <Card
        tone={alarm ? "warning" : "default"}
        className="motion-change h-full overflow-hidden px-4 pb-0 pt-3.5
                   transition-colors group-hover:border-accent"
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-micro uppercase text-fg-muted">{label}</p>
          {delta && !loading && (
            <Delta current={delta.current} previous={delta.previous} />
          )}
        </div>

        {loading ? (
          // Reserves the exact height of the real value so the grid does not
          // jump when data lands.
          <div className="shimmer mt-1.5 h-8 w-20 bg-panel" />
        ) : (
          <p
            className={`mt-1 font-mono text-figure tabular-nums ${
              alarm ? "text-warn" : "text-fg"
            }`}
          >
            {value}
          </p>
        )}

        <p className="mt-1 text-meta leading-snug text-fg-faint">{hint}</p>

        {/* Full-bleed at the bottom of the card. A sparkline inset with the
            text reads as a picture of something; run to the edges it reads as
            the floor the number is standing on. */}
        <div className="-mx-4 mt-2">
          {series.length > 1 ? (
            <Sparkline values={series} tone={tone} />
          ) : (
            <div className="h-8" />
          )}
        </div>
      </Card>
    </Link>
  );
}
