"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allNavItems } from "@/lib/nav";
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
 * Deliberately not a search over *data*. "Find order MIO-X" belongs on the
 * deliveries page, which already has a search box that filters server-side
 * with paging; duplicating it here would mean a second, worse implementation
 * of the same query.
 */
export function CommandSearch({ role }: { role: AdminRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const destinations = useMemo(
    () => allNavItems().filter((item) => canAny(role, item.needs)),
    [role],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations.slice(0, 8);
    return destinations
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [destinations, query]);

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
  useEffect(() => {
    setActive((value) => Math.min(value, Math.max(0, matches.length - 1)));
  }, [matches.length]);

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
        <span className="flex-1 truncate">Search pages</span>
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
            aria-label="Search pages"
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
                  setActive((v) => Math.min(v + 1, matches.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((v) => Math.max(v - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const target = matches[active];
                  if (target) go(target.href);
                }
              }}
              placeholder="Where to?"
              aria-label="Search pages"
              className="w-full border-b border-line bg-transparent px-4 py-3
                         text-body text-fg outline-none placeholder:text-fg-faint"
            />

            {matches.length === 0 ? (
              <p className="px-4 py-6 text-center text-meta text-fg-faint">
                Nothing matches “{query}”.
              </p>
            ) : (
              <ul className="max-h-[46vh] overflow-y-auto py-1">
                {matches.map((item, index) => (
                  <li key={item.href}>
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
                      <span className="flex-1 truncate text-body">
                        {item.label}
                      </span>
                      <span className="font-mono text-micro uppercase text-fg-muted">
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
