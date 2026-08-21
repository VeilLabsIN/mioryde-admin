"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  GhostButton,
  Input,
  Pager,
  SectionLabel,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import {
  ApiError,
  type OutstandingCash,
  type PageMeta,
  api,
  formatMoney,
} from "@/lib/api";
import { ExportButton } from "@/components/ExportButton";
import { useUrlPage } from "@/lib/useUrlState";

const METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cash_office", label: "Cash at office" },
  { value: "adjustment", label: "Adjustment (no reference)" },
] as const;

/**
 * Cash partners are holding, and recording it coming back.
 *
 * ## Why this screen exists
 *
 * A partner who collects COD is holding the platform's money. That balance is
 * netted against what they can withdraw, and once it passes the ceiling they
 * cannot go online at all. Only somebody who actually received the cash can
 * clear it — a partner clearing their own balance would make the whole control
 * decorative — so without this screen, a partner over the limit is locked out
 * with nobody able to release them.
 *
 * ## Ordered by exposure, not by name
 *
 * The list is sorted by amount held, largest first, because this is a
 * collections worklist: the question it answers is "who is holding the most of
 * our money", not "find me this partner".
 */
export default function CollectionsPage() {
  const [rows, setRows] = useState<OutstandingCash[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage, urlReady] = useUrlPage();
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response landing after a newer one.
  const requestId = useRef(0);

  const load = useCallback(() => {
    if (!urlReady) return;

    const id = ++requestId.current;
    setError(null);
    setRows(null);

    api
      .outstandingCash(page)
      .then((result) => {
        if (id !== requestId.current) return;
        if (result.page.beyondEnd) {
          setPage(0);
          return;
        }
        setRows(result?.results ?? []);
        setMeta(result.page);
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load outstanding cash.",
        );
      });
  }, [page, urlReady, setPage]);

  useEffect(load, [load]);

  const totalHeld =
    rows?.reduce((sum, row) => sum + row.held.minor, 0) ?? 0;
  const lockedOut = rows?.filter((row) => row.overLimit).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Cash collections"
          subtitle="Money partners have collected and not yet returned. It is deducted from what they can withdraw until it comes back."
        />
        <ExportButton
          fetcher={() => api.downloadCollectionsCsv()}
          label="Export list"
          disabled={rows?.length === 0 ? "Nothing outstanding." : null}
        />
      </div>

      {rows !== null && rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <SectionLabel>Total outstanding</SectionLabel>
            {/* The number this whole screen exists to bring down. */}
            <p className="mt-1 font-mono text-2xl tabular-nums">
              {formatMoney({ minor: totalHeld, currency: "INR" })}
            </p>
            {/* Scoped to this page, and said so. The total across every page
                would need the server to sum it — this figure adds up only what
                is on screen, and calling it the whole outstanding balance once
                there is a second page would overstate nothing but understate
                the exposure, which is the wrong direction to be wrong in. */}
            <p className="text-fg-faint mt-1 text-xs">
              across {rows.length} partner{rows.length === 1 ? "" : "s"} on this
              page
              {meta?.total != null && meta.total > rows.length
                ? ` of ${meta.total}`
                : ""}
            </p>
          </Card>
          <Card>
            <SectionLabel>Locked out</SectionLabel>
            <p
              className={`mt-1 font-mono text-2xl tabular-nums ${
                lockedOut > 0 ? "text-warn" : ""
              }`}
            >
              {lockedOut}
            </p>
            <p className="text-fg-faint mt-1 text-xs">
              over the ceiling — cannot go online until they deposit
            </p>
          </Card>
        </div>
      ) : null}

      {error ? (
        <Card>
          <p className="text-warn text-sm">{error}</p>
          <Button className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      ) : null}

      {rows === null ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing outstanding"
          hint="No partner is holding company cash."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PartnerRow key={row.riderId} row={row} onDone={load} />
          ))}
        </div>
      )}

      {meta && (
        <Pager
          page={meta}
          busy={rows === null}
          noun="partners holding cash"
          onChange={setPage}
        />
      )}
    </div>
  );
}

function PartnerRow({
  row,
  onDone,
}: {
  row: OutstandingCash;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(METHODS[0].value);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const needsReference = method !== "adjustment";

  const submit = async () => {
    // Rupees in the field, paise on the wire. Parsing here rather than letting
    // a float reach the server: money is integer minor units everywhere in
    // this system, and a rounding error introduced at the form is one nobody
    // ever finds.
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setProblem("Enter the amount received.");
      return;
    }
    const minor = Math.round(rupees * 100);

    if (minor > row.held.minor) {
      // The server refuses this too. Caught here so an operator sees it before
      // submitting rather than after.
      setProblem(
        `That partner is only holding ${formatMoney(row.held)}. Crediting more would put them in credit against the business.`,
      );
      return;
    }
    if (needsReference && !reference.trim()) {
      setProblem("Enter the bank or UPI reference — it is what reconciles this.");
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      await api.recordCashDeposit(row.riderId, {
        amount: minor,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      onDone();
    } catch (caught) {
      setProblem(
        caught instanceof ApiError ? caught.message : "Could not record that.",
      );
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-medium">{row.riderName}</p>
          <p className="text-fg-faint text-xs">
            {row.lastDepositAt
              ? `Last deposit ${new Date(row.lastDepositAt).toLocaleDateString()}`
              : "Never deposited"}
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-xl tabular-nums">
            {formatMoney(row.held)}
          </p>
          {row.overLimit ? (
            <p className="text-warn text-xs">Locked out — over the ceiling</p>
          ) : null}
        </div>

        {!open ? (
          <GhostButton onClick={() => setOpen(true)}>
            Record deposit
          </GhostButton>
        ) : null}
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Amount in ₹ (up to ${(row.held.minor / 100).toFixed(2)})`}
            />
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              className="border-edge bg-bg w-full rounded border px-3 py-2 text-sm"
            >
              {METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder={
              needsReference
                ? "Bank reference / UPI id / receipt number"
                : "Reference (optional for an adjustment)"
            }
          />

          {problem ? <p className="text-warn text-sm">{problem}</p> : null}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy}>
              Record deposit
            </Button>
            <GhostButton
              onClick={() => {
                setOpen(false);
                setProblem(null);
              }}
              disabled={busy}
            >
              Cancel
            </GhostButton>
          </div>
          <p className="text-fg-faint text-xs">
            The same reference cannot be credited twice — a double credit is
            money withdrawn that never arrived.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
