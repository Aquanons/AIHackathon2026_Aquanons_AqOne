# 24 — Offline map

How the Venture map keeps working with no signal, and how to generate the
basemap pack it needs.

## Why this exists

A fisherman opens Venture precisely when he has no signal. Before this work
the map was three separate failures at once: the basemap went grey, the buoy
and hazard layers were memory-only so a restart emptied them, and nothing on
screen said any of it was stale.

## The legal constraint — read this before touching tiles

**OpenStreetMap's tile servers may not be used for offline maps.** The
[Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) §4
is explicit:

> Offline use is not permitted on `tile.openstreetmap.org`. Features such as
> "Download city/country for offline use" or "Save area for later" rely on
> prefetch/bulk downloading and are therefore prohibited.

Enforcement is blocking without notice. A pilot whose basemap dies mid-trip
because we scraped a community-funded server is a worse outcome than a grey
map, and it is the kind of thing a judge reading our governance section would
rightly ask about.

The same policy *requires* the opposite behaviour we now implement: cache what
the user actually viewed, honour `Cache-Control`/`Etag` or a seven-day floor,
and send a User-Agent that identifies the app (§3.2, §3.4).

So: **viewed tiles are cached. Nothing is prefetched. The offline pack comes
from tiles we render ourselves.**

## The four layers

| Layer | What it does | State |
|---|---|---|
| `MapSnapshotStore` | Last good response per feed, in SQLite (schema v11) | Built |
| `OfflineMapBanner` | Says the map is saved, how old, and what is missing | Built |
| `TileCache` | Viewed tiles on disk, 80MB cap, 7-day floor | Built |
| `MbtilesTileProvider` | Reads the bundled pack | Built — **pack not yet generated** |

Provider chain, built in `buildTileProvider`: bundled pack → disk cache →
network. A missing pack degrades to the previous behaviour rather than
breaking the map.

### Snapshot expiry is not uniform, on purpose

| Feed | Max age | Why |
|---|---|---|
| Buoys, hotspots | 7 days | Moorings do not move; a stale position is still true |
| Wave / capsize alerts, sea condition | 6 hours | These describe conditions *now*. Serving a six-hour-old warning as current is the failure mode this feature could otherwise introduce |

When hazard snapshots have expired but buoys have not, the map draws buoys
with **no** hazard layer — which is visually identical to "no hazards
reported" and means the opposite. The banner says so in as many words. That
sentence is the most safety-relevant text in the feature.

## Generating the pack

**Not yet done.** The reader is written and wired; it needs the file at
`mobile/assets/map/new_washington.mbtiles`.

The pack is rendered from a local tile server, so no third party's terms are
involved. Roughly one to two hours, once, on a laptop with Docker.

### 1. Get the OSM data extract

Geofabrik publishes free regional extracts under ODbL:

```bash
curl -O https://download.geofabrik.de/asia/philippines-latest.osm.pbf
```

Optionally cut it down to Aklan first with `osmium extract` — the whole
Philippines will import, it just takes longer.

### 2. Run a local tile server

```bash
docker run -v $(pwd)/philippines-latest.osm.pbf:/data/region.osm.pbf \
  -v osm-data:/data/database/ overv/openstreetmap-tile-server import

docker run -p 8080:80 -v osm-data:/data/database/ \
  -d overv/openstreetmap-tile-server run
```

Tiles are then at `http://localhost:8080/tile/{z}/{x}/{y}.png`. This is your
server; rendering from it in bulk is entirely legitimate.

### 3. Render the bounding box to MBTiles

New Washington municipal waters, with margin for a trip that runs wide:

```
bbox: 122.20,11.55,122.55,11.90   (west,south,east,north)
zoom: 10-15
```

Any MBTiles tool works. With `tl`:

```bash
tl copy -b "122.20 11.55 122.55 11.90" -z 10 -Z 15 \
  http://localhost:8080/tile/{z}/{x}/{y}.png \
  mbtiles://./new_washington.mbtiles
```

Expect roughly 15–25MB — most tiles are open water and compress hard. If it
comes out much larger, drop z15; z14 is about 6m/pixel, which is ample for
"where is the shore and where is the buoy".

### 4. Add it to the app

```bash
mkdir -p mobile/assets/map
cp new_washington.mbtiles mobile/assets/map/
```

Then add to `pubspec.yaml` under `flutter: assets:`:

```yaml
    - assets/map/new_washington.mbtiles
```

`flutter pub get`, rebuild. The app copies it out of the bundle on first
launch (sqflite cannot read the asset bundle directly) and opens it
read-only.

### 5. Verify

Airplane mode, fresh install, open Venture. The municipal waters should draw.
**Check the coastline is the right way up** — MBTiles rows are TMS, counting
y from the bottom, while flutter_map counts from the top. The reader flips
them; if that flip were ever wrong the map would render mirrored
north-to-south, which at sea looks plausible enough to be dangerous.

## Attribution

ODbL applies to the pack as much as to live tiles. The existing on-map
attribution covers it — do not remove it when the basemap goes offline.

## Not done

- The pack itself (steps 1–4 above).
- A download-on-first-run path. Bundling was chosen because a post-install
  download fails for exactly the person it matters to: someone on a weak
  connection who installs at home, never completes it, and goes to sea with a
  blank map and no idea anything is missing. Worth adding later for updating
  coverage without a release.
- Nothing here is covered by device testing yet.
