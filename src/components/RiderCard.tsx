import Link from "next/link";
import type { AdminRider } from "@/lib/api";

/**
 * A partner, as a card.
 *
 * ## Why a grid exists alongside the table
 *
 * They answer different questions, and the panel already learned this lesson
 * with the live board and the map. A table is for comparing a column — who has
 * the most cancellations, who joined last week — and it wins because the eye
 * runs down one number at a time. A grid is for recognising a *person*: the
 * name, the photo, whether they are out there right now. Verification queues
 * and "who can I call" are recognition tasks, and forcing them through a table
 * makes somebody read twelve rows to find a face.
 *
 * The toggle is remembered per browser, because which of those two jobs an
 * operator does all day does not change between sessions.
 *
 * ## The photo
 *
 * `photo_url` exists on the rider row but is not returned by the list endpoint,
 * so this draws initials. That is deliberate rather than pending: adding the
 * URL means every partner's face loads on a page that shows fifty of them, on
 * a connection in a dispatch office, to answer a question the initials and the
 * name already answer. If a photo is wanted it belongs on the detail page.
 */
const STATUS_TONE: Record<string, { dot: string; label: string; text: string }> = {
  active: { dot: "bg-accent-alt", label: "Active", text: "text-fg-muted" },
  pending_kyc: { dot: "bg-warn", label: "Awaiting review", text: "text-warn" },
  suspended: { dot: "bg-danger", label: "Suspended", text: "text-danger" },
  rejected: { dot: "bg-danger", label: "Rejected", text: "text-danger" },
};

export function RiderCard({ rider }: { rider: AdminRider }) {
  const tone = STATUS_TONE[rider.status] ?? {
    dot: "bg-fg-faint",
    label: rider.status.replace(/_/g, " "),
    text: "text-fg-muted",
  };

  return (
    <Link href={`/riders/${rider.id}`} className="group block">
      <div
        className="motion-change h-full rounded-md border border-line bg-surface p-4
                   [box-shadow:var(--shadow-panel)] transition-colors
                   group-hover:border-accent"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-md bg-panel
                       font-mono text-label font-bold text-fg-mid"
          >
            {initials(rider.name)}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-medium text-fg group-hover:text-accent">
              {rider.name}
            </p>
            {/* Not revealed here. Showing a phone number on a card that renders
                fifty at a time would put a wall of personal data on screen for
                a page nobody is calling from, and every reveal is recorded
                against the operator's name for a reason. */}
            <p className="font-mono text-micro uppercase text-fg-faint">
              Joined {new Date(rider.joinedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>

          {/* On duty is a separate fact from account status: an active partner
              who is off shift is not a problem, and colouring them the same as
              a suspended one would say it is. */}
          {rider.isOnline && (
            <span
              className="flex shrink-0 items-center gap-1 font-mono text-micro uppercase
                         text-accent-alt"
            >
              <span className="size-1.5 rounded-full bg-accent-alt" />
              On duty
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
          <span className={`font-mono text-micro uppercase ${tone.text}`}>
            {tone.label}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
          <Figure label="Completed" value={rider.completed} />
          <Figure
            label="Cancelled"
            value={rider.cancelled}
            // Only when there is something to look at. A red zero is noise.
            tone={rider.cancelled > 0 ? "warn" : undefined}
          />
          <Figure
            label="Rating"
            value={rider.rating === null ? "—" : rider.rating.toFixed(1)}
          />
        </dl>

        {(rider.vehicles || rider.zones) && (
          <p className="mt-3 truncate text-meta text-fg-faint">
            {[rider.vehicles, rider.zones].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="font-mono text-micro uppercase text-fg-faint">{label}</dt>
      <dd
        className={`font-mono text-label tabular-nums ${
          tone === "warn" ? "text-warn" : "text-fg-soft"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Up to two initials from a name.
 *
 * Trimmed and filtered before slicing, because a double space or a trailing
 * one would otherwise produce a blank initial and a lopsided monogram.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
