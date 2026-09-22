#!/usr/bin/env bash
#
# Build the self-hosted basemap archive and put it on R2.
#
# ## What this produces
#
# One PMTiles file covering Punjab, to be served from a bucket by HTTP range
# requests. The panel reads tiles straight out of it, so there is no tile
# server to run and no per-tile meter to pay — which is the entire point (A15).
#
# ## Why extraction happens over the network
#
# `pmtiles extract` reads the planet archive with range requests and pulls down
# only the tiles inside the bounding box. You do not download the ~120GB planet
# file; expect a few hundred megabytes of transfer and an archive in the tens
# of megabytes. This is the documented Protomaps workflow, not a trick.
#
# ## Prerequisites
#
#   - `pmtiles`      https://github.com/protomaps/go-pmtiles/releases
#   - `rclone` or the AWS CLI, configured for your R2 account
#
# ## After uploading, two things must be true of the bucket
#
#   1. **CORS allows the panel's origin**, with `Range` in `AllowedHeaders` and
#      `Content-Range`/`Content-Length`/`ETag` in `ExposeHeaders`. Without
#      `Range` the reader cannot ask for a slice and the map renders nothing at
#      all — no error, just an empty canvas.
#   2. **The object is publicly readable**, or fronted by a Worker that makes
#      it so. The archive contains no secrets; it is a slice of OpenStreetMap.
#
# Then set, in the panel's environment:
#
#   NEXT_PUBLIC_MAP_TILES_URL=pmtiles://https://<your-r2-host>/punjab.pmtiles
#
# The dark basemap needs no second archive and no second variable — the same
# file renders either flavour. Leave NEXT_PUBLIC_MAP_TILES_URL_DARK unset.
#
# ## Re-running it
#
# Roads change. Re-run a few times a year against a newer planet build; it is
# the same command. Upload beside the old file under a dated name and flip the
# variable, so a bad extract is one environment change to undo rather than a
# restore.

set -euo pipefail

# The bounding box, as west,south,east,north. Must match SERVICE_BOUNDS in
# src/components/LiveMapCanvas.tsx — the panel will not let anyone pan outside
# that rectangle, so tiles beyond it are bytes nobody can ever look at.
BBOX="${BBOX:-73.8,29.5,76.9,32.5}"

# Must match MAX_ZOOM in the same file. Each level past it is four times the
# tiles of the one before, for detail the panel refuses to display.
MAXZOOM="${MAXZOOM:-17}"

# Protomaps publishes a dated planet build. Pinned rather than "latest" so two
# people running this get the same archive.
BUILD="${BUILD:-20260901}"
SOURCE="${SOURCE:-https://build.protomaps.com/${BUILD}.pmtiles}"

OUT="${OUT:-punjab-${BUILD}.pmtiles}"

echo "Extracting ${BBOX} up to z${MAXZOOM} from ${SOURCE}"
echo "This reads the planet archive remotely; only the region is transferred."

pmtiles extract "${SOURCE}" "${OUT}" \
  --bbox="${BBOX}" \
  --maxzoom="${MAXZOOM}"

echo
echo "Wrote ${OUT} ($(du -h "${OUT}" | cut -f1))"
echo
echo "Verify before uploading — a truncated archive uploads perfectly happily:"
echo "    pmtiles show ${OUT}"
echo
echo "Then upload, for example:"
echo "    rclone copy ${OUT} r2:mioryde-basemap/"
echo
echo "And point the panel at it:"
echo "    NEXT_PUBLIC_MAP_TILES_URL=pmtiles://https://<r2-host>/${OUT}"
echo
echo "The panel probes the archive on load and shows an explicit"
echo "'basemap will not load' banner if the bucket refuses a range request,"
echo "so a CORS mistake is visible immediately rather than as a blank map."
