import type { Capability } from "@/lib/permissions";

/**
 * The one description of what this panel contains.
 *
 * It used to live inside the sidebar, which was fine while the sidebar was the
 * only thing that needed it. The breadcrumb trail and the global search both
 * ask the same question — what is at this path, and what is it called — and
 * three copies of that answer would drift the first time a page was renamed.
 */
export interface NavItem {
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
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
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
  // Separate from Governance: those two are about what was agreed and what was
  // done, these are about whether the machine is working and who can touch it.
  // Filed together they read as one undifferentiated pile of admin screens.
  {
    label: "System",
    items: [
      { href: "/monitoring", label: "Monitoring", mark: "MO", needs: ["metrics.view"] },
      { href: "/readiness", label: "Readiness", mark: "RD", needs: ["metrics.view"] },
      { href: "/access", label: "Access control", mark: "AC", needs: ["access.manage"] },
    ],
  },
];

/** Every destination, flattened. Search and breadcrumbs both want this. */
export function allNavItems(): (NavItem & { group: string })[] {
  return NAV_GROUPS.flatMap((g) =>
    g.items.map((item) => ({ ...item, group: g.label })),
  );
}

/**
 * The nav entry a path belongs to, including detail pages.
 *
 * `/orders/abc123` is not itself a nav item, but it lives under one, and the
 * trail above it should say so. Longest match wins so `/riders/x` resolves to
 * Partners rather than to the root Overview, which every path starts with.
 */
export function navItemForPath(pathname: string): (NavItem & { group: string }) | null {
  const candidates = allNavItems()
    .filter((item) =>
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length);
  return candidates[0] ?? null;
}
