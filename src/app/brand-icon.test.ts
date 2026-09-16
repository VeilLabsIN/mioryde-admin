import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The panel's icon is generated, and this is what stops the copies drifting.
 *
 * `brand/tools/generate-icons.mjs` writes the same SVG to two places, because
 * Next serves `src/app/icon.svg` at `/icon.svg` under the App Router file
 * convention while `public/favicon.svg` is what anything asking for a favicon
 * by path gets. Both have to exist and they have to be the same drawing.
 *
 * This is not a theoretical failure. The marketing site had exactly this pair,
 * only `src/app/icon.svg` was never wired into the generator — it had been
 * hand-drawn once and left behind, and had become a different pin with no
 * swoosh at all. Nothing failed, because nothing was looking, and every tab on
 * mioryde.com showed the wrong logo until somebody happened to compare them.
 */
describe("the panel icon", () => {
  const root = process.cwd();
  const appIcon = join(root, "src/app/icon.svg");
  const publicIcon = join(root, "public/favicon.svg");

  it("is the same drawing in both places Next might serve it from", () => {
    expect(readFileSync(appIcon, "utf8")).toBe(readFileSync(publicIcon, "utf8"));
  });

  it("is the brand mark, not a simplified stand-in", () => {
    const svg = readFileSync(appIcon, "utf8");

    // The three parts of the mark. A hand-drawn substitute typically keeps the
    // teardrop and the hole and drops the road, which is the one element that
    // makes this a Mioryde pin rather than a generic map pin.
    expect(svg).toContain("pinPath");
    expect(svg).toContain("swooshPath");
    expect(svg).toMatch(/<circle cx="266" cy="235" r="90"/);
  });

  it("carries a ground, because a tab strip can be any colour", () => {
    // The mark's counter is knocked out to the ground colour rather than left
    // transparent, so the icon has to bring that ground with it. Without the
    // rect the hole fills with whatever the browser's tab strip happens to be
    // and the road disappears into it on a dark theme.
    expect(readFileSync(appIcon, "utf8")).toMatch(
      /<rect width="512" height="512" fill="#000000"\/>/,
    );
  });
});
