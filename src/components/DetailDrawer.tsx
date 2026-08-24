"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A record's detail, opened over the list it came from.
 *
 * ## Why this instead of navigating to /orders/[id]
 *
 * Triage is the panel's main job: filter a list, open something, decide, come
 * back, open the next one. A page navigation loses the filter, the scroll
 * position and the sense of where you were in the queue — so the operator
 * either re-applies all three every time, or opens rows in new tabs and loses
 * track of which they have already dealt with.
 *
 * A drawer keeps the list on screen and dismisses in one key. The detail page
 * stays: it is the thing a link in a support ticket points at, and it is what
 * prints. This is the *triage* affordance, not a replacement.
 *
 * ## The three things that make a drawer accessible, none of them optional
 *
 * A drawer is a modal, and a modal that only looks like one is worse than a
 * page — it traps a keyboard user in content behind it that they cannot see.
 *
 * 1. **Escape closes it.** Bound on the document, because focus may be inside
 *    an input in the drawer body.
 * 2. **Focus moves in on open and back out on close.** Returning it to the row
 *    that opened the drawer is what makes repeated triage possible with a
 *    keyboard at all; without it focus resets to the top of the document and
 *    the operator tabs through the whole nav for every record.
 * 3. **The page behind is inert.** `aria-hidden` alone hides it from a screen
 *    reader while leaving it tabbable, which is the worst of both. The scrim
 *    takes the clicks and the focus trap takes the tabs.
 *
 * ## Why it is translucent and the cards inside it are not
 *
 * The pane is `glass` so the row underneath stays faintly visible — that is
 * the whole reason it beats a navigation, and it is the one place the
 * translucency in `globals.css` earns its cost. Everything *inside* it sits on
 * opaque surfaces, because that is where the text is and text on an
 * unpredictable ground has no measurable contrast ratio.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  tabs,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Optional tab strip, as in the reference designs — "Order info" beside
   * "Route info" rather than one long scroll of everything known about a
   * record. Omit for a record with one shape.
   */
  tabs?: { key: string; label: string; content: React.ReactNode }[];
  children?: React.ReactNode;
  /** Sticky action row. Actions belong here, not scrolled off the bottom. */
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<Element | null>(null);
  const titleId = useId();
  const [activeTab, setActiveTab] = useState(0);

  // Reset to the first tab per record. Without this, opening a second order
  // while "Route info" was selected shows that tab for a record the operator
  // has not looked at yet — which reads as the drawer having failed to load
  // the part they were expecting.
  //
  // Adjusted during render rather than in an effect. This is the documented
  // pattern for "reset state when a prop changes": React re-runs this
  // component immediately, before touching the DOM, so the wrong tab is never
  // painted. The effect version renders the stale tab first and then corrects
  // it, which is a visible flicker as well as an extra pass.
  const [openedWith, setOpenedWith] = useState(open);
  if (open !== openedWith) {
    setOpenedWith(open);
    if (open) setActiveTab(0);
  }

  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement;
    // Deferred a frame: the panel is not in the DOM at the moment the state
    // flips, so focusing synchronously focuses nothing.
    const raf = requestAnimationFrame(() => panelRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      // Focus trap. Querying on each Tab rather than caching the list, because
      // the drawer's contents load asynchronously and a list captured on open
      // would be missing everything that arrived after it.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      // Non-null after the length check above, but asserted rather than
      // assumed: `noUncheckedIndexedAccess` is on, and it is right to be —
      // an empty NodeList here would throw inside a keydown handler.
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    // The page behind must not scroll under the drawer. Restored to whatever
    // it was rather than to "" — the shell may already be managing it, and
    // blanking it would leave the page permanently scrollable after a modal
    // that had disabled it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Back to the row that opened it, so triaging a queue by keyboard does
      // not restart at the top of the document for every record.
      if (returnFocusTo.current instanceof HTMLElement) {
        returnFocusTo.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/*
        Takes the clicks that would otherwise reach the list. `aria-hidden`
        because it is a backdrop, not a control — the close button and Escape
        are the announced ways out.
      */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="bg-scrim absolute inset-0 motion-safe:animate-[fade-in_var(--dur-base)_var(--ease-out-quint)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass relative flex h-full w-full max-w-[34rem] flex-col border-l
                   outline-none [box-shadow:var(--elev-3)]
                   motion-safe:animate-[slide-in-right_var(--dur-base)_var(--ease-out-quint)]"
      >
        <header className="border-overlay-line flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-label text-fg truncate font-semibold"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="text-meta text-fg-muted mt-0.5 truncate">
                {subtitle}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-fg-muted hover:text-fg hover:border-edge-strong border-edge
                       rounded-xs border px-2 py-1 text-body leading-none
                       transition-colors duration-[var(--dur-fast)]"
          >
            ✕
          </button>
        </header>

        {tabs && tabs.length > 1 ? (
          // `role="tablist"` with arrow-key movement is the full contract, but
          // these are buttons that swap a panel and nothing else — the browser
          // default of Tab-then-Enter works, and a half-implemented tablist
          // (roles without arrow keys) tells a screen reader to expect
          // behaviour that is not there, which is worse than no roles at all.
          <div className="border-overlay-line flex gap-1 border-b px-5 py-2">
            {tabs.map((tab, index) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(index)}
                aria-current={index === activeTab ? "true" : undefined}
                className={`rounded-xs px-2.5 py-1 text-body transition-colors
                            duration-[var(--dur-fast)] ${
                              index === activeTab
                                ? "bg-panel text-fg font-medium"
                                : "text-fg-muted hover:text-fg"
                            }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tabs && tabs.length > 0 ? tabs[activeTab]?.content : children}
        </div>

        {footer ? (
          <footer className="border-overlay-line border-t px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
