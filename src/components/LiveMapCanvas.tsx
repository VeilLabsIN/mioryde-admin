"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";
import type { LiveMapSnapshot, MapOrder, RiderMapStatus } from "@/lib/api";

/**
 * The map itself.
 *
 * ## Why Leaflet, and why raster tiles
 *
 * Not Google Maps: that needs an API key in the browser, and a key in a
 * browser is public by definition — after a week spent making sure no
 * credential ships in this bundle, adding one back for a basemap would be an
 * odd trade. Not MapLibre either: vector rendering wants WebGL and about eight
 * hundred kilobytes, and this has to work on whatever machine is in the
 * dispatch office.
 *
 * Leaflet with raster tiles is a hundred and fifty kilobytes, needs no key,
 * and draws markers and lines — which is the entire requirement.
 *
 * ## The tile source is configuration, not a constant
 *
 * `NEXT_PUBLIC_MAP_TILES_URL` overrides the default. It has to be overridable
 * because the default is OpenStreetMap's public tile server, whose usage
 * policy does not permit heavy commercial traffic. It is right for development
 * and wrong for a dispatch desk refreshing all day; production needs a paid
 * provider or self-hosted tiles. Attribution is rendered either way, because
 * that is a licence condition rather than a courtesy.
 *
 * ## Why markers are updated in place
 *
 * A naive implementation clears every layer each poll and re-adds it. That
 * makes the pins blink four times a minute and throws away Leaflet's own
 * animation, so a rider crossing a junction teleports instead of moving. Here
 * each rider keeps one marker for the life of the page, keyed by id, and only
 * its position and class change — so the browser tweens it and the map reads
 * as live rather than as a slideshow.
 */

const LIGHT_TILES =
  process.env["NEXT_PUBLIC_MAP_TILES_URL"] ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * The night basemap.
 *
 * Falls back to the light one when unset, deliberately: a missing dark style
 * should give a working map that looks slightly wrong, not a broken map.
 *
 * It is worth setting. A standard OSM basemap under the Tokyo Night palette is
 * a sheet of white paper in a dark room — the brightest thing on screen,
 * surrounded by an interface chosen to be easy on the eyes at night, which
 * rather defeats the point of having the theme.
 */
const DARK_TILES =
  process.env["NEXT_PUBLIC_MAP_TILES_URL_DARK"] ?? LIGHT_TILES;

/**
 * Whether the panel is currently dark.
 *
 * `useTheme()` reports the *setting*, which may be `system` — and `system`
 * is not an answer, it is a redirection to the operating system. Resolving it
 * here, with a listener, means an operator whose machine flips to dark at
 * sunset gets the night basemap at the same moment the rest of the panel
 * changes, rather than the next time this component happens to remount.
 */
function useIsDark(): boolean {
  const { theme } = useTheme();
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(query.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  if (theme === "tokyo") return true;
  if (theme === "daylight") return false;
  return systemDark;
}

/**
 * Asks the tile server whether it will actually serve us.
 *
 * ## Why `tileerror` is not enough
 *
 * Providers do not fail cleanly. MapTiler answers a request from an
 * un-allowlisted origin with **HTTP 403 and a perfectly valid PNG** reading
 * "Invalid key" — same 512×512 dimensions as a real tile. The browser
 * decodes it, the `<img>` fires `load`, and Leaflet marks the tile loaded.
 * Measured against the live service: 24 of 24 tiles "loaded", `tileerror`
 * never fired once, and the operator got a wall of tiled error text with
 * nothing anywhere explaining it.
 *
 * So the status code is the only honest signal, and only `fetch` can read it.
 * Both the accepted and the rejected response carry
 * `Access-Control-Allow-Origin: *`, so this works cross-origin; the tile host
 * is added to `connect-src` in the middleware for the same reason.
 *
 * One request per map load, for a tile the browser was about to fetch anyway.
 */
async function probeTiles(template: string): Promise<boolean> {
  // A real tile over Ludhiana at the map's default zoom, so this is a request
  // the basemap would have made regardless.
  const url = template
    .replace("{s}", "a")
    .replace("{z}", "12")
    .replace("{x}", "2909")
    .replace("{y}", "1677")
    .replace("{r}", "");

  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    return response.ok;
  } catch {
    // A network error or a CSP refusal. Either way the basemap is not coming.
    return false;
  }
}

/** Ludhiana. Where the business is, and the fallback when nothing is on screen. */
const HOME: [number, number] = [30.9010, 75.8573];

const STATUS_COLOR: Record<RiderMapStatus, string> = {
  delivering: "var(--accent-alt)",
  idle: "var(--accent-bright)",
  offline: "var(--fg-faint)",
};

export interface LiveMapCanvasProps {
  snapshot: LiveMapSnapshot | null;
  /** Order to keep centred and highlighted, if any. */
  focusedOrderId: string | null;
  onSelectOrder: (id: string | null) => void;
  /**
   * Called when the basemap will not load.
   *
   * Separate from the data error: the pins can be perfectly correct while the
   * imagery underneath them is missing, and conflating the two would tell a
   * dispatcher their fleet data is broken when it is not.
   */
  onTileError?: (failing: boolean) => void;
}

export function LiveMapCanvas({
  snapshot,
  focusedOrderId,
  onSelectOrder,
  onTileError,
}: LiveMapCanvasProps) {
  const isDark = useIsDark();
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);

  // Layers are kept across polls so Leaflet can animate between positions.
  const riderMarkers = useRef(new Map<string, L.Marker>());
  const orderLayers = useRef(new Map<string, L.LayerGroup>());
  const didFit = useRef(false);

  // ── Create once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!host.current || map.current) return;

    const instance = L.map(host.current, {
      center: HOME,
      zoom: 12,
      // The default zoom control sits top-left, directly under the panel's
      // breadcrumb bar. Moved rather than removed — pinch-zoom is not a thing
      // on the desktops this runs on.
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(instance);

    tiles.current = L.tileLayer(LIGHT_TILES, {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);

    /**
     * Genuine network failures — a dead host, a 404 on a missing zoom level.
     *
     * This does **not** catch a rejected key. See `probeTiles` below for why
     * that needs a separate mechanism entirely.
     *
     * Two failures before reporting: one tile can fail on a flaky connection
     * and recover on the next pan, and a banner that flickers on a single
     * dropped request is a banner people stop reading.
     */
    let tileFailures = 0;
    tiles.current.on("tileerror", () => {
      tileFailures += 1;
      if (tileFailures === 2) onTileError?.(true);
    });

    // Clicking empty map clears the selection, which is what people expect
    // and saves a trip to a close button.
    instance.on("click", () => onSelectOrder(null));

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      tiles.current = null;
      riderMarkers.current.clear();
      orderLayers.current.clear();
    };
    // Deliberately once: re-running would tear down the map on every parent
    // render and lose the user's pan and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Follow the theme ─────────────────────────────────────────────────────
  //
  // `setUrl` rather than removing and re-adding the layer: Leaflet keeps the
  // painted tiles on screen until the replacements load, so the map cross-fades
  // instead of flashing empty grey underneath the night-mode transition playing
  // over the top of it.
  useEffect(() => {
    tiles.current?.setUrl(isDark ? DARK_TILES : LIGHT_TILES);
  }, [isDark]);

  // ── Ask whether the provider will serve us ───────────────────────────────
  //
  // Re-run whenever the active basemap changes, because light and dark can be
  // different hosts with different keys. Cancelled on unmount so a slow answer
  // cannot report a failure onto a page the operator has already left.
  useEffect(() => {
    let cancelled = false;
    void probeTiles(isDark ? DARK_TILES : LIGHT_TILES).then((ok) => {
      if (!cancelled) onTileError?.(!ok);
    });
    return () => {
      cancelled = true;
    };
  }, [isDark, onTileError]);

  // ── Draw orders ──────────────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !snapshot) return;

    const seen = new Set<string>();

    for (const order of snapshot.orders) {
      seen.add(order.id);
      const focused = order.id === focusedOrderId;

      let group = orderLayers.current.get(order.id);
      if (!group) {
        group = L.layerGroup().addTo(instance);
        orderLayers.current.set(order.id, group);
      }
      group.clearLayers();

      // A straight line between the two points, not the driving route.
      //
      // Deliberate, and worth being honest about on screen rather than in a
      // comment only: the real geometry would come from OSRM, which is a
      // request per order per poll. Drawn dashed so it reads as "these two
      // points are related" rather than as a claimed path down a named road.
      L.polyline(
        [
          [order.pickup.lat, order.pickup.lng],
          [order.drop.lat, order.drop.lng],
        ],
        {
          color: focused ? "#f5b301" : "#8a92ba",
          weight: focused ? 3 : 1.5,
          opacity: focused ? 0.95 : 0.35,
          dashArray: "6 6",
        },
      ).addTo(group);

      L.marker([order.pickup.lat, order.pickup.lng], {
        icon: dotIcon("#2f7d52", focused),
        title: `Pickup — ${order.pickupAddress}`,
      })
        .on("click", () => onSelectOrder(order.id))
        .addTo(group);

      L.marker([order.drop.lat, order.drop.lng], {
        icon: dotIcon("#b91c1c", focused),
        title: `Drop — ${order.dropAddress}`,
      })
        .on("click", () => onSelectOrder(order.id))
        .addTo(group);
    }

    // Orders that completed since the last poll must leave the map.
    for (const [id, layer] of orderLayers.current) {
      if (!seen.has(id)) {
        layer.remove();
        orderLayers.current.delete(id);
      }
    }
  }, [snapshot, focusedOrderId, onSelectOrder]);

  // ── Draw riders ──────────────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !snapshot) return;

    const seen = new Set<string>();

    for (const rider of snapshot.riders) {
      seen.add(rider.id);
      const existing = riderMarkers.current.get(rider.id);
      const icon = riderIcon(rider.status, rider.heading);

      if (existing) {
        // Position first, then icon: setLatLng animates, setIcon replaces the
        // element, and doing it the other way round cancels the tween.
        existing.setLatLng([rider.lat, rider.lng]);
        existing.setIcon(icon);
      } else {
        const marker = L.marker([rider.lat, rider.lng], {
          icon,
          title: `${rider.name} — ${rider.status}`,
          zIndexOffset: 500, // above order pins
        }).addTo(instance);

        if (rider.activeOrderId) {
          marker.on("click", () => onSelectOrder(rider.activeOrderId));
        }
        riderMarkers.current.set(rider.id, marker);
      }
    }

    for (const [id, marker] of riderMarkers.current) {
      if (!seen.has(id)) {
        marker.remove();
        riderMarkers.current.delete(id);
      }
    }

    // Frame everything once, on the first snapshot that has anything in it.
    // Doing it on every poll would fight the operator for control of the
    // viewport, which is the fastest way to make a live map unusable.
    if (!didFit.current) {
      const points: [number, number][] = [
        ...snapshot.riders.map((r) => [r.lat, r.lng] as [number, number]),
        ...snapshot.orders.flatMap(
          (o) =>
            [
              [o.pickup.lat, o.pickup.lng],
              [o.drop.lat, o.drop.lng],
            ] as [number, number][],
        ),
      ];
      if (points.length > 0) {
        instance.fitBounds(L.latLngBounds(points).pad(0.2));
        didFit.current = true;
      }
    }
  }, [snapshot, onSelectOrder]);

  // ── Follow the selection ─────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !snapshot || !focusedOrderId) return;

    const order = snapshot.orders.find((o) => o.id === focusedOrderId);
    if (!order) return;

    instance.flyToBounds(
      L.latLngBounds([
        [order.pickup.lat, order.pickup.lng],
        [order.drop.lat, order.drop.lng],
      ]).pad(0.35),
      { duration: 0.6 },
    );
    // Only when the *selection* changes. Including `snapshot` would re-fly on
    // every poll and make the map unusable while an order is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedOrderId]);

  return <div ref={host} className="size-full" />;
}

/** A small circular endpoint marker. */
function dotIcon(color: string, focused: boolean): L.DivIcon {
  const size = focused ? 14 : 10;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>`,
  });
}

/**
 * A rider pin, pointed where the vehicle is pointed.
 *
 * When the device reports no heading the arrow is replaced by a plain dot
 * rather than drawn pointing north — a pin confidently indicating a direction
 * nobody measured is worse than one admitting it does not know.
 */
function riderIcon(status: RiderMapStatus, heading: number | null): L.DivIcon {
  const color = STATUS_COLOR[status];
  const pulse =
    status === "delivering"
      ? `<span style="position:absolute;inset:-6px;border-radius:50%;
           background:${color};opacity:0.18"></span>`
      : "";

  const body =
    heading === null
      ? `<span style="display:block;width:12px;height:12px;border-radius:50%;
           background:${color};border:2px solid var(--bg)"></span>`
      : `<span style="display:block;width:16px;height:16px;
           transform:rotate(${heading}deg)">
           <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
             <path d="M8 1l5 13-5-3.2L3 14z" fill="${color}"
                   stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round"/>
           </svg>
         </span>`;

  return L.divIcon({
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<span style="position:relative;display:block">${pulse}${body}</span>`,
  });
}

/** Minutes since a timestamp, against the server's clock rather than the browser's. */
export function minutesSince(iso: string, now: string): number {
  return Math.max(
    0,
    Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60000),
  );
}

/** Whether an order has sat in its status longer than that status should last. */
export function isFlagged(order: MapOrder, now: string): boolean {
  const mins = minutesSince(order.statusSince, now);
  // Same thresholds the live board uses: an unassigned order is a dispatch
  // failure in five minutes, a trip in progress is usually just a long trip.
  if (order.status === "pending") return mins >= 5;
  if (order.status === "assigned" || order.status === "arriving_pickup") return mins >= 15;
  return mins >= 120;
}
