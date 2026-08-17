"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionLabel,
  StatusPill,
} from "@/components/ui";
import { type AdminOrder, api, formatMoney } from "@/lib/api";

type Overview = Awaited<ReturnType<typeof api.overview>>;

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Both at once — they are independent, and sequencing them would double
    // the time the dashboard sits empty.
    Promise.all([api.overview(), api.orders({})])
      .then(([overview, orders]) => {
        if (cancelled) return;
        setData(overview);
        setRecent(orders.results.slice(0, 6));
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load data.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <EmptyState title="Could not load the dashboard" hint={error} />;
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* PageHeader, not a hand-rolled heading. This page was one of the two
          that still had its own treatment, which is the drift the component
          was extracted to end — see context.md §7. */}
      <div className="mb-8">
        <PageHeader
          title="Overview"
          subtitle="Live operations across every zone."
        />
      </div>

      <div className="stagger mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active now" value={data?.orders.active} accent />
        <Stat label="Last 24 hours" value={data?.orders.last24h} />
        <Stat label="Delivered" value={data?.orders.delivered} />
        <Stat label="Cancelled" value={data?.orders.cancelled} />
        <Stat label="Customers" value={data?.customers} />
        <Stat label="Partners" value={data?.riders} />
        <Stat
          label="Revenue (delivered)"
          value={data ? formatMoney(data.revenueDelivered) : undefined}
        />
        <Stat
          label="Dispatch queue"
          value={data?.outboxPending}
          // Unpublished events. The worker drains this every three seconds, so
          // a small non-zero number is an ordinary busy moment rather than a
          // problem — which is why the threshold is not 1.
          //
          // The previous comment here said nothing drained the outbox at all.
          // That stopped being true when the worker shipped, and it told the
          // reader to ignore a number that is now a real signal. Monitoring is
          // where the useful version of this lives: it separates a queue that
          // is busy from one that is stuck by reporting the *age* of the
          // oldest unsent event, which a count cannot.
          warn={(data?.outboxPending ?? 0) > 25}
          hint="Age, not depth, is the signal — see Monitoring"
        />
      </div>

      <div className="flex items-end justify-between">
        <SectionLabel>Recent deliveries</SectionLabel>
        <Link
          href="/orders"
          className="mb-3 font-mono text-[10px] uppercase tracking-[2px] text-fg-muted
                     transition-colors duration-150 hover:text-accent"
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
                  href={`/orders?search=${order.code}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors duration-150
                             hover:bg-panel"
                >
                  <span className="w-[104px] shrink-0 font-mono text-xs text-fg-mid">
                    {order.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-soft">
                    {order.pickupAddress}
                    <span className="mx-2 text-fg-faint">→</span>
                    {order.dropAddress}
                  </span>
                  <StatusPill status={order.status} />
                  <span className="w-[88px] shrink-0 text-right font-mono text-xs">
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

function Stat({
  label,
  value,
  accent = false,
  warn = false,
  hint,
}: {
  label: string;
  value?: number | string;
  accent?: boolean;
  warn?: boolean;
  hint?: string;
}) {
  const loading = value === undefined;
  return (
    <Card className="px-4 py-3.5">
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px] text-fg-muted">
        {label}
      </p>
      {loading ? (
        // Reserves the exact height of the real value, so the grid does not
        // jump when data lands.
        <div className="shimmer h-8 w-16 bg-panel" />
      ) : (
        <p
          className={`font-mono text-[28px] leading-8 tabular-nums ${
            warn ? "text-warn" : accent ? "text-accent" : "text-fg"
          }`}
        >
          {value}
        </p>
      )}
      {hint && !loading ? (
        <p className="mt-1 text-[11px] leading-snug text-fg-faint">{hint}</p>
      ) : null}
    </Card>
  );
}
