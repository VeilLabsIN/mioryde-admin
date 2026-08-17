import { describe, expect, it } from "vitest";

/**
 * The one-based-in-URL to zero-based-in-API conversion, extracted so it can be
 * tested without a DOM.
 *
 * Mirrors `useUrlPage`. Kept in the test rather than exported from the hook
 * because it is two expressions and duplicating them here is cheaper than
 * widening the hook's public surface — but if this drifts from the hook, this
 * file is lying, so change both.
 */
function toApiPage(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed - 1 : 0;
}

function toUrlValue(page: number): string {
  return page <= 0 ? "" : String(page + 1);
}

describe("url page numbering", () => {
  it("writes one-based and reads zero-based", () => {
    // ?page=2 is the second page, which the API calls page 1.
    expect(toApiPage("2")).toBe(1);
    expect(toApiPage("3")).toBe(2);
    expect(toUrlValue(1)).toBe("2");
    expect(toUrlValue(2)).toBe("3");
  });

  it("omits the first page from the URL entirely", () => {
    // /orders and /orders?page=1 are the same view and must be the same link.
    expect(toUrlValue(0)).toBe("");
    expect(toApiPage("")).toBe(0);
    expect(toApiPage("1")).toBe(0);
  });

  it("round-trips every page", () => {
    for (let page = 0; page < 200; page++) {
      expect(toApiPage(toUrlValue(page))).toBe(page);
    }
  });

  it("treats a mangled value as the first page rather than erroring", () => {
    // A hand-edited URL should show something. A number that is merely too
    // large is the server's `beyondEnd` to answer, not this function's.
    for (const bad of ["", "0", "-4", "abc", "1.5", "NaN", "1e3x", " "]) {
      expect(toApiPage(bad)).toBeGreaterThanOrEqual(0);
    }
    expect(toApiPage("0")).toBe(0);
    expect(toApiPage("-4")).toBe(0);
    expect(toApiPage("abc")).toBe(0);
  });

  it("does not silently accept a float as a page", () => {
    // parseInt("1.5") is 1, which is the first page — not page 0.5 and not an
    // error. Recorded because the behaviour is a consequence of parseInt rather
    // than a decision, and somebody will wonder.
    expect(toApiPage("1.5")).toBe(0);
    expect(toApiPage("2.9")).toBe(1);
  });
});
