"use client";

import { useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  PageHeader,
  SectionLabel,
} from "@/components/ui";
import { type AdminEvent, useAdminEvents } from "@/lib/useAdminEvents";

/**
 * How each topic reads to somebody watching the board.
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
};

/**
 * Live operations.
 *
 * ## What this is for
 *
 * Every other screen in the panel is refresh-to-update, which is right for
 * queues somebody works through and wrong for watching a city. A dispatcher
 * needs to notice a cancellation as it happens, not when they next reload.
 *
 * ## What it is deliberately not
 *
 * Not a log, and not a source of truth. Events arrive only while the tab is
 * open — close it and the gap is gone, because the server does not replay
 * history to a reconnecting client. Anything that has to be complete lives in
 * the audit log and the orders table. Treating this as a record would be the
 * mistake it invites, so the empty state says so.
 */
export default function LivePage() {
  const [paused, setPaused] = useState(false);
  const { events, state } = useAdminEvents(!paused);

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const event of events) {
      tally[event.topic] = (tally[event.topic] ?? 0) + 1;
    }
    return tally;
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
        title="Live operations"
        subtitle="Deliveries as they happen. This session only — nothing is kept when you close the tab."
      />

        <div className="flex items-center gap-3">
          <ConnectionBadge state={state} />
          <GhostButton onClick={() => setPaused((value) => !value)}>
            {paused ? "Resume" : "Pause"}
          </GhostButton>
        </div>
      </div>

      {events.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(([topic, count]) => (
            <span
              key={topic}
              className="border-edge text-fg-faint rounded border px-2 py-1 text-xs"
            >
              {TOPICS[topic]?.label ?? topic}
              {": "}
              <span className="tabular-nums">{count}</span>
            </span>
          ))}
        </div>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          title={paused ? "Paused" : "Waiting for activity"}
          hint={
            paused
              ? "Nothing is being received. Resume to watch again."
              : "Events appear here as deliveries are placed, assigned and completed. Past activity is in Deliveries."
          }
        />
      ) : (
        <div className="space-y-1">
          {events.map((event, index) => (
            <EventRow
              // Index is part of the key because two events can share a topic
              // and timestamp, and React needs them distinguishable. The list
              // only ever grows at the head, so indices stay stable enough.
              key={`${event.at}-${event.topic}-${index}`}
              event={event}
            />
          ))}
        </div>
      )}
    </div>
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

function EventRow({ event }: { event: AdminEvent }) {
  const meta = TOPICS[event.topic];
  const code =
    typeof event.payload["code"] === "string"
      ? event.payload["code"]
      : typeof event.payload["orderId"] === "string"
        ? `${(event.payload["orderId"] as string).slice(0, 8)}…`
        : null;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            meta?.tone === "attention"
              ? "bg-warn"
              : meta?.tone === "good"
                ? "bg-ok"
                : "bg-fg-faint"
          }`}
        />
        <div>
          <p className="text-sm font-medium">
            {meta?.label ?? event.topic}
          </p>
          {code ? (
            <p className="text-fg-faint font-mono text-xs">{code}</p>
          ) : null}
        </div>
      </div>

      <SectionLabel>
        {new Date(event.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </SectionLabel>
    </Card>
  );
}
