import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  SERVICE_BOUNDS,
  SHARED_LAYER_OPTIONS,
  archiveUrl,
  isArchive,
} from "./basemap";

const [[south, west], [north, east]] = SERVICE_BOUNDS;

/** Ludhiana, where the business is and where the map opens. */
const LUDHIANA: [number, number] = [30.901, 75.8573];

describe("where the map may go", () => {
  it("contains the city the map centres on", () => {
    // A bound that excludes the default centre is a map that opens outside
    // itself and springs back on the first drag.
    const [lat, lng] = LUDHIANA;
    expect(lat).toBeGreaterThan(south);
    expect(lat).toBeLessThan(north);
    expect(lng).toBeGreaterThan(west);
    expect(lng).toBeLessThan(east);
  });

  it("is the right way round", () => {
    // [[south, west], [north, east]]. Inverted corners give Leaflet an empty
    // rectangle, and an empty maxBounds pins the map to a single point.
    expect(north).toBeGreaterThan(south);
    expect(east).toBeGreaterThan(west);
  });

  it("does not quietly become the whole planet again", () => {
    // The finding this exists for. A few degrees is a state; ninety is the
    // unbounded map that was billing for Europe.
    expect(north - south).toBeLessThan(10);
    expect(east - west).toBeLessThan(10);
  });
});

describe("how close the map may get", () => {
  it("stops well short of building level", () => {
    // Each level is four times the tiles of the one below. z19 was the old
    // ceiling and nobody dispatches on it.
    expect(MAX_ZOOM).toBeLessThanOrEqual(17);
    expect(MIN_ZOOM).toBeGreaterThanOrEqual(8);
    expect(MAX_ZOOM).toBeGreaterThan(MIN_ZOOM);
  });

  it("keeps the consumption limits on the layer", () => {
    // These two are the difference between fetching where a drag landed and
    // fetching everywhere it passed over.
    expect(SHARED_LAYER_OPTIONS.updateWhenIdle).toBe(true);
    expect(SHARED_LAYER_OPTIONS.keepBuffer).toBe(1);
    expect(SHARED_LAYER_OPTIONS.bounds).toBe(SERVICE_BOUNDS);
  });
});

describe("which kind of basemap a URL asks for", () => {
  it("recognises a self-hosted archive", () => {
    expect(isArchive("pmtiles://https://cdn.example/punjab.pmtiles")).toBe(true);
  });

  it("treats an ordinary tile template as raster", () => {
    expect(isArchive("https://tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe(
      false,
    );
    expect(isArchive("")).toBe(false);
  });

  it("hands back a URL the browser can actually fetch", () => {
    // The prefix is ours, not a scheme anything else understands — leaving it
    // on produces a request that fails before it is sent.
    expect(archiveUrl("pmtiles://https://cdn.example/punjab.pmtiles")).toBe(
      "https://cdn.example/punjab.pmtiles",
    );
  });
});

describe("the panel and the extract script agree", () => {
  // The one that matters operationally. The archive is cut to a rectangle and
  // a zoom ceiling; if the panel's numbers drift from the script's, the
  // failure is a blank area of map with no error anywhere — the archive
  // simply has no tile there, and an empty tile renders as nothing.
  const script = readFileSync("scripts/extract-basemap.sh", "utf8");

  it("cuts the archive to the same rectangle the panel can pan", () => {
    const bbox = /BBOX="\$\{BBOX:-([^}]+)\}"/.exec(script)?.[1];
    expect(bbox).toBeDefined();

    // The script writes west,south,east,north.
    const [scriptWest, scriptSouth, scriptEast, scriptNorth] = bbox!
      .split(",")
      .map(Number);

    expect(scriptSouth).toBe(south);
    expect(scriptWest).toBe(west);
    expect(scriptNorth).toBe(north);
    expect(scriptEast).toBe(east);
  });

  it("cuts the archive to the same zoom ceiling the panel displays", () => {
    const maxzoom = /MAXZOOM="\$\{MAXZOOM:-(\d+)\}"/.exec(script)?.[1];
    expect(Number(maxzoom)).toBe(MAX_ZOOM);
  });
});
