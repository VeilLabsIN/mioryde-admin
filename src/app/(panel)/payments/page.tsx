"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, Input, PageHeader, Pager } from "@/components/ui";
import { type AdminPayment, type PageMeta, api, formatMoney } from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";
import { type Column, DataTable } from "@/components/DataTable";

/**
 * Every gateway charge, successful or not.
 *
 * ## Why this page exists
 *
 * The panel could show a refund and it could show a wallet balance, but it
 * could not show a **payment**. Order detail carried one row, `purpose =
 * 'order'` only and only the latest, so wallet top-ups were invisible
 * altogether: money arrived as a wallet entry with no gateway reference, no
 * failure reason, and no trace of the attempts that failed first. The moment
 * anybody asks "did that card actually go through", that is the question, and
 * nothing here could answer it.
 *
 * ## Why failures are not filtered out by default
 *
 * A list that quietly showed only successful charges would be worse than no
 * list at all, because it looks like an answer. The failures are the reason to
 * open this page.
 *
 * ## Why there is no customer name
 *
 * `finance` can read this and does not hold `customers.view` — the customer
 * list is the widest PII surface in the panel and finance has no reason to
 * browse it. The order code and the gateway reference identify a charge without
 * naming anybody. A phone number can still be *searched*, which discloses
 * nothing: you have to know the number to type it.
 */

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "created", label: "Started" },
  { value: "refunded", label: "Refunded" },
] as const;

const PURPOSES = [
  { value: "", label: "All kinds" },
  { value: "order", label: "Delivery" },
  { value: "wallet_top_up", label: "Wallet top-up" },
] as const;

/** Colour carries the same meaning as the word, never instead of it. */
function statusTone(status: AdminPayment["status"]): string {
  switch (status) {
    case "paid":
      return "text-ok";
    case "failed":
      return "text-danger";
    case "refunded":
      return "text-warn";
    default:
      return "text-fg-faint";
  }
}

function statusLabel(status: AdminPayment["status"]): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
    default:
      // "created" is a charge that was started and never completed — the
      // customer closed the sheet, or the gateway never came back. Saying
      // "Created" would describe our row rather than their experience.
      return "Not completed";
  }
}

function paymentColumns(): readonly Column<AdminPayment>[] {
  return [
    {
      key: "when",
      header: "When",
      width: "150px",
      cell: (p) => (
        <span className="font-mono text-meta text-fg-mid">
          {new Date(p.createdAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      width: "130px",
      cell: (p) => (
        <span className="text-meta text-fg-mid">
          {p.purpose === "wallet_top_up" ? "Wallet top-up" : "Delivery"}
        </span>
      ),
    },
    {
      key: "reference",
      header: "Reference",
      cell: (p) => (
        <span className="block min-w-0">
          {p.orderCode ? (
            <Link
              href={`/orders/${p.orderId}`}
              className="motion-change block truncate text-body underline-offset-2
                         transition-colors hover:text-accent hover:underline"
            >
              {p.orderCode}
            </Link>
          ) : (
            <span className="block truncate text-body text-fg-mid">
              Wallet
            </span>
          )}
          {/*
            The gateway's own id, which is the handle somebody has in front of
            them when they are looking at Razorpay's dashboard or a customer's
            screenshot. Selectable, because it gets pasted.
          */}
          <span className="block select-all truncate font-mono text-meta text-fg-faint">
            {p.gatewayPaymentId ?? p.gatewayOrderId ?? "—"}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "200px",
      cell: (p) => (
        <span className="block min-w-0">
          <span className={`text-meta ${statusTone(p.status)}`}>
            {statusLabel(p.status)}
          </span>
          {/*
            The whole reason for the page. A failure with no reason shown is a
            support conversation that ends in a guess.
          */}
          {p.failureReason && (
            <span className="block truncate text-meta text-fg-faint">
              {p.failureReason}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      width: "120px",
      align: "right",
      cell: (p) => (
        <span className="font-mono text-meta tabular-nums">
          {formatMoney(p.amount)}
        </span>
      ),
    },
  ];
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => paymentColumns(), []);

  const [page, setPage, pageReady] = useUrlPage();
  const [search, setSearch, searchReady] = useUrlParam("search");
  const [status, setStatus, statusReady] = useUrlParam("status");
  const [purpose, setPurpose, purposeReady] = useUrlParam("purpose");
  const urlReady = pageReady && searchReady && statusReady && purposeReady;

  // Narrowing returns to the first page — page 4 of the old result set is not
  // page 4 of the new one, and landing past the end reads as "no results".
  const changeSearch = (next: string) => {
    setPage(0);
    setSearch(next);
  };
  const changeStatus = (next: string) => {
    setPage(0);
    setStatus(next);
  };
  const changePurpose = (next: string) => {
    setPage(0);
    setPurpose(next);
  };

  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const requestId = useRef(0);

  useEffect(() => {
    if (!urlReady) return;

    const id = ++requestId.current;
    setPayments(null);
    setError(null);
    api
      .payments({
        ...(page ? { page } : {}),
        ...(debounced ? { search: debounced } : {}),
        ...(status ? { status } : {}),
        ...(purpose ? { purpose } : {}),
      })
      .then((res) => {
        // A stale response must never overwrite a fresh one: typing in the
        // search box starts several of these and they do not come back in
        // order.
        if (id !== requestId.current) return;
        if (res.page.beyondEnd) {
          setPage(0);
          return;
        }
        setPayments(res.results);
        setMeta(res.page);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Could not load payments.");
      });
  }, [debounced, page, status, purpose, urlReady, setPage]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Payments"
          subtitle={
            payments === null
              ? "Loading…"
              : `${meta?.total ?? payments.length} charges`
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={purpose}
            onChange={(e) => changePurpose(e.target.value)}
            aria-label="Filter by kind"
            className="h-9 rounded-md border border-line bg-surface px-2 text-meta text-fg-mid"
          >
            {PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
            aria-label="Filter by status"
            className="h-9 rounded-md border border-line bg-surface px-2 text-meta text-fg-mid"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="w-full max-w-[280px]">
            <Input
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              placeholder="Gateway id, order code or phone"
              aria-label="Search payments"
            />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        {error ? (
          <EmptyState
            title={
              error.includes("requires")
                ? "Your role cannot view payments"
                : "Could not load payments"
            }
            hint={error}
          />
        ) : (
          <DataTable
            caption="Payments, newest first"
            columns={columns}
            rows={payments}
            rowKey={(p) => p.id}
            emptyTitle="No payments match"
            emptyHint={
              search || status || purpose
                ? "Try a different filter."
                : "Charges appear here as customers pay."
            }
          />
        )}
      </Card>

      {meta && (
        <Pager
          page={meta}
          busy={payments === null}
          noun="payments"
          onChange={setPage}
        />
      )}
    </div>
  );
}
