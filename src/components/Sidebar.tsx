"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { type AdminRole, type Capability, canAny } from "@/lib/permissions";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface NavItem {
  href: string;
  label: string;
  /** Two-character monogram. Icon fonts would be another network round trip
   *  for something that renders identically as text. */
  mark: string;
  badge?: number;
  /**
   * Capabilities that make this destination useful. Shown when the role holds
   * any of them.
   *
   * Filtering navigation is a courtesy, not a control: the API enforces the
   * same matrix per route, so a hidden link typed directly leads to a page that
   * loads nothing. Hiding it means an operator is not repeatedly offered doors
   * that will not open.
   */
  needs: readonly Capability[];
}

/**
 * Navigation, grouped by what an operator is trying to do.
 *
 * A flat list was right at seven items and stopped being right at thirteen:
 * "Bank checks" and "Rate cards" sat adjacent while having nothing to do with
 * each other, so finding anything meant reading every label. The groups are
 * the questions people arrive with — what is happening now, who are these
 * people, where is the money, what did we agree.
 *
 * A group with no visible items is dropped entirely, so a support user never
 * sees an empty "Money" heading advertising pages they cannot open.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { href: "/", label: "Overview", mark: "OV", needs: ["metrics.view"] },
      { href: "/live", label: "Live", mark: "LV", needs: ["orders.view"] },
      { href: "/orders", label: "Deliveries", mark: "DL", needs: ["orders.view"] },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/customers", label: "Customers", mark: "CU", needs: ["customers.view"] },
      { href: "/riders", label: "Partners", mark: "PT", needs: ["riders.view"] },
      { href: "/kyc", label: "Verification", mark: "KY", needs: ["riders.review"] },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/payouts", label: "Payouts", mark: "PO", needs: ["payouts.view"] },
      { href: "/banking", label: "Bank checks", mark: "BK", needs: ["payouts.settle"] },
      { href: "/collections", label: "Collections", mark: "CO", needs: ["payouts.settle"] },
      { href: "/pricing", label: "Rate cards", mark: "RC", needs: ["pricing.view"] },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/analytics", label: "Analytics", mark: "AN", needs: ["metrics.view"] },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/agreement", label: "Agreement", mark: "AG", needs: ["pricing.edit"] },
      { href: "/audit", label: "Audit log", mark: "AU", needs: ["audit.view"] },
    ],
  },
];

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
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAny(role, item.needs)),
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
          <span className="font-mono text-[13px] font-bold text-on-accent">M</span>
        </div>
        <div
          className="min-w-0 overflow-hidden transition-opacity duration-200
                     group-data-[collapsed=true]/rail:opacity-0"
          aria-hidden={collapsed}
        >
          <p className="truncate font-sans text-sm font-semibold leading-tight">
            Mioryde
          </p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[2px] text-fg-muted">
            Operations
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav ref={navRef} className="relative flex-1 overflow-y-auto overflow-x-hidden p-2">
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
                className="px-3 pb-1 font-mono text-[9px] uppercase tracking-[1.5px] text-fg-faint
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
                               bg-accent transition-transform duration-300
                               ease-[var(--ease-spring)]"
                    style={{ transform: `translateY(-50%) scaleY(${active ? 1 : 0})` }}
                  />

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
                    className={`min-w-0 flex-1 truncate text-[13px] transition-[opacity,color] duration-200
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
                      className="chamfer-sm bg-accent px-1.5 py-0.5 font-mono text-[10px]
                                 font-bold text-on-accent
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
            className="truncate font-mono text-[10px] uppercase tracking-[2px]
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
