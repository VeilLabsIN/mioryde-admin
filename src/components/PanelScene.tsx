/**
 * The texture behind the panel's content column.
 *
 * ## Why the panel gets one at all
 *
 * The sign-in page has a drawn scene and the panel had a flat field, so the
 * two read as different products — you cross from something composed into
 * something plain the moment you sign in. This carries the same idea through:
 * a faint geometry with light moving very slowly behind it.
 *
 * ## Why it is a different pattern
 *
 * They are seen one after the other, seconds apart. Repeating the sign-in
 * composition would read as that page having failed to go away, so this shares
 * the *family* — boxes, ambient light — and none of the geometry:
 *
 *   - sign-in is a **ruled grid** with solid blocks and a route drawn across
 *     it, which is a picture of the thing the business does, on a page with
 *     nothing else to look at;
 *   - this is a **staggered lattice of empty outlines** with nothing drawn on
 *     it, because everything worth looking at is the data on top of it.
 *
 * Outlines rather than dots, so it does not moiré against the body's own 24px
 * dot grid in daylight. Staggered rather than square, so it is not mistaken
 * for the gridlines of the table sitting on it — a background that looks like
 * a misaligned table is worse than no background.
 *
 * ## Why it does not scroll
 *
 * It is absolutely positioned in the content *column*, not inside `<main>`.
 * `<main>` is the scroll container, so a layer inside it would slide the
 * lattice up past the header on every wheel tick — motion tied to reading,
 * which is the one thing a background must never do. Sitting in the column
 * also keeps it out from under the rail and the top bar, which have their own
 * surfaces and are not part of this.
 *
 * ## Cost
 *
 * Two blurred divs and one tiled SVG pattern. Everything animates `opacity`
 * only, nothing repaints on scroll, and the whole layer is inert to the
 * pointer. The panel runs all day on the oldest machine in the office.
 */
export function PanelScene() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/*
        Ambient light. These *breathe* — a change in brightness and nothing
        else — where the sign-in orbs drift across the frame. On a page where
        somebody is reading rows, anything moving laterally in the background
        is caught by peripheral vision and read as something having happened.
      */}
      <div
        className="panel-glow-a absolute -left-[10%] -top-[20%] size-[45%]
                   rounded-full blur-[120px]"
        style={{ background: "var(--scene-glow-a)" }}
      />
      <div
        className="panel-glow-b absolute -bottom-[25%] -right-[5%] size-[40%]
                   rounded-full blur-[130px]"
        style={{ background: "var(--scene-glow-b)" }}
      />

      <svg className="absolute inset-0 size-full" fill="none">
        <defs>
          {/*
            One tile, two boxes, offset from each other.

            56px rather than a multiple of the body's 24px dot grid: at 48 the
            two textures line up every second dot and the eye finds the
            coincidence. An awkward number never resolves into a second grid.
          */}
          <pattern
            id="panel-lattice"
            width="56"
            height="56"
            patternUnits="userSpaceOnUse"
          >
            <rect
              x="0.5"
              y="0.5"
              width="21"
              height="21"
              stroke="var(--scene-line)"
              strokeWidth="1"
            />
            <rect
              x="28.5"
              y="28.5"
              width="13"
              height="13"
              stroke="var(--scene-line)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#panel-lattice)" />
      </svg>
    </div>
  );
}
