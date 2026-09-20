"use client";

import { useCallback } from "react";

import { useStoredValue } from "@/lib/clientValue";

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
 * The server has no `localStorage`, so the layout it renders is the fallback
 * and the browser corrects it — but stated up front through the store rather
 * than by rendering once and setting state. Same first paint, one render
 * instead of two, and two windows now agree: an operator who switches layout
 * in one tab sees the other follow.
 */
export function useListView(key: string, fallback: ListView = "table") {
  const parse = useCallback(
    (stored: string | null): ListView =>
      stored === "cards" || stored === "table" ? stored : fallback,
    [fallback],
  );

  const [view, write] = useStoredValue(
    `mioryde-view-${key}`,
    parse,
    fallback,
  );

  const choose = useCallback((next: ListView) => write(next), [write]);
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
