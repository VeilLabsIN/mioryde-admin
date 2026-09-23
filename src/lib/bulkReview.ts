import type { ReviewRow } from "@/lib/kycQueue";

/**
 * Which document kinds may be approved several at a time.
 *
 * ## Why this is one kind and not five
 *
 * The decision recorded against A10 was "non-identity kinds only" — Aadhaar,
 * PAN and driving licence keep their two signatures and stay one at a time,
 * which `DUAL_APPROVAL_KINDS` and the `rider_documents_dual_approval` CHECK
 * enforce on the server regardless of what this panel offers.
 *
 * That leaves the photo and the four vehicle papers. The vehicle papers all
 * expire, and an expiring document needs a date **read off that document** by
 * the reviewer — which is a separate answer per document, so approving twenty
 * of them together is twenty date fields and not a bulk action at all. It
 * would also be the exact failure A3 fixed: a date field that arrives with an
 * answer in it gets confirmed rather than read.
 *
 * So what is genuinely batchable is the kind that needs no second signature
 * and no typed answer: the profile photo. That is also the highest-volume item
 * in the queue — one per partner, every partner — which is why doing fifty of
 * them individually is the complaint this exists to answer.
 *
 * Expressed as a set rather than a literal so adding a kind later is a
 * one-line change with a test already pointed at it.
 */
export const BULK_APPROVABLE_KINDS = new Set<string>(["photo"]);

/**
 * Whether this row may be part of a batch.
 *
 * Three conditions, each of which alone is enough to refuse:
 *
 *   - **The kind.** Identity documents are excluded by the decision above.
 *   - **An expiry.** Belt and braces against a kind being added to the set
 *     without noticing it expires; the reviewer would then have no field to
 *     read the date into and the batch would file a document with none.
 *   - **The tab.** Countersigning is a second opinion on one colleague's one
 *     judgement. Approving thirty of those at once is the two-person rule
 *     performed rather than applied, and the whole point of §4.10 is that the
 *     second person actually looked.
 */
export function isBulkApprovable(row: ReviewRow): boolean {
  return (
    row.mode === "review" &&
    !row.expiryRequired &&
    BULK_APPROVABLE_KINDS.has(row.kind)
  );
}
