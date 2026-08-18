"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "@/lib/useNow";
import { RevealPhone } from "@/components/RevealPhone";
import {
  Card,
  EmptyState,
  GhostButton,
  PageHeader,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import { type LiveOrder, api, formatMoney } from "@/lib/api";
import { type Column, DataTable } from "@/components/DataTable";
import {
  boardOrder,
  clockSkewMs,
  elapsedMs,
  formatElapsed,
  needsAttention,
} from "@/lib/elapsed";
import { type AdminEvent, useAdminEvents } from "@/lib/useAdminEvents";
import { useUrlParam } from "@/lib/useUrlState";

/**
 * How each topic reads in the activity feed.
 *
 * `tone` is about attention, not category: a cancellation is the one an
 * operator may need to act on, so it is the only thing that stands out.
 */
const TOPICS: Record<
  string,
  { label: string; tone: "normal" | "good" | "attention" }
> = {
  "order.placed": { label: "Order placed", tone: "normal" },
  "order.assigned": { label: "Partner assigned", tone: "normal" },
  "order.delivered": { label: "Delivered", tone: "good" },
  "order.cancelled": { label: "Cancelled", tone: "attention" },
  "job.offered": { label: "Job offered", tone: "normal" },
};

/** Events that change which deliveries are in flight, or what state they are in. */
const BOARD_CHANGING = new Set([
  "order.placed",
  "order.assigned",
  "order.delivered",
  "order.cancelled",
]);

/**
 * Fallback refresh interval.
 *
 * The stream is the primary trigger and this is the safety net. Everything
 * between the outbox worker and this tab can fail quietly — a stalled worker,
 * a proxy that dropped the stream while the client still believes it is
 * connected — and the failure mode of a dispatch board is not an error
 * message, it is a screen that looks correct and is twenty minutes old.
 */
const POLL_MS = 30_000;

/**
 * Collapses a burst of events into one refetch.
 *
 * The outbox worker publishes a tick's worth at once, so a busy moment is six
 * events and would otherwise be six identical requests landing together.
 */
const REFETCH_DEBOUNCE_MS = 800;

/** After this long without a successful load, the header says so. */
const STALE_AFTER_MS = 90_000;

interface Snapshot {
  orders: LiveOrder[];
  truncated: boolean;
  /** Skew between this workstation's clock and the server's, in ms. */
  skew: number;
  /** Local clock when this landed, for the "updated Ns ago" readout. */
  receivedAt: number;
}


/**
 * The dispatch board's columns.
 *
 * Headers and widths only — the rows are rendered by `OrderRow`, which needs
 * the board's ticking clock to compute elapsed time and cannot be expressed as
 * a function of the order alone.
 */
const BOARD_COLUMNS: readonly Column<LiveOrder>[] = [
  { key: "code", header: "Code", width: "104px" },
  { key: "route", header: "Route" },
  { key: "customer", header: "Customer", width: "156px" },
  { key: "partner", header: "Partner", width: "176px" },
  { key: "status", header: "Status", width: "136px" },
  { key: "total", header: "Total", width: "92px", align: "right" },
];

export default function LivePage() {
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // In the URL so a dispatcher can send "everything stuck at pickup" to a
  // colleague as a link. Pause stays local — it is a momentary act, not a view.
  const [statusFilter, setStatusFilter] = useUrlParam("status", "");
  const { events, state } = useAdminEvents(!paused);

  // Zero until the clock subscription is live, which is what makes the
  // server-rendered pass and the first client pass agree. Everything below
  // that reads it treats zero as "unknown" rather than as an instant.
  const now = useNow();

  // Guards against out-of-order responses. Two refetches can overlap — a poll
  // and an event-driven one — and the older reply must not overwrite the newer.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const res = await api.liveOrders();
      const receivedAt = Date.now();
      if (id !== requestId.current) return;
      setSnapshot({
        orders: res.results,
        truncated: res.truncated,
        skew: clockSkewMs(res.asOf, receivedAt),
        receivedAt,
      });
      setError(null);
    } catch (e: unknown) {
      if (id !== requestId.current) return;
      // The previous snapshot is deliberately kept. A dispatcher mid-call
      // should not lose the board because one request timed out; the header
      // says how old it is, which is the honest version of showing it anyway.
      setError(e instanceof Error ? e.message : "Could not load deliveries.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [paused, load]);

  // Refetch when something happened that changes the board. The event payload
  // is not trusted to describe the new state — it says *that* something moved,
  // and the query is what says what the board now is.
  const latestBoardEvent = events.find((e) => BOARD_CHANGING.has(e.topic))?.at;
  useEffect(() => {
    if (!latestBoardEvent || paused) return;
    const timer = setTimeout(() => void load(), REFETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [latestBoardEvent, paused, load]);

  const orders = snapshot?.orders ?? null;
  const skew = snapshot?.skew ?? 0;

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const order of orders ?? []) {
      tally[order.status] = (tally[order.status] ?? 0) + 1;
    }
    return tally;
  }, [orders]);

  const flagged = useMemo(
    () =>
      (orders ?? []).filter((o) =>
        needsAttention(o.status, elapsedMs(o.statusSince, now, skew)),
      ).length,
    [orders, now, skew],
  );

  const visible = useMemo(() => {
    const filtered = statusFilter
      ? (orders ?? []).filter((o) => o.status === statusFilter)
      : (orders ?? []);
    // Ordered against the snapshot's clock, not the ticking one. Sorting on
    // `now` would re-rank the board every second and slide a row out from
    // under the cursor as it crossed a threshold — on a screen whose rows are
    // links to irreversible actions. The flag still lights up the moment it is
    // earned; only the position waits for the next refresh.
    return boardOrder(filtered, snapshot?.receivedAt ?? 0, skew);
  }, [orders, statusFilter, snapshot?.receivedAt, skew]);

  const stale =
    snapshot !== null && now > 0 && now - snapshot.receivedAt > STALE_AFTER_MS;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title="Live operations"
        subtitle={
          orders === null
            ? "Loading…"
            : `${orders.length} in flight${
                flagged > 0 ? ` · ${flagged} needing attention` : ""
              }`
        }
        actions={
          <div className="flex items-center gap-2">
            <FreshnessBadge
              receivedAt={snapshot?.receivedAt ?? null}
              now={now}
              stale={stale}
              failing={error !== null}
            />
            <ConnectionBadge state={state} />
            <GhostButton onClick={() => setPaused((value) => !value)}>
              {paused ? "Resume" : "Pause"}
            </GhostButton>
          </div>
        }
      />

      {error && orders !== null && (
        <p role="alert" className="text-meta text-warn">
          Showing the last successful load — {error}
        </p>
      )}

      {snapshot?.truncated && (
        <p role="alert" className="text-meta text-warn">
          More deliveries are live than this board will show. Use Deliveries to
          see the rest.
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {orders !== null && orders.length > 0 && (
            <StatusFilters
              counts={counts}
              total={orders.length}
              selected={statusFilter}
              onSelect={setStatusFilter}
            />
          )}

          <Card className="overflow-hidden">
            {orders === null ? (
              error ? (
                <EmptyState title="Could not load the board" hint={error} />
              ) : (
                <SkeletonRows rows={6} />
              )
            ) : visible.length === 0 ? (
              <EmptyState
                title={
                  statusFilter ? "Nothing in that state" : "Nothing in flight"
                }
                hint={
                  statusFilter
                    ? "Clear the filter to see the rest of the board."
                    : "Deliveries appear here from the moment they are placed until they are delivered or cancelled."
                }
              />
            ) : (
              <DataTable
                caption="Deliveries in flight, those needing attention first"
                columns={BOARD_COLUMNS}
                rows={visible}
                rowKey={(order) => order.id}
                // The row needs `now` and `skew` from the board's ticking clock,
                // not just the order, so it cannot be a per-cell function.
                renderRow={(order) => (
                  <OrderRow order={order} now={now} skew={skew} />
                )}
                // The attention marker belongs against the table edge, on the
                // row itself.
                rowClassName={(order) =>
                  needsAttention(
                    order.status,
                    elapsedMs(order.statusSince, now, skew),
                  )
                    ? "border-l-2 border-l-warn"
                    : "border-l-2 border-l-transparent"
                }
              />
            )}
          </Card>
        </div>

        <ActivityFeed events={events} paused={paused} />
      </div>
    </div>
  );
}

function OrderRow({
  order,
  now,
  skew,
}: {
  order: LiveOrder;
  now: number;
  skew: number;
}) {
  const elapsed = elapsedMs(order.statusSince, now, skew);
  const attention = needsAttention(order.status, elapsed);

  return (
    <>
      <td className="px-4 py-3 align-middle">
        <span className="block min-w-0">
        {/* The board is where a stuck delivery is noticed, so it has to be
            where acting on one starts. Without this the operator reads a code
            off the screen and searches for it on another page. */}
        <Link
          href={`/orders/${order.id}`}
          className="motion-change block truncate font-mono text-meta text-fg-mid
                     underline-offset-2 transition-colors hover:text-accent hover:underline"
        >
          {order.code}
        </Link>
        <span className="block font-mono text-micro uppercase text-fg-faint">
          {order.paymentMethod}
        </span>
        </span>
      </td>

      <td className="px-4 py-3 align-middle">
        <span className="block min-w-0">
        <span className="block truncate text-body text-fg-soft">
          {order.pickupAddress}
        </span>
        <span className="block truncate text-meta text-fg-faint">
          → {order.dropAddress}
        </span>
        </span>
      </td>

      <td className="px-4 py-3 align-middle">
        <span className="block min-w-0">
        <span className="block truncate text-body">
          {order.customer.name || "—"}
        </span>
        <span className="block truncate font-mono text-meta text-fg-faint">
          {order.customer.phone}
        </span>
        </span>
      </td>

      <td className="px-4 py-3 align-middle">
        <span className="block min-w-0">
        {order.rider ? (
          <>
            <span className="block truncate text-body">
              {order.rider.name || "—"}
            </span>
            {/* Reveal is audited server-side. A dispatcher chasing a stuck
                delivery needs the number without leaving the board. */}
            <RevealPhone riderId={order.rider.id} masked={order.rider.phone} />
          </>
        ) : (
          <span className="text-meta text-fg-faint">
            Unassigned
            {order.declines > 0 && (
              <span className="ml-1.5 text-warn">
                · {order.declines} declined
              </span>
            )}
          </span>
        )}
        </span>
      </td>

      <td className="px-4 py-3 align-middle">
        <span className="block">
        <StatusPill status={order.status} />
        <span
          className={`mt-1 block font-mono text-meta tabular-nums ${
            attention ? "text-warn" : "text-fg-faint"
          }`}
          // The column reads as a duration, but the value it is derived from is
          // an instant — worth exposing for anyone reconciling against the
          // audit log, where the timestamp is what is recorded.
          title={`In this state since ${new Date(order.statusSince).toLocaleString()}`}
        >
          {formatElapsed(elapsed)}
          {attention ? " ⚑" : ""}
        </span>
        </span>
      </td>

      <td className="px-4 py-3 text-right align-middle">
        <span className="font-mono text-meta tabular-nums">
        {formatMoney(order.total)}
        </span>
      </td>
    </>
  );
}

const STATUS_FILTER_LABELS: Record<string, string> = {
  pending: "Finding driver",
  assigned: "Assigned",
  arriving_pickup: "To pickup",
  picked_up: "Picked up",
  in_transit: "In transit",
};

function StatusFilters({
  counts,
  total,
  selected,
  onSelect,
}: {
  counts: Record<string, number>;
  total: number;
  selected: string;
  onSelect: (status: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <GhostButton
        onClick={() => onSelect("")}
        aria-pressed={selected === ""}
        className={selected === "" ? "border-accent text-accent" : undefined}
      >
        All <span className="tabular-nums">{total}</span>
      </GhostButton>

      {/* Ordered by the lifecycle rather than by count, so the strip reads the
          same way every time. A control that reorders itself as the day moves
          cannot be used without reading it. */}
      {Object.keys(STATUS_FILTER_LABELS).map((status) => {
        const count = counts[status] ?? 0;
        if (count === 0) return null;
        const active = selected === status;
        return (
          <GhostButton
            key={status}
            onClick={() => onSelect(active ? "" : status)}
            aria-pressed={active}
            className={active ? "border-accent text-accent" : undefined}
          >
            {STATUS_FILTER_LABELS[status]}{" "}
            <span className="tabular-nums">{count}</span>
          </GhostButton>
        );
      })}
    </div>
  );
}

/**
 * The event stream, kept beside the board rather than replacing it.
 *
 * The board answers "what is happening"; this answers "what just changed",
 * which is a different question and the one that catches a cancellation the
 * moment it lands. Still not a log — events arrive only while the tab is open
 * and the server replays nothing on reconnect, so anything that has to be
 * complete lives in the audit log.
 */
function ActivityFeed({
  events,
  paused,
}: {
  events: AdminEvent[];
  paused: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-3 font-mono text-micro uppercase text-fg-muted">
        Activity · this session
      </p>

      {events.length === 0 ? (
        <p className="text-meta text-fg-faint">
          {paused
            ? "Paused. Nothing is being received."
            : "Nothing yet. Events appear as deliveries are placed, offered, assigned and completed."}
        </p>
      ) : (
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          {events.map((event, index) => (
            <EventRow
              // Index is part of the key because two events can share a topic
              // and timestamp, and React needs them distinguishable. The list
              // only ever grows at the head, so indices stay stable enough.
              key={`${event.at}-${event.topic}-${index}`}
              event={event}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({ event }: { event: AdminEvent }) {
  const meta = TOPICS[event.topic];
  const code =
    typeof event.payload["code"] === "string"
      ? event.payload["code"]
      : typeof event.payload["orderId"] === "string"
        ? `${(event.payload["orderId"] as string).slice(0, 8)}…`
        : null;

  return (
    <li className="flex items-center justify-between gap-2 border-b border-line py-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-block size-1.5 shrink-0 rounded-full ${
            meta?.tone === "attention"
              ? "bg-warn"
              : meta?.tone === "good"
                ? "bg-ok"
                : "bg-fg-faint"
          }`}
        />
        <span className="min-w-0">
          <span className="block truncate text-meta">
            {meta?.label ?? event.topic}
          </span>
          {code && (
            <span className="block truncate font-mono text-micro text-fg-faint">
              {code}
            </span>
          )}
        </span>
      </span>

      <span className="shrink-0 font-mono text-micro tabular-nums text-fg-faint">
        {new Date(event.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
    </li>
  );
}

/**
 * How old the board is.
 *
 * The connection badge says whether the *stream* is alive, which is not the
 * same question — the stream can be healthy while the query behind the board
 * has been failing for a minute. This is the one an operator needs before they
 * act on what they are reading.
 */
function FreshnessBadge({
  receivedAt,
  now,
  stale,
  failing,
}: {
  receivedAt: number | null;
  now: number;
  stale: boolean;
  failing: boolean;
}) {
  if (receivedAt === null || now === 0) return null;

  const age = formatElapsed(Math.max(0, now - receivedAt));
  const alarming = stale || failing;

  return (
    <span
      className={`rounded border px-2 py-1 font-mono text-micro tabular-nums ${
        alarming ? "border-warn/40 text-warn" : "border-edge text-fg-faint"
      }`}
      title={
        alarming
          ? "The board has not refreshed recently. Treat what it shows as out of date."
          : undefined
      }
    >
      {age} old
    </span>
  );
}

function ConnectionBadge({ state }: { state: string }) {
  const [label, className] = (
    {
      live: ["Live", "text-ok border-ok/40"],
      connecting: ["Connecting…", "text-fg-faint border-edge"],
      reconnecting: ["Reconnecting…", "text-warn border-warn/40"],
      stopped: ["Paused", "text-fg-faint border-edge"],
    } as Record<string, [string, string]>
  )[state] ?? ["Unknown", "text-fg-faint border-edge"];

  return (
    <span className={`rounded border px-2 py-1 text-meta ${className}`}>
      {/* A dot that only pulses while genuinely connected. A badge that says
          "Live" on a dead stream is worse than no badge. */}
      {state === "live" ? (
        <span className="bg-ok mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle" />
      ) : null}
      {label}
    </span>
  );
}
