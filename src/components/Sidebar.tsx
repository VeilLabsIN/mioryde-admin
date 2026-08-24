"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type AdminRole, canAny } from "@/lib/permissions";
import { NAV_GROUPS, RAIL_FOOTER } from "@/lib/nav";
import { NavIcon } from "./NavIcon";
import { LayerSwitch, useLayer } from "./LayerSwitch";
import { ThemeSwitcher } from "./ThemeSwitcher";

/**
 * The panel's navigation rail.
 *
 * Two deliberate departures from a stock admin sidebar:
 *
 * 1. **A single indicator element slides between items** rather than each item
 *    toggling its own background. One transform on one node, so switching
 *    sections is a compositor-only animation — no layout, no paint, no
 *    per-item state.
 * 2. **Collapse is width-only on a grid track**, and the labels fade rather
 *    than unmount. Unmounting them would reflow the whole rail mid-animation.
 */
const COLLAPSED_KEY = "mioryde-rail-collapsed";
const SHUT_GROUPS_KEY = "mioryde-rail-shut-groups";

/**
 * Wide enough for content but not for a 248px rail beside it — a tablet, or a
 * laptop with a browser at half width. Matches Tailwind's `lg`, so the query
 * and the classes cannot disagree about where the rail changes shape.
 *
 * Below `md` it stops sharing the row at all and becomes a drawer; that switch
 * is pure CSS and needs no query here.
 */
const NARROW_BELOW = "(max-width: 1023px)";

export function Sidebar({
  role,
  /** Drawer state. Only consulted below `md`, where the rail is not in flow. */
  open = false,
  onOpen,
  onClose,
}: {
  role: AdminRole | undefined;
  open?: boolean;
  /** Called when the rail needs to be on screen — the Alt+N shortcut. */
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  // Recomputed per render rather than memoised: the list is a dozen items and
  // the role changes only on sign-in.
  //
  // Empty groups are dropped so a support user is not shown a "Money" heading
  // with nothing under it.
  const [layer, setLayer] = useLayer();

  /**
   * Role first, then side.
   *
   * The order matters and is not interchangeable. Role decides what an
   * operator *may* reach and is mirrored from the server; side decides what
   * they have asked to *look at* right now. Filtering by side first would let
   * a preference appear to grant something — and a group left empty by a
   * preference should still disappear, which is why the emptiness check comes
   * after both.
   */
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        canAny(role, item.needs) &&
        (layer === "both" || item.side === undefined || item.side === layer),
    ),
  })).filter((group) => group.items.length > 0);

  /**
   * Collapsed to icons.
   *
   * Starts expanded and is corrected after mount, never during render: the
   * panel is statically prerendered, so reading `matchMedia` or storage while
   * rendering produces markup that disagrees with the client and React
   * discards the tree.
   *
   * A stored choice wins over the viewport. An operator who collapsed the rail
   * on a wide screen meant it; re-expanding it because their window is large
   * would be the panel arguing with them every morning.
   */
  const [collapsed, setCollapsed] = useState(false);

  /**
   * Whether the pointer is over a collapsed rail.
   *
   * Peeking is not un-collapsing. The stored preference is untouched, so
   * moving the mouse away puts the rail straight back — an operator who chose
   * 72px keeps 72px, and gets to read a label without paying for it with a
   * click and a second click to undo.
   */
  const [peeking, setPeeking] = useState(false);

  /**
   * Opening is delayed; closing is not.
   *
   * Without the delay, a pointer travelling diagonally across the screen to
   * something else clips the rail and throws it open on the way past — the
   * width animates, the page reflows, and the thing being aimed at moves.
   * 220ms is longer than a pass-through and shorter than a deliberate arrival.
   *
   * Closing has no delay on purpose: once somebody has left, holding the rail
   * open is the panel arguing with them.
   */
  const peekTimer = useRef<number | null>(null);

  const beginPeek = () => {
    if (peekTimer.current !== null) window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeeking(true), 220);
  };

  const endPeek = () => {
    if (peekTimer.current !== null) {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setPeeking(false);
  };

  // A pending timer must not fire into an unmounted component, and a rail left
  // peeking because the route changed under the pointer is a rail stuck open.
  useEffect(
    () => () => {
      if (peekTimer.current !== null) window.clearTimeout(peekTimer.current);
    },
    [],
  );

  /**
   * What the rail actually renders as.
   *
   * Everything below reads this rather than `collapsed`, so a peeked rail is
   * indistinguishable from an open one — labels, tooltips, focusability and
   * the group chevrons all follow together instead of each needing to know
   * about peeking separately.
   */
  const narrow = collapsed && !peeking;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      if (stored === "true" || stored === "false") {
        setCollapsed(stored === "true");
        return;
      }
    } catch {
      // Storage disabled. The viewport still gets a say.
    }
    setCollapsed(window.matchMedia(NARROW_BELOW).matches);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((wasCollapsed) => {
      const next = !wasCollapsed;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // Not remembering is survivable.
      }
      return next;
    });
  };

  /**
   * Groups the operator has folded away, by label.
   *
   * Shut rather than open is stored, so a group added later appears rather
   * than arriving folded — a new section nobody can see is indistinguishable
   * from one that was never shipped.
   */
  const [shutGroups, setShutGroups] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SHUT_GROUPS_KEY);
      if (stored) setShutGroups(JSON.parse(stored) as string[]);
    } catch {
      // Unparseable or unavailable: every group open is a working rail.
    }
  }, []);

  const toggleGroup = (label: string) => {
    setShutGroups((shut) => {
      const next = shut.includes(label)
        ? shut.filter((l) => l !== label)
        : [...shut, label];
      try {
        localStorage.setItem(SHUT_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Not remembering is survivable.
      }
      return next;
    });
  };

  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ y: number; h: number } | null>(
    null,
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const activeHref =
    groups.flatMap((group) => group.items).find((item) => isActive(item.href))
      ?.href ?? null;

  /**
   * Measures the active item and positions the indicator.
   *
   * Finds the element by attribute rather than by index into a flat list.
   * Indexing broke the moment the nav was grouped — the items now live in
   * several lists, and nothing about an index survives that. Querying for the
   * active element is indifferent to how the markup is arranged.
   *
   * `useLayoutEffect` rather than `useEffect`: this runs before paint, so the
   * indicator never appears at the wrong position for a frame.
   */
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || !activeHref) {
      setIndicator(null);
      return;
    }
    const item = nav.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (!item) {
      setIndicator(null);
      return;
    }
    // offsetTop is relative to the nearest positioned ancestor, which is the
    // nav itself — so this stays correct with the items nested inside groups.
    setIndicator({ y: item.offsetTop, h: item.offsetHeight });
  }, [activeHref, narrow, groups.length, shutGroups]);

  /**
   * A group is folded unless it holds the page you are on.
   *
   * Collapsing the section containing the current page would hide the one item
   * whose position the sliding indicator is measuring, and leave an operator
   * looking at a rail that does not contain where they are.
   */
  const isShut = (group: { label: string; items: { href: string }[] }) =>
    shutGroups.includes(group.label) &&
    !group.items.some((item) => item.href === activeHref);

  /**
   * Alt+N puts focus on the rail.
   *
   * The skip link goes past navigation, which is right for reading a page and
   * useless for reaching a different one — a keyboard user who wanted the nav
   * had to tab through the top bar and the layer switch to get there. Alt is
   * modified, so it cannot fire while somebody is typing a partner's name.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "n") return;
      event.preventDefault();
      onOpen?.();
      // Focused straight away rather than after a frame. The rail is in the
      // DOM at every width — below `md` it is merely translated off-screen —
      // so there is nothing to wait for, and `requestAnimationFrame` does not
      // run at all in a hidden document, which is precisely where a keyboard
      // user's second monitor is.
      navRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);

  // Escape closes the drawer, and a navigation closes it too: on a phone the
  // rail covers the page it just took you to.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    // Deliberately keyed on the path alone. Including `onClose` would fire
    // this whenever the parent re-rendered with a new closure, shutting a
    // drawer the operator had just opened.
    closeRef.current?.();
  }, [pathname]);

  return (
    <>
      {/* Below `md` the rail is an overlay, so it needs something to close it
          that is not a hunt for the toggle. Hidden from assistive technology —
          Escape and the rail's own close control are the accessible paths, and
          a focusable backdrop is a tab stop that does nothing legible. */}
      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}
    <aside
      onMouseEnter={collapsed ? beginPeek : undefined}
      onMouseLeave={collapsed ? endPeek : undefined}
      /*
        Focus opens it too. A keyboard user tabbing into a collapsed rail would
        otherwise move through a column of unlabelled icons — the peek is what
        makes the labels available, so it has to be reachable without a mouse.
      */
      onFocusCapture={collapsed ? () => setPeeking(true) : undefined}
      onBlurCapture={
        collapsed
          ? (event) => {
              // Only when focus has genuinely left the rail, not while moving
              // between two items inside it.
              if (!event.currentTarget.contains(event.relatedTarget)) {
                endPeek();
              }
            }
          : undefined
      }
      data-collapsed={narrow}
      data-peek={peeking ? "true" : undefined}
      data-open={open}
      /*
        `data-peek` floats the rail over the page instead of pushing it.

        This is the whole difference between a hover-expand that feels
        considered and one that feels broken. If the rail grows in the layout,
        every column to its right moves — on a table that is a 176px reflow of
        the thing the operator is reading, triggered by the mouse merely
        passing near the edge. Overlaying costs nothing and moves nothing.

        The 72px track is held by the sibling spacer, so the page never learns
        the rail widened. A deliberate collapse still reflows, once, because
        that was asked for.
      */
      className="group/rail fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col border-r border-rail-line bg-rail-bg text-rail-fg
                 transition-[width,transform] duration-300 ease-[var(--ease-out-quint)]
                 w-[248px] data-[collapsed=true]:w-[72px]
                 -translate-x-full data-[open=true]:translate-x-0
                 md:static md:z-20 md:translate-x-0
                 data-[peek=true]:md:absolute data-[peek=true]:md:inset-y-0
                 data-[peek=true]:md:left-0 data-[peek=true]:md:w-[248px]
                 data-[peek=true]:md:[box-shadow:var(--elev-3)]"
    >
      {/* No brand block here.

          The rail used to open with the mark and "Mioryde / Operations",
          directly beneath the identical pair in the top bar — two marks and
          two wordmarks stacked in the same corner, which reads as a rendering
          fault rather than as branding. The top bar owns it: it spans the full
          width and cannot be collapsed away, which is what makes it furniture.
          A rail that can shrink to 72px is the wrong place to keep the one
          element that must always be legible. */}

      {/* Navigation */}
      {/* Labelled, so a screen reader announces it as the panel's navigation
          rather than as an unnamed region indistinguishable from any other. */}
      {/* Above the navigation it filters, so the cause sits over the effect. */}
      {/* Only when the rail is an overlay. On a desktop it is furniture and
          there is nothing to close. */}
      <button
        type="button"
        onClick={onClose}
        className="flex h-11 items-center gap-2 px-3 text-body text-rail-fg-muted
                   transition-colors hover:text-rail-fg md:hidden"
      >
        <span aria-hidden className="font-mono">
          ←
        </span>
        Close navigation
      </button>

      {/*
        Icon only, and pinned right so it sits on the rail's edge — the edge
        being the thing that moves. At 72px there is no room for a word anyway,
        so a label would only have existed to disappear.
      */}
      <div className="flex h-11 shrink-0 items-center justify-end px-3.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid size-7 place-items-center rounded-xs text-rail-fg-faint
                     transition-colors duration-150 hover:bg-rail-hover hover:text-rail-fg
                     focus-visible:ring-2 focus-visible:ring-rail-accent focus-visible:outline-none"
        >
          {/*
            Two bars, not a chevron. A chevron says "there is more this way",
            which is what the group headers below already say; this says "the
            panel has an edge and I am moving it". The right-hand bar slides
            toward the left one as it closes.
          */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="1.5" y="2.5" width="4" height="11" rx="1" fill="currentColor" opacity="0.9" />
            <rect
              x="7.5"
              y="2.5"
              width="7"
              height="11"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.3"
              className="origin-left transition-transform duration-300 ease-[var(--ease-out-quint)] motion-reduce:transition-none"
              style={{ transform: collapsed ? "scaleX(0.35)" : "none" }}
            />
          </svg>
        </button>
      </div>

      <div className="border-b border-rail-line">
        <LayerSwitch layer={layer} onChange={setLayer} collapsed={narrow} />
      </div>

      <nav
        ref={navRef}
        aria-label="Panel sections"
        className="relative flex-1 overflow-y-auto overflow-x-hidden p-2"
      >
        {/* The single sliding indicator. `translate3d` keeps it on the
            compositor; animating `top` instead would trigger layout each frame. */}
        {indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-2 right-2 z-0 chamfer-sm bg-rail-active
                       transition-transform duration-300 ease-[var(--ease-out-quint)]
                       motion-reduce:transition-none"
            style={{
              height: indicator.h,
              transform: `translate3d(0, ${indicator.y}px, 0)`,
            }}
          />
        )}

        <div className="relative z-10 flex flex-col gap-4">
          {groups.map((group) => {
            const shut = isShut(group);
            return (
            <div key={group.label}>
              {/* A button, not a heading, because it does something. Hidden
                  when collapsed: a 72px rail has no room for a word, and a
                  truncated heading is worse than none — folding is also
                  meaningless there, since every group is already icons. */}
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={!shut}
                aria-hidden={narrow}
                tabIndex={narrow ? -1 : undefined}
                className="flex w-full items-center gap-1.5 px-3 pb-1 font-mono text-micro uppercase
                           text-rail-fg-faint transition-opacity duration-200 hover:text-rail-fg-muted
                           group-data-[collapsed=true]/rail:opacity-0"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  aria-hidden
                  className="shrink-0 transition-transform duration-200 motion-reduce:transition-none"
                  style={{ transform: shut ? "rotate(-90deg)" : "none" }}
                >
                  <path d="M1 2.5L4 5.5l3-3" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                {group.label}
              </button>
              <ul className="flex flex-col gap-0.5" hidden={shut}>
          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} data-nav-active={active ? "true" : undefined}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={narrow ? item.label : undefined}
                  className="group/item relative flex h-11 items-center gap-3 rounded-none px-3
                             transition-colors duration-150"
                >
                  {/* Hazard tick — the brand's accent shape, earning its place
                      as the active marker rather than a generic left border. */}
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 origin-center
                               bg-rail-accent transition-transform duration-300
                               ease-[var(--ease-spring)]"
                    style={{ transform: `translateY(-50%) scaleY(${active ? 1 : 0})` }}
                  />

                  {/* An icon, not the two-letter mark this used to show.

                      At 72px a column of initialisms is a column of things
                      that must be *read*, and `PO` four rows from `PT` is a
                      mistake waiting to happen. A silhouette is recognised
                      without reading, which is the entire job of a collapsed
                      rail. The mark survives for the command palette, where
                      there is room for neither an icon nor a full label. */}
                  <span
                    className={`grid size-7 shrink-0 place-items-center transition-colors duration-150
                                ${
                                  active
                                    ? "text-rail-accent"
                                    : "text-rail-fg-faint group-hover/item:text-rail-fg"
                                }`}
                  >
                    <NavIcon name={item.icon} />
                  </span>

                  <span
                    className={`min-w-0 flex-1 truncate text-body transition-[opacity,color] duration-200
                                group-data-[collapsed=true]/rail:opacity-0
                                ${
                                  active
                                    ? "font-medium text-rail-fg"
                                    : "text-rail-fg-muted group-hover/item:text-rail-fg"
                                }`}
                  >
                    {item.label}
                  </span>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="chamfer-sm bg-rail-accent px-1.5 py-0.5 font-mono text-meta
                                 font-bold text-rail-bg
                                 group-data-[collapsed=true]/rail:opacity-0"
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
              </ul>
            </div>
            );
          })}
        </div>
      </nav>

      {/*
        The pinned foot.

        Settings and help are not part of the job, so they are not in the list
        of places the job happens. They live at a fixed address that does not
        move when a group is folded, when a role hides half the rail, or when
        the list grows — because both are reached rarely, and hunting for a
        rarely-used destination is the whole of its cost.

        Icon-first even when expanded: these are two items in a row rather than
        a stack, so the foot stays one line tall and the navigation above keeps
        the height.
      */}
      <div className="border-t border-rail-line p-2">
        <div className="mb-1 flex items-center gap-1">
          {RAIL_FOOTER.filter(
            // An empty `needs` means open to everyone. `canAny` is `some` over
            // the list, which is false for an empty one — the opposite of what
            // an unrestricted page means.
            (item) => item.needs.length === 0 || canAny(role, item.needs),
          ).map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`group/foot flex h-8 items-center gap-2.5 rounded-xs px-1.5
                            transition-colors duration-150
                            ${narrow ? "" : "flex-1"}
                            ${
                              active
                                ? "bg-rail-active text-rail-fg"
                                : "text-rail-fg-faint hover:bg-rail-hover hover:text-rail-fg"
                            }`}
              >
                <span className="grid size-5 shrink-0 place-items-center">
                  <NavIcon name={item.icon} />
                </span>
                <span
                  aria-hidden={narrow}
                  className="min-w-0 truncate text-body transition-opacity duration-200
                             group-data-[collapsed=true]/rail:opacity-0"
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        <ThemeSwitcher collapsed={narrow} />

        {/* The collapse control moved to the top of the rail.

            It used to live down here under the theme switcher, which put the
            one control that changes the shape of the navigation below all of
            the navigation — so using it meant travelling the full height of
            the thing you were about to shrink. It is now the first element in
            the rail, where the effect is next to the cause. */}
      </div>
    </aside>

    {/*
      Holds the 72px track while the rail is floating over the page.

      Only rendered during a peek, and only on desktop — at which point the
      rail is `position: absolute` and has left the flex row, so without this
      the entire page would slide 72px left the instant the pointer arrived.
      That is the reflow the overlay exists to avoid, arriving by the back
      door.
    */}
    {peeking ? (
      <div aria-hidden className="hidden w-[72px] shrink-0 md:block" />
    ) : null}
    </>
  );
}
