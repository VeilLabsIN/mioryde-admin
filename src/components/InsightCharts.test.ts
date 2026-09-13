import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The charts' accessibility, asserted rather than claimed.
 *
 * These tests run in plain node — there is no DOM here, by deliberate choice
 * in `vitest.config.mts` — so they read the source. That is weaker than
 * driving the component, and it is worth having anyway: the failure being
 * guarded against is somebody removing the keyboard handler, and the file
 * saying it is keyboard-operable while it no longer is.
 *
 * A comment asserting behaviour that is not there is worse than no comment.
 * This is the cheapest way to keep this particular one honest.
 */
const source = readFileSync(join(__dirname, "InsightCharts.tsx"), "utf8");

describe("the chart can be read without a mouse", () => {
  it("takes focus", () => {
    // The chart it replaces could not be reached by keyboard at all: its whole
    // interaction hung off `onPointerEnter` on invisible rectangles.
    expect(source).toContain("tabIndex={0}");
  });

  it("walks the days with the arrow keys", () => {
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
  });

  it("announces what is selected", () => {
    // The readout is HTML rather than an SVG <text>, so a screen reader can
    // reach it, and it is a live region so each arrow press is spoken.
    expect(source).toContain('aria-live="polite"');
  });

  it("shows a focus ring", () => {
    // Keyboard reachable and invisible is not reachable.
    expect(source).toContain("focus-visible:outline");
  });
});

describe("the heatmap is a table, because it is one", () => {
  it("uses real table semantics rather than a grid of coloured divs", () => {
    expect(source).toContain("<caption");
    expect(source).toContain('scope="col"');
    expect(source).toContain('scope="row"');
  });

  it("carries the numbers as text, not only as colour", () => {
    // 8% of men have a red/green deficiency, and every cell here is a shade of
    // one hue — so the value has to exist in words as well.
    expect(source).toContain("sr-only");
  });

  it("names the busiest hour in the caption", () => {
    // The single fact somebody comes to this chart for. Reading it off a grid
    // of shades with a screen reader would otherwise be impossible.
    expect(source).toContain("Busiest:");
  });
});

describe("shares are stated, not left to be computed", () => {
  it("prints a percentage beside every segment and funnel step", () => {
    const percentages = source.match(/Math\.round\(\s*\(?[^)]*\)?\s*\*\s*100\)/g) ?? [];
    expect(percentages.length).toBeGreaterThanOrEqual(2);
  });
});
