import { describe, expect, it } from "vitest";
import type { CountersignItem, KycPartnerGroup } from "@/lib/api";
import {
  documentLabel,
  flattenCountersignRows,
  flattenPartnerRows,
  formatWhen,
  partnerRowOffsets,
} from "./kycQueue";

/** A stand-in for the relative time, so the assertions are about order. */
const age = () => "1h ago";

function partner(
  riderId: string,
  documents: Array<{ id: string; label?: string; side?: string }>,
): KycPartnerGroup {
  return {
    riderId,
    riderName: `Partner ${riderId}`,
    riderStage: "kyc_submitted",
    oldestUploadedAt: "2026-09-01T10:00:00.000Z",
    approvedCount: 0,
    awaitingSecondCount: 0,
    documents: documents.map((document) => ({
      id: document.id,
      kind: "driving_licence",
      label: document.label ?? "Driving licence",
      side: document.side ?? "single",
      status: "under_review",
      uploadedAt: "2026-09-01T10:00:00.000Z",
      expiryRequired: true,
    })),
  };
}

describe("what a document is called", () => {
  it("names the face, so front and back are not two identical rows", () => {
    expect(documentLabel("Driving licence", "front")).toBe(
      "Driving licence — front",
    );
    expect(documentLabel("Driving licence", "back")).toBe(
      "Driving licence — back",
    );
  });

  it("says nothing about a document with only one face", () => {
    // "Insurance — single" is noise on every row to no benefit.
    expect(documentLabel("Insurance", "single")).toBe("Insurance");
  });

  it("leaves an unrecognised side alone rather than inventing a suffix", () => {
    expect(documentLabel("Insurance", "")).toBe("Insurance");
  });
});

describe("the order the keyboard moves through", () => {
  it("flattens partners in the order they are painted", () => {
    const rows = flattenPartnerRows(
      [
        partner("r1", [{ id: "d1" }, { id: "d2" }]),
        partner("r2", [{ id: "d3" }]),
      ],
      age,
    );

    expect(rows.map((row) => row.documentId)).toEqual(["d1", "d2", "d3"]);
  });

  it("keeps a partner's documents together", () => {
    const rows = flattenPartnerRows(
      [partner("r1", [{ id: "d1" }]), partner("r2", [{ id: "d2" }])],
      age,
    );

    expect(rows.map((row) => row.riderName)).toEqual([
      "Partner r1",
      "Partner r2",
    ]);
  });

  it("gives every row the mode its queue decides with", () => {
    // The drawer sends an approval to one of two different endpoints on the
    // strength of this. Getting it wrong would countersign a document nobody
    // had reviewed once.
    const rows = flattenPartnerRows([partner("r1", [{ id: "d1" }])], age);
    expect(rows[0]!.mode).toBe("review");
  });

  it("is empty for an empty queue", () => {
    expect(flattenPartnerRows([], age)).toEqual([]);
  });
});

describe("where each partner's rows begin", () => {
  it("offsets each card by everything painted above it", () => {
    const partners = [
      partner("r1", [{ id: "d1" }, { id: "d2" }]),
      partner("r2", [{ id: "d3" }]),
      partner("r3", [{ id: "d4" }, { id: "d5" }, { id: "d6" }]),
    ];

    expect(partnerRowOffsets(partners)).toEqual([0, 2, 3]);
  });

  it("agrees with the flattened list, which is the whole point", () => {
    // If these two ever disagree, `j` highlights one document and Enter opens
    // another — on the one screen where approving what you did not look at is
    // the failure it exists to prevent.
    const partners = [
      partner("r1", [{ id: "d1" }, { id: "d2" }]),
      partner("r2", [{ id: "d3" }]),
    ];
    const rows = flattenPartnerRows(partners, age);
    const offsets = partnerRowOffsets(partners);

    partners.forEach((group, index) => {
      group.documents.forEach((document, at) => {
        expect(rows[offsets[index]! + at]!.documentId).toBe(document.id);
      });
    });
  });

  it("does not skip a partner with nothing waiting", () => {
    // The server does not return one, but an offset list that silently
    // shortened would shift every card below it.
    const partners = [
      partner("r1", [{ id: "d1" }]),
      partner("r2", []),
      partner("r3", [{ id: "d2" }]),
    ];

    expect(partnerRowOffsets(partners)).toEqual([0, 1, 1]);
  });

  it("is empty for an empty queue", () => {
    expect(partnerRowOffsets([])).toEqual([]);
  });
});

describe("the countersign queue, which stays flat", () => {
  const item: CountersignItem = {
    id: "d1",
    kind: "driving_licence",
    label: "Driving licence",
    side: "back",
    riderId: "r1",
    riderName: "A partner",
    expiryRequired: true,
    firstReviewerName: "Priya",
    firstReviewedAt: "2026-09-01T10:00:00.000Z",
  };

  it("names the first reviewer, because that is who this is a check on", () => {
    const [row] = flattenCountersignRows([item], age);
    expect(row!.meta).toContain("Priya");
    expect(row!.mode).toBe("countersign");
  });

  it("still says so when the first reviewer's name is missing", () => {
    // A deactivated admin leaves a null name. "First approved by null" is
    // worse than saying nothing about who.
    const [row] = flattenCountersignRows(
      [{ ...item, firstReviewerName: null }],
      age,
    );
    expect(row!.meta).toContain("a colleague");
    expect(row!.meta).not.toContain("null");
  });

  it("labels the side here too", () => {
    const [row] = flattenCountersignRows([item], age);
    expect(row!.label).toBe("Driving licence — back");
  });
});

describe("how long something has been waiting", () => {
  const now = Date.parse("2026-09-23T12:00:00.000Z");

  it("reads as a queue, not as a calendar", () => {
    expect(formatWhen("2026-09-23T11:59:40.000Z", now)).toBe("just now");
    expect(formatWhen("2026-09-23T11:30:00.000Z", now)).toBe("30m ago");
    expect(formatWhen("2026-09-23T06:00:00.000Z", now)).toBe("6h ago");
    expect(formatWhen("2026-09-20T12:00:00.000Z", now)).toBe("3d ago");
  });

  it("returns nothing for a date it cannot read", () => {
    // Rather than "NaNm ago" on a row somebody has to triage.
    expect(formatWhen("not a date", now)).toBe("");
  });
});
