"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  SectionLabel,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import {
  ApiError,
  type AuditEntry,
  type RiderDetail,
  api,
  formatMoney,
} from "@/lib/api";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One partner, in full.
 *
 * `GET /admin/riders/:id` has returned lifetime earnings, completion and
 * cancellation counts, and whether bank details are on file since it was
 * written. Nothing linked to it, so the list view — which shows none of that —
 * was the only view of a partner an operator had.
 *
 * This is the screen behind a decision to suspend somebody, so it puts the
 * history next to the action rather than making that a separate lookup. The
 * audit trail for this partner is on the same page for the same reason: "has
 * this happened before" is the first question worth asking.
 */
export default function RiderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [rider, setRider] = useState<RiderDetail | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .riderById(id)
      .then(setRider)
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError ? e.message : "Could not load this partner.",
        ),
      );

    // Best-effort. A partner with no audit history is the normal case, and a
    // failure here should not stop the page rendering the partner.
    api
      .auditLog({ subjectId: id })
      .then((res) => setHistory(res.results))
      .catch(() => setHistory([]));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <EmptyState title="Could not load this partner" hint={error} />
        </Card>
      </div>
    );
  }

  if (!rider) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card className="p-4">
          <SkeletonRows rows={6} />
        </Card>
      </div>
    );
  }

  const total = rider.completed + rider.cancelled;
  // Guarded rather than computed blindly: a new partner has no deliveries, and
  // 0/0 renders as NaN%.
  const cancelRate =
    total === 0 ? null : Math.round((rider.cancelled / total) * 100);

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-medium">{rider.name}</h1>
            <StatusPill status={rider.status} />
            {rider.isOnline && (
              <span className="border border-ok/40 px-2 py-0.5 text-xs text-ok">
                On duty
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-fg-mid">{rider.phone}</p>
        </div>
        <GhostButton onClick={load}>Refresh</GhostButton>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lifetime earnings" value={formatMoney(rider.earnings)} />
        <Stat label="Delivered" value={String(rider.completed)} />
        <Stat
          label="Cancelled"
          value={
            cancelRate === null
              ? String(rider.cancelled)
              : `${rider.cancelled} (${cancelRate}%)`
          }
          // Worth flagging rather than leaving an operator to divide two
          // numbers in their head, but only once there is enough history for
          // the rate to mean anything.
          tone={cancelRate !== null && total >= 10 && cancelRate >= 20 ? "bad" : undefined}
        />
        <Stat
          label="Rating"
          value={rider.rating === null ? "Not yet rated" : rider.rating.toFixed(2)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionLabel>Account</SectionLabel>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Joined" value={formatWhen(rider.joinedAt)} />
            <Row label="Commission" value={`${rider.commissionPct}%`} />
            <Row
              label="Bank details"
              value={rider.hasBankDetails ? "On file" : "Not provided"}
            />
          </dl>
          {/* Deliberate: the API returns only whether details exist. They are
              encrypted at rest and an operator has no reason to read a
              partner's account number — payouts are settled against a
              reference, not by reading it back. */}
          <p className="mt-3 text-xs text-fg-faint">
            Account numbers are encrypted and never shown here.
          </p>
        </Card>

        <Card className="p-5">
          <SectionLabel>History</SectionLabel>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-fg-faint">
              No administrative actions recorded for this partner.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{entry.action.replace(/[._-]+/g, " ")}</span>
                    <span className="shrink-0 text-xs text-fg-faint">
                      {formatWhen(entry.at)}
                    </span>
                  </div>
                  <span className="text-xs text-fg-mid">by {entry.admin}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/riders"
      className="text-sm text-fg-mid underline-offset-2 hover:text-accent hover:underline"
    >
      ← All partners
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-fg-faint">
        {label}
      </div>
      <div
        className={`mt-1 text-lg ${tone === "bad" ? "text-danger" : "text-fg"}`}
      >
        {value}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-mid">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
