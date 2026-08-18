"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

/** Chamfered primary action, matching the website's CTA shape. */
export function Button({
  className = "",
  loading = false,
  children,
  disabled,
  ...props
}: ComponentPropsWithoutRef<"button"> & { loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      className={`grad-accent chamfer-sm relative h-10 px-5 font-sans text-body font-semibold
                  text-on-accent transition-[filter,transform] duration-150
                  hover:brightness-110 active:scale-[0.98]
                  disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100
                  disabled:active:scale-100 ${className}`}
      {...props}
    >
      <span className={loading ? "opacity-0" : undefined}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}

export function GhostButton({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className={`h-9 border border-edge px-3 font-sans text-body text-fg-mid
                  transition-colors duration-150 hover:border-accent hover:text-accent
                  ${className}`}
      {...props}
    />
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`size-4 animate-spin ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Input({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return (
    <input
      // No `focus:outline-none`. It used to be here, and because Tailwind's
      // utilities sit in a later cascade layer than `@layer base` it beat the
      // global `:focus-visible { outline: 2px solid var(--accent) }` rule —
      // making the text field the one control in the panel that lost its
      // keyboard focus ring, keeping only a border colour change. The border
      // shift stays as reinforcement; the outline does the actual work.
      className={`motion-change h-10 w-full border border-edge bg-panel px-3 font-sans
                  text-body text-fg transition-colors placeholder:text-fg-faint
                  focus:border-accent ${className}`}
      {...props}
    />
  );
}

/**
 * How loud a container is.
 *
 * One `Card` for everything meant a warning, a table and a form all looked
 * identical, so a page had no read order — the operator had to read all of it
 * to find the part that mattered. Tone puts importance in the container rather
 * than in making its text bigger.
 *
 * The three status tones colour the *left edge* rather than the whole border.
 * A fully coloured box competes with its own contents for attention; an edge
 * marks the card in a scan of the page and then gets out of the way. The
 * monitoring page improvised this with `border-warn` before it was a pattern.
 */
type CardTone = "default" | "raised" | "inset" | "critical" | "warning" | "ok";

const CARD_TONES: Record<CardTone, string> = {
  default: "border-line bg-surface",
  raised: "border-edge bg-raised",
  // A level down, for detail nested inside another card. No shadow — an inset
  // surface with a shadow reads as floating above the thing containing it.
  inset: "border-line bg-panel",
  critical: "border-line border-l-2 border-l-danger bg-surface",
  warning: "border-line border-l-2 border-l-warn bg-surface",
  ok: "border-line border-l-2 border-l-ok bg-surface",
};

/** Panel with the brand's bottom-right corner cut. */
export function Card({
  className = "",
  tone = "default",
  ...props
}: ComponentPropsWithoutRef<"div"> & { tone?: CardTone }) {
  return (
    <div
      className={`corner-cut border ${CARD_TONES[tone]} ${
        tone === "inset" ? "" : "[box-shadow:var(--shadow-panel)]"
      } ${className}`}
      {...props}
    />
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="inline-block h-[3px] w-[18px] bg-accent" />
      <span className="font-mono text-micro uppercase text-accent">
        {children}
      </span>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "text-warn border-warn/40",
  assigned: "text-accent border-accent/40",
  arriving_pickup: "text-accent border-accent/40",
  picked_up: "text-accent border-accent/40",
  in_transit: "text-accent border-accent/40",
  delivered: "text-ok border-ok/40",
  cancelled: "text-danger border-danger/40",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Finding driver",
  assigned: "Assigned",
  arriving_pickup: "To pickup",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function StatusPill({ status }: { status: string }) {
  const live = !["delivered", "cancelled"].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-micro
                  uppercase ${
                    STATUS_STYLES[status] ?? "border-edge text-fg-muted"
                  }`}
    >
      {live && (
        <span className="relative grid size-1.5 place-items-center">
          <span className="absolute size-1.5 rounded-full bg-current [animation:pulse-ring_1.8s_ease-out_infinite]" />
          <span className="size-1.5 rounded-full bg-current" />
        </span>
      )}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="animate-rise grid place-items-center px-6 py-16 text-center">
      <p className="font-sans text-label text-fg-mid">{title}</p>
      {hint && <p className="mt-1 text-body text-fg-faint">{hint}</p>}
    </div>
  );
}

/**
 * Placeholder rows that match the real row height, so nothing jumps on load.
 *
 * The height is not decorative — 52px is what a populated row measures, and
 * matching it is why the table does not reflow when data lands.
 */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="shimmer h-[52px]" />
      ))}
    </div>
  );
}

/**
 * Placeholder for a grid of metric tiles.
 *
 * Exists because three pages that are not tables used `SkeletonRows` anyway —
 * the monitoring cards and the analytics charts both showed a stack of 52px
 * bars and then rendered something completely unlike it. A skeleton in the
 * wrong shape is worse than a spinner: it makes a promise about the layout and
 * then breaks it.
 */
export function SkeletonCards({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="px-4 py-3.5">
          <div className="shimmer mb-2 h-2 w-16 bg-panel" />
          {/* Same height as the figure it stands in for. */}
          <div className="shimmer h-8 w-20 bg-panel" />
        </Card>
      ))}
    </div>
  );
}

/** Placeholder sized to a chart's plotting area rather than to a list. */
export function SkeletonChart({ height = 200 }: { height?: number }) {
  return (
    <div
      className="shimmer w-full bg-panel"
      style={{ height }}
      aria-hidden
    />
  );
}

/**
 * Paging controls for a list.
 *
 * One component for every list in the panel, because before this only the audit
 * log had any — every other page fetched the first 25 rows and presented them
 * as the whole set.
 *
 * The range readout is the important part, more than the buttons. "26–50 of
 * 340" tells the operator both where they are and that there is a 340 at all;
 * a bare "next" leaves them guessing whether they have seen everything.
 *
 * Renders nothing at all when there is a single page of results. A pager on a
 * five-row table is furniture.
 */
export function Pager({
  page,
  onChange,
  busy = false,
  noun = "results",
}: {
  page: {
    page: number;
    pageSize: number;
    total: number | null;
    hasMore: boolean;
  };
  onChange: (page: number) => void;
  busy?: boolean;
  /** Plural noun for the readout — "deliveries", "partners". */
  noun?: string;
}) {
  const onFirstPage = page.page === 0;
  if (onFirstPage && !page.hasMore) return null;

  const from = page.page * page.pageSize + 1;
  // `total` may be null, meaning it was not counted. Fall back to the page's
  // own extent rather than to zero — claiming an empty set on missing metadata
  // is the failure this whole envelope exists to prevent.
  const to =
    page.total === null
      ? from + page.pageSize - 1
      : Math.min(from + page.pageSize - 1, page.total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-meta text-fg-faint">
        <span className="tabular-nums">
          {from}–{to}
        </span>{" "}
        of{" "}
        {page.total === null ? (
          // Honest about not knowing. "25+" beats a fabricated figure, and
          // beats "0" by a distance.
          <span className="tabular-nums">{page.pageSize}+</span>
        ) : (
          <span className="tabular-nums text-fg-mid">{page.total}</span>
        )}{" "}
        {noun}
      </p>

      <div className="flex items-center gap-1.5">
        <GhostButton
          onClick={() => onChange(page.page - 1)}
          disabled={onFirstPage || busy}
          aria-label="Previous page"
        >
          ← Previous
        </GhostButton>
        <GhostButton
          onClick={() => onChange(page.page + 1)}
          disabled={!page.hasMore || busy}
          aria-label="Next page"
        >
          Next →
        </GhostButton>
      </div>
    </div>
  );
}

/**
 * The heading every page opens with.
 *
 * Extracted because twelve pages had grown three different treatments —
 * `text-2xl font-semibold` on the originals, `text-xl font-semibold` on newer
 * ones, `text-xl font-medium` on the audit log. Nobody notices any single page
 * being wrong; what they notice is the panel feeling unfinished as they move
 * between them.
 *
 * The originals' treatment won, on the grounds that four pages already used it
 * and it was the more deliberate choice — explicit `font-sans` and a subtitle
 * sized to sit under a 2xl heading rather than beside it.
 *
 * `actions` sits opposite the title and wraps beneath on narrow screens rather
 * than crushing the heading.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: string;
  /**
   * A node, not a string: several pages count what they are showing
   * ("128 shown · 4 active") and that has to be live, not a caption written
   * once at build time.
   */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * The trail above the title, for a page somebody arrived *at* rather than
   * navigated *to*.
   *
   * A detail page reached from a link has no other way back up — the sidebar
   * highlights the section but there is nothing pointing at the list you came
   * from, so the only exit is the browser button. Top-level pages omit this.
   */
  breadcrumb?: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1.5 text-meta text-fg-faint">
              {breadcrumb.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  <Link
                    href={crumb.href}
                    className="motion-change transition-colors hover:text-accent"
                  >
                    {crumb.label}
                  </Link>
                  {/* Decorative, so it is hidden rather than read out between
                      every level. */}
                  <span aria-hidden>/</span>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <h1 className="mb-1 font-sans text-title">{title}</h1>
        {subtitle ? <p className="text-body text-fg-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
