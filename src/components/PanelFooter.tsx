"use client";

import Link from "next/link";
import { useState } from "react";
import { useAttention } from "./Banner";
import { NAV_GROUPS } from "@/lib/nav";
import { FOOTER_PRIMARY, allSiteLinks, siteLinksNotInNav } from "@/lib/siteLinks";
import { type AdminRole, canAny } from "@/lib/permissions";

/**
 * What the status light is allowed to claim.
 *
 * The temptation is a green dot and the words "Systems Operational", which is
 * what the design frames show and what every ops panel ships. It is only
 * honest when something actually checked. Monitoring and readiness are both
 * role-gated, so for a support operator every request behind this light is
 * refused — and a green light in that case does not mean "fine", it means
 * "asked nobody". That gets its own state rather than borrowing the good one.
 */
type Health = "unknown" | "checking" | "ok" | "degraded" | "down";

const HEALTH: Record<Health, { dot: string; text: string; label: string }> = {
  checking: { dot: "bg-fg-faint", text: "text-fg-faint", label: "Checking status" },
  unknown: { dot: "bg-fg-faint", text: "text-fg-faint", label: "Status not visible to your role" },
  ok: { dot: "bg-accent-alt", text: "text-fg-muted", label: "All systems normal" },
  degraded: { dot: "bg-warn", text: "text-warn", label: "Needs attention" },
  down: { dot: "bg-danger", text: "text-danger", label: "Action required" },
};

function useHealth(): { state: Health; detail: string | null } {
  const { items, sources, loaded } = useAttention();

  if (!loaded) return { state: "checking", detail: null };
  if (sources === 0) return { state: "unknown", detail: null };

  const critical = items.filter((i) => i.tone === "critical");
  if (critical.length > 0) {
    return { state: "down", detail: critical[0]!.title };
  }
  if (items.length > 0) {
    return {
      state: "degraded",
      detail: `${items.length} issue${items.length === 1 ? "" : "s"} outstanding`,
    };
  }
  return { state: "ok", detail: null };
}

/**
 * The footer bar, on every authenticated page.
 *
 * ## Why a bar and not a page
 *
 * Everything in it already existed and none of it was findable. The privacy
 * position was a paragraph inside `/legal`, which is reachable only from a
 * menu behind a `?`; support had no home at all; the version number was in
 * `package.json`. An operator with a question had the search box and a guess.
 *
 * ## Why it does not scroll away
 *
 * It sits below `<main>` in the shell rather than at the end of the page. A
 * footer that requires scrolling to the bottom of a two-thousand-row delivery
 * table is a footer that is never seen, and the two things people want from it
 * — is the system healthy, who do I tell — are wanted most when something is
 * going wrong halfway down a queue.
 *
 * The site map is collapsed by default and holds the full index. The bar keeps
 * four links because a footer listing eleven destinations is furniture people
 * learn to look past.
 */
export function PanelFooter({ role }: { role: AdminRole | undefined }) {
  const [mapOpen, setMapOpen] = useState(false);
  const { state, detail } = useHealth();
  const health = HEALTH[state];

  const byHref = new Map(allSiteLinks().map((l) => [l.href, l]));
  const primary = FOOTER_PRIMARY.map((href) => byHref.get(href)).filter(
    (l) => l !== undefined,
  );

  return (
    <footer className="shrink-0 border-t border-line bg-surface">
      {mapOpen && <SiteMap role={role} onNavigate={() => setMapOpen(false)} />}

      <div
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2
                   px-6 py-2.5"
      >
        {/* Health first. It is the one thing here that changes. */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${health.dot} ${
              state === "down" ? "motion-safe:animate-pulse" : ""
            }`}
          />
          <span className={`truncate text-meta ${health.text}`}>
            {detail ?? health.label}
          </span>
        </div>

        <nav aria-label="Help and policies" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {primary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="motion-change text-meta text-fg-muted transition-colors
                         hover:text-accent"
            >
              {link.label}
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setMapOpen((o) => !o)}
            aria-expanded={mapOpen}
            aria-controls="panel-site-map"
            className="motion-change flex items-center gap-1.5 text-meta text-fg-muted
                       transition-colors hover:text-accent"
          >
            All pages
            <svg
              width="9"
              height="9"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden
              className="transition-transform duration-200 ease-[var(--ease-out-quint)]
                         motion-reduce:transition-none"
              style={{ transform: mapOpen ? "rotate(180deg)" : "none" }}
            >
              <path d="M2 6.5L5 3.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
            </svg>
          </button>
        </nav>

        <p className="truncate font-mono text-micro uppercase text-fg-faint">
          Miorigin Pvt Ltd
          <span aria-hidden> · </span>
          <Link href="/about" className="transition-colors hover:text-accent">
            Panel v{process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.1.0"}
          </Link>
        </p>
      </div>
    </footer>
  );
}

/**
 * The full index, expanded upward from the bar.
 *
 * Both registries in one place, which is the only view in the panel that shows
 * the whole product at once. Role-filtered exactly like the sidebar — a
 * support operator opening this should not be handed a directory of pages that
 * refuse to load.
 */
function SiteMap({
  role,
  onNavigate,
}: {
  role: AdminRole | undefined;
  onNavigate: () => void;
}) {
  const work = NAV_GROUPS.map((g) => ({
    label: g.label,
    links: g.items
      .filter((item) => canAny(role, item.needs))
      .map((item) => ({ href: item.href, label: item.label, blurb: null as string | null })),
  })).filter((g) => g.links.length > 0);

  // Deduped against the nav, not merged with it. Readiness, monitoring and the
  // audit log are in both registries — they are work pages the footer also
  // points at — and rendering both copies produced two groups called
  // "System", each listing the same three destinations.
  const site = siteLinksNotInNav(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  const rest = [...new Set(site.map((l) => l.group))]
    .map((label) => ({
      label,
      links: site
        .filter((l) => l.group === label)
        .filter((link) => link.needs === undefined || canAny(role, link.needs))
        .map((link) => ({ href: link.href, label: link.label, blurb: link.blurb })),
    }))
    .filter((g) => g.links.length > 0);

  return (
    <div
      id="panel-site-map"
      className="motion-enter max-h-[45vh] overflow-y-auto border-b border-line bg-panel px-6 py-5"
    >
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...work, ...rest].map((group) => (
          <div key={group.label}>
            <p className="mb-2 font-mono text-micro uppercase text-fg-faint">
              {group.label}
            </p>
            <ul className="space-y-1.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    className="motion-change block text-body text-fg-soft transition-colors
                               hover:text-accent"
                  >
                    {link.label}
                  </Link>
                  {link.blurb ? (
                    <p className="text-meta text-fg-faint">{link.blurb}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
