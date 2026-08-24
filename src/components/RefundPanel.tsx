"use client";

import { useEffect, useState } from "react";
import { Button, Card, GhostButton, Input, SectionLabel, SkeletonRows } from "@/components/ui";
import {
  type RefundContext,
  type RefundReason,
  ApiError,
  api,
  formatMoney,
} from "@/lib/api";
import { useCan } from "@/components/AdminProvider";
import { parseScaled } from "@/lib/rupees";

const REASONS: { value: RefundReason; label: string; hint: string }[] = [
  {
    value: "service_deficiency",
    label: "Service problem",
    hint: "Late, damaged, or not delivered as agreed",
  },
  {
    value: "order_cancelled",
    label: "Cancelled",
    hint: "The delivery did not go ahead",
  },
  {
    value: "price_correction",
    label: "Price correction",
    hint: "Charged the wrong amount",
  },
  { value: "goodwill", label: "Goodwill", hint: "A gesture, not an error" },
];

/**
 * Returning money on a delivery.
 *
 * ## Why this reads from its own endpoint and not from the order
 *
 * Issuing a refund is `finance`, and finance **cannot read a delivery** —
 * `admin-rbac.test.ts` refuses it, because the delivery list is the same data
 * as the dispatch board and handing finance that surface for the sake of one
 * button would give them a live map of the city's customers.
 *
 * So everything here comes from `GET /admin/orders/:id/refunds`, which carries
 * the money facts and no PII. That is also why this component takes an id and
 * fetches, rather than being handed an `OrderDetail` the caller already has.
 *
 * ## Why the amount is parsed as text
 *
 * `parseScaled` rather than `Math.round(Number(x) * 100)`. `Number("1.15") *
 * 100` is `114.99999999999999`, and rounding hides that until the day it does
 * not — on a control that moves real money out of the business.
 */
export function RefundPanel({ orderId }: { orderId: string }) {
  // Above the early returns, deliberately. Hooks cannot be called
  // conditionally, and this component returns early for both the error and
  // loading states — reading the capability after those would call the hook on
  // some renders and not others, which React refuses at runtime.
  //
  // `useCan` rather than the role directly: the matrix is the one place the
  // mapping lives, and the server is the real gate either way.
  const mayRefund = useCan("orders.refund");

  const [data, setData] = useState<RefundContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .refundContext(orderId)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "Could not load refunds.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, reload]);

  if (error) {
    return (
      <p className="text-warn text-body" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return <SkeletonRows rows={3} />;

  const { order, refunds } = data;

  return (
    <div className="flex flex-col gap-3">
      <Card tone="inset" className="p-3">
        <SectionLabel>Refundable</SectionLabel>
        {order.refundable === null ? (
          /*
           * Null is not zero, and saying which matters.
           *
           * "₹0.00 refundable" on an unpaid order reads as though everything
           * has already been returned. This one was never paid for — a cash
           * delivery that was cancelled, or a card that never cleared — and
           * there is nothing to return rather than nothing left.
           */
          <p className="text-fg-muted text-body mt-1">
            {order.paymentMethod === "cod"
              ? "Cash delivery that was never completed — the customer never paid, so there is nothing to refund."
              : "This delivery was never paid for, so there is nothing to refund."}
          </p>
        ) : (
          <>
            <p className="text-figure mt-1 font-mono tabular-nums">
              {formatMoney(order.refundable)}
            </p>
            <p className="text-fg-faint text-meta mt-1">
              {formatMoney(order.total)} charged
              {order.refunded.minor > 0
                ? ` · ${formatMoney(order.refunded)} already returned`
                : ""}
            </p>
            {order.issuesCreditNote ? (
              // Said before the click, not after. A credit note joins a gapless
              // statutory series and cannot be withdrawn.
              <p className="text-fg-faint text-meta mt-2">
                This delivery was invoiced, so a refund also issues a GST credit
                note.
              </p>
            ) : null}
          </>
        )}
      </Card>

      {order.refundable !== null && order.refundable.minor > 0 && mayRefund ? (
        <RefundForm
          orderId={orderId}
          max={order.refundable.minor}
          onDone={() => setReload((n) => n + 1)}
        />
      ) : null}

      {order.refundable !== null &&
      order.refundable.minor > 0 &&
      !mayRefund ? (
        // Explained rather than simply absent. A control that is missing with
        // no reason reads as a broken page; naming the role tells the operator
        // who to ask.
        <p className="text-fg-faint text-meta">
          Refunds are issued by finance.
        </p>
      ) : null}

      <div>
        <SectionLabel>History</SectionLabel>
        {refunds.length === 0 ? (
          <p className="text-fg-muted text-body mt-1">
            Nothing refunded on this delivery.
          </p>
        ) : (
          <ol className="mt-1 flex flex-col">
            {refunds.map((refund) => (
              <li
                key={refund.id}
                className="border-line flex items-start gap-3 border-b py-2.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-soft">
                    {REASONS.find((r) => r.value === refund.reasonCode)?.label ??
                      refund.reasonCode}
                  </p>
                  {refund.reason ? (
                    <p className="text-fg-muted text-meta">{refund.reason}</p>
                  ) : null}
                  <p className="text-fg-faint text-meta">
                    {new Date(refund.createdAt).toLocaleString("en-IN")}
                    {refund.issuedBy ? ` · ${refund.issuedBy}` : ""}
                  </p>
                  {refund.creditNoteNumber ? (
                    <p className="text-fg-faint font-mono text-meta">
                      {refund.creditNoteNumber}
                    </p>
                  ) : null}
                </div>
                <span className="text-ok font-mono text-body tabular-nums">
                  {formatMoney(refund.amount)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function RefundForm({
  orderId,
  max,
  onDone,
}: {
  orderId: string;
  /** Refundable headroom in paise. The server caps too; this avoids the trip. */
  max: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState<RefundReason>(
    "service_deficiency",
  );
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const parsed = parseScaled(amount, 2);
  const overMax = parsed.ok && parsed.minor > max;

  async function submit() {
    if (!parsed.ok || overMax) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.issueRefund(orderId, {
        amount: parsed.minor,
        reasonCode,
        // Omitted rather than sent empty: the API validates with
        // `forbidNonWhitelisted` and an empty optional string is noise in an
        // immutable record somebody reads a year later.
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setDone(result.note);
      setAmount("");
      setReason("");
      setConfirming(false);
      onDone();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not issue the refund.",
      );
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="inset" className="p-3">
      <SectionLabel>Issue a refund</SectionLabel>

      <div className="mt-2 flex flex-col gap-2">
        <div>
          <Input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setConfirming(false);
              setDone(null);
            }}
            placeholder="Amount in ₹"
            aria-label="Refund amount in rupees"
            inputMode="decimal"
          />
          {amount && !parsed.ok ? (
            <p className="text-warn text-meta mt-1">{parsed.error}</p>
          ) : null}
          {overMax ? (
            <p className="text-warn text-meta mt-1">
              At most {formatMoney({ minor: max, currency: "INR" })} is left on
              this delivery.
            </p>
          ) : null}
          {/*
            A full-amount shortcut, because that is the common case and typing
            "114.67" from the figure above is a transcription error waiting to
            happen.
          */}
          <GhostButton
            className="mt-1"
            onClick={() => {
              setAmount((max / 100).toFixed(2));
              setConfirming(false);
            }}
          >
            Refund everything left
          </GhostButton>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-fg-muted font-mono text-micro uppercase">
            Reason
          </span>
          <select
            value={reasonCode}
            onChange={(e) => {
              setReasonCode(e.target.value as RefundReason);
              setConfirming(false);
            }}
            className="border-edge bg-surface text-body rounded-xs border px-2 py-1.5"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.hint}
              </option>
            ))}
          </select>
        </label>

        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What happened (optional, but read a year later)"
          aria-label="Refund note"
        />

        {error ? (
          <p className="text-warn text-meta" role="alert">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="text-ok text-meta" role="status">
            {done}
          </p>
        ) : null}

        {/*
          Two steps, because this is irreversible.

          The refund row is immutable, the credit note joins a gapless
          statutory series, and the money lands in a customer's wallet. Nothing
          else in the panel needs a confirm; this does, and the confirm names
          the amount rather than asking "are you sure" about a figure the
          operator can no longer see.
        */}
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body text-fg-soft">
              Refund{" "}
              {parsed.ok
                ? formatMoney({ minor: parsed.minor, currency: "INR" })
                : "—"}{" "}
              to the customer&apos;s wallet?
            </span>
            <Button onClick={submit} loading={busy}>
              Yes, refund
            </Button>
            <GhostButton onClick={() => setConfirming(false)}>
              Cancel
            </GhostButton>
          </div>
        ) : (
          <Button
            onClick={() => setConfirming(true)}
            disabled={!parsed.ok || overMax || busy}
          >
            Refund
          </Button>
        )}
      </div>
    </Card>
  );
}
