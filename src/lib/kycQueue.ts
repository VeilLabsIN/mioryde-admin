import type { CountersignItem, KycPartnerGroup } from "@/lib/api";

/**
 * Turning the verification queues into something a reviewer can move through.
 *
 * Kept out of the page because a Next page module should export its component
 * and nothing else, and because this is the part with rules in it — what a
 * document is called, and what order a thousand of them are in. Both are
 * testable without a browser, and both have been wrong in production before.
 */

/**
 * The document's name, including which face of it this is.
 *
 * A licence and an Aadhaar are each uploaded as two objects, and the server
 * has said which is which since 0052 — the panel simply never read the field,
 * so the queue showed two rows reading "Driving licence" for the same partner
 * and a reviewer had to open both to tell them apart (A6).
 *
 * `single` adds nothing: most kinds have one face, and "Insurance — single"
 * is noise on every row of the queue to no benefit.
 */
export function documentLabel(label: string, side: string): string {
  if (side === "front") return `${label} — front`;
  if (side === "back") return `${label} — back`;
  return label;
}

/**
 * One row of the queue, flattened out of whatever shape its tab came in.
 *
 * The review queue arrives grouped by partner and the countersign queue
 * arrives flat, but a reviewer moving with `j` does not care about that — they
 * are moving through documents. Both tabs project onto this, so there is one
 * list to move through and one thing to open.
 */
export interface ReviewRow {
  documentId: string;
  /**
   * The server's kind slug, not the label.
   *
   * Carried because eligibility for a batch is a property of the kind, and
   * deciding it from the human label would mean matching on a translated,
   * reworded string — see `isBulkApprovable`.
   */
  kind: string;
  label: string;
  riderName: string;
  /** The line under the name: when it arrived, or who signed it first. */
  meta: string;
  expiryRequired: boolean;
  mode: "review" | "countersign";
}

/**
 * The review queue's partner groups, flattened in painted order.
 *
 * The order is the contract. The keyboard walks this list by index and the
 * cards are painted from the same array, so a row's position here has to be
 * its position on screen — otherwise `j` moves the highlight to one document
 * and Enter opens a different one, on a screen whose entire purpose is that
 * you approve the thing you looked at.
 */
export function flattenPartnerRows(
  partners: KycPartnerGroup[],
  describeAge: (iso: string) => string,
): ReviewRow[] {
  return partners.flatMap((partner) =>
    partner.documents.map((document) => ({
      documentId: document.id,
      kind: document.kind,
      label: documentLabel(document.label, document.side),
      riderName: partner.riderName,
      meta: `Uploaded ${describeAge(document.uploadedAt)}`,
      expiryRequired: document.expiryRequired,
      mode: "review" as const,
    })),
  );
}

/** The countersign queue, which is already one row per document. */
export function flattenCountersignRows(
  items: CountersignItem[],
  describeAge: (iso: string) => string,
): ReviewRow[] {
  return items.map((item) => ({
    documentId: item.id,
    kind: item.kind,
    label: documentLabel(item.label, item.side),
    riderName: item.riderName,
    meta: `First approved by ${item.firstReviewerName ?? "a colleague"} ${describeAge(item.firstReviewedAt)}`,
    expiryRequired: item.expiryRequired,
    mode: "countersign" as const,
  }));
}

/**
 * Where each partner's documents begin in the flattened list.
 *
 * The cards are painted per partner but the keyboard index is global, so each
 * card needs to know its offset. Computed up front rather than by incrementing
 * a counter while rendering — a counter mutated during render is read again on
 * the next render before it has been reset, and React is right to refuse it.
 */
export function partnerRowOffsets(partners: KycPartnerGroup[]): number[] {
  const offsets: number[] = [];
  let next = 0;
  for (const partner of partners) {
    offsets.push(next);
    next += partner.documents.length;
  }
  return offsets;
}

/**
 * A short relative time. Absolute dates make a queue harder to triage.
 *
 * `now` is a parameter so this is a function of its inputs and can be tested
 * without freezing the clock.
 */
export function formatWhen(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
