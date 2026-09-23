import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  join(process.cwd(), "src/app/(panel)/kyc/page.tsx"),
  "utf8",
);

/**
 * A23. PDFs rasterise now, so the weak "I have opened this file" gate should
 * disappear for the documents that no longer need it — and survive, exactly,
 * for the ones that do.
 */
describe("the approval gate after PDFs render", () => {
  it("is the render gate alone for a single-page document", () => {
    // pageCount === 1 means nothing is unseen, so no acknowledgement.
    expect(page).toContain("view?.renderable && view.pageCount !== 1");
    expect(page).toContain("const needsPageAck = unseenPages !== 0;");
  });

  it("still asks about pages it did not show", () => {
    // Page one shown with Approve unlocked would be weaker than the checkbox
    // it replaced: it looks like the whole document has been seen.
    expect(page).toContain("(!needsPageAck || restRead)");
    expect(page).toContain("Only the first is shown.");
  });

  it("treats an unknown page count as 'there may be more'", () => {
    // A rendition produced before the server recorded a count. The safe
    // direction is a box ticked unnecessarily, not pages nobody read.
    expect(page).toContain('? "unknown"');
    expect(page).toContain("I have read the whole document.");
  });

  it("keeps the two assurances separate in the code", () => {
    // `hasRendered` is "the browser painted it". `restRead` is "the reviewer
    // says so". Merging them would lose which one an approval rested on.
    expect(page).toContain("const [restRead, setRestRead] = useState(false)");
    expect(page).toContain("setHasRendered(true)");
  });

  it("offers the original for the pages it did not render", () => {
    // Not `view.url` — on this path that is the page-one image.
    expect(page).toContain("view?.originalUrl ?");
    expect(page).toContain("href={view.originalUrl}");
  });

  it("keeps the old acknowledgement for a file that would not decode", () => {
    // What is left on the non-renderable path is bytes nothing can read, and
    // the reviewer's word is the only assurance available.
    expect(page).toContain("I have opened this file and read it.");
  });
});
