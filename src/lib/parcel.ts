import { type OrderDetail, formatMoney } from "@/lib/api";

/**
 * One line for what a customer declared they were sending.
 *
 * "up to", because the weight is the customer's word and the top of the band
 * they picked, not a scale reading — an operator settling a "goods do not fit"
 * report needs to see it as a claim. Null when nothing was declared, which is
 * every order placed before migration 0056 and must not read as "0 kg".
 */
export function describeParcel(parcel: OrderDetail["parcel"]): string | null {
  if (!parcel) return null;
  const items = parcel.count === 1 ? "1 item" : `${parcel.count} items`;
  const parts = [`up to ${parcel.weightKg} kg`, items];
  if (parcel.declaredValue) {
    parts.push(`worth ${formatMoney(parcel.declaredValue)}`);
  }
  return parts.join(" · ");
}
