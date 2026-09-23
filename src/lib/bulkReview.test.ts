import { describe, expect, it } from "vitest";
import { BULK_APPROVABLE_KINDS, isBulkApprovable } from "@/lib/bulkReview";
import type { ReviewRow } from "@/lib/kycQueue";

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  documentId: "d1",
  kind: "photo",
  label: "Profile photo",
  riderName: "A partner",
  meta: "Uploaded today",
  expiryRequired: false,
  mode: "review",
  ...over,
});

describe("what may be approved in a batch", () => {
  it("takes the profile photo", () => {
    expect(isBulkApprovable(row())).toBe(true);
  });

  it("never takes an identity document", () => {
    // §4.10: two signatures, from two people, one document at a time. The
    // server enforces this too — this keeps the panel from offering something
    // it would then be refused for, and from implying the rule is negotiable.
    for (const kind of ["aadhaar", "pan", "driving_licence"]) {
      expect(BULK_APPROVABLE_KINDS.has(kind)).toBe(false);
      expect(isBulkApprovable(row({ kind }))).toBe(false);
    }
  });

  it("never takes a document whose expiry has to be read off it", () => {
    // Guards a future addition to the set: a batch has nowhere to type a date,
    // so it would file the document with none.
    expect(isBulkApprovable(row({ expiryRequired: true }))).toBe(false);
    for (const kind of [
      "insurance",
      "registration_certificate",
      "commercial_permit",
      "fitness_puc",
    ]) {
      expect(isBulkApprovable(row({ kind, expiryRequired: true }))).toBe(false);
    }
  });

  it("never takes a countersignature", () => {
    expect(isBulkApprovable(row({ mode: "countersign" }))).toBe(false);
  });

  it("does not take a kind it has never heard of", () => {
    expect(isBulkApprovable(row({ kind: "passport" }))).toBe(false);
  });
});
