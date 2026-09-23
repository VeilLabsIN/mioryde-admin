import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  join(process.cwd(), "src/app/(panel)/agreement/page.tsx"),
  "utf8",
);

/**
 * A21. Publishing terms is the only irreversible action in the panel that also
 * stops the whole fleet working. The guard was typing a version number printed
 * four inches above the box asking for it.
 */
describe("the publish guard", () => {
  it("states the blast radius before the action, not after", () => {
    expect(page).toContain("api.agreementImpact()");
    expect(page).toContain("are working right now and will be taken offline");
  });

  it("refuses to publish text nobody has compared", () => {
    expect(page).toContain("diffOpen &&");
    expect(page).toContain("Review the changes first.");
  });

  it("keeps the version confirmation as well, not instead", () => {
    expect(page).toContain("confirm.trim() === version.trim()");
  });

  it("offers the scheduled publish the server has always accepted", () => {
    // The same shape as the zone blocker: the API took `effectiveFrom` all
    // along and the panel never sent it, so every publish landed mid-shift.
    expect(page).toContain("effectiveFrom: new Date(effectiveFrom)");
    expect(page).toContain('type="datetime-local"');
  });

  it("does not claim a scheduled publish stops anyone today", () => {
    expect(page).toContain("Nobody is taken offline now.");
  });

  it("re-counts after publishing rather than leaving a stale figure", () => {
    expect(page).toContain("reloadImpact()");
  });
});
