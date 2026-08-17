"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  Pager,
  SkeletonRows,
  StatusPill,
  PageHeader,
} from "@/components/ui";
import {
  type AdminOrder,
  type PageMeta,
  api,
  formatMoney,
} from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";

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
  const [meta, setMeta] = useState<PageMeta | null>(null);

  // Filters, search and page live in the URL, so this view is linkable. The
  // overview's recent-delivery links point here with ?search=<code> and were
  // silently dropping the filter before this — see PATTERNS.md A3.
  const [page, setPage, pageReady] = useUrlPage();
  const [status, setStatus, statusReady] = useUrlParam("status");
  const [search, setSearch, searchReady] = useUrlParam("search");
  const [error, setError] = useState<string | null>(null);

  // The URL is read in an effect after mount, so the first render holds
  // defaults. Fetching then would fire a request for the unfiltered list and
  // race it against the real one — and on a slow API the wrong response can
  // land last. Waiting one tick costs nothing and removes the race.
  const urlReady = pageReady && statusReady && searchReady;

  /**
   * Narrowing the view returns to the first page.
   *
   * Both values are in the URL, so this is two sequential writes. They compose
   * because each setter re-reads `window.location.search` rather than closing
   * over a snapshot — otherwise the second would overwrite the first and the
   * page number would survive the filter change.
   *
   * Without this, refining a search from page three lands the operator on an
   * empty table for a query that has results.
   */
  const changeStatus = (next: string) => {
    setPage(0);
    setStatus(next);
  };

  const changeSearch = (next: string) => {
    setPage(0);
    setSearch(next);
  };

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
    if (!urlReady) return;

    const id = ++requestId.current;
    setOrders(null);
    setError(null);

    api
      .orders({
        ...(page ? { page } : {}),
        ...(status ? { status } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      })
      .then((res) => {
        if (id !== requestId.current) return;
        // A stale or typed page number past the end. Recover rather than show
        // an empty table for a set that has rows in it.
        if (res.page.beyondEnd) {
          setPage(0);
          return;
        }
        setOrders(res.results);
        setMeta(res.page);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Could not load deliveries.");
      });
  }, [status, debouncedSearch, page, urlReady, setPage]);

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
                : // The total, not the page length. "25 shown" on a set of 340
                  // was the panel telling the operator it had shown them
                  // everything.
                  `${meta?.total ?? orders.length} total · ${activeCount} active on this page`
            }
          />
        </div>

        <div className="w-full max-w-[280px]">
          <Input
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
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
              onClick={() => changeStatus(filter.value)}
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
                  {/* The row's way in to the detail page. On the code rather
                      than the whole row: the row is wide and a full-row link
                      makes selecting an address to copy impossible. */}
                  <Link
                    href={`/orders/${order.id}`}
                    className="motion-change font-mono text-xs text-fg-mid underline-offset-2
                               transition-colors hover:text-accent hover:underline"
                  >
                    {order.code}
                  </Link>

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

      {meta && (
        <Pager
          page={meta}
          busy={orders === null}
          noun="deliveries"
          onChange={setPage}
        />
      )}
    </div>
  );
}
