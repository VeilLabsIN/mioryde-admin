"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItemForPath } from "@/lib/nav";

/**
 * Where you are, on every page.
 *
 * `PageHeader` already takes a `breadcrumb` prop, and three detail pages pass
 * one. That left the trail present on the pages whose authors remembered and
 * absent everywhere else — so it read as decoration rather than as a fixed
 * part of the furniture you could rely on.
 *
 * This derives the trail from the path instead, which means it cannot be
 * forgotten and cannot disagree with the sidebar: both read the same registry.
 *
 * A record id is shown truncated rather than resolved to a name. Resolving it
 * would mean this strip issuing its own fetch on every navigation, and a
 * breadcrumb that loads is a breadcrumb that flickers — the page below is
 * already naming the record in its title.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const item = navItemForPath(pathname);

  // The overview is the root. A trail reading "Overview" above a page titled
  // "Overview" is noise.
  if (!item || pathname === "/") return null;

  const rest = pathname
    .slice(item.href === "/" ? 1 : item.href.length)
    .split("/")
    .filter(Boolean);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line
                 bg-surface px-6 text-meta text-fg-faint"
    >
      <Link
        href="/"
        className="motion-change transition-colors hover:text-accent"
      >
        Mioryde
      </Link>

      <Separator />

      <span className="text-fg-muted">{item.group}</span>

      <Separator />

      {rest.length === 0 ? (
        <span className="font-medium text-fg-soft" aria-current="page">
          {item.label}
        </span>
      ) : (
        <>
          <Link
            href={item.href}
            className="motion-change transition-colors hover:text-accent"
          >
            {item.label}
          </Link>
          {rest.map((segment, index) => (
            <span key={segment} className="flex items-center gap-1.5">
              <Separator />
              <span
                className="font-mono text-fg-soft"
                aria-current={index === rest.length - 1 ? "page" : undefined}
                // The full value, for anyone reconciling against a log where
                // the id is written out in full.
                title={segment}
              >
                {segment.length > 12 ? `${segment.slice(0, 8)}…` : segment}
              </span>
            </span>
          ))}
        </>
      )}
    </nav>
  );
}

/** Decorative, so it is not read out between every level. */
function Separator() {
  return (
    <span aria-hidden className="text-fg-muted/50">
      /
    </span>
  );
}
