"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionLabel,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import {
  type OrderActions,
  type OrderDetail,
  ApiError,
  api,
  formatMoney,
} from "@/lib/api";
import { ActionPanel } from "@/components/ActionPanel";
import { formatElapsed } from "@/lib/elapsed";

/**
 * One delivery.
 *
 * ## Why this page exists
 *
 * Support's entire job is "what happened to MIO-XXXXX", and until this existed
 * the panel's answer was a row in a list. `order_events` has recorded every
 * transition with its actor since booking shipped, `order_ratings` has the
 * customer's verdict, and the invoice and payment were both reachable — none of
 * it was on a screen.
 *
 * ## The timeline is the page
 *
 * Everything else here is a fact you could infer. The timeline is the only thing
 * that answers *why*: who accepted the job, how long it sat unassigned, who
 * cancelled it and when. So it gets the left column and the most room, and the
 * gaps between events are stated in words rather than left as two timestamps to
 * subtract.
 */
export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [actions, setActions] = useState<OrderActions | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(
    null,
  );

  const load = useCallback(() => {
    if (!id) return;
    api
      .orderById(id)
      .then(setOrder)
      .catch((caught: unknown) => {
        // A 404 is a different situation from a failure and reads differently:
        // one means the id is wrong, the other means the panel could not ask.
        const missing = caught instanceof ApiError && caught.status === 404;
        setError({
          message:
            caught instanceof ApiError
              ? caught.message
              : "Could not load this delivery.",
          missing,
        });
      });

    // Separate call, and a failure is swallowed: support can read this page but
    // not act on it, so a 403 here means "no buttons for you" rather than an
    // error over the whole delivery.
    api
      .orderActions(id)
      .then(setActions)
      .catch(() => setActions(null));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-[900px]">
        <PageHeader
          title={error.missing ? "No such delivery" : "Could not load"}
          breadcrumb={[{ label: "Deliveries", href: "/orders" }]}
        />
        <div className="mt-6">
          <EmptyState
            title={error.missing ? "Nothing here" : "Something went wrong"}
            hint={error.message}
          />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-[900px]">
        <PageHeader
          title="Delivery"
          breadcrumb={[{ label: "Deliveries", href: "/orders" }]}
        />
        <Card className="mt-6 overflow-hidden">
          <SkeletonRows rows={6} />
        </Card>
      </div>
    );
  }

  const cancelled = order.status === "cancelled";

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        title={order.code}
        breadcrumb={[{ label: "Deliveries", href: "/orders" }]}
        subtitle={
          <>
            Placed {new Date(order.placedAt).toLocaleString("en-IN")}
            {order.deliveredAt && (
              <>
                {" · delivered in "}
                {formatElapsed(
                  new Date(order.deliveredAt).getTime() -
                    new Date(order.placedAt).getTime(),
                )}
              </>
            )}
          </>
        }
        actions={<StatusPill status={order.status} />}
      />

      {/* A cancellation is the first thing to say, not a field halfway down. */}
      {cancelled && (
        <Card tone="warning" className="p-4">
          <SectionLabel>Cancelled</SectionLabel>
          <p className="text-body text-fg-soft">
            {order.cancellationReason ?? "No reason was recorded."}
          </p>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card tone="raised" className="p-5">
          <SectionLabel>History</SectionLabel>
          <Timeline events={order.timeline} />
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <SectionLabel>Route</SectionLabel>
            <Field label="From" value={order.route.pickupAddress} />
            <Field label="To" value={order.route.dropAddress} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Distance"
                value={`${(order.route.distanceMeters / 1000).toFixed(1)} km`}
                mono
              />
              <Field
                label="Quoted"
                value={formatElapsed(order.route.quotedSeconds * 1000)}
                mono
              />
              <Field label="Vehicle" value={order.route.vehicleName} />
              <Field label="Zone" value={order.route.zoneName ?? "—"} />
            </div>
            {order.route.goodsCategory && (
              <Field label="Goods" value={order.route.goodsCategory} />
            )}
          </Card>

          <Card className="p-4">
            <SectionLabel>People</SectionLabel>
            <Field
              label="Customer"
              value={order.customer.name || "Unnamed"}
              detail={order.customer.phone}
              href={`/customers/${order.customer.id}`}
            />
            <Field
              label="Recipient"
              value={order.receiver.name}
              detail={order.receiver.phone}
            />
            <Field
              label="Partner"
              value={order.rider?.name ?? "Not assigned"}
              detail={order.rider?.phone}
              href={order.rider ? `/riders/${order.rider.id}` : undefined}
            />
            {/* Numbers are masked by the server, and the full value comes from
                a separate audited call on the partner's own page. Nothing here
                reveals one. */}
            <p className="mt-2 text-meta text-fg-faint">
              Numbers are masked. Reveal one from the partner&apos;s page, which
              records who looked.
            </p>
          </Card>

          <MoneyCard order={order} />
        </div>
      </div>

      {actions && (
        <ActionPanel
          title="Cancel this delivery"
          description="Ends the delivery on the customer's behalf and tells dispatch to stop offering it."
          consequence={
            order.rider
              ? `${order.rider.name} is assigned and will be notified that the job is off.`
              : "No partner has accepted this yet, so nobody is mid-journey."
          }
          actionLabel="Cancel delivery"
          disabledReason={actions.cancel.reason}
          requireReason
          reasonPlaceholder="Customer called — wrong address entered"
          destructive
          successMessage={`${order.code} cancelled.`}
          onConfirm={async (reason) => {
            await api.cancelOrder(order.id, reason);
            load();
          }}
        />
      )}

      {order.rating && (
        <Card className="p-4">
          <SectionLabel>Customer rating</SectionLabel>
          <p className="text-label">
            <span className="tabular-nums">{order.rating.stars}</span>
            <span className="text-fg-faint">/5</span>
            {order.rating.tags.length > 0 && (
              <span className="ml-3 text-body text-fg-muted">
                {order.rating.tags.join(", ")}
              </span>
            )}
          </p>
          {order.rating.comment && (
            <p className="mt-1 text-body text-fg-soft">
              &ldquo;{order.rating.comment}&rdquo;
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Money, and the tax record attached to it.
 *
 * Grouped rather than spread across the page because the questions are asked
 * together: what was charged, was it collected, what did the partner get, and
 * is there a document for it.
 */
function MoneyCard({ order }: { order: OrderDetail }) {
  const credited = order.creditNotes.reduce(
    (sum, note) => sum + note.totalValue.minor,
    0,
  );

  return (
    <Card className="p-4">
      <SectionLabel>Money</SectionLabel>

      <Field label="Total charged" value={formatMoney(order.money.total)} mono />
      <Field
        label="Of which tax"
        value={formatMoney(order.money.tax)}
        mono
      />
      <Field
        label={`Paid by ${order.money.method === "cod" ? "cash on delivery" : order.money.method}`}
        value={order.money.status}
      />

      {order.money.riderPayout && (
        <Field
          label={`Partner earned${
            order.money.commissionPct === null
              ? ""
              : ` (at ${order.money.commissionPct}% commission)`
          }`}
          value={formatMoney(order.money.riderPayout)}
          mono
        />
      )}

      {order.payment?.failureReason && (
        <p className="mt-2 text-meta text-danger">
          Gateway said: {order.payment.failureReason}
        </p>
      )}

      <div className="mt-3 border-t border-line pt-3">
        {order.invoice ? (
          <Field
            label="Tax invoice"
            value={order.invoice.invoiceNumber}
            detail={new Date(order.invoice.issuedAt).toLocaleDateString("en-IN")}
            mono
          />
        ) : (
          // Said explicitly. An invoice is issued on delivery, so its absence on
          // a delivered order is a real finding rather than a blank field.
          <p className="text-meta text-fg-faint">
            No tax invoice — issued on delivery.
          </p>
        )}

        {order.creditNotes.map((note) => (
          <Field
            key={note.creditNoteNumber}
            label={`Credit note · ${note.reasonCode.replace(/_/g, " ")}`}
            value={`${note.creditNoteNumber} · ${formatMoney(note.totalValue)}`}
            detail={note.reason ?? undefined}
            mono
          />
        ))}

        {credited > 0 && (
          <p className="mt-2 text-meta text-warn">
            {formatMoney({ minor: credited, currency: order.money.total.currency })}{" "}
            credited of {formatMoney(order.money.total)}.
          </p>
        )}
      </div>
    </Card>
  );
}

/** Human labels for the wire statuses, so a timeline reads as sentences. */
const TRANSITION: Record<string, string> = {
  pending: "Placed, looking for a partner",
  assigned: "Partner accepted",
  arriving_pickup: "Heading to pickup",
  picked_up: "Parcel collected",
  in_transit: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function Timeline({ events }: { events: OrderDetail["timeline"] }) {
  if (events.length === 0) {
    return (
      <p className="py-4 text-body text-fg-faint">
        No transitions recorded for this delivery.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => {
        const previous = index > 0 ? events[index - 1] : undefined;
        const gap = previous
          ? new Date(event.at).getTime() - new Date(previous.at).getTime()
          : 0;

        // A decline writes pending → pending. It is not a step forward, and
        // showing it as one would make an order look like it progressed six
        // times when it never left the queue.
        const declined =
          event.fromStatus === "pending" && event.toStatus === "pending";

        const label = declined
          ? "Partner declined"
          : (TRANSITION[event.toStatus] ?? event.toStatus);

        return (
          <li key={`${event.at}-${index}`} className="relative flex gap-3 pb-4">
            {/* The connecting rail, stopping at the last event rather than
                trailing off past it. */}
            {index < events.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[5px] top-4 h-full w-px bg-edge"
              />
            )}

            <span
              aria-hidden
              className={`relative z-10 mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${
                declined
                  ? "border-warn bg-bg"
                  : event.toStatus === "cancelled"
                    ? "border-danger bg-danger"
                    : event.toStatus === "delivered"
                      ? "border-ok bg-ok"
                      : "border-edge-strong bg-bg"
              }`}
            />

            <div className="min-w-0 flex-1">
              <p className="text-body text-fg-soft">{label}</p>
              <p className="text-meta text-fg-faint">
                {new Date(event.at).toLocaleString("en-IN")}
                {event.actorName && (
                  <>
                    {" · "}
                    <span className="text-fg-muted">{event.actorName}</span>
                    <span className="text-fg-faint"> ({event.actorType})</span>
                  </>
                )}
              </p>

              {/* The wait between steps, said in words. Two timestamps a reader
                  has to subtract is the difference between data and an answer,
                  and a long gap here is usually the whole story. */}
              {gap > 60_000 && (
                <p className="text-meta text-fg-faint">
                  {formatElapsed(gap)} after the previous step
                </p>
              )}

              {typeof event.metadata["declineReason"] === "string" && (
                <p className="text-meta text-warn">
                  Reason: {event.metadata["declineReason"]}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  value,
  detail,
  mono = false,
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <p className="text-micro font-mono uppercase text-fg-muted">{label}</p>
      <p className={`text-body text-fg-soft ${mono ? "font-mono tabular-nums" : ""}`}>
        {href ? (
          <a
            href={href}
            className="motion-change underline-offset-2 transition-colors hover:text-accent hover:underline"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </p>
      {detail && (
        <p className="font-mono text-meta text-fg-faint">{detail}</p>
      )}
    </div>
  );
}
