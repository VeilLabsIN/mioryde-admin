"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import { type Monitoring, api } from "@/lib/api";
import { formatElapsed } from "@/lib/elapsed";
import { useNow } from "@/lib/useNow";

/** Slow enough not to be a load generator, quick enough to watch a queue drain. */
const POLL_MS = 20_000;

/**
 * A pending queue older than this is not busy, it is stuck.
 *
 * The worker ticks every three seconds. Anything that has been waiting two
 * minutes has missed forty ticks, which is not a backlog — it is a worker that
 * is not running, or a row it cannot get past.
 */
const OUTBOX_STALL_SECONDS = 120;

/**
 * System health.
 *
 * Every number here answers a question that was previously only answerable by
 * reading server logs: did the notification actually go out, is dispatch
 * finding drivers, do the books still add up.
 *
 * The organising idea is that **a healthy system should be visibly boring**.
 * Everything reads as plain text until something is actually wrong, at which
 * point exactly that thing turns amber or red. A page where three things are
 * always yellow is a page nobody reads.
 */
export default function MonitoringPage() {
  const [data, setData] = useState<Monitoring | null>(null);
  // Only the local receipt time is kept. Unlike the dispatch board, nothing
  // here is measured against a server instant — "how old is this page" is a
  // purely local question, so there is no clock skew to correct for.
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const res = await api.monitoring();
      setData(res);
      setReceivedAt(Date.now());
      setError(null);
    } catch (e: unknown) {
      // The previous snapshot is kept. A monitoring page that blanks itself on
      // one failed request is least useful exactly when things are failing.
      setError(e instanceof Error ? e.message : "Could not load monitoring.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader
        title="Monitoring"
        subtitle="Queues, dispatch and the integrity of the books."
        actions={
          <div className="flex items-center gap-2">
            {receivedAt !== null && now > 0 && (
              <span className="rounded border border-edge px-2 py-1 font-mono text-[10px] tabular-nums text-fg-faint">
                {formatElapsed(Math.max(0, now - receivedAt))} old
              </span>
            )}
            <GhostButton onClick={() => void load()}>Refresh</GhostButton>
          </div>
        }
      />

      {error && data !== null && (
        <p role="alert" className="text-[12px] text-warn">
          Showing the last successful load — {error}
        </p>
      )}

      {data === null ? (
        <Card className="overflow-hidden">
          {error ? (
            <EmptyState title="Could not load monitoring" hint={error} />
          ) : (
            <SkeletonRows rows={5} />
          )}
        </Card>
      ) : (
        <>
          <LedgerCard ledger={data.ledger} />

          <div className="grid gap-5 lg:grid-cols-2">
            <OutboxCard outbox={data.outbox} />
            <DispatchCard dispatch={data.dispatch} />
          </div>

          <PushCard push={data.push} />
        </>
      )}
    </div>
  );
}

/**
 * The books, checked against themselves.
 *
 * First on the page and given the most room, because it is the only thing here
 * that is about money being wrong rather than something being slow. All three
 * numbers are guaranteed by database triggers, so in normal operation this is
 * three zeroes — the point is that it is *checked* zeroes rather than assumed
 * ones. A restore that replayed rows before the triggers existed leaves a
 * database that looks completely normal.
 */
function LedgerCard({ ledger }: { ledger: Monitoring["ledger"] }) {
  const broken =
    ledger.unbalancedTransactions > 0 ||
    ledger.driftingAccounts > 0 ||
    ledger.netMinor !== 0;

  return (
    <Card className={`p-5 ${broken ? "border-danger" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Ledger integrity</SectionLabel>
          <p className="text-[13px] text-fg-muted">
            {broken
              ? "The books do not agree with themselves. Stop and investigate before anything else."
              : `Checked across ${ledger.transactions.toLocaleString("en-IN")} postings. Everything balances.`}
          </p>
        </div>
        <span
          className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${
            broken ? "border-danger text-danger" : "border-ok/40 text-ok"
          }`}
        >
          {broken ? "Failed" : "Passing"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Metric
          label="Unbalanced postings"
          value={ledger.unbalancedTransactions}
          bad={ledger.unbalancedTransactions > 0}
          hint="Lines that do not sum to zero — money created or destroyed."
        />
        <Metric
          label="Drifting accounts"
          value={ledger.driftingAccounts}
          bad={ledger.driftingAccounts > 0}
          hint="Stored balance disagrees with the lines behind it."
        />
        <Metric
          label="Net across all lines"
          value={ledger.netMinor === 0 ? "0" : `${ledger.netMinor} p`}
          bad={ledger.netMinor !== 0}
          hint="Double entry over the whole system. Must be exactly zero."
        />
      </div>
    </Card>
  );
}

function OutboxCard({ outbox }: { outbox: Monitoring["outbox"] }) {
  const stalled =
    outbox.oldestPendingSeconds !== null &&
    outbox.oldestPendingSeconds > OUTBOX_STALL_SECONDS;

  return (
    <Card className={`p-5 ${outbox.deadLettered > 0 || stalled ? "border-warn" : ""}`}>
      <SectionLabel>Notification queue</SectionLabel>

      <div className="grid grid-cols-2 gap-4">
        <Metric
          label="Waiting"
          value={outbox.pending}
          // A pending count is not itself a problem — the worker ticks every
          // three seconds and a busy minute is meant to queue. Age is the
          // signal, so that is what turns amber.
          bad={stalled}
          hint={
            outbox.oldestPendingSeconds === null
              ? "Nothing queued."
              : `Oldest has waited ${formatElapsed(outbox.oldestPendingSeconds * 1000)}.`
          }
        />
        <Metric
          label="Given up on"
          value={outbox.deadLettered}
          bad={outbox.deadLettered > 0}
          hint="Out of retries. The worker will never look at these again."
        />
        <Metric label="Retrying" value={outbox.retrying} />
        <Metric label="Sent in the last hour" value={outbox.publishedLastHour} />
      </div>

      {outbox.failures.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-fg-muted">
            Abandoned by topic
          </p>
          <ul className="space-y-2">
            {outbox.failures.map((failure) => (
              <li key={failure.topic}>
                <p className="text-[12px]">
                  <span className="font-mono">{failure.topic}</span>
                  <span className="text-fg-faint"> · {failure.count}</span>
                </p>
                {failure.lastError && (
                  // Raw, and wrapped rather than truncated. The whole reason
                  // to look here is to read the message the worker recorded,
                  // and an ellipsis in the middle of it defeats the point.
                  <p className="mt-0.5 break-words font-mono text-[11px] text-warn">
                    {failure.lastError}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function DispatchCard({ dispatch }: { dispatch: Monitoring["dispatch"] }) {
  const seconds = (value: number | null) =>
    value === null ? "—" : formatElapsed(value * 1000);

  return (
    <Card className={`p-5 ${dispatch.waitingTooLong > 0 ? "border-warn" : ""}`}>
      <SectionLabel>Dispatch</SectionLabel>

      <div className="grid grid-cols-2 gap-4">
        <Metric
          label="Unassigned too long"
          value={dispatch.waitingTooLong}
          bad={dispatch.waitingTooLong > 0}
          hint={`Placed over ${dispatch.concernAfterMinutes} minutes ago with no partner.`}
        />
        <Metric
          label="Assigned in 24h"
          value={dispatch.assignedLastDay}
          hint="Jobs a partner accepted."
        />
        <Metric
          label="Typical time to accept"
          value={seconds(dispatch.medianSecondsToAssign)}
          hint="Median from placement to a partner taking it."
        />
        <Metric
          label="Slowest 5%"
          value={seconds(dispatch.p95SecondsToAssign)}
          // p95 rather than the worst case: one order that took forty minutes
          // is an anecdote, and one in twenty taking that long is a problem.
          hint="A duration one customer in twenty actually waited."
        />
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-[12px] text-fg-faint">
          Offers in 24h:{" "}
          <span className="tabular-nums text-fg-mid">
            {dispatch.offers.offered}
          </span>{" "}
          made ·{" "}
          <span className="tabular-nums text-fg-mid">
            {dispatch.offers.rejected}
          </span>{" "}
          declined ·{" "}
          <span className="tabular-nums text-fg-mid">
            {dispatch.offers.expired}
          </span>{" "}
          expired
        </p>
        {dispatch.offers.offered > 0 &&
          dispatch.offers.expired / dispatch.offers.offered > 0.3 && (
            <p className="mt-1 text-[12px] text-warn">
              Most offers are timing out rather than being declined — partners
              are not seeing them, which is a push or coverage problem rather
              than a pricing one.
            </p>
          )}
      </div>
    </Card>
  );
}

function PushCard({ push }: { push: Monitoring["push"] }) {
  return (
    <Card className={`p-5 ${push.configured ? "" : "border-warn"}`}>
      <SectionLabel>Push notifications</SectionLabel>

      {!push.configured && (
        <p className="mb-3 text-[13px] text-warn">
          No Firebase service account is configured. Every push is written to
          the server log and nothing reaches a device — the device counts below
          look identical either way.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Customer devices" value={push.customers} />
        <Metric label="Partner devices" value={push.riders} />
        <Metric
          label="Dormant"
          value={push.stale}
          hint={`No contact in ${push.staleAfterDays} days. Providers reject these.`}
        />
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  bad = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  bad?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[2px] text-fg-muted">
        {label}
      </p>
      <p
        className={`mt-0.5 font-sans text-2xl tabular-nums ${
          bad ? "text-warn" : "text-fg"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] leading-snug text-fg-faint">{hint}</p>
      )}
    </div>
  );
}
