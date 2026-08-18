"use client";

import Link from "next/link";
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
import { type CustomerDetail, ApiError, api, formatMoney } from "@/lib/api";
import { ActionPanel } from "@/components/ActionPanel";

/**
 * One customer.
 *
 * The list gave a name, a phone and an order count, and nothing behind it — so
 * "has this person been refunded before", "why is their wallet empty" and "are
 * they a regular or a first-timer" had no answer in the panel.
 *
 * Blocking and restoring are the only actions offered. Everything else about a
 * customer — a refund, a fare adjustment — needs machinery that does not exist,
 * and a page with buttons that fail teaches operators to ignore errors.
 */
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(
    null,
  );

  const load = useCallback(() => {
    if (!id) return;
    api
      .customerById(id)
      .then(setCustomer)
      .catch((caught: unknown) => {
        const missing = caught instanceof ApiError && caught.status === 404;
        setError({
          message:
            caught instanceof ApiError
              ? caught.message
              : "Could not load this customer.",
          missing,
        });
      });
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-[900px]">
        <PageHeader
          title={error.missing ? "No such customer" : "Could not load"}
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

  if (!customer) {
    return (
      <div className="mx-auto max-w-[900px]">
        <PageHeader
          title="Customer"
        />
        <Card className="mt-6 overflow-hidden">
          <SkeletonRows rows={5} />
        </Card>
      </div>
    );
  }

  const blocked = customer.status !== "active";

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        title={customer.name || "Unnamed customer"}
        subtitle={
          <>
            {customer.phone}
            {customer.email && ` · ${customer.email}`}
            {" · joined "}
            {new Date(customer.joinedAt).toLocaleDateString("en-IN")}
          </>
        }
      />

      {blocked && (
        <Card tone="warning" className="p-4">
          <SectionLabel>Account {customer.status}</SectionLabel>
          <p className="text-body text-fg-soft">
            This customer cannot place orders. Deliveries already in flight are
            unaffected — a parcel with a partner still has to arrive somewhere.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Lifetime value"
          value={formatMoney(customer.orders.lifetimeValue)}
          hint="Delivered orders only"
        />
        <Metric
          label="Orders"
          value={String(customer.orders.total)}
          hint={`${customer.orders.delivered} delivered`}
        />
        <Metric
          label="Cancellations"
          value={
            customer.orders.total === 0
              ? "—"
              : `${(customer.orders.cancellationRate * 100).toFixed(0)}%`
          }
          hint={`${customer.orders.cancelled} of ${customer.orders.total}`}
          warn={customer.orders.cancellationRate > 0.2}
        />
        <Metric
          label="Wallet"
          value={
            customer.wallet.balance
              ? formatMoney(customer.wallet.balance)
              : "Never used"
          }
          hint={
            customer.wallet.balance
              ? `${customer.wallet.entries.length} recent entries`
              : "No wallet activity"
          }
        />
      </div>

      <ActionPanel
        title={blocked ? "Restore this account" : "Block this account"}
        description={
          blocked
            ? "Lets this customer place orders again."
            : "Stops this customer placing new orders. Deliveries already in flight are not touched."
        }
        consequence={
          blocked
            ? undefined
            : "Blocking does not cancel anything already booked, and does not refund anything."
        }
        actionLabel={blocked ? "Restore account" : "Block account"}
        requireReason={!blocked}
        reasonPlaceholder="Repeated fraudulent cancellations"
        destructive={!blocked}
        successMessage={
          blocked
            ? `${customer.name || "Account"} restored.`
            : `${customer.name || "Account"} blocked.`
        }
        onConfirm={async (reason) => {
          await api.setCustomerStatus(
            customer.id,
            blocked ? "active" : "blocked",
            reason || undefined,
          );
          load();
        }}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card tone="raised" className="p-5">
          <SectionLabel>Recent orders</SectionLabel>
          {customer.recentOrders.length === 0 ? (
            <p className="py-3 text-body text-fg-faint">
              This customer has never placed an order.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {customer.recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center gap-3 py-2.5"
                >
                  <Link
                    href={`/orders/${order.id}`}
                    className="motion-change w-[104px] shrink-0 font-mono text-meta
                               text-fg-mid underline-offset-2 transition-colors
                               hover:text-accent hover:underline"
                  >
                    {order.code}
                  </Link>
                  <span className="flex-1 text-meta text-fg-faint">
                    {new Date(order.placedAt).toLocaleDateString("en-IN")}
                  </span>
                  <StatusPill status={order.status} />
                  <span className="w-[80px] shrink-0 text-right font-mono text-meta tabular-nums">
                    {formatMoney(order.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {customer.orders.total > customer.recentOrders.length && (
            <p className="mt-3 text-meta text-fg-faint">
              Showing the {customer.recentOrders.length} most recent of{" "}
              {customer.orders.total}.
            </p>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <SectionLabel>Account</SectionLabel>
            <Field
              label="Type"
              value={customer.orders.isRepeat ? "Returning" : "First-time"}
              detail={
                customer.orders.firstOrderAt
                  ? `First order ${new Date(customer.orders.firstOrderAt).toLocaleDateString("en-IN")}`
                  : "Never ordered"
              }
            />
            <Field label="Status" value={customer.status} />
            <Field label="Referral code" value={customer.referralCode} mono />
            <Field
              label="Saved addresses"
              value={String(customer.savedAddresses)}
              mono
            />
            {customer.organizationName && (
              <Field label="Organisation" value={customer.organizationName} />
            )}
          </Card>

          {customer.wallet.entries.length > 0 && (
            <Card className="p-4">
              <SectionLabel>Wallet activity</SectionLabel>
              <ul className="divide-y divide-line">
                {customer.wallet.entries.map((entry, index) => (
                  <li key={index} className="py-2">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="text-body text-fg-soft">
                        {entry.kind.replace(/_/g, " ")}
                      </span>
                      {/* Signed at source. A credit and a debit that look
                          identical is how somebody reads a refund as a charge. */}
                      <span
                        className={`shrink-0 font-mono text-meta tabular-nums ${
                          entry.amount.minor < 0 ? "text-fg-mid" : "text-ok"
                        }`}
                      >
                        {entry.amount.minor > 0 ? "+" : ""}
                        {formatMoney(entry.amount)}
                      </span>
                    </p>
                    <p className="text-meta text-fg-faint">
                      {new Date(entry.at).toLocaleDateString("en-IN")}
                      {entry.description && ` · ${entry.description}`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-micro font-mono uppercase text-fg-muted">{label}</p>
      <p
        className={`mt-0.5 font-sans text-label tabular-nums ${
          warn ? "text-warn" : "text-fg"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-meta text-fg-faint">{hint}</p>}
    </Card>
  );
}

function Field({
  label,
  value,
  detail,
  mono = false,
}: {
  label: string;
  value: string;
  detail?: string;
  mono?: boolean;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <p className="text-micro font-mono uppercase text-fg-muted">{label}</p>
      <p className={`text-body text-fg-soft ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
      {detail && <p className="text-meta text-fg-faint">{detail}</p>}
    </div>
  );
}
