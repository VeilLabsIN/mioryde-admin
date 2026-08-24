/**
 * The navigation icon set.
 *
 * ## Why these are drawn here rather than installed
 *
 * The rail used two-letter marks — `OV`, `LV`, `DL` — which are not icons.
 * They are abbreviations, and a column of them collapsed to 72px is a column
 * of unreadable initialisms: `PO` and `PT` differ by one letter and sit four
 * rows apart. An icon is recognised by silhouette at a glance; a two-letter
 * mark has to be read, and at that size it cannot be.
 *
 * An icon library would be the obvious answer and is the wrong one here. Every
 * set has its own stroke weight, corner radius and optical grid, and this panel
 * has all three already: 1.5px strokes, square caps on brand shapes, a 16px
 * box. Importing a set means either overriding it everywhere or accepting a
 * rail that looks borrowed from a different product.
 *
 * ## The rules every glyph follows
 *
 * - **16×16 box, 1.5 stroke, `currentColor`.** Colour is the caller's business,
 *   so the same glyph works on the rail's dark ground and on a light page.
 * - **Stroke, not fill.** A filled glyph at 16px turns into a blob; strokes
 *   keep the interior counters open, which is what makes a shape readable
 *   small.
 * - **`round` joins.** Square caps are the brand's shape language on chamfers
 *   and buttons — at 16px they read as ragged, so the icons keep the geometry
 *   and drop the sharpness.
 * - **Distinct silhouettes within a group.** Payouts, bank checks and
 *   collections all mean "money" and are drawn as an arrow leaving, a building,
 *   and a stack — because three variations on a coin would be three identical
 *   dots at rail size.
 */

export type IconName =
  | "overview"
  | "live"
  | "map"
  | "deliveries"
  | "customers"
  | "partners"
  | "verification"
  | "payouts"
  | "banking"
  | "collections"
  | "pricing"
  | "analytics"
  | "agreement"
  | "audit"
  | "monitoring"
  | "readiness"
  | "access"
  | "notifications"
  | "settings"
  | "help";

const PATHS: Record<IconName, React.ReactNode> = {
  // Four panes — the dashboard convention, and the only glyph here that may
  // safely be generic because it is the one people find by position.
  overview: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  // A pulse. Movement happening now, as opposed to the record of it.
  live: <path d="M1 8h3l2-4 3 8 2-4h3" />,
  map: (
    <>
      <path d="M8 14s5-4.2 5-7.6A5 5 0 0 0 3 6.4C3 9.8 8 14 8 14Z" />
      <circle cx="8" cy="6.4" r="1.8" />
    </>
  ),
  // A parcel, not a lorry. The lorry belongs to partners; the thing being
  // tracked here is the box.
  deliveries: (
    <>
      <path d="M8 1.6 14 5v6l-6 3.4L2 11V5l6-3.4Z" />
      <path d="M2 5l6 3.4L14 5" />
      <path d="M8 8.4V14.4" />
    </>
  ),
  customers: (
    <>
      <circle cx="8" cy="5" r="2.6" />
      <path d="M2.6 14a5.4 5.4 0 0 1 10.8 0" />
    </>
  ),
  // A vehicle in profile. Deliberately unlike the parcel above it.
  partners: (
    <>
      <path d="M1.5 4.5h7v6h-7z" />
      <path d="M8.5 7h3l3 2.2v1.3h-6z" />
      <circle cx="4.5" cy="12" r="1.4" />
      <circle cx="11.5" cy="12" r="1.4" />
    </>
  ),
  // A shield with a tick — identity checked, rather than a document filed.
  verification: (
    <>
      <path d="M8 1.6 13.2 3.6v4.2c0 3.2-2.2 5.6-5.2 6.6-3-1-5.2-3.4-5.2-6.6V3.6L8 1.6Z" />
      <path d="M5.8 7.9 7.4 9.5l3-3.1" />
    </>
  ),
  // Money leaving. The arrow is the whole point: this is the outbound side.
  payouts: (
    <>
      <rect x="1.6" y="4" width="12.8" height="8" rx="1.4" />
      <path d="M6 8h4.6M9 6.4 10.8 8 9 9.6" />
    </>
  ),
  // A building with columns. Reads as an institution at 16px where a card
  // would just read as a rectangle.
  banking: (
    <>
      <path d="M1.6 6.2 8 2.4l6.4 3.8" />
      <path d="M3.2 6.8v5.4M6.4 6.8v5.4M9.6 6.8v5.4M12.8 6.8v5.4" />
      <path d="M1.6 13.6h12.8" />
    </>
  ),
  // A stack — cash held, accumulating, waiting to come back.
  collections: (
    <>
      <ellipse cx="8" cy="4" rx="5.4" ry="2.2" />
      <path d="M2.6 4v4c0 1.2 2.4 2.2 5.4 2.2s5.4-1 5.4-2.2V4" />
      <path d="M2.6 8v3.4c0 1.2 2.4 2.2 5.4 2.2s5.4-1 5.4-2.2V8" />
    </>
  ),
  // A price tag. The one glyph in the money group that is about the number
  // rather than the movement.
  pricing: (
    <>
      <path d="M7.4 1.8H13a1.2 1.2 0 0 1 1.2 1.2v5.6L7.6 15.2 1.4 9 8 2.4Z" />
      <circle cx="11" cy="5" r="1.1" />
    </>
  ),
  analytics: (
    <>
      <path d="M2 14V9M6 14V4M10 14V7M14 14V2" />
    </>
  ),
  // A document with a signature line, not a plain page — the signing is what
  // distinguishes it from every other record in the panel.
  agreement: (
    <>
      <path d="M3.4 1.8h6.2L13 5.2v9H3.4z" />
      <path d="M9.4 1.8v3.6H13" />
      <path d="M5.8 11.4c1.2-1.6 2-1.6 2.6 0 .6 1.4 1.4 1.4 2.2-.4" />
    </>
  ),
  // A clock over lines: the history of what was done, not the doing.
  audit: (
    <>
      <path d="M2 4h7M2 7.4h5M2 10.8h4" />
      <circle cx="11.4" cy="10.4" r="3.4" />
      <path d="M11.4 8.8v1.8l1.2.8" />
    </>
  ),
  // A gauge. Health at a glance, distinct from the analytics bars.
  monitoring: (
    <>
      <path d="M2 11.6a6.4 6.4 0 1 1 12 0" />
      <path d="M8 11.6 11 7.4" />
    </>
  ),
  readiness: (
    <>
      <path d="M2.6 4.4 4 5.8l2.4-2.6M2.6 9.6 4 11l2.4-2.6" />
      <path d="M8.8 4.6H14M8.8 10H14" />
    </>
  ),
  // A key. Access is about who holds one, not about a person.
  access: (
    <>
      <circle cx="5" cy="5.4" r="3.2" />
      <path d="M7.3 7.7 14 14.4M11.4 11.8l1.6-1.6M9.6 10l1.6-1.6" />
    </>
  ),
  notifications: (
    <>
      <path d="M4 6.8a4 4 0 0 1 8 0c0 3.2 1.2 4.4 1.2 4.4H2.8S4 10 4 6.8Z" />
      <path d="M6.6 13.4a1.6 1.6 0 0 0 2.8 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" />
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M6.2 6.2a1.9 1.9 0 1 1 2.5 1.8c-.5.2-.7.6-.7 1.1v.4" />
      <path d="M8 12.1v.1" />
    </>
  ),
};

export function NavIcon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative in every current use: each one sits beside its own text
      // label, or inside a control that carries its own accessible name. An
      // icon announced alongside the word it illustrates is read twice.
      aria-hidden
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
