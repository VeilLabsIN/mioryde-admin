import type { IconName } from "@/components/NavIcon";
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
  /**
   * The two-letter mark, kept for the command palette and breadcrumbs.
   *
   * No longer used in the rail: at 72px a column of initialisms is a column of
   * things that have to be *read*, and `PO` beside `PT` four rows apart is a
   * mistake waiting to be made. The rail uses `icon`; text surfaces that have
   * room for neither an icon nor a full label still use this.
   */
  mark: string;
  /** The rail's glyph. See `NavIcon` for why these are drawn rather than installed. */
  icon: IconName;
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
  /**
   * Which half of the business this belongs to.
   *
   * Omitted means both, and most of the panel genuinely is both — a delivery
   * has a customer at one end and a partner at the other, and the live board
   * shows the same row to whoever is looking. Only the pages that are truly
   * about one party carry a side.
   */
  side?: "customer" | "rider";
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
      { href: "/", label: "Overview", mark: "OV", icon: "overview", needs: ["metrics.view"] },
      { href: "/live", label: "Live", mark: "LV", icon: "live", needs: ["orders.view"] },
      // The same deliveries as Live, drawn spatially. Both exist because they
      // answer different questions: the board is for triage "what needs me
      // next", the map is for geography "who is near this pickup".
      { href: "/map", label: "Map", mark: "MP", icon: "map", needs: ["orders.view"] },
      { href: "/orders", label: "Deliveries", mark: "DL", icon: "deliveries", needs: ["orders.view"] },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/customers", label: "Customers", mark: "CU", icon: "customers", needs: ["customers.view"], side: "customer" },
      { href: "/riders", label: "Partners", mark: "PT", icon: "partners", needs: ["riders.view"], side: "rider" },
      { href: "/kyc", label: "Verification", mark: "KY", icon: "verification", needs: ["riders.review"], side: "rider" },
    ],
  },
  {
    label: "Money",
    items: [
      // Customer-side money, above the rider-side rows: this is where "did
      // that charge go through" is answered, including wallet top-ups, which
      // had no representation in the panel at all.
      { href: "/payments", label: "Payments", mark: "PY", icon: "payouts", needs: ["payments.view"], side: "customer" },
      { href: "/payouts", label: "Payouts", mark: "PO", icon: "payouts", needs: ["payouts.view"], side: "rider" },
      { href: "/banking", label: "Bank checks", mark: "BK", icon: "banking", needs: ["payouts.settle"], side: "rider" },
      { href: "/collections", label: "Collections", mark: "CO", icon: "collections", needs: ["payouts.settle"], side: "rider" },
      { href: "/pricing", label: "Rate cards", mark: "RC", icon: "pricing", needs: ["pricing.view"] },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/analytics", label: "Analytics", mark: "AN", icon: "analytics", needs: ["metrics.view"] },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/agreement", label: "Agreement", mark: "AG", icon: "agreement", needs: ["pricing.edit"], side: "rider" },
      { href: "/audit", label: "Audit log", mark: "AU", icon: "audit", needs: ["audit.view"] },
    ],
  },
  // Separate from Governance: those two are about what was agreed and what was
  // done, these are about whether the machine is working and who can touch it.
  // Filed together they read as one undifferentiated pile of admin screens.
  {
    label: "System",
    items: [
      { href: "/monitoring", label: "Monitoring", mark: "MO", icon: "monitoring", needs: ["metrics.view"] },
      // Its own capability, granted to ops and owner, matching the server.
      // This used to say `orders.view` — which support also has, so support
      // saw the link and hit a 403 behind it.
      { href: "/notifications", label: "Notifications", mark: "NT", icon: "notifications", needs: ["notifications.manage"] },
      // Same capability as notifications: both are "say something to everybody",
      // and splitting them would mean granting one team the ability to message
      // the whole city and not the other.
      { href: "/banners", label: "In-app banners", mark: "BN", icon: "notifications", needs: ["banners.manage"] },
      { href: "/readiness", label: "Readiness", mark: "RD", icon: "readiness", needs: ["metrics.view"] },
      { href: "/access", label: "Access control", mark: "AC", icon: "access", needs: ["access.manage"] },
    ],
  },
];

/** Every destination, flattened. Search and breadcrumbs both want this. */
/**
 * The rail's pinned foot.
 *
 * Settings and help are not a group and were wrong inside one. Everything in
 * `NAV_GROUPS` is a place operators go *to do the job* — deliveries, payouts,
 * partners — and those are read by scanning downward. Settings is a place they
 * go when something about the tool itself is wrong, which is a different kind
 * of errand and belongs at a fixed address rather than at whatever height the
 * System group happens to end up.
 *
 * Pinned, so it does not move when a group is folded, when a role hides half
 * the rail, or when the list grows. A destination that keeps still is one
 * people reach for without looking, and both of these are used rarely enough
 * that hunting for them is the whole cost.
 *
 * Held out of `NAV_GROUPS` rather than flagged inside it: `allNavItems` feeds
 * the command palette and the breadcrumb trail, and both want these listed
 * alongside everything else. Only the rail treats them differently.
 */
export const RAIL_FOOTER: NavItem[] = [
  {
    // Above Settings, and the pairing is deliberate: Settings explains what the
    // process booted with and cannot change it, Platform changes what the
    // product is doing right now. Somebody arriving to stop an incident wants
    // the second one, and finding the read-only page first wastes the minute
    // that matters.
    href: "/platform",
    label: "Platform",
    mark: "PF",
    icon: "platform",
    needs: ["platform.manage"],
  },
  {
    href: "/settings",
    label: "Settings",
    mark: "ST",
    icon: "settings",
    needs: ["settings.view"],
  },
  {
    href: "/help",
    label: "Help",
    mark: "HP",
    icon: "help",
    // Unlisted in ROUTE_CAPABILITIES on purpose, so every role reaches it.
    // Somebody being asked to use a tool is entitled to read about it.
    needs: [],
  },
];

export function allNavItems(): (NavItem & { group: string })[] {
  // The pinned pair are included here even though the rail draws them
  // separately — the command palette and the breadcrumb trail want every
  // destination, and a page missing from those is a page nobody can jump to.

  return [
    ...NAV_GROUPS.flatMap((g) =>
      g.items.map((item) => ({ ...item, group: g.label })),
    ),
    ...RAIL_FOOTER.map((item) => ({ ...item, group: "System" })),
  ];
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
