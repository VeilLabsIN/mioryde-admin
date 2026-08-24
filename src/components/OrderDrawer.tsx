"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DetailDrawer } from "@/components/DetailDrawer";
import { RefundPanel } from "@/components/RefundPanel";
import { Card, Fact, SectionLabel, SkeletonRows, StatusPill } from "@/components/ui";
import { type OrderDetail, api, formatMoney } from "@/lib/api";

/**
 * One delivery, opened over the list it came from.
 *
 * ## Why the list row is not enough to fill this
 *
 * `AdminOrder` carries nine fields — enough for a table row and nothing more.
 * The drawer needs the receiver, the money breakdown, the payment state and
 * the timeline, which only `GET /admin/orders/:id` has. So this fetches, and
 * the fetch is the reason for most of the care below.
 *
 * ## Fetch-on-open, cancelled on change
 *
 * An operator triaging a queue opens rows faster than the API answers. Without
 * the `cancelled` flag, opening order A then B then C races three responses
 * into one piece of state and whichever lands last wins — so the drawer shows
 * A's money under C's heading, and nothing about it looks wrong.
 *
 * The detail is also cleared the moment the id changes rather than left in
 * place, because stale-but-plausible is the worst thing this screen can show:
 * every figure here is one somebody acts on.
 */
export function OrderDrawer({
  orderId,
  onClose,
}: {
  /** Null closes the drawer. The id is the open/closed state — see below. */
  orderId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Cleared during render, not in the effect below.
   *
   * The effect version paints the previous order's detail under the new
   * order's heading for one frame before correcting itself — and on this
   * screen every figure is one somebody acts on, so a frame of
   * stale-but-plausible is the worst thing it can show. Adjusting during
   * render is React's documented pattern for resetting state when a prop
   * changes, and it re-runs before touching the DOM.
   */
  const [showingFor, setShowingFor] = useState<string | null>(orderId);
  if (orderId !== showingFor) {
    setShowingFor(orderId);
    setDetail(null);
    setError(null);
  }

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    api
      .orderById(orderId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Could not load this delivery.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <DetailDrawer
      open={orderId !== null}
      onClose={onClose}
      title={detail ? detail.code : "Loading…"}
      subtitle={
        detail ? (
          <span className="flex items-center gap-2">
            <StatusPill status={detail.status} />
            <span>{formatDateTime(detail.placedAt)}</span>
          </span>
        ) : null
      }
      tabs={
        detail
          ? [
              {
                key: "order",
                label: "Order",
                content: <OrderTab detail={detail} />,
              },
              {
                key: "route",
                label: "Route",
                content: <RouteTab detail={detail} />,
              },
              {
                key: "timeline",
                label: "Timeline",
                content: <TimelineTab detail={detail} />,
              },
              {
                key: "refunds",
                label: "Refunds",
                // Always present, not conditional on there being money to
                // return. "Has anything been refunded on this?" is a question
                // asked about orders that have not been, and a tab that
                // appears only sometimes cannot answer it.
                content: <RefundPanel orderId={detail.id} />,
              },
            ]
          : undefined
      }
      footer={
        detail ? (
          // The full page, from inside the drawer. It is what a support ticket
          // links to and what prints, so the drawer has to be a way *to* it
          // rather than a replacement that hides it.
          <Link
            href={`/orders/${detail.id}`}
            className="text-body text-accent underline-offset-2 hover:underline"
          >
            Open the full record →
          </Link>
        ) : null
      }
    >
      {error ? (
        <p className="text-warn text-body" role="alert">
          {error}
        </p>
      ) : (
        <SkeletonRows rows={5} />
      )}
    </DetailDrawer>
  );
}

function OrderTab({ detail }: { detail: OrderDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <Card tone="inset" className="p-3">
        <SectionLabel>People</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Fact label="Customer" value={detail.customer.name || "—"} />
          <Fact label="Phone" value={detail.customer.phone} mono />
          <Fact label="Receiver" value={detail.receiver.name || "—"} />
          <Fact label="Phone" value={detail.receiver.phone} mono />
        </dl>
        {/*
          The partner is a separate block rather than a fifth Fact, because
          "nobody has accepted this yet" is a different kind of answer from a
          missing name — it is the thing the operator opened the row to find
          out, and a dash in a grid does not say it.
        */}
        <div className="border-line mt-3 border-t pt-3">
          {detail.rider ? (
            <dl className="grid grid-cols-2 gap-3">
              <Fact label="Partner" value={detail.rider.name} />
              <Fact label="Phone" value={detail.rider.phone} mono />
            </dl>
          ) : (
            <p className="text-fg-muted text-body">
              No partner assigned yet.
            </p>
          )}
        </div>
      </Card>

      <Card tone="inset" className="p-3">
        <SectionLabel>Money</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Fact label="Total" value={formatMoney(detail.money.total)} mono />
          <Fact label="Tax" value={formatMoney(detail.money.tax)} mono />
          <Fact
            label="Partner payout"
            // Null until delivered, and said rather than shown as a dash —
            // the payout is frozen at delivery on purpose (BUG-043), so its
            // absence before then is correct rather than missing.
            value={
              detail.money.riderPayout
                ? formatMoney(detail.money.riderPayout)
                : "Set at delivery"
            }
            mono={detail.money.riderPayout !== null}
          />
          <Fact
            label="Commission"
            value={
              detail.money.commissionPct === null
                ? "—"
                : `${detail.money.commissionPct}%`
            }
            mono
          />
          <Fact label="Method" value={detail.money.method} />
          <Fact label="Payment" value={detail.money.status} />
        </dl>

        {detail.payment?.failureReason ? (
          <p className="text-warn text-meta mt-3">
            {detail.payment.failureReason}
          </p>
        ) : null}
      </Card>

      {detail.invoice ? (
        <Card tone="inset" className="p-3">
          <SectionLabel>Invoice</SectionLabel>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Fact
              label="Number"
              value={detail.invoice.invoiceNumber}
              mono
            />
            <Fact
              label="Issued"
              value={formatDateTime(detail.invoice.issuedAt)}
            />
          </dl>
          {detail.creditNotes.length > 0 ? (
            <p className="text-fg-muted text-meta mt-3">
              {detail.creditNotes.length} credit note
              {detail.creditNotes.length === 1 ? "" : "s"} against this invoice.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function RouteTab({ detail }: { detail: OrderDetail }) {
  const { route } = detail;

  return (
    <div className="flex flex-col gap-3">
      <Card tone="inset" className="p-3">
        <SectionLabel>Route</SectionLabel>
        {/*
          Pickup and drop as a vertical run with a connecting rule, not two
          Facts side by side. The order of the two is the information — which
          end the parcel is at right now depends on reading them in sequence.
        */}
        <ol className="mt-2 flex flex-col gap-3">
          <li className="border-accent border-l-2 pl-3">
            <p className="text-fg-muted font-mono text-micro uppercase">
              Pickup
            </p>
            <p className="text-body text-fg-soft">{route.pickupAddress}</p>
          </li>
          <li className="border-ok border-l-2 pl-3">
            <p className="text-fg-muted font-mono text-micro uppercase">Drop</p>
            <p className="text-body text-fg-soft">{route.dropAddress}</p>
          </li>
        </ol>
      </Card>

      <Card tone="inset" className="p-3">
        <SectionLabel>Trip</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Fact
            label="Distance"
            value={`${(route.distanceMeters / 1000).toFixed(1)} km`}
            mono
          />
          <Fact
            label="Quoted time"
            // Named "quoted", not "duration". It comes from the quote at
            // placement and was never measured against the delivery, and a
            // label implying otherwise invites somebody to judge a partner by
            // it.
            value={`${Math.round(route.quotedSeconds / 60)} min`}
            mono
          />
          <Fact label="Vehicle" value={route.vehicleName} />
          <Fact label="Zone" value={route.zoneName ?? "—"} />
          <Fact label="Goods" value={route.goodsCategory ?? "—"} />
        </dl>
      </Card>
    </div>
  );
}

function TimelineTab({ detail }: { detail: OrderDetail }) {
  /*
   * Declines are dropped.
   *
   * `order_events` records a partner refusing a job as a `pending → pending`
   * row. Those belong in a dispatch investigation, not in the story of what
   * happened to this delivery — and left in, a busy order reads as forty
   * events of which two are transitions. Same predicate the server uses to
   * answer "how long has this been in its current status".
   */
  const transitions = detail.timeline.filter(
    (event) => event.fromStatus !== event.toStatus,
  );

  const declines = detail.timeline.length - transitions.length;

  if (transitions.length === 0) {
    return <p className="text-fg-muted text-body">Nothing recorded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {transitions.map((event, index) => (
          <li
            key={`${event.at}-${index}`}
            className="border-line border-l-2 pl-3"
          >
            <p className="text-body text-fg">
              <StatusPill status={event.toStatus} />
            </p>
            <p className="text-fg-faint text-meta mt-1">
              {formatDateTime(event.at)}
              {event.actorName ? ` · ${event.actorName}` : ""}
              {event.actorType ? ` (${event.actorType})` : ""}
            </p>
          </li>
        ))}
      </ol>

      {declines > 0 ? (
        <p className="text-fg-faint text-meta">
          {declines} partner decline{declines === 1 ? "" : "s"} not shown.
        </p>
      ) : null}

      {detail.cancellationReason ? (
        <Card tone="inset" className="p-3">
          <SectionLabel>Cancelled because</SectionLabel>
          <p className="text-body text-fg-soft mt-2">
            {detail.cancellationReason}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Local rather than shared, for now.
 *
 * The panel formats elapsed time against the *server's* clock — every response
 * driving a duration carries `asOf` and the client subtracts the measured skew,
 * because a workstation four minutes fast ages every row on the dispatch board
 * uniformly and plausibly. These are absolute timestamps, not durations, so
 * they need none of that. Do not "unify" the two.
 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
