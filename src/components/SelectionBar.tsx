"use client";

/**
 * Actions for a chosen subset of rows, floating over the list.
 *
 * ## What this changes about export, which is the point
 *
 * Every export in the panel currently acts on **the whole current filter**.
 * That is right for "give me last month's payouts" and wrong for the thing
 * operators actually ask for — these four deliveries, for this complaint, in
 * one file. Today that means exporting three hundred rows and deleting the
 * rest in a spreadsheet.
 *
 * So the bar is not a convenience layer over the same action. It is a
 * different action, and the distinction has to survive into the filename and
 * the row count or somebody will send the wrong file to a customer.
 *
 * ## Why it floats rather than sitting above the table
 *
 * A bar that appears in the layout pushes every row down the moment the first
 * checkbox is ticked — so the row you were about to tick second has moved, and
 * on a long list the one you just ticked can scroll out of view. Floating over
 * the bottom costs nothing in layout and keeps the selection where the eye
 * left it.
 *
 * This is also the one place `glass` is unambiguously right: it sits over rows
 * the operator is still reading, and being able to see the row underneath the
 * bar is the difference between covering data and hovering above it.
 *
 * ## Announced, not just drawn
 *
 * `role="status"` with `aria-live="polite"` means the count is read out as it
 * changes. Without it a screen-reader user ticking checkboxes gets no feedback
 * that anything is accumulating, and the actions appear from nowhere.
 */
export function SelectionBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  /** Singular. "delivery" becomes "1 delivery" / "4 deliveries". */
  noun: string;
  onClear: () => void;
  /** The actions. Buttons, in the order they are most often wanted. */
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div
      // `pointer-events-none` on the positioner and back on for the bar, so
      // the empty space either side of it does not swallow clicks on the rows
      // underneath — which is the usual bug with a full-width fixed overlay.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4"
    >
      <div
        role="status"
        aria-live="polite"
        className="glass pointer-events-auto flex flex-wrap items-center gap-2
                   rounded-lg border px-3 py-2 [box-shadow:var(--elev-3)]
                   motion-safe:animate-[rise_var(--dur-base)_var(--ease-out-quint)]"
      >
        <span className="text-body text-fg px-1 font-medium tabular-nums">
          {count} {count === 1 ? noun : `${noun}s`} selected
        </span>

        <span aria-hidden className="bg-edge mx-1 h-4 w-px" />

        {children}

        <button
          type="button"
          onClick={onClear}
          className="text-fg-muted hover:text-fg hover:border-edge-strong border-edge
                     ml-1 rounded-xs border px-2 py-1 text-body leading-none
                     transition-colors duration-[var(--dur-fast)]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/**
 * The header checkbox, which has three states rather than two.
 *
 * "Some rows on this page are selected" is not the same as "none are", and a
 * plain checkbox can only say one of those. `indeterminate` is not an
 * attribute — it exists only as a DOM property — so it has to be set through a
 * ref callback rather than in JSX, which is the reason this is a component and
 * not three lines inline.
 */
export function SelectAllBox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(node) => {
        if (node) node.indeterminate = indeterminate && !checked;
      }}
      onChange={(event) => onChange(event.target.checked)}
      className="accent-accent-bright size-3.5 cursor-pointer align-middle"
    />
  );
}
