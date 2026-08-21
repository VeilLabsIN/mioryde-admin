"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type AdminRole, canAny } from "@/lib/permissions";
import { NAV_GROUPS } from "@/lib/nav";
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
  }, [activeHref, collapsed, groups.length, shutGroups]);

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
      data-collapsed={collapsed}
      data-open={open}
      className="group/rail fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col border-r border-line bg-surface
                 transition-[width,transform] duration-300 ease-[var(--ease-out-quint)]
                 w-[248px] data-[collapsed=true]:w-[72px]
                 -translate-x-full data-[open=true]:translate-x-0
                 md:static md:z-20 md:translate-x-0"
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
        className="flex h-11 items-center gap-2 px-3 text-body text-fg-muted
                   transition-colors hover:text-fg md:hidden"
      >
        <span aria-hidden className="font-mono">
          ←
        </span>
        Close navigation
      </button>

      <div className="border-b border-line pt-2">
        <LayerSwitch layer={layer} onChange={setLayer} collapsed={collapsed} />
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
            className="pointer-events-none absolute left-2 right-2 z-0 chamfer-sm bg-panel
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
                aria-hidden={collapsed}
                tabIndex={collapsed ? -1 : undefined}
                className="flex w-full items-center gap-1.5 px-3 pb-1 font-mono text-micro uppercase
                           text-fg-faint transition-opacity duration-200 hover:text-fg-mid
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
                  title={collapsed ? item.label : undefined}
                  className="group/item relative flex h-11 items-center gap-3 rounded-none px-3
                             transition-colors duration-150"
                >
                  {/* Hazard tick — the brand's accent shape, earning its place
                      as the active marker rather than a generic left border. */}
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 origin-center
                               bg-accent-bright transition-transform duration-300
                               ease-[var(--ease-spring)]"
                    style={{ transform: `translateY(-50%) scaleY(${active ? 1 : 0})` }}
                  />

                  {/* Off the scale on purpose: `text-micro` carries 2px of
                      tracking, which pushes a two-letter mark off-centre in a
                      fixed 28px box. This is a glyph, not a label. */}
                  <span
                    className={`grid size-7 shrink-0 place-items-center font-mono text-[10px]
                                font-bold tracking-tight transition-colors duration-150
                                ${
                                  active
                                    ? "text-accent"
                                    : "text-fg-faint group-hover/item:text-fg-mid"
                                }`}
                  >
                    {item.mark}
                  </span>

                  <span
                    className={`min-w-0 flex-1 truncate text-body transition-[opacity,color] duration-200
                                group-data-[collapsed=true]/rail:opacity-0
                                ${
                                  active
                                    ? "font-medium text-fg"
                                    : "text-fg-muted group-hover/item:text-fg-soft"
                                }`}
                  >
                    {item.label}
                  </span>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="chamfer-sm bg-accent-bright px-1.5 py-0.5 font-mono text-meta
                                 font-bold text-on-accent-bright
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

      <div className="border-t border-line p-2">
        <ThemeSwitcher collapsed={collapsed} />

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mt-1 flex h-9 w-full items-center gap-3 px-3 text-fg-faint
                     transition-colors duration-150 hover:text-fg-mid"
        >
          <span className="grid size-7 shrink-0 place-items-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
              className="transition-transform duration-300 ease-[var(--ease-out-quint)]"
              style={{ transform: collapsed ? "rotate(180deg)" : "none" }}
            >
              <path
                d="M9 3L5 7l4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </svg>
          </span>
          <span
            className="truncate font-mono text-micro uppercase
                       transition-opacity duration-200
                       group-data-[collapsed=true]/rail:opacity-0"
          >
            Collapse
          </span>
        </button>
      </div>
    </aside>
    </>
  );
}
