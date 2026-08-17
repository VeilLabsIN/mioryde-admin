"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * View state that lives in the query string.
 *
 * ## Why this exists
 *
 * Filters, search terms, the selected tab and the page number all lived in
 * React state only. Three consequences, all of which an operations team hits
 * daily:
 *
 *   - **Nothing was shareable.** An operator could not send a colleague a link
 *     to the thing they were looking at, which is the most common act of
 *     collaboration in an ops team.
 *   - **Nothing was bookmarkable.** "Partners awaiting review" was not a URL.
 *   - **The dashboard's drill-through was silently broken.** The overview links
 *     each recent delivery to `/orders?search=<code>`, and because no page read
 *     the query string the filter was dropped and the operator landed on the
 *     unfiltered list. It looked like it worked.
 *
 * ## Why not `useSearchParams`
 *
 * The obvious tool, and it brings a constraint that is not worth paying here:
 * a client component reading `useSearchParams` in a statically prerendered
 * route has to sit under a Suspense boundary, or `next build` refuses. Every
 * page in this panel is `"use client"` and prerendered, so adopting it means
 * adding a boundary to each one and accepting that each deopts out of static
 * rendering — for a value that only ever changes on the client, in a panel
 * where nothing server-side reads the query string at all. All data fetching
 * goes to the API from the browser.
 *
 * So this reads `window.location.search` directly and writes with
 * `history.replaceState`. The costs are explicit:
 *
 *   - It must listen for `popstate` itself, which it does, so browser back
 *     still restores a view.
 *   - It reads nothing during the server render. The initial value is applied
 *     in an effect after mount, which is correct anyway — the server has no
 *     query string for a prerendered page.
 *
 * `replaceState`, not `pushState`. Typing six characters into a search box
 * would otherwise leave six history entries and make the back button useless
 * for its actual job of leaving the page.
 */

/** Reads the current query string. Empty on the server. */
function currentParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/**
 * One string value, mirrored to a query parameter.
 *
 * Returns `[value, setValue, hydrated]`. `hydrated` is false until the first
 * read of the URL has happened, which matters for callers that must not fetch
 * with a default before knowing whether the URL asked for something else —
 * otherwise a shared link fires two requests and the wrong one can land last.
 */
export function useUrlParam(
  key: string,
  fallback = "",
): [string, (next: string) => void, boolean] {
  const [value, setValue] = useState(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const read = () => {
      setValue(currentParams().get(key) ?? fallback);
      setHydrated(true);
    };
    read();

    // Back and forward move between whole views, so re-read rather than
    // assuming our own state is still authoritative.
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [key, fallback]);

  const set = useCallback(
    (next: string) => {
      setValue(next);

      const params = currentParams();
      // An empty value is removed rather than written as `?status=`. A URL full
      // of empty parameters is unreadable, and it makes two identical views
      // produce two different links.
      if (next === "" || next === fallback) params.delete(key);
      else params.set(key, next);

      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        query ? `${window.location.pathname}?${query}` : window.location.pathname,
      );
    },
    [key, fallback],
  );

  return [value, set, hydrated];
}

/**
 * A zero-based page number in the query string, written one-based.
 *
 * `?page=2` is the second page, not the third. The internal representation
 * stays zero-based because that is what the API takes, and the conversion lives
 * here so no page component has to remember which convention it is holding.
 * Page one is omitted entirely — `/orders` and `/orders?page=1` are the same
 * view and should be the same link.
 */
export function useUrlPage(): [number, (next: number) => void, boolean] {
  const [raw, setRaw, hydrated] = useUrlParam("page", "");

  const parsed = Number.parseInt(raw, 10);
  // Anything unparseable, negative or zero reads as the first page rather than
  // as an error. A hand-mangled URL should show something, and the server's
  // `beyondEnd` flag already handles a number that is merely too large.
  const page = Number.isFinite(parsed) && parsed > 1 ? parsed - 1 : 0;

  const set = useCallback(
    (next: number) => setRaw(next <= 0 ? "" : String(next + 1)),
    [setRaw],
  );

  return [page, set, hydrated];
}
