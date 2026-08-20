import type { Capability } from "@/lib/permissions";

/**
 * The pages that belong to everybody.
 *
 * `nav.ts` describes the panel's *work* — the queues and records an operator
 * opens to do their job, organised by capability. This describes everything
 * else: what the product is, who to ask when it breaks, what the company is
 * obliged to do with the data on screen. None of it is capability-gated,
 * because none of it is a place you can do damage.
 *
 * It is a registry for the same reason the nav is one. The footer lists these,
 * the site map expands them, and the help drawer points at several — three
 * copies of the same list would drift the first time a page was renamed.
 */
export interface SiteLink {
  href: string;
  label: string;
  /** Two-character monogram, same as a nav item — the command palette renders
   *  both lists through one row and would otherwise have a ragged column. */
  mark: string;
  /** One line, shown in the site map. Says what is behind the link, not what
   *  the link is called again. */
  blurb: string;
  /**
   * Set only on the few entries that mirror a capability-gated page. Same
   * courtesy as the nav: an operator is not offered a door that will not open.
   */
  needs?: readonly Capability[];
}

export const SITE_LINK_GROUPS: { label: string; links: SiteLink[] }[] = [
  {
    label: "Ask",
    links: [
      {
        href: "/wuda",
        mark: "WU",
        label: "Ask WUDA",
        blurb: "The assistant. Ask anything about the business or this panel, however you phrase it.",
      },
      {
        href: "/faq",
        mark: "FQ",
        label: "Questions and answers",
        blurb: "The whole knowledge base, searchable and filterable, for when you do not know what to ask.",
      },
    ],
  },
  {
    label: "Help and support",
    links: [
      {
        href: "/help",
        mark: "HP",
        label: "Help topics",
        blurb: "What each page is for, what people do there, and the behaviour that surprises them.",
      },
      {
        href: "/support",
        mark: "SU",
        label: "Support",
        blurb: "Who to tell when something is wrong, and what to send them so it can be fixed.",
      },
    ],
  },
  {
    label: "Company",
    links: [
      {
        href: "/about",
        mark: "AB",
        label: "About Mioryde",
        blurb: "The operating entity, what the platform is made of, and which version you are running.",
      },
      {
        href: "/legal",
        mark: "LG",
        label: "Policies and legal",
        blurb: "Registration numbers, your obligations using this panel, and what counsel still owes.",
      },
      {
        href: "/privacy",
        mark: "PV",
        label: "Privacy and data",
        blurb: "The personal data this panel shows you, how long it is kept, and what is recorded about your access.",
      },
    ],
  },
  {
    label: "System",
    links: [
      {
        href: "/readiness",
        mark: "RD",
        label: "Readiness",
        blurb: "Whether the platform is configured well enough to take real money.",
        needs: ["metrics.view"],
      },
      {
        href: "/monitoring",
        mark: "MO",
        label: "Monitoring",
        blurb: "The ledger, the outbox and the queues — whether the machinery is keeping up.",
        needs: ["metrics.view"],
      },
      {
        href: "/audit",
        mark: "AU",
        label: "Audit log",
        blurb: "Every consequential action taken in this panel, and who took it.",
        needs: ["audit.view"],
      },
    ],
  },
];

/** Every site link, flattened. */
export function allSiteLinks(): SiteLink[] {
  return SITE_LINK_GROUPS.flatMap((g) => g.links);
}

/**
 * The short row in the footer bar itself.
 *
 * Deliberately not all of them. A footer that lists eleven destinations is an
 * index nobody reads; these four are the ones somebody reaches for without
 * having decided to go looking, and the site map holds the rest.
 */
export const FOOTER_PRIMARY: readonly string[] = [
  // WUDA leads. It is the only one of these that answers a question you have
  // not already worked out how to look up, which makes it the right first stop
  // for the person who does not know where to start — and the footer is where
  // that person is looking.
  "/wuda",
  "/faq",
  "/support",
  "/privacy",
];

/**
 * Everything the command palette should be able to reach, nav and site pages
 * together.
 *
 * Readiness, monitoring and the audit log appear in both registries — they
 * are work pages that the footer also points at — so nav wins and the
 * duplicate is dropped. Two rows with the same name and different group labels
 * is a bug report waiting to be filed.
 */
export function siteLinksNotInNav(navHrefs: readonly string[]): (SiteLink & { group: string })[] {
  const taken = new Set(navHrefs);
  return SITE_LINK_GROUPS.flatMap((g) =>
    g.links
      .filter((link) => !taken.has(link.href))
      .map((link) => ({ ...link, group: g.label })),
  );
}
