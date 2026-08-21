"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  Pager,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import { ApiError, type AuditEntry, type PageMeta, api } from "@/lib/api";
import { ExportButton } from "@/components/ExportButton";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";

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
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  // All three in the URL: "who touched this record" is the question this page
  // exists for, and the answer to it should be a link somebody can paste into
  // an incident thread.
  const [action, setAction, actionReady] = useUrlParam("action");
  const [subjectId, setSubjectId, subjectReady] = useUrlParam("subject");
  const [page, setPage, pageReady] = useUrlPage();
  const urlReady = actionReady && subjectReady && pageReady;
  const [error, setError] = useState<string | null>(null);

  // Only sent once it is a complete UUID. Filtering on a partial id would
  // return nothing and read as "no such record" while the operator is still
  // mid-paste.
  const subjectFilter = /^[0-9a-f-]{36}$/i.test(subjectId.trim())
    ? subjectId.trim()
    : undefined;

  const load = useCallback(() => {
    if (!urlReady) return;

    setEntries(null);
    setError(null);
    api
      .auditLog({ page, action: action || undefined, subjectId: subjectFilter })
      .then((res) => {
        if (res.page.beyondEnd) {
          setPage(0);
          return;
        }
        setEntries(res.results);
        setMeta(res.page);
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Could not load the log."),
      );
  }, [page, action, subjectFilter, urlReady, setPage]);

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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Audit log"
          subtitle="Every administrative action, newest first. Records are written in the same transaction as the change they describe, so this cannot disagree with what actually happened."
        />
        {/* The export this page exists to produce when somebody outside the
            team asks what happened. Filtered the same way the screen is. */}
        <ExportButton
          fetcher={() =>
            api.downloadAuditCsv({
              action: action || undefined,
              subjectId: subjectFilter,
            })
          }
          label="Export log"
        />
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All actions"
            active={action === ""}
            onClick={() => {
              setPage(0);
              setAction("");
            }}
          />
          {actions.map((value) => (
            <FilterChip
              key={value}
              label={humanise(value)}
              active={action === value}
              onClick={() => {
                setPage(0);
                setAction(value);
              }}
            />
          ))}
        </div>

        <div className="ml-auto w-full max-w-xs">
          <Input
            placeholder="Filter by record id"
            value={subjectId}
            onChange={(e) => {
              setPage(0);
              setSubjectId(e.target.value);
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
                          setPage(0);
                          setSubjectId(entry.subjectId ?? "");
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

      {/* The shared Pager, replacing this page's own prev/next — it was the only
          list in the panel that had any, and now that every list does they
          should look and behave identically.

          It still shows no total, and for the original reason: counting an
          append-only log on every page view is a full scan of the filtered set,
          and the number is not worth it. The server uses the probe form for this
          one endpoint, so `total` is null and the readout says "50+". That is
          the honest rendering of not having counted, and it is why Pager treats
          a null total as unknown rather than falling back to zero. */}
      {meta && (
        <Pager
          page={meta}
          busy={entries === null}
          noun="entries"
          onChange={setPage}
        />
      )}
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
