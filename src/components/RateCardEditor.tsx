"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, GhostButton, Input, SectionLabel } from "./ui";
import { useToast } from "./ToastProvider";
import {
  ApiError,
  type FarePreview,
  type RateCard,
  type VehicleType,
  type Zone,
  api,
  formatMoney,
} from "@/lib/api";
import {
  minorToRupeeInput,
  parseScaled,
  percentToBasisPoints,
  rupeesToMinor,
} from "@/lib/rupees";

/**
 * Publishing a fare.
 *
 * ## Why this is a form and not six inline cells
 *
 * A rate card is one decision made of six numbers. Editing them one at a time
 * would let an operator save a per-km rate they intended to pair with a lower
 * base, and the customer-facing price would be wrong for the seconds in
 * between — which for a live booking is not a rounding problem, it is a
 * different fare. The server publishes all six atomically; the form matches.
 *
 * ## Why the preview comes from the server
 *
 * The panel could add these numbers up itself. It deliberately does not: the
 * fare formula lives in one place (`FareCalculator`) because a second copy
 * drifts, and a *preview* that drifts is worse than none — it keeps looking
 * authoritative while being wrong. So the draft is priced by asking the same
 * calculator a customer's quote goes through.
 *
 * ## Why the old fare is shown beside the new one
 *
 * "Consequence in numbers, not adjectives" — the house rule from
 * `ActionPanel`. "This changes pricing" is a warning; "a 5 km delivery goes
 * ₹98.65 → ₹87.32" is a decision.
 */

/** The six numbers, as typed. Strings, because a half-typed "1." is a state. */
interface Draft {
  baseFare: string;
  perKm: string;
  perMinute: string;
  minFare: string;
  includedKm: string;
  gstPercent: string;
}

const BLANK: Draft = {
  baseFare: "0.00",
  perKm: "0.00",
  perMinute: "0.00",
  minFare: "0.00",
  includedKm: "0",
  gstPercent: "18",
};

function draftFrom(card: RateCard): Draft {
  return {
    baseFare: minorToRupeeInput(card.baseFare.minor),
    perKm: minorToRupeeInput(card.perKm.minor),
    perMinute: minorToRupeeInput(card.perMinute.minor),
    minFare: minorToRupeeInput(card.minFare.minor),
    includedKm: String(card.includedKm),
    // `gstPercent` arrives as a number like 18; trailing zeroes on a tax rate
    // read as precision nobody asked for.
    gstPercent: String(card.gstPercent),
  };
}

/** The parsed draft, or the first thing wrong with it. */
type Parsed =
  | {
      ok: true;
      values: {
        baseFare: number;
        perKm: number;
        perMinute: number;
        minFare: number;
        includedKm: number;
        gstBasisPoints: number;
      };
    }
  | { ok: false; errors: Partial<Record<keyof Draft, string>> };

function parseDraft(draft: Draft): Parsed {
  const errors: Partial<Record<keyof Draft, string>> = {};

  const money = (key: keyof Draft) => {
    const result = rupeesToMinor(draft[key]);
    if (!result.ok) errors[key] = result.error;
    return result.ok ? result.minor : 0;
  };

  const baseFare = money("baseFare");
  const perKm = money("perKm");
  const perMinute = money("perMinute");
  const minFare = money("minFare");

  const kmText = draft.includedKm.trim();
  let km = 0;
  if (!/^\d{1,3}$/.test(kmText)) {
    errors.includedKm = "Whole kilometres, 0–100.";
  } else {
    km = Number(kmText);
    if (km > 100) errors.includedKm = "At most 100 km.";
  }

  const gst = percentToBasisPoints(draft.gstPercent);
  if (!gst.ok) errors.gstPercent = gst.error;
  else if (gst.minor > 5000) errors.gstPercent = "At most 50%.";

  // The server's own rule, checked here so the operator learns it while both
  // numbers are still on screen rather than after a failed submit.
  if (!errors.minFare && !errors.baseFare && minFare > 0 && baseFare > minFare) {
    errors.minFare = "Must be at least the base fare, or 0 to disable it.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      baseFare,
      perKm,
      perMinute,
      minFare,
      includedKm: km,
      gstBasisPoints: gst.ok ? gst.minor : 1800,
    },
  };
}

/** Fields whose value differs from the card being replaced. */
function changedFields(current: RateCard | null, draft: Draft): string[] {
  if (!current) return [];
  const before = draftFrom(current);
  const labels: Record<keyof Draft, string> = {
    baseFare: "Base fare",
    perKm: "Per km",
    perMinute: "Per minute",
    minFare: "Minimum fare",
    includedKm: "Included km",
    gstPercent: "GST",
  };
  return (Object.keys(labels) as (keyof Draft)[])
    .filter((key) => {
      // Compared as parsed integers, so "18" and "18.00" are the same value
      // and re-publishing an untouched card is correctly offered as no change.
      const scale = (text: string) => {
        const parsed = key === "includedKm" ? null : parseScaled(text, 2);
        return parsed?.ok === true ? String(parsed.minor) : text.trim();
      };
      return scale(before[key]) !== scale(draft[key]);
    })
    .map((key) => `${labels[key]}: ${before[key]} → ${draft[key]}`);
}

function Field({
  label,
  hint,
  prefix,
  suffix,
  value,
  error,
  onChange,
}: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  value: string;
  error?: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro text-fg-faint">{label}</span>
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-meta text-fg-faint">
            {prefix}
          </span>
        )}
        <Input
          value={value}
          inputMode="decimal"
          // `type="text"`, not `number`: a number input silently drops what it
          // cannot parse, so a mistyped fare becomes an empty field with no
          // message, and the scroll wheel edits money.
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={`font-mono tabular-nums ${prefix ? "pl-7" : ""} ${
            suffix ? "pr-9" : ""
          } ${error ? "border-danger" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-meta text-fg-faint">
            {suffix}
          </span>
        )}
      </span>
      {error ? (
        <span className="mt-1 block text-meta text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-meta text-fg-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export function RateCardEditor({
  current,
  zone,
  vehicle,
  zones,
  vehicles,
  liveCards,
  onCancel,
  onPublished,
}: {
  /** The live card being superseded, or null when there is none yet. */
  current: RateCard | null;
  /** Fixed when editing; chosen by the operator when creating. */
  zone: { id: string; name: string; city: string } | null;
  vehicle: { id: string; name: string; code: string } | null;
  zones: Zone[];
  vehicles: VehicleType[];
  /**
   * Every card currently in force. Only read when creating: it is how the form
   * notices that the pair being "created" already has a live fare, which the
   * server would supersede without complaint.
   */
  liveCards: RateCard[];
  onCancel: () => void;
  onPublished: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    current ? draftFrom(current) : BLANK,
  );
  const [zoneId, setZoneId] = useState(zone?.id ?? "");
  const [vehicleTypeId, setVehicleTypeId] = useState(vehicle?.id ?? "");
  const [sample, setSample] = useState({ km: "5", minutes: "15" });
  const [preview, setPreview] = useState<{
    /**
     * The inputs this price was computed from.
     *
     * Kept so a stale answer can be *withheld* rather than shown while a newer
     * request is in flight. On a pricing form the wrong number briefly is the
     * failure mode to design against — nobody re-reads a figure that already
     * looked plausible.
     */
    key: string;
    before: FarePreview | null;
    after: FarePreview;
  } | null>(null);
  // Distinct from "no price yet". Without it a failed preview leaves
  // "Pricing…" on screen for ever, which reads as a slow server rather than a
  // dead one and quietly invites the operator to wait instead of publishing.
  const [previewFailed, setPreviewFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const firstField = useRef<HTMLDivElement>(null);

  /**
   * Re-initialise when the card being edited changes.
   *
   * `useState` initialisers run once per *instance*, and React keeps the
   * instance when the same component is rendered in the same position — so
   * clicking Change on a second vehicle in the same zone reused the first
   * card's draft, and the operator edited the 8ft Truck through the
   * 2-Wheeler's numbers. Publishing that would have written one card's amounts
   * onto another card's zone and vehicle, with a preview and a diff line that
   * both looked entirely reasonable.
   *
   * The caller could pass a `key` instead, and the pricing page did. This lives
   * here because correctness should not depend on every future call site
   * remembering one — the throwaway harness that found this rendered two
   * editors with no key at all, which is exactly the mistake being guarded
   * against.
   *
   * Adjusting state during render, which React supports for precisely this:
   * cheaper than an effect, which would paint the stale numbers once first.
   */
  const editing = current?.id ?? "new";
  const [seenEditing, setSeenEditing] = useState(editing);
  if (seenEditing !== editing) {
    setSeenEditing(editing);
    setDraft(current ? draftFrom(current) : BLANK);
    setZoneId(zone?.id ?? "");
    setVehicleTypeId(vehicle?.id ?? "");
    // A confirmation belongs to the card it was raised for, and a price to the
    // amounts it was computed from. Neither survives the switch.
    setConfirming(false);
    setPreview(null);
    setPreviewFailed(false);
    setError(null);
  }

  /**
   * Every change to the numbers goes through here.
   *
   * Editing withdraws a confirmation that is already open — otherwise an
   * operator can reach the confirm step, correct a digit, and publish a card
   * whose consequence they were never shown.
   */
  function edit(next: Draft) {
    setDraft(next);
    setConfirming(false);
  }

  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const changes = useMemo(() => changedFields(current, draft), [current, draft]);

  /**
   * A live card for the pair the operator picked while creating a "new" one.
   *
   * The server supersedes it silently and correctly — but "new rate card" and
   * "replace the fare this vehicle is being booked at right now" are different
   * intentions, and only one of them was expressed.
   */
  const collision =
    current === null && zoneId && vehicleTypeId
      ? (liveCards.find(
          (card) => card.zone.id === zoneId && card.vehicle.id === vehicleTypeId,
        ) ?? null)
      : null;
  const target =
    current === null && (!zoneId || !vehicleTypeId)
      ? "Choose a zone and a vehicle."
      : null;

  // Escape leaves the editor. An ops panel is used by people whose hands are
  // already on the keyboard, and a form with no way out but the mouse is the
  // reason A11 is on the list.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  useEffect(() => {
    firstField.current?.querySelector("input")?.focus();
  }, []);

  const distanceKm = Number(sample.km);
  const minutes = Number(sample.minutes);
  const sampleOk =
    Number.isFinite(distanceKm) &&
    Number.isFinite(minutes) &&
    distanceKm >= 0 &&
    distanceKm <= 500 &&
    minutes >= 0 &&
    minutes <= 1440;

  /** What the draft is replacing, if anything. */
  const baseline = current ?? collision;

  // Identifies exactly what a displayed price describes. Anything that moves
  // a fare is in it.
  const previewKey = JSON.stringify([draft, sample, baseline?.id ?? null]);
  const priced = preview?.key === previewKey ? preview : null;

  useEffect(() => {
    if (!parsed.ok || !sampleOk) return;
    let cancelled = false;
    // Debounced: this fires on every keystroke in six fields, and the answer
    // for a half-typed number is not worth a round trip.
    const timer = setTimeout(() => {
      const after = api.previewFare({ ...parsed.values, distanceKm, minutes });
      // Priced against whatever this is actually replacing — the card being
      // edited, or the one a "new" card has landed on top of.
      const before = baseline
        ? api.previewFare({
            baseFare: baseline.baseFare.minor,
            perKm: baseline.perKm.minor,
            perMinute: baseline.perMinute.minor,
            minFare: baseline.minFare.minor,
            includedKm: baseline.includedKm,
            gstBasisPoints: Math.round(baseline.gstPercent * 100),
            distanceKm,
            minutes,
          })
        : Promise.resolve(null);

      Promise.all([before, after])
        .then(([b, a]) => {
          if (cancelled) return;
          setPreview({ key: previewKey, before: b, after: a });
          setPreviewFailed(false);
        })
        .catch(() => {
          // A failed preview must not block publishing — the server validates
          // the real thing anyway, and a dead preview that also disabled the
          // form would turn a cosmetic outage into an operational one.
          if (!cancelled) setPreviewFailed(true);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [parsed, sampleOk, distanceKm, minutes, baseline, previewKey]);

  async function publish() {
    if (!parsed.ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.publishRateCard({
        zoneId: zoneId || zone?.id || "",
        vehicleTypeId: vehicleTypeId || vehicle?.id || "",
        ...parsed.values,
      });
      toast.success(
        `New rates are live for ${vehicleName(vehicles, vehicleTypeId, vehicle)}.`,
      );
      onPublished();
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not publish. Nothing was changed.",
      );
      setBusy(false);
      setConfirming(false);
    }
  }

  const errors = parsed.ok ? {} : parsed.errors;
  const blocked = !parsed.ok || Boolean(target) || busy;

  return (
    <Card tone="raised" className="mb-4 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="text-label font-medium text-fg">
          {current ? "Change" : "New rate card"}
          {current && (
            <span className="ml-2 font-mono text-meta text-fg-faint">
              {current.vehicle.name} · {current.zone.city} — {current.zone.name}
            </span>
          )}
        </h3>
        <span className="text-meta text-fg-faint">Esc to cancel</span>
      </div>

      {current === null && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-micro text-fg-faint">Zone</span>
            <select
              value={zoneId}
              onChange={(e) => {
                setZoneId(e.target.value);
                setConfirming(false);
              }}
              className="motion-change h-10 w-full rounded-xs border border-edge bg-panel px-3 font-sans text-body text-fg focus:border-accent"
            >
              <option value="">Choose…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.city} — {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-micro text-fg-faint">Vehicle</span>
            <select
              value={vehicleTypeId}
              onChange={(e) => {
                setVehicleTypeId(e.target.value);
                setConfirming(false);
              }}
              className="motion-change h-10 w-full rounded-xs border border-edge bg-panel px-3 font-sans text-body text-fg focus:border-accent"
            >
              <option value="">Choose…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.capacityLabel ? ` · ${v.capacityLabel}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {collision && (
        <Card tone="warning" className="mb-4 px-4 py-3">
          <p className="mb-1 text-body text-fg-mid">
            This zone and vehicle already have a live card —{" "}
            <span className="font-mono">
              {formatMoney(collision.baseFare, { alwaysShowDecimals: true })}{" "}
              base, {formatMoney(collision.perKm, { alwaysShowDecimals: true })}
              /km
            </span>
            . Publishing replaces it.
          </p>
          <GhostButton
            className="mt-1 h-7 px-2 text-meta"
            onClick={() => edit(draftFrom(collision))}
          >
            Start from its current values
          </GhostButton>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div ref={firstField} className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Base fare"
              prefix="₹"
              value={draft.baseFare}
              error={errors.baseFare}
              onChange={(v) => edit({ ...draft, baseFare: v })}
            />
            <Field
              label="Per km"
              prefix="₹"
              value={draft.perKm}
              error={errors.perKm}
              onChange={(v) => edit({ ...draft, perKm: v })}
            />
            <Field
              label="Per minute"
              prefix="₹"
              value={draft.perMinute}
              error={errors.perMinute}
              onChange={(v) => edit({ ...draft, perMinute: v })}
            />
            <Field
              label="Minimum fare"
              prefix="₹"
              hint="0 disables the floor"
              value={draft.minFare}
              error={errors.minFare}
              onChange={(v) => edit({ ...draft, minFare: v })}
            />
            <Field
              label="Included km"
              suffix="km"
              hint="Charged beyond this"
              value={draft.includedKm}
              error={errors.includedKm}
              onChange={(v) => edit({ ...draft, includedKm: v })}
            />
            <Field
              label="GST"
              suffix="%"
              value={draft.gstPercent}
              error={errors.gstPercent}
              onChange={(v) => edit({ ...draft, gstPercent: v })}
            />
          </div>

          {current && changes.length > 0 && (
            <div className="mt-4">
              <SectionLabel>Changing</SectionLabel>
              <ul className="space-y-1">
                {changes.map((line) => (
                  <li key={line} className="font-mono text-meta text-fg-mid">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Card tone="inset" className="p-4">
          <SectionLabel>A sample delivery</SectionLabel>
          <div className="mb-3 flex items-center gap-2">
            <Input
              value={sample.km}
              inputMode="decimal"
              aria-label="Sample distance in kilometres"
              onChange={(e) => setSample({ ...sample, km: e.target.value })}
              className="h-8 w-16 font-mono tabular-nums"
            />
            <span className="text-meta text-fg-faint">km</span>
            <Input
              value={sample.minutes}
              inputMode="decimal"
              aria-label="Sample duration in minutes"
              onChange={(e) => setSample({ ...sample, minutes: e.target.value })}
              className="h-8 w-16 font-mono tabular-nums"
            />
            <span className="text-meta text-fg-faint">min</span>
          </div>

          {!sampleOk ? (
            <p className="text-meta text-fg-faint">
              Up to 500 km and 1440 minutes.
            </p>
          ) : priced === null ? (
            <p className="text-meta text-fg-faint">
              {!parsed.ok
                ? "Fix the fields to see a price."
                : previewFailed
                  ? "The server could not price this. Publishing still works — it validates the amounts itself."
                  : "Pricing…"}
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-baseline gap-2">
                {priced.before && (
                  <>
                    <span className="font-mono text-label tabular-nums text-fg-faint line-through">
                      {formatMoney(priced.before.total, {
                        alwaysShowDecimals: true,
                      })}
                    </span>
                    <span className="text-meta text-fg-faint">→</span>
                  </>
                )}
                <span className="font-mono text-figure tabular-nums text-accent">
                  {formatMoney(priced.after.total, {
                    alwaysShowDecimals: true,
                  })}
                </span>
              </div>
              <dl className="space-y-1">
                {(
                  [
                    ["Base", priced.after.base],
                    ["Distance", priced.after.distance],
                    ["Time", priced.after.time],
                    ["GST", priced.after.tax],
                  ] as const
                ).map(([label, amount]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-meta text-fg-faint">{label}</dt>
                    <dd className="font-mono text-meta tabular-nums text-fg-mid">
                      {formatMoney(amount, { alwaysShowDecimals: true })}
                    </dd>
                  </div>
                ))}
              </dl>
              {priced.after.minFareApplied && (
                <p className="mt-3 text-meta text-warn">
                  Held up to the minimum fare, so the parts above do not sum to
                  the total.
                </p>
              )}
              <p className="mt-3 text-meta leading-relaxed text-fg-faint">
                Priced by the server, through the same calculator a customer is
                quoted with. No surge, no coupon.
              </p>
            </>
          )}
        </Card>
      </div>

      {error && (
        <p className="mt-4 text-body text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {confirming ? (
          <>
            <Button onClick={publish} loading={busy}>
              Yes, publish
            </Button>
            <GhostButton onClick={() => setConfirming(false)} disabled={busy}>
              Back
            </GhostButton>
            <p className="text-meta text-fg-mid">
              {current
                ? "The current card stops applying now. Deliveries already placed keep their price."
                : "This becomes the live fare for this zone and vehicle immediately."}
            </p>
          </>
        ) : (
          <>
            <Button
              onClick={() => setConfirming(true)}
              disabled={blocked || (current !== null && changes.length === 0)}
            >
              Publish new rates
            </Button>
            <GhostButton onClick={onCancel}>Cancel</GhostButton>
            {target ? (
              <p className="text-meta text-fg-faint">{target}</p>
            ) : current !== null && changes.length === 0 ? (
              <p className="text-meta text-fg-faint">Nothing has changed yet.</p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function vehicleName(
  vehicles: VehicleType[],
  id: string,
  fallback: { name: string } | null,
): string {
  return vehicles.find((v) => v.id === id)?.name ?? fallback?.name ?? "this vehicle";
}
