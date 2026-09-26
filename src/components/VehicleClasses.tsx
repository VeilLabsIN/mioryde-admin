"use client";

import { useState } from "react";
import { Card, GhostButton, Input, SectionLabel } from "@/components/ui";
import { type RateCard, type VehicleType, ApiError, api } from "@/lib/api";
import { activationBlocker } from "@/lib/vehicleClasses";

/**
 * Each vehicle class's weight limit, and whether it is live.
 *
 * Exists because a new class (the 3-Wheeler, migration 0056) is created
 * switched off and unpriced, and nothing in the panel could switch one on —
 * the vehicle-type endpoint had no caller. The order is fixed: publish a rate
 * card for it in each zone, *then* switch it on. Switching on an unpriced class
 * would show it on the customer home screen with no fare behind it, so the
 * button refuses until at least one zone has a card.
 */
export function VehicleClasses({
  vehicles,
  liveCards,
  onChanged,
}: {
  vehicles: VehicleType[];
  liveCards: RateCard[];
  onChanged: () => void;
}) {
  return (
    <section className="mb-8">
      <SectionLabel>Vehicle classes</SectionLabel>
      <Card className="divide-y divide-edge">
        {vehicles.map((v) => (
          <VehicleRow
            key={v.id}
            vehicle={v}
            pricedZones={
              new Set(
                liveCards
                  .filter((c) => c.vehicle.id === v.id)
                  .map((c) => c.zone.id),
              ).size
            }
            onChanged={onChanged}
          />
        ))}
      </Card>
    </section>
  );
}

function VehicleRow({
  vehicle,
  pricedZones,
  onChanged,
}: {
  vehicle: VehicleType;
  pricedZones: number;
  onChanged: () => void;
}) {
  const [limit, setLimit] = useState(
    vehicle.maxWeightKg === null ? "" : String(vehicle.maxWeightKg),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number.parseInt(limit, 10);
  const limitValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 50_000;
  const limitChanged = limitValid && parsed !== vehicle.maxWeightKg;
  const blocker = activationBlocker(vehicle, pricedZones);

  async function save(change: { isActive?: boolean; maxWeightKg?: number }) {
    setBusy(true);
    setError(null);
    try {
      await api.updateVehicleType({
        code: vehicle.code,
        name: vehicle.name,
        ...change,
      });
      onChanged();
    } catch (e: unknown) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[160px] flex-1">
        <p className="text-body font-semibold text-fg">
          {vehicle.name}{" "}
          <span className="font-mono text-micro text-fg-faint">{vehicle.code}</span>
        </p>
        <p className="text-micro text-fg-muted">
          {vehicle.isActive ? "Live" : "Off"} · priced in {pricedZones}{" "}
          {pricedZones === 1 ? "zone" : "zones"}
        </p>
      </div>
      <label className="flex items-center gap-2 text-micro text-fg-faint">
        Max kg
        <Input
          className="w-24 text-right font-mono"
          inputMode="numeric"
          value={limit}
          onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
          aria-label={`Maximum load for ${vehicle.name}, in kilograms`}
        />
      </label>
      <GhostButton
        disabled={busy || !limitChanged}
        onClick={() => void save({ maxWeightKg: parsed })}
      >
        Save limit
      </GhostButton>
      <GhostButton
        disabled={busy || (!vehicle.isActive && blocker !== null)}
        title={!vehicle.isActive ? (blocker ?? undefined) : undefined}
        onClick={() => void save({ isActive: !vehicle.isActive })}
      >
        {vehicle.isActive ? "Switch off" : "Switch on"}
      </GhostButton>
      {!vehicle.isActive && blocker && (
        <p className="w-full text-micro text-warn">{blocker}</p>
      )}
      {error && <p className="w-full text-micro text-danger">{error}</p>}
    </div>
  );
}
