"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import { ApiError, type AuditEntry, api } from "@/lib/api";

/** Turns `payout.settled` into `Payout settled`. */
function humanise(action: string): string {
  const words = action.replace(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Colour by consequence, not by category.
 *
 * An operator scanning this page is looking for the irreversible things —
 * money leaving, someone losing their livelihood. Those read differently from
 * an approval.
 */
function toneFor(action: string): string {
  if (/reject|suspend|fail/.test(action)) return "text-danger border-danger/40";
  if (/settle|paid|payout/.test(action)) return "text-warn border-warn/40";
  if (/approve|reinstate/.test(action)) return "text-ok border-ok/40";
  return "text-fg-mid border-edge";
}

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
 * The administrative audit trail.
 *
 * Every payout settlement and partner status change has been written to
 * `admin_audit_log` since those features shipped. Nothing displayed it, which
 * meant the record existed and answered no questions — the worst of both, since
 * an invisible audit log reads as coverage without providing any.
 *
 * Built around filtering rather than browsing. The question an audit log gets
 * asked is never "what happened recently"; it is "who suspended this partner,
 * and when" — so `subjectId` is the primary control and the reverse-chronological
 * list is what you get when you have not asked anything yet.
 */
export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Only sent once it is a complete UUID. Filtering on a partial id would
  // return nothing and read as "no such record" while the operator is still
  // mid-paste.
  const subjectFilter = /^[0-9a-f-]{36}$/i.test(subjectId.trim())
    ? subjectId.trim()
    : undefined;

  const load = useCallback(() => {
    setEntries(null);
    setError(null);
    api
      .auditLog({ page, action: action || undefined, subjectId: subjectFilter })
      .then((res) => setEntries(res.results))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Could not load the log."),
      );
  }, [page, action, subjectFilter]);

  useEffect(load, [load]);

  useEffect(() => {
    // Failure here is not worth surfacing: the filter degrades to the free-text
    // box and the page still works.
    api
      .auditActions()
      .then((res) => setActions(res.results))
      .catch(() => setActions([]));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <PageHeader
          title="Audit log"
          subtitle="Every administrative action, newest first. Records are written in the same transaction as the change they describe, so this cannot disagree with what actually happened."
        />
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All actions"
            active={action === ""}
            onClick={() => {
              setAction("");
              setPage(0);
            }}
          />
          {actions.map((value) => (
            <FilterChip
              key={value}
              label={humanise(value)}
              active={action === value}
              onClick={() => {
                setAction(value);
                setPage(0);
              }}
            />
          ))}
        </div>

        <div className="ml-auto w-full max-w-xs">
          <Input
            placeholder="Filter by record id"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      <Card className="p-0">
        {error ? (
          <EmptyState title="Could not load the log" hint={error} />
        ) : entries === null ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="Nothing recorded"
            hint={
              action || subjectFilter
                ? "No entries match this filter."
                : "Administrative actions will appear here as they happen."
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Record</th>
                <th className="px-4 py-3 font-medium">By</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-edge/50">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block border px-2 py-0.5 text-xs ${toneFor(entry.action)}`}
                    >
                      {humanise(entry.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-mid">
                    {entry.subjectId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSubjectId(entry.subjectId ?? "");
                          setPage(0);
                        }}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                        title="Filter to this record"
                      >
                        {entry.subjectType ?? "record"}&nbsp;
                        {entry.subjectId.slice(0, 8)}
                      </button>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{entry.admin}</td>
                  <td className="px-4 py-3 text-fg-mid">
                    {formatWhen(entry.at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <GhostButton
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </GhostButton>
        <span className="text-sm text-fg-faint">Page {page + 1}</span>
        {/* No total count: counting an append-only log on every page view is a
            full scan, and the number is not worth it. A short last page is the
            signal that there is no more. */}
        <GhostButton
          disabled={entries !== null && entries.length < 50}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </GhostButton>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-accent text-accent"
          : "border-edge text-fg-mid hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
}
