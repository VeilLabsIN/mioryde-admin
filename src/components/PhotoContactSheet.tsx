"use client";

import { useCallback, useEffect, useState } from "react";
import { GhostButton, SectionLabel } from "@/components/ui";
import { ApiError, api, type KycDocumentView } from "@/lib/api";
import type { ReviewRow } from "@/lib/kycQueue";

interface Sheet {
  row: ReviewRow;
  view: KycDocumentView | null;
  /** Set from the image's own `onLoad` — pixels, not a successful fetch. */
  rendered: boolean;
  problem: string | null;
  outcome: "approved" | null;
}

/**
 * Several profile photos, looked at together and approved in one action.
 *
 * ## Why a sheet and not a checkbox that approves unseen
 *
 * "Bulk approve" read literally means a reviewer records a judgement about
 * documents they have not seen, and for a profile photo the judgement *is*
 * looking at it. So the batch does not skip the looking; it skips the fifty
 * round trips through a drawer. Every photo is fetched and displayed, and
 * Approve counts only the ones whose pixels actually arrived — the same gate
 * `DocumentReview` applies to one document, applied to each of these.
 *
 * ## Why the access rows are right here and wrong in the queue
 *
 * Each photo is fetched through `viewKycDocument`, which writes a §13.12
 * access row. The queue list deliberately shows no thumbnails for exactly that
 * reason: a log saying somebody opened forty documents because a page loaded
 * is worse than no log. Here the opposite holds — the reviewer asked to look
 * at these specific documents, so a row per document is precisely the event
 * the record exists for, and omitting them would be the falsification.
 *
 * ## Why the approvals are one request each
 *
 * There is no batch endpoint and deliberately so. Compare-and-set on the
 * reviewable states, the audit row, the two-person routing and the expiry
 * handling all live in the single-document endpoint; a second path that
 * approves many would be a second place for those to be got wrong. Sequential
 * rather than parallel so a partial failure stops rather than fans out, and so
 * the count that is reported is the count that happened.
 */
export function PhotoContactSheet({
  rows,
  onClose,
  onFinished,
}: {
  rows: ReviewRow[];
  onClose: () => void;
  onFinished: (approved: number) => void;
}) {
  const [sheets, setSheets] = useState<Sheet[]>(() =>
    rows.map((row) => ({
      row,
      view: null,
      rendered: false,
      problem: null,
      outcome: null,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      // Sequential, because each one writes an audit row and a burst of forty
      // concurrent POSTs is also how this screen would meet the rate limiter.
      for (const row of rows) {
        try {
          const view = await api.viewKycDocument(row.documentId);
          if (!live) return;
          setSheets((prev) =>
            prev.map((s) =>
              s.row.documentId === row.documentId ? { ...s, view } : s,
            ),
          );
        } catch (e) {
          if (!live) return;
          const message =
            e instanceof ApiError ? e.message : "Could not open it.";
          setSheets((prev) =>
            prev.map((s) =>
              s.row.documentId === row.documentId
                ? { ...s, problem: message }
                : s,
            ),
          );
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [rows]);

  const ready = sheets.filter((s) => s.rendered && !s.outcome);
  const pending = sheets.filter((s) => !s.outcome);

  const approveAll = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    let done = 0;
    for (const sheet of ready) {
      try {
        await api.reviewKycDocument(sheet.row.documentId, "approve");
        done += 1;
        setSheets((prev) =>
          prev.map((s) =>
            s.row.documentId === sheet.row.documentId
              ? { ...s, outcome: "approved" as const }
              : s,
          ),
        );
      } catch (e) {
        // Stop rather than carry on. The rest are still in the queue and can
        // be tried again; continuing past a refusal would report a number the
        // reviewer cannot reconcile with what the queue then shows.
        setProblem(
          `${done} approved, then ${sheet.row.riderName}'s photo was refused: ${
            e instanceof ApiError ? e.message : "that could not be applied."
          }`,
        );
        break;
      }
    }
    setBusy(false);
    if (done > 0) onFinished(done);
  }, [ready, onFinished]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>
          {rows.length} profile {rows.length === 1 ? "photo" : "photos"}
        </SectionLabel>
        <p className="text-fg-faint text-xs">
          Approve enables for the photos that have actually appeared.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sheets.map((sheet) => (
          <li
            key={sheet.row.documentId}
            className="border-line rounded-xs border p-2"
          >
            <div className="bg-panel flex aspect-square items-center justify-center overflow-hidden">
              {sheet.view && sheet.view.renderable ? (
                // A short-lived signed URL on another origin, so the image
                // optimiser cannot fetch it — and would be caching an
                // identity document at the edge if it could.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sheet.view.url}
                  alt={`${sheet.row.riderName} — profile photo`}
                  className="h-full w-full object-cover"
                  onLoad={() =>
                    setSheets((prev) =>
                      prev.map((s) =>
                        s.row.documentId === sheet.row.documentId
                          ? { ...s, rendered: true }
                          : s,
                      ),
                    )
                  }
                />
              ) : (
                <span className="text-fg-faint px-2 text-center text-xs">
                  {sheet.problem ??
                    (sheet.view ? "Cannot be shown here" : "Opening…")}
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate text-xs">{sheet.row.riderName}</p>
            <p className="text-fg-faint truncate text-[11px]">
              {sheet.outcome === "approved" ? "Approved" : sheet.row.meta}
            </p>
          </li>
        ))}
      </ul>

      {problem && (
        <p role="alert" className="text-danger text-[13px]">
          {problem}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <GhostButton
          className="border-ok/50 text-ok hover:border-ok"
          disabled={busy || ready.length === 0}
          onClick={() => void approveAll()}
        >
          {busy
            ? "Approving…"
            : `Approve ${ready.length} ${ready.length === 1 ? "photo" : "photos"}`}
        </GhostButton>
        <GhostButton onClick={onClose}>
          {pending.length === 0 ? "Done" : "Cancel"}
        </GhostButton>
        {ready.length < pending.length && (
          <span className="text-fg-faint text-xs">
            {pending.length - ready.length} not shown yet, and not included.
          </span>
        )}
      </div>
    </div>
  );
}
