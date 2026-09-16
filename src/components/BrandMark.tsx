import {
  BRAND_MARK_PIN,
  BRAND_MARK_ROAD,
  BRAND_MARK_VIEWBOX,
} from "@/components/brandMarkPaths";

/**
 * The Mioryde mark, drawn rather than shipped as an image.
 *
 * ## Why a component and not a PNG or an `<img>`
 *
 * The header used a literal `M` in a mono font on an amber tile. That is a
 * placeholder wearing a logo's clothes: it reads as a missing asset, it is the
 * same glyph as any other product starting with M, and at 8px of type on a
 * 32px tile it is mostly empty square.
 *
 * A file would fix the first problem and add three others — a fetch, a second
 * asset for dark mode, and a raster that softens on a high-DPI display. This
 * is geometry, so it scales to any size, costs no request, and inherits colour
 * from CSS. `currentColor` on the pin means one component serves the amber
 * tile in the header, a muted footer, and anything else later, with the theme
 * deciding rather than the asset.
 *
 * ## The shape
 *
 * The delivery pin from the apps' notification icon, so the panel and the
 * phones carry the same mark. The counter is an `evenOdd` cut-out rather than a
 * second filled path: at 20px an overlapping shape turns to mud, whereas a hole
 * stays a hole.
 *
 * The geometry is **generated**, from `brand/mioryde-mark.svg` via
 * `brand/tools/generate-icons.mjs`. It used to be a path typed in here, and
 * that copy went stale the moment the mark was redrawn — the panel carried the
 * previous logo, with a different counter and a road that was a small comma
 * rather than a full sweep, while every other surface had moved on. The
 * marketing site's icon had gone the same way for the same reason.
 */
export function BrandMark({
  className = "",
  size = 20,
}: {
  className?: string;
  /** Rendered square. Legible down to about 14px. */
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={BRAND_MARK_VIEWBOX}
      fill="none"
      // Decorative: the link around it already carries the accessible name,
      // and a second announcement of "Mioryde" would just be noise.
      aria-hidden
      focusable="false"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d={BRAND_MARK_PIN}
      />
      <path fill="currentColor" d={BRAND_MARK_ROAD} />
    </svg>
  );
}

/**
 * A person, drawn from their own name.
 *
 * `admin_users` has **no photo column** — onboarding never asks for one and
 * there is nowhere to store it — so an `<img>` here would be a broken image on
 * every account. This is the honest version: initials on a tint derived from
 * the person's id, so two operators are visually distinct and the same person
 * looks the same on every machine.
 *
 * If a real uploaded photo is wanted later it needs a column, an upload
 * endpoint and object storage; this component is the seam that would render it.
 */
export function Avatar({
  name,
  id,
  size = 32,
}: {
  name: string;
  /** Only used to pick a hue. Nothing about it is displayed. */
  id: string;
  size?: number;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  // A stable hue per person. Not random: an avatar that changed colour between
  // page loads would be worse than no colour at all.
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        // `color-mix` against the page's own surface keeps the tint legible in
        // both themes from one declaration — a fixed lightness would be washed
        // out on light and glaring on dark.
        background: `color-mix(in oklab, hsl(${hash} 70% 55%) 22%, var(--panel))`,
        color: `color-mix(in oklab, hsl(${hash} 70% 45%) 85%, var(--fg))`,
      }}
      className="grid shrink-0 place-items-center rounded-full font-sans text-micro font-bold"
    >
      {initials}
    </span>
  );
}
