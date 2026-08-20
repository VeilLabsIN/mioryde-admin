"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui";
import {
  type LiveMapSnapshot,
  type MapOrder,
  type RiderMapStatus,
  api,
} from "@/lib/api";

/**
 * The live map.
 *
 * ## Why it is not inside a Card
 *
 * Every other page in the panel is a column of cards on a padded background.
 * This one is a map that fills the frame, because a dispatch map with a
 * hundred pixels of chrome around it is a smaller map for no reason. The side
 * panel is the only furniture, and it collapses.
 *
 * ## Why Leaflet is loaded dynamically
 *
 * Leaflet reaches for `window` at import time, which throws during the static
 * prerender Next does at build. `ssr: false` keeps it off the server entirely.
 * The page is behind a client-side auth guard anyway, so there was never any
 * server-rendered content to lose.
 */
const LiveMapCanvas = dynamic(
  () => import("@/components/LiveMapCanvas").then((m) => m.LiveMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid size-full place-items-center bg-panel">
        <Spinner className="size-5 text-fg-faint" />
      </div>
    ),
  },
);

/**
 * How often the snapshot is refetched.
 *
 * Four seconds. The rider app heartbeats every few seconds, so polling faster
 * buys nothing but load, and polling slower makes a pin visibly lag the vehicle
 * it represents. The request is one query returning the active fleet — small
 * enough that this is cheap, and the interval pauses when the tab is hidden.
 */
const POLL_MS = 4000;

const STATUS_DOT: Record<RiderMapStatus, string> = {
  delivering: "bg-accent-alt",
  idle: "bg-accent-bright",
  offline: "bg-fg-faint",
};

export default function MapPage() {
  const [snapshot, setSnapshot] = useState<LiveMapSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [tilesBroken, setTilesBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await api.liveMap();
        if (!cancelled) {
          setSnapshot(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Lost contact with the server.");
        }
      }
    };

    /**
     * Repeat polls only.
     *
     * A hidden tab is a dispatcher who has gone to look at something else, and
     * polling it keeps a connection warm for nobody. But the *first* load must
     * happen regardless: opening this in a background tab and gating that one
     * too leaves an empty map behind, and switching to the tab shows nothing
     * until the next tick — or, if the browser throttles timers in background
     * tabs, for as long as it feels like. That was a real bug, found by
     * loading the page in a pane the browser reported as hidden and watching
     * it stay blank forever.
     */
    const poll = () => {
      if (document.hidden) return;
      void load();
    };

    // Unconditional, and first.
    void load();
    const timer = setInterval(poll, POLL_MS);

    // Coming back to the tab refetches immediately rather than waiting out the
    // remainder of an interval. Four seconds of staring at stale pins is four
    // seconds of not trusting the map.
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const onSelectOrder = useCallback((id: string | null) => setFocused(id), []);

  const counts = useMemo(() => {
    const riders = snapshot?.riders ?? [];
    return {
      delivering: riders.filter((r) => r.status === "delivering").length,
      idle: riders.filter((r) => r.status === "idle").length,
      offline: riders.filter((r) => r.status === "offline").length,
      unassigned: (snapshot?.orders ?? []).filter((o) => o.status === "pending").length,
    };
  }, [snapshot]);

  const orders = useMemo(() => {
    const list = [...(snapshot?.orders ?? [])];
    // Oldest in its current status first — the same order the live board uses,
    // because the thing that has been waiting longest is the thing that needs
    // somebody.
    list.sort(
      (a, b) =>
        new Date(a.statusSince).getTime() - new Date(b.statusSince).getTime(),
    );
    return list;
  }, [snapshot]);

  return (
    // Negative margin cancels the shell's page padding. The map is the page.
    <div className="-m-6 flex h-[calc(100%+3rem)] min-h-0">
      <div className="relative min-w-0 flex-1">
        <LiveMapCanvas
          snapshot={snapshot}
          focusedOrderId={focused}
          onSelectOrder={onSelectOrder}
          onTileError={setTilesBroken}
        />

        {/*
          The basemap and the fleet data fail independently, and the message
          says which. A provider rejecting the key still draws pins in the
          right places — the positions are ours, only the imagery is theirs.
        */}
        {tilesBroken && (
          <div
            role="status"
            className="absolute inset-x-3 top-14 z-[400] rounded-md border border-warn/60
                       bg-surface px-3 py-2 text-meta text-warn"
          >
            The basemap will not load. The pins are still correct — only the
            imagery is missing. Usually the tile provider is rejecting this
            site&rsquo;s address: check the allowed origins on the key.
          </div>
        )}

        {/* Floating summary. Over the map rather than above it, so the map
            keeps the full height of the frame. */}
        <div className="pointer-events-none absolute left-3 top-3 z-[400] flex flex-wrap gap-2">
          <Tally label="Delivering" value={counts.delivering} dot="bg-accent-alt" />
          <Tally label="Idle" value={counts.idle} dot="bg-accent-bright" />
          <Tally label="Offline" value={counts.offline} dot="bg-fg-faint" />
          {counts.unassigned > 0 && (
            <Tally label="Unassigned" value={counts.unassigned} dot="bg-danger" alarm />
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="absolute inset-x-3 bottom-3 z-[400] rounded-md border border-danger/60
                       bg-surface px-3 py-2 text-meta text-danger"
          >
            {error} — showing the last good positions.
          </div>
        )}

        {!showPanel && (
          <button
            type="button"
            onClick={() => setShowPanel(true)}
            className="motion-change absolute right-3 top-3 z-[400] rounded-md border border-edge
                       bg-surface px-3 py-1.5 font-mono text-micro uppercase text-fg-mid
                       transition-colors hover:border-accent hover:text-accent"
          >
            Show queue
          </button>
        )}
      </div>

      {showPanel && (
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-mono text-micro uppercase text-fg-faint">In flight</p>
              <p className="text-label font-medium text-fg">
                {orders.length} deliver{orders.length === 1 ? "y" : "ies"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              aria-label="Hide the queue"
              className="motion-change font-mono text-micro uppercase text-fg-faint
                         transition-colors hover:text-accent"
            >
              Hide
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {snapshot === null && (
              <div className="grid place-items-center py-16">
                <Spinner className="size-4 text-fg-faint" />
              </div>
            )}

            {snapshot !== null && orders.length === 0 && (
              <p className="px-4 py-10 text-center text-body text-fg-muted">
                Nothing in flight. A quiet board is a good board.
              </p>
            )}

            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                now={snapshot?.now ?? new Date().toISOString()}
                selected={focused === order.id}
                onSelect={() =>
                  setFocused(focused === order.id ? null : order.id)
                }
              />
            ))}
          </div>

          {snapshot && (
            <div className="border-t border-line px-4 py-2">
              <p className="font-mono text-micro uppercase text-fg-faint">
                Fleet · {snapshot.riders.length} tracked
              </p>
              <div className="mt-1.5 space-y-1">
                {snapshot.riders.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[r.status]}`} />
                    <span className="min-w-0 flex-1 truncate text-meta text-fg-muted">
                      {r.name}
                    </span>
                    <span className="font-mono text-micro text-fg-faint">
                      {r.secondsAgo < 60 ? `${r.secondsAgo}s` : `${Math.floor(r.secondsAgo / 60)}m`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function Tally({
  label,
  value,
  dot,
  alarm = false,
}: {
  label: string;
  value: number;
  dot: string;
  alarm?: boolean;
}) {
  return (
    <span
      // Solid, not translucent. A chip at 95% over map detail is measurably
      // harder to read than one at 100%, and `backdrop-blur` asks the compositor
      // to re-blur on every tile that moves underneath it — paid continuously,
      // for an effect nobody asked for.
      className={`flex items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1
                  [box-shadow:var(--shadow-panel)] ${alarm ? "border-danger/60" : "border-line"}`}
    >
      <span
        className={`size-1.5 rounded-full ${dot} ${alarm ? "motion-safe:animate-pulse" : ""}`}
      />
      <span className="font-mono text-micro uppercase text-fg-muted">{label}</span>
      <span className="text-body font-medium tabular-nums text-fg">{value}</span>
    </span>
  );
}

function OrderRow({
  order,
  now,
  selected,
  onSelect,
}: {
  order: MapOrder;
  now: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const mins = Math.max(
    0,
    Math.round((new Date(now).getTime() - new Date(order.statusSince).getTime()) / 60000),
  );
  const flagged =
    order.status === "pending"
      ? mins >= 5
      : order.status === "assigned" || order.status === "arriving_pickup"
        ? mins >= 15
        : mins >= 120;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`motion-change block w-full border-b border-line px-4 py-3 text-left
                  transition-colors ${
                    selected ? "bg-panel" : "hover:bg-panel"
                  }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-meta font-medium text-fg">{order.code}</span>
        <span
          className={`font-mono text-micro tabular-nums ${
            flagged ? "text-danger" : "text-fg-faint"
          }`}
        >
          {flagged && <span aria-hidden>⚑ </span>}
          {mins}m
        </span>
      </div>

      <p className="mt-0.5 font-mono text-micro uppercase text-fg-muted">
        {order.status.replace(/_/g, " ")}
        {order.riderName ? ` · ${order.riderName}` : " · unassigned"}
      </p>

      <p className="mt-1 truncate text-meta text-fg-muted">{order.pickupAddress}</p>
      <p className="truncate text-meta text-fg-faint">→ {order.dropAddress}</p>

      {selected && (
        <span className="mt-2 inline-block">
          <Link
            href={`/orders/${order.id}`}
            onClick={(e) => e.stopPropagation()}
            className="motion-change font-mono text-micro uppercase text-accent
                       transition-colors hover:underline"
          >
            Open delivery →
          </Link>
        </span>
      )}
    </button>
  );
}
