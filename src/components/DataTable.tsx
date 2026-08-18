"use client";

import type { ReactNode } from "react";
import { EmptyState, SkeletonRows } from "./ui";

export interface Column<T> {
  /** Stable identity for the column. Used as the React key, never displayed. */
  key: string;
  header: string;
  /** A CSS width for the column track, e.g. `104px`. Omit to size to content. */
  width?: string;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
}

/**
 * A real table for tabular data.
 *
 * ## Why this exists
 *
 * Five pages built tabular data as `<ul>` / `<li>` with `grid-cols-[...]` and a
 * separate header `<div>`. Two problems, and the second is the reason this is
 * a component rather than a lint rule:
 *
 * 1. **A screen reader gets nothing.** No row/column relationship, no header
 *    association — every cell is read as loose text with no idea which column
 *    it belongs to. A `<td>` in a real table is announced with its `<th>`.
 * 2. **The column widths were written twice** on every one of those pages, once
 *    on the header `div` and once on the row `li`, and kept in sync by hand.
 *    They had already drifted apart in places by a few pixels.
 *
 * One column definition now carries the width, the alignment, the header text
 * and how to render the cell, so the two cannot disagree.
 *
 * ## Widths
 *
 * Set through `<colgroup>` rather than on each `<th>`. A width on a header cell
 * is a suggestion the browser is free to ignore once content is wider; a `<col>`
 * is applied to the whole column, which is what the fixed layout below needs to
 * behave like the grid it replaces.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = "Nothing here",
  emptyHint,
  caption,
}: {
  columns: readonly Column<T>[];
  /** Null while loading. An empty array means genuinely nothing matched. */
  rows: T[] | null;
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  /**
   * What the table contains, for screen readers.
   *
   * Visually hidden. A table announced as "table with 5 columns" and no name is
   * one a screen-reader user has to read into before knowing whether it is the
   * one they wanted.
   */
  caption?: string;
}) {
  if (rows === null || loading) {
    return <SkeletonRows rows={8} />;
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    // Horizontally scrollable in its own container rather than letting the page
    // scroll sideways — a table wider than the viewport must not drag the
    // sidebar off screen with it.
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-body">
        {caption && <caption className="sr-only">{caption}</caption>}

        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={column.width ? { width: column.width } : undefined}
            />
          ))}
        </colgroup>

        <thead>
          <tr className="border-b border-line bg-panel">
            {columns.map((column) => (
              <th
                key={column.key}
                // `scope="col"` is what ties every cell below to this header.
                // Without it a screen reader has a grid of unlabelled values.
                scope="col"
                className={`px-4 py-2 text-micro font-mono uppercase text-fg-muted ${
                  column.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="stagger divide-y divide-line">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="motion-change transition-colors hover:bg-panel"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 align-middle ${
                    column.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {/* min-w-0 lives on the cell's own wrapper rather than here,
                      because `table-fixed` already constrains the width and a
                      truncating child needs a block to truncate within. */}
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
