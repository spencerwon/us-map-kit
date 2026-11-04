# Architecture

## The one-paragraph version

Every map in this kit is three layers stacked on each other. At the bottom, a **data layer**: static
JSON files, prebuilt by a pipeline from public sources, every county keyed by its 5-digit FIPS code.
In the middle, an **engine** (`engine/usmap.js`) that loads those files into a MapLibre GL map, draws
the basemap, indexes counties and cities, and exposes a small API: colour counties, listen for clicks,
search, fly somewhere. On top, an **app**: one HTML file that owns the UI, the dataset being shown, and
how it is stored. Apps never touch MapLibre directly; they talk to `USMap`. That is the contract that
lets a county tracker and an election map share 100% of the mapping code.

```
┌─────────────────────────────────────────────────────────────┐
│  APP  (county-tracker.html, apps/political-example.html)    │
│  owns: UI, the dataset, persistence, what a click means     │
├─────────────────────────────────────────────────────────────┤
│  ENGINE  (engine/usmap.js)   global: USMap                  │
│  owns: basemap style, themes, county/city index, scales,    │
│        events, search, camera, legends                      │
├─────────────────────────────────────────────────────────────┤
│  DATA  (data/*.json, data/fonts/)   built by pipeline/      │
│  owns: geometry + attributes, keyed by FIPS                 │
└─────────────────────────────────────────────────────────────┘
          ▲ MapLibre GL JS 4.7 (WebGL renderer, from cdnjs)
          ▲ topojson-client 3 (decodes the compact geometry)
```

## Why these choices

**MapLibre GL, not Leaflet or D3.** The request was a road atlas you can zoom from the whole country
down to a town, with every county clickable. That is ~37,000 road segments, 3,200 polygons and 16,000
labelled points on screen at once. Canvas/SVG renderers choke on that; a WebGL vector renderer draws it
at 60 fps and does label collision, route shields and zoom-dependent styling natively. MapLibre is the
open-source fork of Mapbox GL and needs no API key.

**No tile server.** The usual way to serve a basemap is vector tiles from a server. That means hosting
infrastructure and an online dependency. Instead the kit ships *GeoJSON sources* (TopoJSON on disk,
decoded in the browser) and lets MapLibre tile them client-side. The whole basemap is 16 MB of static
files that work from any folder on any host. The trade-off is the first load (~4–8 s on a decent
connection, mostly the two road files, which load lazily after the counties are already interactive).
If a future project needs street-level detail everywhere, swap the road sources for a tile URL; the
engine's layer definitions are written against source names, so that is a one-line change per source.

**TopoJSON on disk, GeoJSON in memory.** TopoJSON shares arcs between neighbouring polygons and
quantizes coordinates, which is why 3,231 counties fit in 842 KB. `topojson.feature()` expands it to
GeoJSON on load.

**FIPS as the universal key.** Every county polygon, label point, city record and index entry carries
the 5-digit Census FIPS code as a *string* (`'01001'`, never `1001`). Election returns, polling
crosstabs, ACS demographics and the Census API all key on FIPS, so a dataset joins to the map with
no geocoding step. Internally MapLibre needs numeric feature ids for `feature-state`, so the engine
stores `+fips` on the geometry and pads back to a 5-character string at every public boundary. Apps
never see the number.

**Colour lives in feature-state, not in the data.** To colour a county the engine calls
`map.setFeatureState({source:'counties', id}, {color, value, opacity})`. The geometry is never
re-uploaded, so recolouring all 3,142 counties is instant. Apps that need something richer (the
tracker stores a status code `v` instead of a colour and lets a paint expression map it to the
theme's colours) use `setCountyState` + `setCountyPaint`.

**Themes are a flat object of named colours.** `USMap.themes['atlas-light']` and `['atlas-dark']`
list every colour the basemap uses. `setTheme()` rebuilds the layer definitions from the new object
and pushes only paint properties, so switching themes does not reload data. Add a brand theme by
adding an object with the same keys.

**Labels need glyphs.** WebGL text rendering uses signed-distance-field glyph atlases. The kit ships
its own (Overpass, four weights) in `data/fonts/<stack>/<range>.pbf` so no external font server is
needed. The pipeline only emits the Latin ranges (0–1023). The glyph URL template is configurable
(`glyphs` option) because some hosts only serve known file extensions; claude.ai artifacts serve the
same bytes under an `.otf` name, which the tracker detects by hostname.

## Data flow at runtime

1. `USMap.create()` fetches **counties.topo.json**, **counties-index.json** and **cities.json** in
   parallel and resolves only when the map has drawn counties, states and cities. Progress events fire
   for the counties file (the largest of the three) so an app can show a bar.
2. Roads, lakes, rivers and urban areas load **after** the promise resolves, each into an empty source
   that was created up front. `layer:loaded` fires per layer, `basemap:complete` when all are in.
   The user can click counties while the roads are still arriving.
3. Pointer events are resolved with `queryRenderedFeatures` on the `county-fill` layer, mapped from
   the numeric feature id back to the FIPS string and the index record, and emitted as
   `county:hover` / `county:click`.

## Extending the kit

| You want to… | Do this |
|---|---|
| Show a dataset on counties | `m.setCountyValues(valuesByFips, {scale})` — see ENGINE.md |
| Colour states instead | `m.setStateColors({'48': '#d2382d'})` (adds a state-fill layer under county-fill) |
| Add a point layer (polling places, offices) | `m.map.addSource('x', {type:'geojson', data})` + `m.map.addLayer({...}, 'county-label')` — the engine exposes the raw MapLibre map |
| Congressional or legislative districts | Build a `districts.topo.json` with the pipeline (Census TIGER cartographic boundaries, same mapshaper flags as counties) and add a source + fill/line layers; keep the GEOID as the id |
| Precincts | Same, but per state, and lazy-load by state bbox: precinct files are large |
| Another country | The engine is US-shaped only in `counties-index.json` (state table) and the `states:'50dc'` filter; everything else is generic |
| A different basemap look | Copy a theme object, change colours, `theme: 'mine'` |
| Street-level roads | Replace `roads-major`/`roads-minor` sources with a vector-tile source (OpenMapTiles schema) and re-point the `road-*` layers' `source-layer` |

## Known limits

- **Natural Earth roads stop at the "important county road" level.** Every interstate, US route and
  state highway is there, plus a dense network of other paved roads, but not residential streets.
  Zoom 13+ is intentionally capped at 15 to keep that honest.
- **Alaska and Hawaii** are drawn in their real positions (no inset). `fitUS()` frames the lower 48;
  `flyToState('02')` gets you to Alaska.
- **Puerto Rico and the territories** are in the counties file but filtered out by the default
  `states:'50dc'`. Pass `states:'all'` or an array of state FIPS to include them.
- **County names** are the Census names: "District of Columbia", "Carson City", Louisiana parishes
  and Alaska boroughs appear without the word "County". Apps that append "County" should check for
  the handful of independent cities (`/city$/i` on the name is a fair heuristic; Virginia has 38).
- `countyAt(lngLat)` uses rendered features, so it only resolves points inside the current viewport.
  A proper point-in-polygon lookup (e.g. for geocoding addresses to counties offline) would be a
  small addition using the decoded GeoJSON.
