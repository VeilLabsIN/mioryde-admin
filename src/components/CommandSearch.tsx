"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type SearchHit } from "@/lib/api";
import { allNavItems } from "@/lib/nav";
import { siteLinksNotInNav } from "@/lib/siteLinks";
import { type AdminRole, canAny } from "@/lib/permissions";

/**
 * Go anywhere without reading the sidebar.
 *
 * Nineteen destinations across six groups is past the point where scanning is
 * faster than typing. The sidebar is still the map — this is for the operator
 * who already knows where they are going and does not want to look for it.
 *
 * Only destinations the role can actually open are offered. Same reasoning as
 * the sidebar: the API enforces the matrix regardless, and offering a door
 * that will not open is worse than not offering it.
 *
 * ## It searches data too, having once deliberately not
 *
 * The original note here argued that "find order MIO-X" belonged on the
 * deliveries page, which already searches server-side with paging. That was
 * right about the implementation and wrong about the operator: somebody with
 * a customer on the phone reading out a number does not know whether it is a
 * delivery, a customer or a partner, and making them pick the right page
 * first is asking them to answer the question they rang to ask.
 *
 * So the palette now also queries `GET /admin/search` and offers what it
 * finds. It still does not reimplement those pages — every hit is a link
 * *into* the screen that already handles that kind of thing properly.
 *
 * Pages match locally and appear instantly; data needs a round trip. Both
 * are listed together, pages first, because a page is what most of these
 * keystrokes are looking for and it must not be pushed down the list by a
 * slower answer.
 */
export function CommandSearch({ role }: { role: AdminRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Nav first, then the pages that belong to everyone. Somebody looking for
  // "privacy" or "support" was previously told there were no matches, on the
  // one control in the panel that is supposed to know where everything is.
  const destinations = useMemo(() => {
    const nav = allNavItems().filter((item) => canAny(role, item.needs));
    const site = siteLinksNotInNav(allNavItems().map((i) => i.href)).filter(
      (link) => link.needs === undefined || canAny(role, link.needs),
    );
    return [...nav, ...site];
  }, [role]);

  /**
   * Server hits for the current query.
   *
   * Debounced, and every in-flight response is checked against the query that
   * is current when it lands — two keystrokes produce two requests and they do
   * not necessarily come back in order. Without that check a slower earlier
   * response overwrites a newer one and the list disagrees with the box.
   */
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }

    let cancelled = false;
    // 180ms: shorter than a comfortable typing rhythm, so a burst of keystrokes
    // is one request rather than six.
    const timer = window.setTimeout(() => {
      void api
        .search(q)
        .then((res) => {
          if (!cancelled) setHits(res.results);
        })
        .catch(() => {
          // Silent, and the page list still works. A palette that shows an
          // error banner because a background lookup failed is worse than one
          // that quietly offers less.
          if (!cancelled) setHits([]);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations.slice(0, 8);
    return destinations
      .filter((item) => {
        const blurb = "blurb" in item ? item.blurb.toLowerCase() : "";
        return (
          item.label.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q) ||
          blurb.includes(q)
        );
      })
      .slice(0, 6);
  }, [destinations, query]);

  /**
   * Pages and data as one keyboard-navigable list.
   *
   * Shaped into a common row here rather than rendered as two lists, so
   * arrow-key navigation crosses the boundary without the component having to
   * know where it is.
   */
  const rows = useMemo(
    () => [
      ...matches.map((item) => ({
        key: item.href,
        mark: item.mark,
        label: item.label,
        detail: null as string | null,
        group: item.group,
        href: item.href,
      })),
      ...hits.map((hit) => ({
        key: `${hit.type}:${hit.id}`,
        mark: hit.type === "delivery" ? "DL" : hit.type === "customer" ? "CU" : "PT",
        label: hit.label,
        detail: hit.subtitle,
        group: hit.meta ?? hit.type,
        href: hit.href,
      })),
    ],
    [matches, hits],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  // Ctrl/Cmd-K from anywhere. Registered on the document rather than on the
  // input, which is the whole point — the operator should not have to reach
  // for the box before they can use it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clamped rather than reset, so narrowing the query does not silently move
  // the selection to something the operator was not looking at.
  //
  // Against `rows`, not `matches`. `active` indexes into `rows` — the page
  // matches *plus* the data results — so clamping to `matches.length` threw
  // away any selection that had moved into the data section: arrow down past
  // the last page and the highlight jumped back up. The dependency was
  // already `rows.length`; the body disagreed with it, and the lint rule is
  // what noticed.
  useEffect(() => {
    setActive((value) => Math.min(value, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-change flex h-9 w-full max-w-[420px] items-center gap-2
                   rounded-sm border border-edge bg-panel px-3 text-left
                   text-meta text-fg-faint transition-colors
                   hover:border-edge-strong hover:text-fg-muted"
      >
        <span aria-hidden>⌕</span>
        <span className="flex-1 truncate">Search</span>
        <kbd className="font-mono text-micro text-fg-muted">CTRL K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 pt-[12vh]"
          // A click on the backdrop is a dismissal. The dialog below stops
          // propagation so a click inside does not close it.
          onClick={close}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onClick={(event) => event.stopPropagation()}
            className="animate-rise mx-auto w-[min(560px,92vw)] overflow-hidden
                       rounded border border-edge-strong bg-raised shadow-2xl"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((v) => Math.min(v + 1, rows.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((v) => Math.max(v - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const target = rows[active];
                  if (target) go(target.href);
                }
              }}
              placeholder="Search deliveries, customers, partners or pages"
              aria-label="Search"
              className="w-full border-b border-line bg-transparent px-4 py-3
                         text-body text-fg outline-none placeholder:text-fg-faint"
            />

            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-meta text-fg-faint">
                {query.trim().length < 2
                  ? "Type at least two characters."
                  : `Nothing matches “${query}”.`}
              </p>
            ) : (
              <ul className="max-h-[46vh] overflow-y-auto py-1">
                {rows.map((item, index) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(item.href)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left
                                  transition-colors ${
                                    index === active
                                      ? "bg-panel text-fg"
                                      : "text-fg-soft"
                                  }`}
                    >
                      <span className="grid size-6 shrink-0 place-items-center
                                       font-mono text-[10px] font-bold tracking-tight
                                       text-fg-faint">
                        {item.mark}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body">
                          {item.label}
                        </span>
                        {/* Only data rows carry one. A page's name is the whole
                            of what it is; an order needs its route to be
                            recognised, and a person needs something past a
                            name two customers might share. */}
                        {item.detail !== null && (
                          <span className="block truncate text-micro text-fg-faint">
                            {item.detail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-micro uppercase text-fg-muted">
                        {item.group}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
