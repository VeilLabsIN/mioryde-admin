/**
 * What the basemap is allowed to cost.
 *
 * Separated from `LiveMapCanvas` because these are the numbers that decide the
 * map's bill, and a number that decides a bill should be assertable without
 * standing up Leaflet and a DOM. The component reads them; the tests check
 * they still say what the extract script was built against.
 */

/**
 * How far the map may pan, as [[south, west], [north, east]].
 *
 * ## Why a bound at all
 *
 * Every tile on screen is a fetched tile, and this map had no bounds, no floor
 * and a ceiling of z19. Panning to Europe loaded Europe. Zooming out loaded
 * the planet. Nothing about dispatch needs either, so the meter ran for views
 * nobody was working in.
 *
 * Punjab rather than Ludhiana alone: the business runs in one city today, and
 * a bound drawn that tightly turns opening the next one into a code change at
 * exactly the moment nobody wants to be editing the map. The state still
 * excludes the other 99% of the planet, which is where the saving is.
 *
 * **This must match `BBOX` in `scripts/extract-basemap.sh`.** The archive is
 * cut to the same rectangle; anywhere the panel can pan to but the archive
 * does not cover is blank map, and anywhere the archive covers but the panel
 * refuses to show is bytes nobody can ever look at.
 */
export const SERVICE_BOUNDS: [[number, number], [number, number]] = [
  [29.5, 73.8],
  [32.5, 76.9],
];

/** The whole state in view. The furthest out a dispatcher has any use for. */
export const MIN_ZOOM = 9;

/**
 * The street the rider is on.
 *
 * Building-level z19 is two further doublings, and each level is four times
 * the tiles of the one before — so the top two levels alone can cost more than
 * everything beneath them, for detail nobody dispatches on. Must match
 * `MAXZOOM` in `scripts/extract-basemap.sh`.
 */
export const MAX_ZOOM = 17;

/**
 * How the two kinds of basemap are told apart.
 *
 * A `pmtiles://` prefix means one self-hosted archive read by HTTP range
 * requests; anything else is a conventional `{z}/{x}/{y}` raster endpoint.
 * One environment variable selects between them, so development keeps the OSM
 * default and production flips to the archive without a code change.
 */
export const PMTILES_PREFIX = "pmtiles://";

export function isArchive(url: string): boolean {
  return url.startsWith(PMTILES_PREFIX);
}

/** The archive's real URL, with the scheme marker taken off. */
export function archiveUrl(url: string): string {
  return url.slice(PMTILES_PREFIX.length);
}

/**
 * Layer options that bound consumption, whichever kind of basemap it is.
 *
 * `updateWhenIdle` fetches where the pan *landed* rather than everywhere it
 * travelled through — the default requests tiles on every frame of a drag, so
 * flicking across the state pulls a corridor the dispatcher never looked at.
 * `keepBuffer: 1` keeps one ring of off-screen tiles instead of two; the
 * buffer exists so a small pan has something painted to move into, and at the
 * default it roughly doubles a viewport's tile count to pre-fetch a margin
 * most views never reach.
 */
export const SHARED_LAYER_OPTIONS = {
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  bounds: SERVICE_BOUNDS,
  updateWhenIdle: true,
  keepBuffer: 1,
} as const;

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const PROTOMAPS_ATTRIBUTION = `${OSM_ATTRIBUTION} &copy; <a href="https://protomaps.com">Protomaps</a>`;
