"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
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
export function Sidebar({ role }: { role: AdminRole | undefined }) {
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

  const [collapsed, setCollapsed] = useState(false);

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
  }, [activeHref, collapsed, groups.length]);

  return (
    <aside
      data-collapsed={collapsed}
      className="group/rail relative z-20 flex h-dvh shrink-0 flex-col border-r border-line bg-surface
                 transition-[width] duration-300 ease-[var(--ease-out-quint)]
                 w-[248px] data-[collapsed=true]:w-[72px]"
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-line px-4">
        <div className="grad-accent chamfer-sm grid size-8 shrink-0 place-items-center">
          <span className="font-mono text-body font-bold text-on-accent-bright">M</span>
        </div>
        <div
          className="min-w-0 overflow-hidden transition-opacity duration-200
                     group-data-[collapsed=true]/rail:opacity-0"
          aria-hidden={collapsed}
        >
          <p className="truncate font-sans text-body font-semibold leading-tight">
            Mioryde
          </p>
          <p className="truncate font-mono text-micro uppercase text-fg-muted">
            Operations
          </p>
        </div>
      </div>

      {/* Navigation */}
      {/* Labelled, so a screen reader announces it as the panel's navigation
          rather than as an unnamed region indistinguishable from any other. */}
      {/* Above the navigation it filters, so the cause sits over the effect. */}
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
          {groups.map((group) => (
            <div key={group.label}>
              {/* Hidden when collapsed: a 72px rail has no room for a word,
                  and a truncated heading is worse than none. */}
              <p
                className="px-3 pb-1 font-mono text-micro uppercase text-fg-faint
                           transition-opacity duration-200
                           group-data-[collapsed=true]/rail:opacity-0"
                aria-hidden={collapsed}
              >
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
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
          ))}
        </div>
      </nav>

      <div className="border-t border-line p-2">
        <ThemeSwitcher collapsed={collapsed} />

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
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
  );
}
