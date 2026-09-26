import type { VehicleType } from "@/lib/api";

/**
 * Why a vehicle class cannot be switched on yet, or null when it can.
 *
 * Live means the customer home screen lists it and partners can onboard with
 * it. Without a rate card it would be listed with no fare behind it (quotes
 * skip unpriced classes), and without a weight limit orders could not be
 * checked against it.
 */
export function activationBlocker(
  vehicle: Pick<VehicleType, "maxWeightKg">,
  pricedZones: number,
): string | null {
  if (pricedZones === 0) {
    return "Publish a rate card for this vehicle in at least one zone first.";
  }
  if (vehicle.maxWeightKg === null) {
    return "Set its maximum load first.";
  }
  return null;
}
