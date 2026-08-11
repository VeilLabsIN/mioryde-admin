"use client";
import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  SkeletonRows,
} from "@/components/ui";
import { type AdminRider, ApiError, api } from "@/lib/api";

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
  const [status, setStatus] = useState<string>("pending_kyc");
  const [search, setSearch] = useState("");
  const [riders, setRiders] = useState<AdminRider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setRiders(null);
    setError(null);
    api
      .riders({
        ...(status ? { status } : {}),
        ...(debounced ? { search: debounced } : {}),
      })
      .then((res) => {
        if (id === requestId.current) setRiders(res.results);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Could not load partners.");
      });
  }, [status, debounced]);

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
          <h1 className="mb-1 font-sans text-2xl font-semibold">Partners</h1>
          <p className="text-[13px] text-fg-muted">
            {riders === null ? "Loading…" : `${riders.length} shown`}
          </p>
        </div>
        <div className="w-full max-w-[280px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or phone"
            aria-label="Search partners"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <GhostButton
            key={f.value || "all"}
            onClick={() => setStatus(f.value)}
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

      <Card className="overflow-hidden">
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
                  <span className="font-mono text-[11px] text-fg-faint">
                    {rider.phone}
                  </span>
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
    </div>
  );
}
