import { describe, expect, it } from "vitest";
import {
  asyncToken,
  loadMessage,
  selectAsync,
  selectPaged,
  type Paged,
  type Settled,
} from "./useAsync";

/**
 * The core under `useAsync`.
 *
 * Tested as three pure functions rather than through a renderer, for the same
 * reason as `clientValue`: the panel has no DOM-rendering test setup, and
 * adding one for a hook whose logic is these three functions would be a
 * dependency to carry forever. The hook itself is two effects and a spread.
 *
 * What actually matters, and is what these check:
 *
 *   - **two different requests never share a token.** The token is the only
 *     thing standing between a slow response for a filter the operator has
 *     moved off and it overwriting the right one;
 *   - **a stale token reads as loading, not as empty.** "No results" and "not
 *     back yet" are different sentences on screen, and the old code kept them
 *     apart with a separate `useState` that could drift;
 *   - **`keepPrevious` survives a failure.** The monitoring screen is least
 *     useful exactly when it blanks itself.
 */

const settled = <T,>(token: string, data: T | null, error: string | null = null): Settled<T> =>
  ({ token, data, error });

describe("asyncToken", () => {
  it("gives the same token for the same request", () => {
    expect(asyncToken(["pending_kyc", 2, true], 0)).toBe(
      asyncToken(["pending_kyc", 2, true], 0),
    );
  });

  it("separates deps that would run together under a plain join", () => {
    // A search box accepts commas. Joining on one would make these two
    // requests indistinguishable, and the wrong response could land last.
    expect(asyncToken(["a,b"], 0)).not.toBe(asyncToken(["a", "b"], 0));
  });

  it("separates values that only differ by type", () => {
    // A page number is a number on one screen and a string off a URL on
    // another; `null` means "no filter" where `"null"` would be one.
    expect(asyncToken([1], 0)).not.toBe(asyncToken(["1"], 0));
    expect(asyncToken([null], 0)).not.toBe(asyncToken(["null"], 0));
    expect(asyncToken([undefined], 0)).not.toBe(asyncToken([null], 0));
  });

  it("changes when the same request is asked for again", () => {
    // `reload()` is a refresh button and a poll timer. Without the nonce the
    // token would be unchanged and the effect would never re-run.
    expect(asyncToken(["x"], 1)).not.toBe(asyncToken(["x"], 0));
  });

  it("is stable across an empty dep list", () => {
    expect(asyncToken([], 0)).toBe(asyncToken([], 0));
  });
});

describe("loadMessage", () => {
  it("prefers the thrown message, which the API writes for the operator", () => {
    expect(loadMessage(new Error("Partner not found."), "Could not load.")).toBe(
      "Partner not found.",
    );
  });

  it("falls back for a non-Error, which fetch rejects with offline", () => {
    expect(loadMessage("boom", "Could not load.")).toBe("Could not load.");
    expect(loadMessage(undefined, "Could not load.")).toBe("Could not load.");
  });

  it("falls back for an Error with no message rather than showing nothing", () => {
    expect(loadMessage(new Error(""), "Could not load.")).toBe(
      "Could not load.",
    );
  });
});

describe("selectAsync", () => {
  const token = asyncToken(["page:2"], 0);

  it("reports a settled request for the token being asked for", () => {
    expect(selectAsync(settled(token, [1, 2]), token, false)).toEqual({
      data: [1, 2],
      error: null,
      loading: false,
    });
  });

  it("reports null data as loaded, not as still loading", () => {
    // `load` returning null means "nothing to show, and that is not an error":
    // an agreement never published, a page past the end that has redirected.
    expect(selectAsync(settled(token, null), token, false)).toEqual({
      data: null,
      error: null,
      loading: false,
    });
  });

  it("reports an error for the current token as settled", () => {
    expect(selectAsync(settled(token, null, "Denied."), token, false)).toEqual({
      data: null,
      error: "Denied.",
      loading: false,
    });
  });

  it("hides the previous request's rows under the new heading", () => {
    const stale = settled(asyncToken(["page:1"], 0), [1, 2]);
    expect(selectAsync(stale, token, false)).toEqual({
      data: null,
      error: null,
      loading: true,
    });
  });

  it("clears the previous request's error too", () => {
    // A filter that failed must not leave its message over the next one's
    // skeleton — that is a failure the operator cannot act on.
    const stale = settled(asyncToken(["page:1"], 0), null, "Denied.");
    expect(selectAsync(stale, token, false)).toEqual({
      data: null,
      error: null,
      loading: true,
    });
  });

  it("keeps the last snapshot while reloading when asked to", () => {
    const stale = settled(asyncToken(["page:1"], 0), [1, 2]);
    expect(selectAsync(stale, token, true)).toEqual({
      data: [1, 2],
      error: null,
      loading: true,
    });
  });

  it("loads before anything has settled", () => {
    expect(selectAsync(settled("", null), token, false)).toEqual({
      data: null,
      error: null,
      loading: true,
    });
  });

  it("still loads before anything has settled under keepPrevious", () => {
    // There is no previous, and an empty first paint must not read as loaded.
    expect(selectAsync(settled("", null), token, true)).toEqual({
      data: null,
      error: null,
      loading: true,
    });
  });
});

describe("selectPaged", () => {
  const listing = (results: string[], total: number): Paged<string> => ({
    results,
    page: { page: 0, pageSize: 20, total, hasMore: false },
  });

  it("shows the rows and the pager for a settled page", () => {
    expect(selectPaged({ data: listing(["a"], 1), error: null, loading: false }))
      .toEqual({
        rows: ["a"],
        meta: { page: 0, pageSize: 20, total: 1, hasMore: false },
        data: listing(["a"], 1),
        error: null,
        loading: false,
      });
  });

  it("keeps the pager while the rows load", () => {
    // Every one of these screens renders `<Pager busy={rows === null}>`, which
    // only means anything if the pager is still on screen while the rows are
    // not. Clearing both would make the controls jump out of the layout and
    // back on every page change.
    const state = selectPaged({
      data: listing(["a", "b"], 2),
      error: null,
      loading: true,
    });
    expect(state.rows).toBeNull();
    expect(state.meta).toEqual({
      page: 0,
      pageSize: 20,
      total: 2,
      hasMore: false,
    });
  });

  it("hides the rows behind an error, and keeps the pager", () => {
    // Rows left up beside an error message read as the rows the error is
    // about — the operator acts on a list that failed to refresh.
    const state = selectPaged({
      data: listing(["a"], 1),
      error: "Denied.",
      loading: false,
    });
    expect(state.rows).toBeNull();
    expect(state.error).toBe("Denied.");
    expect(state.meta).not.toBeNull();
  });

  it("has no pager before the first page has settled", () => {
    expect(selectPaged({ data: null, error: null, loading: true })).toEqual({
      rows: null,
      meta: null,
      data: null,
      error: null,
      loading: true,
    });
  });

  it("reports an empty page as loaded and empty, not as loading", () => {
    // The difference between "no results" and "not back yet" is two different
    // sentences on screen.
    const state = selectPaged({
      data: listing([], 0),
      error: null,
      loading: false,
    });
    expect(state.rows).toEqual([]);
    expect(state.loading).toBe(false);
  });
});
