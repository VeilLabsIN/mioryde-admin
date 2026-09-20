import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the panel costs to leave open.
 *
 * A dispatcher keeps this open all day across several tabs. Every polled page
 * was spending its requests whether or not anybody could see it — six
 * background tabs overnight is tens of thousands of calls against an API that
 * runs on half a CPU, for numbers nobody reads.
 *
 * Two pages had solved this by hand and three had not, which is the shape of a
 * fix that keeps coming undone. These assertions are about the *adoption* of
 * one hook, because that is the part that regresses: somebody adds a page with
 * `setInterval` and nothing notices.
 */
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const POLLERS = [
  "app/(panel)/monitoring/page.tsx",
  "app/(panel)/live/page.tsx",
  "app/(panel)/page.tsx",
  "app/(panel)/map/page.tsx",
];

describe("nothing polls a tab nobody is looking at", () => {
  for (const path of POLLERS) {
    it(`${path} stops while hidden`, () => {
      const source = read(path);
      // Either the shared hook, or the explicit visibility check the two
      // pages that got this right first already use. Both are acceptable;
      // neither being present is not.
      expect(
        source.includes("useVisiblePoll") || source.includes("document.hidden"),
      ).toBe(true);
    });
  }

  it("the banner that rides on every page checks too", () => {
    // This one mattered most: it is mounted on every route, so its poll ran in
    // every background tab at once.
    expect(read("components/Banner.tsx")).toContain("document.hidden");
  });

  it("the hook refreshes on return rather than waiting out the interval", () => {
    const hook = read("lib/useVisiblePoll.ts");
    // Skipping hidden ticks means what an operator comes back to is stale.
    // Waiting out the remaining interval to correct it makes the page look
    // frozen at the moment attention returns.
    expect(hook).toContain("latest.current();");
    expect(hook).toContain('addEventListener("visibilitychange"');
    expect(hook).toContain('removeEventListener("visibilitychange"');
  });

  it("the hook does not start polling in a tab opened in the background", () => {
    // A middle-click from the dispatch board opens a page nobody is looking
    // at yet. It should cost nothing until it is looked at.
    expect(read("lib/useVisiblePoll.ts")).toContain("if (!document.hidden) start();");
  });
});
