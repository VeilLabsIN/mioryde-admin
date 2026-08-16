"use client";

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
import {
  clockSkewMs,
  elapsedMs,
  formatElapsed,
  needsAttention,
} from "@/lib/elapsed";
import { type AdminEvent, useAdminEvents } from "@/lib/useAdminEvents";

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

export default function LivePage() {
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
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

  const visible = useMemo(
    () =>
      statusFilter
        ? (orders ?? []).filter((o) => o.status === statusFilter)
        : (orders ?? []),
    [orders, statusFilter],
  );

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
        <p role="alert" className="text-[12px] text-warn">
          Showing the last successful load — {error}
        </p>
      )}

      {snapshot?.truncated && (
        <p role="alert" className="text-[12px] text-warn">
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
              <>
                <div
                  className="grid grid-cols-[96px_minmax(0,1fr)_150px_170px_130px_86px] gap-4
                             border-b border-line bg-panel px-4 py-2 font-mono text-[9px]
                             uppercase tracking-[2px] text-fg-muted"
                >
                  <span>Code</span>
                  <span>Route</span>
                  <span>Customer</span>
                  <span>Partner</span>
                  <span>Status</span>
                  <span className="text-right">Total</span>
                </div>

                <ul className="divide-y divide-line">
                  {visible.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      now={now}
                      skew={skew}
                    />
                  ))}
                </ul>
              </>
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
    <li
      className={`grid grid-cols-[96px_minmax(0,1fr)_150px_170px_130px_86px] items-center
                  gap-4 px-4 py-3 transition-colors duration-150 hover:bg-panel
                  ${attention ? "border-l-2 border-l-warn" : "border-l-2 border-l-transparent"}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-xs text-fg-mid">
          {order.code}
        </span>
        <span className="block font-mono text-[10px] uppercase tracking-wide text-fg-faint">
          {order.paymentMethod}
        </span>
      </span>

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

      <span className="min-w-0">
        {order.rider ? (
          <>
            <span className="block truncate text-[13px]">
              {order.rider.name || "—"}
            </span>
            {/* Reveal is audited server-side. A dispatcher chasing a stuck
                delivery needs the number without leaving the board. */}
            <RevealPhone riderId={order.rider.id} masked={order.rider.phone} />
          </>
        ) : (
          <span className="text-[12px] text-fg-faint">
            Unassigned
            {order.declines > 0 && (
              <span className="ml-1.5 text-warn">
                · {order.declines} declined
              </span>
            )}
          </span>
        )}
      </span>

      <span>
        <StatusPill status={order.status} />
        <span
          className={`mt-1 block font-mono text-[11px] tabular-nums ${
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

      <span className="text-right font-mono text-xs tabular-nums">
        {formatMoney(order.total)}
      </span>
    </li>
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
  selected: string | null;
  onSelect: (status: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <GhostButton
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={selected === null ? "border-accent text-accent" : undefined}
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
            onClick={() => onSelect(active ? null : status)}
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
      <p className="mb-3 font-mono text-[9px] uppercase tracking-[2px] text-fg-muted">
        Activity · this session
      </p>

      {events.length === 0 ? (
        <p className="text-[12px] text-fg-faint">
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
          <span className="block truncate text-[12px]">
            {meta?.label ?? event.topic}
          </span>
          {code && (
            <span className="block truncate font-mono text-[10px] text-fg-faint">
              {code}
            </span>
          )}
        </span>
      </span>

      <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
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
      className={`rounded border px-2 py-1 font-mono text-[10px] tabular-nums ${
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
    <span className={`rounded border px-2 py-1 text-xs ${className}`}>
      {/* A dot that only pulses while genuinely connected. A badge that says
          "Live" on a dead stream is worse than no badge. */}
      {state === "live" ? (
        <span className="bg-ok mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle" />
      ) : null}
      {label}
    </span>
  );
}
