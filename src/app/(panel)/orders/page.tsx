"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  SkeletonRows,
  StatusPill,
  PageHeader,
} from "@/components/ui";
import { type AdminOrder, api, formatMoney } from "@/lib/api";

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Finding driver" },
  { value: "assigned", label: "Assigned" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Debounced so typing a phone number is one request, not eleven.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Guards against out-of-order responses: a slow request for "98" must not
  // overwrite results for the later, more specific "9876".
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setOrders(null);
    setError(null);

    api
      .orders({
        ...(status ? { status } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      })
      .then((res) => {
        if (id !== requestId.current) return;
        setOrders(res.results);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Could not load deliveries.");
      });
  }, [status, debouncedSearch]);

  const activeCount = useMemo(
    () =>
      orders?.filter(
        (o) => !["delivered", "cancelled"].includes(o.status),
      ).length ?? 0,
    [orders],
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageHeader
            title="Deliveries"
            subtitle={
              orders === null
                ? "Loading…"
                : `${orders.length} shown · ${activeCount} active`
            }
          />
        </div>

        <div className="w-full max-w-[280px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order code, phone or name"
            aria-label="Search deliveries"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => {
          const selected = filter.value === status;
          return (
            <GhostButton
              key={filter.value || "all"}
              onClick={() => setStatus(filter.value)}
              aria-pressed={selected}
              className={
                selected
                  ? "border-accent text-accent"
                  : undefined
              }
            >
              {filter.label}
            </GhostButton>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {error ? (
          <EmptyState title="Could not load deliveries" hint={error} />
        ) : orders === null ? (
          <SkeletonRows rows={8} />
        ) : orders.length === 0 ? (
          <EmptyState
            title="Nothing matches"
            hint={
              search || status
                ? "Try a different filter or search."
                : "Bookings will appear here."
            }
          />
        ) : (
          <>
            <div
              className="grid grid-cols-[104px_1fr_150px_120px_88px] gap-4 border-b border-line
                         bg-panel px-4 py-2 font-mono text-[9px] uppercase tracking-[2px]
                         text-fg-muted"
            >
              <span>Code</span>
              <span>Route</span>
              <span>Customer</span>
              <span>Status</span>
              <span className="text-right">Total</span>
            </div>

            <ul className="stagger divide-y divide-line">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="grid grid-cols-[104px_1fr_150px_120px_88px] items-center gap-4
                             px-4 py-3 transition-colors duration-150 hover:bg-panel"
                >
                  <span className="font-mono text-xs text-fg-mid">{order.code}</span>

                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-fg-soft">
                      {order.pickupAddress}
                    </span>
                    <span className="block truncate text-[12px] text-fg-faint">
                      → {order.dropAddress}
                    </span>
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-[13px]">
                      {order.customer.name || "—"}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-fg-faint">
                      {order.customer.phone}
                    </span>
                  </span>

                  <span>
                    <StatusPill status={order.status} />
                    {order.riderName && (
                      <span className="mt-1 block truncate text-[11px] text-fg-faint">
                        {order.riderName}
                      </span>
                    )}
                  </span>

                  <span className="text-right font-mono text-xs tabular-nums">
                    {formatMoney(order.total)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
