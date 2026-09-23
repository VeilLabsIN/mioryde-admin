import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const sheet = read("components/PhotoContactSheet.tsx");
const page = read("app/(panel)/kyc/page.tsx");

/**
 * A10. Batch approval is the one change on this screen that could quietly
 * weaken it, so what is asserted here is the safety, not the feature.
 */
describe("approving photos together", () => {
  it("still requires each photo to have actually appeared", () => {
    // The same gate one document gets, applied per photo: `rendered` is set
    // from the image's own onLoad, and only rendered photos are approved.
    expect(sheet).toContain("onLoad=");
    expect(sheet).toContain("s.rendered && !s.outcome");
    expect(sheet).toContain("disabled={busy || ready.length === 0}");
  });

  it("records an access for every photo it displays", () => {
    // §13.12. The reviewer asked to look at these, so the row is the truth.
    expect(sheet).toContain("api.viewKycDocument(row.documentId)");
  });

  it("goes through the single-document endpoint, not a batch one", () => {
    // Compare-and-set, the audit row and the two-person routing all live
    // there; a second write path would be a second place to get them wrong.
    expect(sheet).toContain(
      'api.reviewKycDocument(sheet.row.documentId, "approve")',
    );
    expect(sheet).not.toContain("bulkApprove");
  });

  it("stops at the first refusal rather than reporting a number it invented", () => {
    expect(sheet).toContain("break;");
    expect(sheet).toContain("approved, then");
  });

  it("asks for the triage rendition, not the 8x-zoom preview", () => {
    // Forty full previews painted at 160px is the page's whole bandwidth for
    // nothing; `thumbnailUrl` exists for exactly this.
    expect(sheet).toContain("sheet.view.thumbnailUrl ?? sheet.view.url");
  });

  it("says why a tile is not a photograph, per tile", () => {
    // One message under forty tiles cannot say which one went wrong.
    expect(sheet).toContain("onError={");
    expect(sheet).toContain("sheet.view.renditionError");
    expect(sheet).toContain("None of these could be displayed");
  });

  it("offers the batch only where the rule allows it", () => {
    expect(page).toContain("isBulkApprovable(");
    // The bar is a review-queue affordance; countersigning thirty documents at
    // once would be the second signature performed rather than given.
    expect(page).toContain('{tab === "review" && !sheetOpen && (');
  });

  it("tracks the selection by document, not by position in the queue", () => {
    // Indexes shift when the queue reloads after an approval.
    expect(page).toContain("useState<ReadonlySet<string>>(new Set())");
    expect(page).toContain("selected.has(document.id)");
  });
});
