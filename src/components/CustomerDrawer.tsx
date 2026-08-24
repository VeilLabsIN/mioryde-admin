"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DetailDrawer } from "@/components/DetailDrawer";
import {
  Card,
  Fact,
  SectionLabel,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import { type CustomerDetail, api, formatMoney } from "@/lib/api";

/**
 * One customer, opened over the list.
 *
 * ## The phone number is masked and there is no way to unmask it
 *
 * `admin.controller.ts` calls `maskPhone` on the customers list *and* on
 * `customerById`, and — unlike partners — **there is no
 * `customers/:id/reveal-phone`**. Partners have an audited reveal; customers
 * have nothing.
 *
 * So this labels the field "Phone (masked)" rather than "Phone". A masked
 * number under a plain label reads as truncated data, and the next person to
 * notice "fixes" it by unmasking server-side, which is the change that removes
 * the protection. Saying it is masked makes the state deliberate on screen.
 *
 * Whether support should be able to reach a customer at all is a real question
 * and not one to answer by quietly adding an endpoint — it needs a role rule
 * and an audit row, the same way the partner reveal does. Recorded in
 * `PANEL-DESIGN-REFS.md` rather than decided here.
 */
export function CustomerDrawer({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset during render, so the previous customer's lifetime value is never
  // painted under the new customer's name.
  const [showingFor, setShowingFor] = useState<string | null>(customerId);
  if (customerId !== showingFor) {
    setShowingFor(customerId);
    setDetail(null);
    setError(null);
  }

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;

    api
      .customerById(customerId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load this customer.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <DetailDrawer
      open={customerId !== null}
      onClose={onClose}
      title={detail ? detail.name || "Unnamed" : "Loading…"}
      subtitle={
        detail ? (
          <span>
            Joined {formatDate(detail.joinedAt)}
            {detail.organizationName ? ` · ${detail.organizationName}` : ""}
          </span>
        ) : null
      }
      tabs={
        detail
          ? [
              {
                key: "customer",
                label: "Customer",
                content: <CustomerTab detail={detail} />,
              },
              {
                key: "orders",
                label: "Orders",
                content: <OrdersTab detail={detail} />,
              },
              {
                key: "wallet",
                label: "Wallet",
                content: <WalletTab detail={detail} />,
              },
            ]
          : undefined
      }
      footer={
        detail ? (
          <Link
            href={`/customers/${detail.id}`}
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

function CustomerTab({ detail }: { detail: CustomerDetail }) {
  const { orders } = detail;

  return (
    <div className="flex flex-col gap-3">
      <Card tone="inset" className="p-3">
        <SectionLabel>Identity</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          {/* Labelled as masked on purpose — see the note at the top. */}
          <Fact label="Phone (masked)" value={detail.phone} mono />
          <Fact label="Email" value={detail.email ?? "—"} />
          <Fact label="Status" value={detail.status} />
          <Fact label="Referral code" value={detail.referralCode} mono />
          <Fact
            label="Saved addresses"
            value={String(detail.savedAddresses)}
            mono
          />
        </dl>
      </Card>

      <Card tone="inset" className="p-3">
        <SectionLabel>History</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Fact label="Orders" value={String(orders.total)} mono />
          <Fact label="Delivered" value={String(orders.delivered)} mono />
          <Fact
            label="Cancelled"
            value={`${orders.cancelled} (${(orders.cancellationRate * 100).toFixed(0)}%)`}
            mono
          />
          <Fact
            label="Lifetime value"
            value={formatMoney(orders.lifetimeValue)}
            mono
          />
          <Fact
            label="First order"
            value={orders.firstOrderAt ? formatDate(orders.firstOrderAt) : "—"}
          />
          <Fact
            label="Last order"
            value={orders.lastOrderAt ? formatDate(orders.lastOrderAt) : "—"}
          />
        </dl>

        {/*
          "Returning" is measured over the customer's whole history, not this
          window — somebody who ordered in January and again this week is
          returning, not new. Said here because the same word means the
          narrower thing on the analytics page's period filter, and an operator
          reading both in one session should not have to guess which.
        */}
        <p className="text-fg-faint text-meta mt-3">
          {orders.isRepeat
            ? "Returning customer — has ordered more than once over their whole history."
            : "Has ordered once."}
        </p>
      </Card>
    </div>
  );
}

function OrdersTab({ detail }: { detail: CustomerDetail }) {
  if (detail.recentOrders.length === 0) {
    return <p className="text-fg-muted text-body">No orders yet.</p>;
  }

  return (
    <ol className="flex flex-col">
      {detail.recentOrders.map((order) => (
        <li
          key={order.id}
          className="border-line flex items-center gap-3 border-b py-2.5 last:border-0"
        >
          <Link
            href={`/orders/${order.id}`}
            className="text-fg-mid hover:text-accent font-mono text-meta underline-offset-2 hover:underline"
          >
            {order.code}
          </Link>
          <StatusPill status={order.status} />
          <span className="flex-1" />
          <span className="text-fg-faint text-meta">
            {formatDate(order.placedAt)}
          </span>
          <span className="font-mono text-body tabular-nums">
            {formatMoney(order.total)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function WalletTab({ detail }: { detail: CustomerDetail }) {
  const { wallet } = detail;

  /*
   * Never having had a wallet is not the same as having zero in one, and the
   * API models that difference deliberately — `balance` is null in the first
   * case. Collapsing them would tell an operator investigating a refund that
   * the money went to a wallet balance of zero, when in fact no wallet has
   * ever existed for this customer.
   */
  if (wallet.balance === null) {
    return (
      <p className="text-fg-muted text-body">
        This customer has never had a wallet entry.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card tone="inset" className="p-3">
        <SectionLabel>Balance</SectionLabel>
        <p className="text-figure mt-1 font-mono tabular-nums">
          {formatMoney(wallet.balance)}
        </p>
      </Card>

      {wallet.entries.length === 0 ? (
        <p className="text-fg-muted text-body">No entries.</p>
      ) : (
        <ol className="flex flex-col">
          {wallet.entries.map((entry, index) => (
            <li
              key={`${entry.at}-${index}`}
              className="border-line flex items-baseline gap-3 border-b py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body text-fg-soft">
                  {entry.description ?? entry.kind}
                </p>
                <p className="text-fg-faint text-meta">
                  {formatDate(entry.at)}
                </p>
              </div>
              {/*
                Amounts are signed — credits positive, debits negative — so the
                sign is already in the formatted value. Colouring by sign adds
                the second channel without re-deriving anything, and a leading
                "+" is added for credits because a bare number beside a
                negative one is ambiguous at a glance.
              */}
              <span
                className={`font-mono text-body tabular-nums ${
                  entry.amount.minor < 0 ? "text-warn" : "text-ok"
                }`}
              >
                {entry.amount.minor > 0 ? "+" : ""}
                {formatMoney(entry.amount)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
