"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  GhostButton,
  Input,
  Pager,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import {
  ApiError,
  type PageMeta,
  type Payout,
  type PayoutTotals,
  api,
  formatMoney,
} from "@/lib/api";
import { ExportButton } from "@/components/ExportButton";
import { RevealPhone } from "@/components/RevealPhone";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";

const FILTERS = [
  { value: "requested", label: "To action" },
  { value: "", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  requested: "text-warn border-warn/40",
  processing: "text-warn border-warn/40",
  paid: "text-ok border-ok/40",
  rejected: "text-fg-faint border-edge",
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
};

/**
 * The payout queue.
 *
 * This is the one screen in the panel that moves money out of the business, so
 * it is deliberately a **work queue** rather than a browsable table: it opens on
 * open requests, and the settle action demands a bank reference before it will
 * mark anything paid.
 */
export default function PayoutsPage() {
  // "requested" is the default and the fallback, so the opening view has a
  // clean URL and only a deliberate change puts ?status= in it.
  const [status, setStatus, statusReady] = useUrlParam("status", "requested");
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [pending, setPending] = useState<PayoutTotals | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage, pageReady] = useUrlPage();
  const urlReady = statusReady && pageReady;
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response for an old filter landing after a newer one
  // and repainting the table with the wrong rows.
  const requestId = useRef(0);

  const load = useCallback(() => {
    if (!urlReady) return;

    const id = ++requestId.current;
    setPayouts(null);
    setError(null);
    api
      .payouts({ ...(page ? { page } : {}), ...(status ? { status } : {}) })
      .then((res) => {
        if (id !== requestId.current) return;
        if (res.page.beyondEnd) {
          setPage(0);
          return;
        }
        setPayouts(res.results);
        setPending(res.pending);
        setMeta(res.page);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(
          e instanceof ApiError ? e.message : "Could not load payouts.",
        );
      });
  }, [status, page, urlReady, setPage]);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Payouts"
          subtitle="Withdrawal requests from delivery partners."
        />
        {/* Carries the filter the screen is on: an export that ignored it
            would answer a question nobody asked. */}
        <ExportButton
          fetcher={() => api.downloadPayoutsCsv(status || undefined)}
          label="Export queue"
          disabled={payouts?.length === 0 ? "Nothing to export." : null}
        />
        {pending && pending.count > 0 && (
          <div className="chamfer-sm border border-warn/40 bg-panel px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-warn">
              Awaiting payment
            </p>
            <p className="mt-0.5 font-mono text-lg">
              {formatMoney(pending.total)}
              <span className="ml-2 text-[12px] text-fg-muted">
                {pending.count} request{pending.count === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <GhostButton
            key={f.value}
            onClick={() => {
              // Two sequential URL writes; each re-reads the live query string,
              // so the page reset is not overwritten by the status write.
              setPage(0);
              setStatus(f.value);
            }}
            className={
              status === f.value ? "border-accent text-fg" : undefined
            }
          >
            {f.label}
          </GhostButton>
        ))}
      </div>

      <Card>
        {error ? (
          <EmptyState title="Something went wrong" hint={error} />
        ) : payouts === null ? (
          <SkeletonRows />
        ) : payouts.length === 0 ? (
          <EmptyState
            title="Nothing to action"
            hint="Withdrawal requests from partners will appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {payouts.map((p) => (
              <PayoutRow key={p.id} payout={p} onSettled={load} />
            ))}
          </ul>
        )}
      </Card>

      {meta && (
        <Pager
          page={meta}
          busy={payouts === null}
          noun="requests"
          onChange={setPage}
        />
      )}
    </div>
  );
}

function PayoutRow({
  payout,
  onSettled,
}: {
  payout: Payout;
  onSettled: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = payout.status === "requested" || payout.status === "processing";

  async function settle(action: "start" | "paid" | "reject") {
    // Checked here as well as on the server. The server is the authority, but
    // finding out after the click that a reference was needed means retyping
    // the note too.
    if (action === "paid" && !reference.trim()) {
      setError("Enter the bank or UPI reference before marking this paid.");
      return;
    }

    setBusy(action);
    setError(null);
    try {
      await api.settlePayout(payout.id, action, {
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSettled();
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Could not update this payout.",
      );
      setBusy(null);
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[15px]">
              {formatMoney(payout.amount, { alwaysShowDecimals: true })}
            </p>
            <span
              className={`chamfer-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[1px] ${
                STATUS_STYLE[payout.status] ?? "border-edge text-fg-faint"
              }`}
            >
              {STATUS_LABEL[payout.status] ?? payout.status}
            </span>
          </div>
          <p className="mt-1 truncate text-[13px]">{payout.rider.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-faint">
            {/* Masked, with the same audited reveal every other partner
                surface uses. This printed the number in full until the server
                started masking it. */}
            <RevealPhone riderId={payout.rider.id} masked={payout.rider.phone} />
            <span>
              · earned {formatMoney(payout.rider.lifetimeEarned)} lifetime
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-fg-faint">
            Requested {new Date(payout.requestedAt).toLocaleString("en-IN")}
            {payout.settledAt &&
              ` · settled ${new Date(payout.settledAt).toLocaleString("en-IN")}`}
          </p>
          {payout.reference && (
            <p className="mt-0.5 font-mono text-[11px] text-fg-muted">
              Ref: {payout.reference}
            </p>
          )}
          {payout.note && (
            <p className="mt-0.5 text-[11px] text-fg-muted">{payout.note}</p>
          )}
        </div>

        {open && (
          <GhostButton onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Cancel" : "Settle"}
          </GhostButton>
        )}
      </div>

      {expanded && open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank / UPI reference"
              className="min-w-[200px] flex-1"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="min-w-[200px] flex-1"
            />
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {payout.status === "requested" && (
              <GhostButton
                onClick={() => settle("start")}
                disabled={busy !== null}
              >
                {busy === "start" ? "Working…" : "Mark processing"}
              </GhostButton>
            )}
            <Button onClick={() => settle("paid")} disabled={busy !== null}>
              {busy === "paid" ? "Working…" : "Mark paid"}
            </Button>
            <GhostButton
              onClick={() => settle("reject")}
              disabled={busy !== null}
              className="border-danger/40 text-danger"
            >
              {busy === "reject" ? "Working…" : "Reject"}
            </GhostButton>
          </div>

          <p className="text-[11px] text-fg-faint">
            Rejecting returns the amount to the partner&rsquo;s available
            balance. Marking paid requires a reference so the transfer can be
            reconciled later.
          </p>
        </div>
      )}
    </li>
  );
}
