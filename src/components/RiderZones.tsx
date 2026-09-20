"use client";

import { useMemo, useState } from "react";
import { Card, GhostButton, SectionLabel } from "@/components/ui";
import { ApiError, api, type RiderZone, type Zone } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";

/**
 * Where a partner may work, and the only place it can be set.
 *
 * ## Why this exists
 *
 * Dispatch inner-joins `rider_zones`. A partner with no row there matches no
 * order at all — no offers, no error, nothing on any screen to explain it — so
 * the API refuses to activate one and says why: *"This partner has no service
 * zone assigned, so they would receive no work."*
 *
 * That refusal is correct and was unfixable. `POST /admin/riders/:id/zones` has
 * existed on the server all along and **nothing in this panel ever called it**,
 * so an operator met the message with no way to act on it and no partner could
 * be approved. This component is that missing half.
 *
 * ## Why a replace and not a toggle per row
 *
 * The endpoint replaces the whole set in one transaction, inserting before
 * deleting so a zone in both the old and new set is never momentarily absent —
 * a dispatch tick between the two statements would otherwise skip the partner
 * for a reason nobody could reconstruct afterwards. Sending one zone at a time
 * would give up that property for no gain.
 *
 * So the checkboxes are local until Save, and Save sends the full set.
 */
export function RiderZones({
  riderId,
  riderStatus,
  onSaved,
  /**
   * Matches the surrounding cards. The drawer stacks `tone="inset"` p-3 cards
   * and the full record uses plain p-5 ones; a card that picks its own would be
   * the one thing on either screen that does not belong to it.
   */
  inset = false,
}: {
  riderId: string;
  riderStatus: string;
  onSaved?: () => void;
  inset?: boolean;
}) {
  const { data: all, error: zonesError } = useAsync<{ results: Zone[] }>(
    () => api.zones(),
    [],
    { fallback: "Could not load the zone list." },
  );
  const {
    data: assigned,
    error: assignedError,
    reload: reloadAssigned,
  } = useAsync<{ results: RiderZone[] }>(
    () => api.riderZones(riderId),
    [riderId],
    { fallback: "Could not load this partner's zones." },
  );

  /**
   * What the operator has ticked, or null while they have not touched it.
   *
   * Derived rather than seeded from an effect. Copying the server's answer into
   * state on arrival means two sources of truth and a render where they
   * disagree — and it is the case React's own guidance names first: state that
   * can be computed from props should be computed, not synchronised.
   *
   * Null therefore means "whatever the server says", which also makes `dirty`
   * exact: there is no edit until somebody makes one, so a refetch that returns
   * the same set cannot be mistaken for a change.
   */
  const [edited, setEdited] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = useMemo(
    () => new Set((assigned?.results ?? []).map((z) => z.id)),
    [assigned],
  );
  const picked = edited ?? current;

  const loadError = zonesError ?? assignedError;

  // Only zones we still dispatch. The server refuses a retired one, and
  // offering it here would produce a save that reads as done and is refused.
  const selectable = (all?.results ?? []).filter((z) => z.isActive);

  const dirty =
    edited !== null &&
    (edited.size !== current.size || [...edited].some((id) => !current.has(id)));

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.setRiderZones(riderId, [...picked]);
      // Back to deriving from the server, then refetch so what is derived is
      // what was actually stored — the endpoint returns the resulting set, and
      // trusting the local copy would hide a zone the server dropped.
      setEdited(null);
      reloadAssigned();
      setSaved(true);
      // The partner's approvability just changed, so whatever is showing their
      // status needs to hear about it.
      onSaved?.();
    } catch (e) {
      setSaveError(
        e instanceof ApiError ? e.message : "Those zones could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone={inset ? "inset" : "default"} className={inset ? "p-3" : "p-5"}>
      <SectionLabel>Service zones</SectionLabel>

      <p className="mt-2 text-xs text-fg-muted">
        Where this partner receives work. A partner with no zone is matched to
        no orders and cannot be approved.
      </p>

      {loadError && <p className="mt-3 text-[13px] text-danger">{loadError}</p>}

      {!loadError && !assigned && (
        <p className="mt-3 text-[13px] text-fg-muted">Loading…</p>
      )}

      {!loadError && assigned && selectable.length === 0 && (
        // Not an empty checkbox list. There is nothing to tick and the reason
        // is somewhere else entirely, so say so rather than showing a control
        // that cannot be used.
        <p className="mt-3 text-[13px] text-fg-muted">
          No active zones exist yet. Create one under Pricing before approving
          partners.
        </p>
      )}

      {!loadError && assigned && selectable.length > 0 && (
        <>
          <ul className="mt-3 space-y-1.5">
            {selectable.map((zone) => {
              const on = picked.has(zone.id);
              return (
                <li key={zone.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={saving}
                      onChange={() => {
                        setSaved(false);
                        setEdited((prev) => {
                          const next = new Set(prev ?? current);
                          if (on) {
                            next.delete(zone.id);
                          } else {
                            next.add(zone.id);
                          }
                          return next;
                        });
                      }}
                      className="h-3.5 w-3.5 accent-ok"
                    />
                    <span>{zone.name}</span>
                    <span className="text-xs text-fg-muted">{zone.city}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          {/* Named before it is met, not after.

              The API refuses to remove the last zone from an active partner —
              dispatch would stop with nothing on screen to explain it, and
              suspending is the honest way to do that. Saying so here turns a
              refusal into a rule somebody already knew. */}
          {picked.size === 0 && riderStatus === "active" && (
            <p className="mt-3 text-[13px] text-danger">
              An active partner must keep at least one zone. To stop their work,
              suspend them instead.
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <GhostButton
              disabled={!dirty || saving}
              onClick={save}
              className="border-ok/50 text-ok hover:border-ok"
            >
              {saving ? "Saving…" : "Save zones"}
            </GhostButton>
            {saved && !dirty && (
              <span className="text-[13px] text-ok">Saved.</span>
            )}
            {dirty && !saving && (
              <span className="text-[13px] text-fg-muted">
                Unsaved changes.
              </span>
            )}
          </div>

          {saveError && (
            <p className="mt-3 text-[13px] text-danger">{saveError}</p>
          )}
        </>
      )}
    </Card>
  );
}
