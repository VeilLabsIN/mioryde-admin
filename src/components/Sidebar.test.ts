import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDTH,
  MAX_WIDTH,
  MIN_WIDTH,
  clampWidth,
} from "./Sidebar";

/**
 * The rail's width is an operator preference now, which means it is a value
 * that arrives from `localStorage` — i.e. from anywhere.
 */
describe("the resizable rail", () => {
  it("keeps the labels legible at the floor", () => {
    // Below roughly 200px the longest nav labels ("Verification", "Rate
    // cards") truncate, and a rail of ellipses is strictly worse than the
    // 72px icon rail — which is one click away and designed for exactly that.
    expect(MIN_WIDTH).toBeGreaterThanOrEqual(200);
    expect(clampWidth(0)).toBe(MIN_WIDTH);
    expect(clampWidth(-9999)).toBe(MIN_WIDTH);
  });

  it("stops the rail competing with the table beside it", () => {
    expect(clampWidth(99999)).toBe(MAX_WIDTH);
  });

  it("leaves a sensible width alone", () => {
    expect(clampWidth(DEFAULT_WIDTH)).toBe(DEFAULT_WIDTH);
    expect(clampWidth(300)).toBe(300);
  });

  it("rounds, because a stored width becomes an inline pixel value", () => {
    expect(clampWidth(248.6)).toBe(249);
  });

  it("survives nonsense from storage", () => {
    // `Number(null)` and `Number("")` are both 0, and `Number("abc")` is NaN.
    // A rail that renders at NaN pixels collapses to nothing and the panel
    // looks broken with no way back, so this is the one that matters.
    // NaN falls back to the default rather than the floor: nothing was
    // chosen, so the rail should look the way it does out of the box, not as
    // narrow as it is allowed to get.
    expect(clampWidth(Number("abc"))).toBe(DEFAULT_WIDTH);
    // `Number(null)` is 0 — a real number, and genuinely below the floor.
    expect(clampWidth(Number(null))).toBe(MIN_WIDTH);
  });

  it("has a default inside its own range", () => {
    expect(DEFAULT_WIDTH).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(DEFAULT_WIDTH).toBeLessThanOrEqual(MAX_WIDTH);
  });
});
