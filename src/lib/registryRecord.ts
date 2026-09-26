/**
 * The Parivahan record, in words a reviewer reads at a glance.
 *
 * Pure, so the wording and the blind re-key rule are testable without a
 * browser. The record is evidence next to the photograph — never a verdict —
 * and nothing here approves or rejects anything.
 */
import type { RecordCheck } from "@/lib/api";

const FLAG_TEXT: Record<string, string> = {
  dl_expired: "Licence expired on the registry",
  dl_class_mismatch: "Licence class does not cover the vehicle",
  name_mismatch: "Name differs from the account",
  rc_not_active: "RC not active",
  rc_blacklisted: "RC blacklisted",
  insurance_expired: "Insurance expired on the registry",
  puc_expired: "PUC expired on the registry",
  not_commercial: "Registered as a private vehicle",
  class_mismatch: "Registered class does not match the vehicle type",
  owner_differs: "Registered owner differs",
};

export function flagText(flag: string): string {
  return FLAG_TEXT[flag] ?? flag.replaceAll("_", " ");
}

export function statusText(check: RecordCheck | null): string {
  switch (check?.status) {
    case undefined:
      return "Not checked yet";
    case "pending":
      return "Checking…";
    case "found":
      return "Found on Parivahan";
    case "not_found":
      return "Not found on Parivahan";
    default:
      return "Lookup failed — check the photograph";
  }
}

export function scoreText(
  score: number | null,
  threshold: number,
): string | null {
  if (score === null) return null;
  return score >= threshold
    ? `Name matches (${score}/100)`
    : `Name differs (${score}/100)`;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The latest validity date on a licence record, or null. */
export function licenceValidUntil(check: RecordCheck | null): string | null {
  if (check?.status !== "found") return null;
  const dates = [
    str(check.facts["nonTransportUntil"]),
    str(check.facts["transportUntil"]),
  ].filter((d): d is string => d !== null);
  if (dates.length === 0) return null;
  return [...dates].sort()[dates.length - 1] ?? null;
}

/**
 * Whether what the reviewer typed disagrees with the registry.
 *
 * Only ever evaluated **after** the reviewer has typed their own reading: the
 * expiry is re-keyed blind from the photograph, and showing the registry's
 * date first would turn a check into copying. Null means nothing to say — no
 * reading yet, or no registry date.
 */
export function expiryDisagreement(
  typed: string,
  check: RecordCheck | null,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(typed)) return null;
  const registry = licenceValidUntil(check);
  if (registry === null || registry === typed) return null;
  return registry;
}

/** The licence facts safe to show before the blind re-key: no dates. */
export function licenceFactLines(check: RecordCheck): string[] {
  if (check.status !== "found") return [];
  const classes = Array.isArray(check.facts["classes"])
    ? (check.facts["classes"] as unknown[]).filter(
        (c): c is string => typeof c === "string",
      )
    : [];
  const name = str(check.facts["name"]);
  return [
    ...(name ? [`Name on licence: ${name}`] : []),
    ...(classes.length > 0 ? [`Classes: ${classes.join(", ")}`] : []),
  ];
}

/** The facts worth a line on the vehicle card, in reading order. */
export function vehicleFactLines(check: RecordCheck): string[] {
  if (check.status !== "found") return [];
  const f = check.facts;
  const lines: string[] = [];
  const maker = str(f["makerModel"]);
  const cls = str(f["vehicleClass"]);
  if (maker || cls) lines.push([maker, cls].filter(Boolean).join(" · "));
  const owner = str(f["ownerName"]);
  if (owner) lines.push(`Registered owner: ${owner}`);
  const gross = num(f["grossWeightKg"]);
  const unladen = num(f["unladenWeightKg"]);
  if (gross !== null) {
    lines.push(
      unladen !== null
        ? `Gross ${gross} kg · unladen ${unladen} kg · carries about ${gross - unladen} kg`
        : `Gross ${gross} kg`,
    );
  }
  if (f["isCommercial"] === true) lines.push("Commercial registration");
  const insurance = str(f["insuranceUntil"]);
  if (insurance) lines.push(`Insured until ${insurance}`);
  const puc = str(f["pucUntil"]);
  if (puc) lines.push(`PUC until ${puc}`);
  return lines;
}
