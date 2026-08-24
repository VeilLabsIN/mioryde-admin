/**
 * How a partner's status is named and coloured, in one place.
 *
 * ## Why this was extracted
 *
 * The list page held its own `STATUS_LABEL` and `STATUS_STYLE` maps, and they
 * were missing `doc_expired` — a status `document-expiry.worker.ts` has been
 * writing since migration 0015. So a partner suspended by the expiry sweep
 * rendered in the panel as the literal string `doc_expired`, in the fallback
 * grey, and could not be filtered for at all.
 *
 * That is the exact drift a second copy guarantees. The drawer needed the same
 * two maps, and adding a third copy would have made it worse.
 *
 * ## Keep this in step with the database, not with memory
 *
 * The authoritative list is the CHECK constraint on `riders.status` in
 * `migrations/0015_rider_kyc.sql`:
 *
 *     'pending_kyc', 'active', 'suspended', 'rejected', 'doc_expired'
 *
 * `riderStatusLabel` still falls back to the raw value rather than throwing —
 * an unrecognised status must render as itself, not as blank or as a guess.
 * An operator seeing an odd word can ask; an operator seeing "Active" for a
 * status that is not active acts on it.
 */

const LABELS: Record<string, string> = {
  active: "Active",
  pending_kyc: "Awaiting review",
  suspended: "Suspended",
  rejected: "Rejected",
  // Deliberately not "Suspended". The sweep took this partner off duty for a
  // lapsed licence or insurance, and the fix is a document rather than a
  // conversation — naming it the same as a misconduct suspension sends the
  // operator down the wrong path.
  doc_expired: "Documents expired",
};

const STYLES: Record<string, string> = {
  active: "text-ok border-ok/40",
  pending_kyc: "text-warn border-warn/40",
  suspended: "text-danger border-danger/40",
  rejected: "text-fg-faint border-edge",
  // Warn, not danger. This partner has done nothing wrong and is one approved
  // upload away from working again.
  doc_expired: "text-warn border-warn/40",
};

export function riderStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}

export function riderStatusStyle(status: string): string {
  return STYLES[status] ?? "border-edge text-fg-muted";
}

/** The filter chips on the partners list, in the order they are most used. */
export const RIDER_FILTERS = [
  { value: "pending_kyc", label: "Awaiting review" },
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  // Added with this extraction. Partners in this state are precisely the ones
  // an operator goes looking for when somebody calls to say they have stopped
  // receiving jobs, and there was no way to list them.
  { value: "doc_expired", label: "Documents expired" },
  { value: "suspended", label: "Suspended" },
] as const;
