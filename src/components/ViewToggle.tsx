"use client";

import { useEffect, useState } from "react";

export type ListView = "cards" | "table";

/**
 * Remembers which layout an operator prefers.
 *
 * Per browser rather than per session, and deliberately not in the URL. The
 * URL carries what a link should reproduce — the filter, the search, the page
 * — and a colleague opening a shared link should see the rows that were being
 * discussed, in whichever layout *they* work in. Layout is a habit, not part
 * of the address.
 *
 * Reads after mount rather than during render: `localStorage` does not exist
 * on the server, and initialising state from it produces markup that disagrees
 * with the client's first paint. The one frame of default layout is cheaper
 * than a hydration mismatch.
 */
export function useListView(key: string, fallback: ListView = "table") {
  const [view, setView] = useState<ListView>(fallback);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`mioryde-view-${key}`);
      if (stored === "cards" || stored === "table") setView(stored);
    } catch {
      // Private mode, or storage disabled. The default is a working page.
    }
  }, [key]);

  const choose = (next: ListView) => {
    setView(next);
    try {
      localStorage.setItem(`mioryde-view-${key}`, next);
    } catch {
      // Not remembering is survivable; failing to switch is not.
    }
  };

  return [view, choose] as const;
}

export function ViewToggle({
  view,
  onChange,
}: {
  view: ListView;
  onChange: (view: ListView) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Layout"
      className="flex shrink-0 rounded-md border border-line bg-panel p-0.5"
    >
      <Option
        current={view}
        value="table"
        label="Table"
        onChange={onChange}
        glyph={
          <>
            <path d="M1.5 3.5h11M1.5 7h11M1.5 10.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </>
        }
      />
      <Option
        current={view}
        value="cards"
        label="Cards"
        onChange={onChange}
        glyph={
          <>
            <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          </>
        }
      />
    </div>
  );
}

function Option({
  current,
  value,
  label,
  glyph,
  onChange,
}: {
  current: ListView;
  value: ListView;
  label: string;
  glyph: React.ReactNode;
  onChange: (view: ListView) => void;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onChange(value)}
      title={label}
      className={`motion-change grid size-7 place-items-center rounded-sm transition-colors ${
        selected
          ? "bg-surface text-accent [box-shadow:var(--shadow-panel)]"
          : "text-fg-faint hover:text-fg-mid"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        {glyph}
      </svg>
      <span className="sr-only">{label}</span>
    </button>
  );
}
