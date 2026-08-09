"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, EmptyState, SectionLabel, StatusPill } from "@/components/ui";
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
      <h1 className="mb-1 font-sans text-2xl font-semibold">Overview</h1>
      <p className="mb-8 text-[13px] text-fg-muted">
        Live operations across every zone.
      </p>

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
          // Nothing drains the outbox yet, so a rising number here is expected
          // rather than alarming — but it should be visible, not hidden.
          warn={(data?.outboxPending ?? 0) > 0}
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
}: {
  label: string;
  value?: number | string;
  accent?: boolean;
  warn?: boolean;
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
    </Card>
  );
}
