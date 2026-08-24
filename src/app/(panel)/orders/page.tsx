"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  Pager,
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
import { type Column, DataTable } from "@/components/DataTable";
import { OrderDrawer } from "@/components/OrderDrawer";
import { OrdersSummaryRail } from "@/components/OrdersSummaryRail";
import { SelectAllBox, SelectionBar } from "@/components/SelectionBar";
import { CopyCodesButton } from "@/components/CopyCodesButton";

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Finding driver" },
  { value: "assigned", label: "Assigned" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
] as const;


/**
 * The delivery table's columns.
 *
 * Declared once. The grid version this replaces wrote every width twice — on
 * the header row and again on each data row — and kept them in sync by hand.
 */
function orderColumns(
  onOpen: (order: AdminOrder) => void,
  selection: {
    selected: ReadonlySet<string>;
    toggle: (id: string) => void;
    allOnPage: boolean;
    someOnPage: boolean;
    toggleAll: (next: boolean) => void;
  },
): readonly Column<AdminOrder>[] {
  return [
  {
    key: "select",
    // Narrow and unlabelled in the header: the header cell holds the
    // select-all control itself, and a visible "Select" heading above a column
    // of checkboxes says nothing the checkboxes do not.
    header: "",
    width: "36px",
    headerCell: (
      <SelectAllBox
        checked={selection.allOnPage}
        indeterminate={selection.someOnPage}
        onChange={selection.toggleAll}
        label="Select every delivery on this page"
      />
    ),
    cell: (order) => (
      <input
        type="checkbox"
        checked={selection.selected.has(order.id)}
        onChange={() => selection.toggle(order.id)}
        // Named per row. "Checkbox" repeated twenty-five times tells a
        // screen-reader user which row they are on only by counting.
        aria-label={`Select ${order.code}`}
        className="accent-accent-bright size-3.5 cursor-pointer align-middle"
      />
    ),
  },
  {
    key: "code",
    header: "Code",
    width: "116px",
    cell: (order) => (
      /*
        A button, not a link, and this is the accessibility contract for the
        whole table.

        `DataTable` opens a row on click as a mouse convenience, but a `<tr>`
        cannot be the keyboard route — given `tabIndex` it has no role to
        announce, and `role="button"` would destroy the row/column semantics
        the table exists to provide. So the keyboard route is a real focusable
        control inside the row, and the code was already the designated click
        target.

        The full record is still reachable, from the drawer's footer. That
        loses ctrl-click-to-new-tab from the list, which is a real cost — but
        the drawer is the faster path for the triage this page is for, and
        queueing rows in tabs was mostly a workaround for losing the filter on
        navigation, which is exactly what the drawer fixes.
      */
      <button
        type="button"
        onClick={() => onOpen(order)}
        className="motion-change font-mono text-meta text-fg-mid underline-offset-2
                   transition-colors hover:text-accent hover:underline"
      >
        {order.code}
      </button>
    ),
  },
  {
    key: "route",
    header: "Route",
    cell: (order) => (
      <span className="block min-w-0">
        <span className="block truncate text-body text-fg-soft">
          {order.pickupAddress}
        </span>
        <span className="block truncate text-meta text-fg-faint">
          → {order.dropAddress}
        </span>
      </span>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    width: "160px",
    cell: (order) => (
      <span className="block min-w-0">
        <span className="block truncate text-body">
          {order.customer.name || "—"}
        </span>
        <span className="block truncate font-mono text-meta text-fg-faint">
          {order.customer.phone}
        </span>
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    width: "132px",
    cell: (order) => (
      <>
        <StatusPill status={order.status} />
        {order.riderName && (
          <span className="mt-1 block truncate text-meta text-fg-faint">
            {order.riderName}
          </span>
        )}
      </>
    ),
  },
  {
    key: "total",
    header: "Total",
    width: "96px",
    align: "right",
    cell: (order) => (
      <span className="font-mono text-meta tabular-nums">
        {formatMoney(order.total)}
      </span>
    ),
  },
  ];
}

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

  // The open row's id *is* the drawer's open state. A separate boolean would be
  // a second thing to keep in step, and the pair disagreeing means either a
  // drawer with no record or a record with no drawer.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  /*
   * Selection survives paging, and that is deliberate.
   *
   * Keyed by id in a Set rather than by index or by "all on this page",
   * because an operator gathering the deliveries for one complaint often finds
   * them across two pages. Clearing on navigation would silently discard half
   * their work at the moment they clicked "next".
   *
   * It is cleared when the *filter* changes, though — see the effect below.
   * A selection made under "Cancelled" that survives into "Delivered" is a set
   * the operator can no longer see, and acting on rows you cannot see is how
   * the wrong thing gets sent to a customer.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const pageIds = useMemo(() => orders?.map((o) => o.id) ?? [], [orders]);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;

  const columns = useMemo(
    () =>
      orderColumns(
        (order) => setOpenOrderId(order.id),
        {
          selected,
          toggle: (id) =>
            setSelected((current) => {
              const next = new Set(current);
              if (!next.delete(id)) next.add(id);
              return next;
            }),
          allOnPage: pageIds.length > 0 && selectedOnPage === pageIds.length,
          someOnPage: selectedOnPage > 0,
          toggleAll: (on) =>
            setSelected((current) => {
              const next = new Set(current);
              for (const id of pageIds) {
                if (on) next.add(id);
                else next.delete(id);
              }
              return next;
            }),
        },
      ),
    [selected, pageIds, selectedOnPage],
  );

  /*
   * A filter change discards the selection.
   *
   * Paging deliberately keeps it — an operator gathering deliveries for one
   * complaint often finds them across two pages. Changing the filter is
   * different: the rows selected under "Cancelled" are not visible under
   * "Delivered", and acting on a set you cannot see is how the wrong file gets
   * sent to a customer.
   */
  // JSON rather than a delimiter. Joining these with any separator means
  // picking one that cannot appear in a search box, and a NUL for that
  // purpose is how an invisible byte ended up in this file once already.
  const filterKey = JSON.stringify([status, debouncedSearch]);
  const [selectedUnder, setSelectedUnder] = useState(filterKey);
  if (filterKey !== selectedUnder) {
    // Adjusted during render rather than in an effect, so the stale selection
    // is never painted against the new filter — a bar reading "4 selected"
    // over rows that are not those four is exactly the confusion this is
    // preventing.
    setSelectedUnder(filterKey);
    setSelected(new Set());
  }

  const selectedOrders = useMemo(
    () => orders?.filter((o) => selected.has(o.id)) ?? [],
    [orders, selected],
  );

  const activeCount = useMemo(
    () =>
      orders?.filter(
        (o) => !["delivered", "cancelled"].includes(o.status),
      ).length ?? 0,
    [orders],
  );

  return (
    /*
      Wider than the 1200px most pages use, and only since the rail arrived.

      The rail takes 288px plus a gap, which at 1200 leaves the table under
      900 for five columns including two addresses — the route column
      truncates to the first few words and stops being readable, which is the
      column people scan. 1440 restores roughly what the table had before.

      Not applied globally: the pages on 900 and 1200 are reading-width by
      intent, and a table page needing more room is not an argument for
      stretching a settings form to match. `/map` already sits at 1400 for the
      same kind of reason.
    */
    <div className="mx-auto max-w-[1440px]">
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

      {/*
        Table and rail.

        `xl` rather than `lg` for the split: the deliveries table has five
        columns including two addresses, and taking 288px off it at 1024px
        makes the route column truncate to uselessness. Below that the rail
        moves under the table rather than beside it — and it goes *after*,
        because on a narrow screen the rows are what somebody came for and
        totals above them would push the work off screen.
      */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
      <Card className="overflow-hidden">
        {error ? (
          <EmptyState title="Could not load deliveries" hint={error} />
        ) : (
          <DataTable
            caption="Deliveries, newest first"
            columns={columns}
            rows={orders}
            rowKey={(order) => order.id}
            onRowActivate={(order) => setOpenOrderId(order.id)}
            emptyTitle="Nothing matches"
            emptyHint={
              search || status
                ? "Try a different filter or search."
                : "Bookings will appear here."
            }
          />
        )}
      </Card>
        </div>

        {/*
          Hidden while the table is erroring. A rail of totals beside an error
          message invites the reading that the totals are what loaded and the
          rows are what failed — when in practice the same outage takes both.
        */}
        {error ? null : (
          <aside className="w-full shrink-0 xl:w-[288px]">
            <OrdersSummaryRail
              status={status}
              search={debouncedSearch}
              filterLabel={
                FILTERS.find((f) => f.value === status)?.label ?? "All"
              }
            />
          </aside>
        )}
      </div>

      <OrderDrawer
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
      />

      {/*
        Copy, not export, and not as a fallback.

        There is no `deliveries.csv` endpoint — the panel exports payouts,
        collections, the audit log, the partner leaderboard and daily figures,
        but never the deliveries list. Adding one is worth doing; it is not
        what this bar is for.

        What an operator does with four order codes is paste them into a
        ticket, a WhatsApp message to a partner, or a mail to the customer. A
        newline-joined list is what all three want, and it needs no server.
      */}
      <SelectionBar
        count={selected.size}
        noun="delivery"
        onClear={() => setSelected(new Set())}
      >
        <CopyCodesButton orders={selectedOrders} total={selected.size} />
      </SelectionBar>

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
