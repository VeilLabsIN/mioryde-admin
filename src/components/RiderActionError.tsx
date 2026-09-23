"use client";

import { useState } from "react";
import { GhostButton } from "@/components/ui";
import { RiderZones } from "@/components/RiderZones";
import type { DispatchGap } from "@/lib/riderBlockers";

export interface RowError {
  /** What was attempted, so the retry after a fix repeats the same thing. */
  action: RiderAction;
  message: string;
  /**
   * `null` when the refusal was something else. An empty array means the
   * approval *was* blocked on dispatch reachability but the server could not
   * say which half — see `dispatchGapsOf`.
   */
  gaps: DispatchGap[] | null;
}

export type RiderAction = "approve" | "reject" | "suspend" | "reinstate";

/**
 * A refused action, shown on the row it was refused for — and, where the panel
 * can, fixable without leaving it.
 *
 * ## Why the fix is here and not a link
 *
 * The API refuses to activate a partner with no service zone, because dispatch
 * inner-joins `rider_zones` and an approved partner with no row there receives
 * no work, silently. The message is good. Acting on it was not: the operator
 * had to leave the queue, find the partner, open their record, assign a zone,
 * come back, find them again and approve. Five steps for a two-second
 * decision, on the highest-traffic screen in the panel.
 *
 * So the zone control is rendered inline and the approval is re-run
 * automatically once it saves. The operator clicks Approve, ticks a zone,
 * saves, and the partner is approved.
 *
 * ## Why only zones
 *
 * The other half of the blocker is a missing approved vehicle, and there is no
 * two-second version of that — a vehicle is documents, an inspection and a
 * separate review. Offering a control that cannot finish the job would be
 * worse than the link, so that case opens the partner's record instead.
 */
export function RiderActionError({
  riderId,
  riderStatus,
  riderName,
  error,
  busy,
  onRetry,
  onOpenRider,
}: {
  riderId: string;
  riderStatus: string;
  riderName: string;
  error: RowError;
  busy: boolean;
  onRetry: () => void;
  onOpenRider: () => void;
}) {
  const [fixing, setFixing] = useState(false);

  const gaps = error.gaps ?? [];
  const canFixHere = gaps.includes("zone");
  const vehicleOnly = gaps.length > 0 && !canFixHere;

  return (
    <div
      role="alert"
      className="animate-slide-in mt-2 border-l-2 border-danger pl-3"
    >
      {/* Named, because a screen reader reaches this out of the row's context
          and "This partner" would then refer to nothing. */}
      <p className="text-[13px] text-danger">
        <span className="sr-only">{riderName}: </span>
        {error.message}
      </p>

      {canFixHere && !fixing && (
        <GhostButton
          className="mt-2"
          disabled={busy}
          onClick={() => setFixing(true)}
        >
          Assign a zone
        </GhostButton>
      )}

      {vehicleOnly && (
        <GhostButton className="mt-2" disabled={busy} onClick={onOpenRider}>
          Open partner
        </GhostButton>
      )}

      {canFixHere && fixing && (
        <div className="mt-2 max-w-[420px]">
          <RiderZones
            riderId={riderId}
            riderStatus={riderStatus}
            inset
            onSaved={() => {
              // The blocker is gone, so finish what the operator asked for
              // rather than making them ask again. If something else is still
              // wrong, the next refusal lands in this same place and says so.
              setFixing(false);
              onRetry();
            }}
          />
          <GhostButton className="mt-2" onClick={() => setFixing(false)}>
            Cancel
          </GhostButton>
        </div>
      )}
    </div>
  );
}
