# us-map-kit

A self-contained framework for building interactive US county and state maps in the browser:
a full road atlas basemap (interstates, US and state highways, local roads, 16,600 cities and towns,
lakes, rivers, built-up areas), every county and state boundary keyed by FIPS code, and a small
JavaScript engine (`USMap`) that turns any FIPS-keyed dataset into a clickable, colourable map.

It ships with two apps:

| App | What it is |
|---|---|
| `county-tracker.html` | **Spencer's County Log** — click or paint the counties you've been to. |
| `apps/political-example.html` | A choropleth template (margin, turnout, winner, classed) for polling and election maps. |

```
us-map-kit/
├── county-tracker.html        the tracker app
├── County Log.app             double-click: opens the live tracker (claude.ai)
├── County Log (offline).app   double-click: runs the tracker from this folder
├── Map Kit Example.app        double-click: runs the choropleth example
├── serve.command              same as the offline app, but keeps a Terminal window open
├── apps/
│   └── political-example.html choropleth template with synthetic data
├── engine/
│   ├── usmap.js               the map engine (one global: USMap)
│   └── maplibre-css.js        MapLibre's stylesheet, injected by the engine
├── data/                      16 MB of prebuilt map data (see docs/DATA.md)
│   ├── manifest.json          what every file is, where it came from, its licence
│   ├── counties.topo.json     3,231 county equivalents + 56 states/territories
│   ├── counties-index.json    FIPS → name, state, label point, area
│   ├── roads-major/minor      Natural Earth roads, US only, two detail tiers
│   ├── population.json        Census population + region per county
│   ├── cities.json            GeoNames places ≥1,000 people
│   ├── lakes / rivers / urban
│   └── fonts/                 map label glyphs (Overpass)
├── pipeline/
│   ├── build-data.sh          rebuilds data/ from public sources
│   ├── build-data.command     Mac double-click wrapper for the above
│   └── scripts/               the individual build steps
└── docs/
    ├── ARCHITECTURE.md        how the pieces fit, and why
    ├── ENGINE.md              USMap API reference
    ├── DATA.md                every data file, field by field
    └── POLITICAL.md           recipe for polling / election maps
```

## Opening it (the short version)

Three double-clickable apps sit in the kit folder:

| App | Opens |
|---|---|
| **County Log.app** | the live tracker on claude.ai, with your account-synced log |
| **County Log (offline).app** | the same tracker served from this folder (saves to the browser only) |
| **Map Kit Example.app** | the political choropleth template |

Drag any of them to the Dock or the Desktop. The first time, macOS may say the app is from an
unidentified developer: right-click → Open, once. (Cloning with GitHub Desktop avoids that
entirely; only files downloaded as a zip get the warning.)

For a real Dock app for the live page, Safari can also do it: open the tracker in Safari, then
File → Add to Dock. That keeps your claude.ai login and opens in its own window.

## Running it on your Mac (the longer version)

1. Unzip the kit anywhere (Documents is fine).
2. Double-click **`serve.command`**. A Terminal window opens, and the tracker opens in your browser at
   `http://localhost:8765/county-tracker.html`. Leave the Terminal window open while you use it.
   (The first time, macOS may ask you to allow it: right-click → Open.)
3. For the choropleth template: `http://localhost:8765/apps/political-example.html`.

Why a server at all: browsers refuse to load data files from a page opened straight off the disk
(`file://`), so the map needs to be served over `http`. Any static host works the same way: drop the
folder on GitHub Pages, Netlify, S3, or a claude.ai artifact.

## Building a new map in five lines

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"></script>
<script src="engine/maplibre-css.js"></script>
<script src="engine/usmap.js"></script>
<div id="map" style="position:absolute;inset:0"></div>
<script>
  USMap.create({ container: '#map', dataRoot: 'data/' }).then(m => {
    m.setCountyValues({ '48453': 12.4, '48491': -3.1 },           // FIPS → value
      { scale: USMap.scale.diverging([-30, 0, 30], USMap.palettes.redBlue) });
    m.on('county:click', e => console.log(e.county.name, e.fips));
  });
</script>
```

Everything else — search, flyTo, legends, themes, layer toggles, state-level colouring — is in
`docs/ENGINE.md`.

## Rebuilding the data

`pipeline/build-data.sh` (or the `.command` wrapper) downloads the sources and regenerates every
file in `data/`. It needs Node 18+, Python 3 and `curl`; it installs `mapshaper` and `fontnik` on
first run. About 300 MB of downloads, ~3 minutes. Sources and licences are in `data/manifest.json`.

## Licences

Engine and apps: MIT. Data: US Census (public domain), Natural Earth (public domain),
GeoNames (CC BY 4.0 — keep the attribution line the engine renders), Overpass font (OFL 1.1),
MapLibre GL JS (BSD-3), topojson-client (ISC).
