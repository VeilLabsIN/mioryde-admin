"use client";

import { useState } from "react";
import { GhostButton } from "@/components/ui";
import { ApiError, type RecordCheck, type RecordChecks, api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import {
  flagText,
  licenceFactLines,
  scoreText,
  statusText,
  vehicleFactLines,
} from "@/lib/registryRecord";

/**
 * What Parivahan says, next to the photographs.
 *
 * Evidence, never a verdict: approving still takes the reviewers the two-person
 * rule asks for. The licence card deliberately shows no dates — the expiry is
 * re-keyed blind from the photograph, and the registry's date appears only
 * after the reviewer has typed theirs (see `expiryDisagreement`).
 *
 * Renders nothing at all while lookups are switched off, so the review screen
 * looks exactly as it did before.
 */
export function RegistryRecord({
  riderId,
  vehicleId,
}: {
  riderId: string;
  /** Set for the RC card; absent for the licence card. */
  vehicleId?: string;
}) {
  const [override, setOverride] = useState<RecordChecks | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const loaded = useAsync(() => api.recordChecks(riderId), [riderId], {
    fallback: "Could not load the Parivahan record.",
  });
  const data = override ?? loaded.data;
  if (!data?.enabled) return null;

  const check: RecordCheck | null = vehicleId
    ? (data.vehicles.find((v) => v.vehicleId === vehicleId) ?? null)
    : data.licence;
  const lines = check
    ? vehicleId
      ? vehicleFactLines(check)
      : licenceFactLines(check)
    : [];
  const score = check ? scoreText(check.nameScore, data.threshold) : null;
  const weakName =
    check !== null &&
    check.nameScore !== null &&
    check.nameScore < data.threshold;

  const rerun = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setOverride(
        vehicleId
          ? await api.rerunVehicleCheck(riderId, vehicleId)
          : await api.rerunLicenceCheck(riderId),
      );
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : "The lookup failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-edge mt-3 border-t pt-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-fg-faint text-xs uppercase tracking-wide">
          Parivahan {vehicleId ? "RC" : "licence"} ·{" "}
          <span className="text-fg-mid normal-case tracking-normal">
            {statusText(check)}
            {check ? ` (${check.reference})` : ""}
          </span>
        </p>
        <GhostButton onClick={rerun} disabled={busy} className="h-7 text-xs">
          {busy ? "Checking…" : check ? "Check again" : "Check now"}
        </GhostButton>
      </div>
      {score ? (
        <p className={weakName ? "text-warn mt-1" : "text-fg-mid mt-1"}>
          {score}
        </p>
      ) : null}
      {lines.map((line) => (
        <p key={line} className="text-fg-mid mt-1">
          {line}
        </p>
      ))}
      {check && check.flags.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {check.flags.map((flag) => (
            <li key={flag} className="text-warn text-xs">
              ⚑ {flagText(flag)}
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? <p className="text-warn mt-1 text-xs">{problem}</p> : null}
    </div>
  );
}
