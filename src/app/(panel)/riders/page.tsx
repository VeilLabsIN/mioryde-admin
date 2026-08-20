"use client";
import Link from "next/link";
import { RevealPhone } from "@/components/RevealPhone";

import { useCallback, useEffect, useRef, useState } from "react";
import { RiderCard } from "@/components/RiderCard";
import { ViewToggle, useListView } from "@/components/ViewToggle";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  Pager,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import { type AdminRider, type PageMeta, ApiError, api } from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";

const FILTERS = [
  { value: "pending_kyc", label: "Awaiting review" },
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  active: "text-ok border-ok/40",
  pending_kyc: "text-warn border-warn/40",
  suspended: "text-danger border-danger/40",
  rejected: "text-fg-faint border-edge",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending_kyc: "Awaiting review",
  suspended: "Suspended",
  rejected: "Rejected",
};

export default function RidersPage() {
  // Opens on pending applications — this screen exists to get people approved,
  // not to browse everyone.
  // "pending_kyc" is the default *and* the fallback, so the opening view has a
  // clean URL and only a deliberate change puts ?status= in it.
  const [status, setStatus, statusReady] = useUrlParam("status", "pending_kyc");
  const [search, setSearch, searchReady] = useUrlParam("search");
  const [riders, setRiders] = useState<AdminRider[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage, pageReady] = useUrlPage();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useListView("riders", "table");

  // The URL is read after mount, so the first render holds defaults. Fetching
  // then would race a request for the default view against the one the URL
  // actually asked for, and the wrong response can land last.
  const urlReady = pageReady && statusReady && searchReady;

  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const requestId = useRef(0);

  const load = useCallback(() => {
    if (!urlReady) return;

    const id = ++requestId.current;
    setRiders(null);
    setError(null);
    api
      .riders({
        ...(page ? { page } : {}),
        ...(status ? { status } : {}),
        ...(debounced ? { search: debounced } : {}),
      })
      .then((res) => {
        if (id !== requestId.current) return;
        if (res.page.beyondEnd) {
          setPage(0);
          return;
        }
        setRiders(res.results);
        setMeta(res.page);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Could not load partners.");
      });
  }, [status, debounced, page, urlReady, setPage]);

  useEffect(load, [load]);

  async function review(rider: AdminRider, action: string) {
    setBusyId(rider.id);
    try {
      await api.reviewRider(rider.id, action);
      load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "That action could not be applied.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageHeader
            title="Partners"
            subtitle={
              riders === null
                ? "Loading…"
                : `${meta?.total ?? riders.length} partners`
            }
          />
        </div>
        <div className="flex w-full max-w-[340px] items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            placeholder="Name or phone"
            aria-label="Search partners"
          />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <GhostButton
            key={f.value || "all"}
            onClick={() => {
              // Two sequential URL writes; each re-reads the live query string,
              // so the page reset is not overwritten by the status write.
              setPage(0);
              setStatus(f.value);
            }}
            aria-pressed={f.value === status}
            className={f.value === status ? "border-accent text-accent" : undefined}
          >
            {f.label}
          </GhostButton>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="animate-slide-in mb-3 border-l-2 border-danger pl-3 text-[13px] text-danger"
        >
          {error}
        </p>
      )}

      {view === "cards" && riders !== null && riders.length > 0 && (
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {riders.map((rider) => (
            <RiderCard key={rider.id} rider={rider} />
          ))}
        </div>
      )}

      {/* The table keeps every action the grid does not carry — approve,
          reject, reveal. A card is for finding somebody; the row is for doing
          something to them, and duplicating destructive controls into a
          fifty-up grid is how one gets clicked by accident. */}
      <Card className={`overflow-hidden ${view === "cards" ? "hidden" : ""}`}>
        {riders === null ? (
          <SkeletonRows rows={6} />
        ) : riders.length === 0 ? (
          <EmptyState
            title="No partners here"
            hint={
              status === "pending_kyc"
                ? "Nothing awaiting review — you're up to date."
                : "Try a different filter."
            }
          />
        ) : (
          <ul className="stagger divide-y divide-line">
            {riders.map((rider) => (
              <li
                key={rider.id}
                className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors
                           duration-150 hover:bg-panel"
              >
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/riders/${rider.id}`}
                      className="text-[13px] font-medium underline-offset-2
                                 hover:text-accent hover:underline"
                    >
                      {rider.name}
                    </Link>
                    {rider.isOnline && (
                      <span
                        title="Online"
                        className="size-1.5 rounded-full bg-ok"
                        aria-label="Online"
                      />
                    )}
                  </div>
                  <RevealPhone
                    riderId={rider.id}
                    masked={rider.phone}
                    className="mt-0.5"
                  />
                </div>

                <div className="min-w-[140px] text-[12px] text-fg-mid">
                  {rider.vehicles || "—"}
                  <span className="block text-[11px] text-fg-faint">
                    {rider.zones || "No zone"}
                  </span>
                </div>

                <div className="min-w-[92px] font-mono text-[11px] text-fg-muted">
                  {rider.completed} done
                  {rider.cancelled > 0 && (
                    <span className="block text-danger">
                      {rider.cancelled} cancelled
                    </span>
                  )}
                </div>

                <span
                  className={`min-w-[124px] border px-2 py-0.5 text-center font-mono
                              text-[10px] uppercase tracking-wide ${
                                STATUS_STYLE[rider.status] ??
                                "border-edge text-fg-muted"
                              }`}
                >
                  {STATUS_LABEL[rider.status] ?? rider.status}
                </span>

                <div className="flex gap-1.5">
                  {/*
                    Only the transitions the API will actually accept are
                    offered. Showing a button that always 404s trains operators
                    to ignore errors.
                  */}
                  {rider.status === "pending_kyc" && (
                    <>
                      <GhostButton
                        disabled={busyId === rider.id}
                        onClick={() => review(rider, "approve")}
                        className="border-ok/50 text-ok hover:border-ok"
                      >
                        Approve
                      </GhostButton>
                      <GhostButton
                        disabled={busyId === rider.id}
                        onClick={() => review(rider, "reject")}
                        className="border-danger/50 text-danger hover:border-danger"
                      >
                        Reject
                      </GhostButton>
                    </>
                  )}
                  {rider.status === "active" && (
                    <GhostButton
                      disabled={busyId === rider.id}
                      onClick={() => review(rider, "suspend")}
                      className="border-danger/50 text-danger hover:border-danger"
                    >
                      Suspend
                    </GhostButton>
                  )}
                  {(rider.status === "suspended" ||
                    rider.status === "rejected") && (
                    <GhostButton
                      disabled={busyId === rider.id}
                      onClick={() => review(rider, "reinstate")}
                      className="border-ok/50 text-ok hover:border-ok"
                    >
                      Reinstate
                    </GhostButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {meta && (
        <Pager
          page={meta}
          busy={riders === null}
          noun="partners"
          onChange={setPage}
        />
      )}
    </div>
  );
}
