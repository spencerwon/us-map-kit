# Data files

Everything in `data/` is static JSON (plus glyph binaries), built by `pipeline/build-data.sh`.
`data/manifest.json` is the machine-readable version of this page and is regenerated on every build.
Coordinates are WGS84 longitude/latitude. All county keys are 5-digit FIPS strings.

| file | size | source | licence |
|---|---|---|---|
| `counties.topo.json` | 842 KB | us-atlas 3.0.1 (Census cartographic boundaries, 1:10m) | ISC / public domain |
| `counties-index.json` | 147 KB | derived from the above with mapshaper | public domain |
| `roads-major.topo.json` | 4.6 MB | Natural Earth 1:10m roads, North America supplement | public domain |
| `roads-minor.topo.json` | 6.1 MB | same | public domain |
| `population.json` | 63 KB | Census county population estimates, vintage 2024 | public domain |
| `cities.json` | 880 KB | GeoNames `cities1000` | **CC BY 4.0** — keep the attribution |
| `lakes.topo.json` | 581 KB | Natural Earth 1:10m lakes | public domain |
| `rivers.topo.json` | 482 KB | Natural Earth 1:10m rivers + lake centerlines | public domain |
| `urban.topo.json` | 371 KB | Natural Earth 1:10m urban areas | public domain |
| `fonts/*/0-255…768-1023.pbf` | 1 MB | Overpass via Google Fonts, rendered with fontnik | OFL 1.1 |

## counties.topo.json

TopoJSON with three objects: `counties` (3,231 geometries), `states` (56), `nation` (1).
Geometry `id` is the FIPS string; `properties.name` is the Census name without the "County" suffix.
The engine filters to 50 states + DC by default (`id.slice(0,2) <= '56'`); 60/66/69/72/78 are the
territories. One county equivalent, Falls Church city VA (`51610`), has no polygon at this scale
and gets a fallback label point in the index.

Vintage: us-atlas 3.0.1 reflects 2017-era boundaries. Two things changed since: Connecticut replaced
its 8 counties with 9 planning regions for Census purposes (2022, FIPS `09110`–`09190`), and
Alaska rearranged a few boroughs. Election and polling datasets published before 2024 still use the
old Connecticut counties, which this file matches. To move to the current boundaries, replace this
file with a mapshaper-simplified Census `cb_2023_us_county_5m` shapefile (same field layout: keep
`GEOID` as the id and `NAME` as `name`) and rerun `build_index.py`.

## counties-index.json

```json
{ "vintage": "...",
  "states":   { "48": { "name": "Texas", "abbr": "TX", "lon": -99.3, "lat": 31.4 }, … },
  "counties": { "48453": ["Travis", "48", -97.78, 30.33, 1034], … } }
```
County row: `[name, stateFips, labelLon, labelLat, areaSqMi]`. Label points are mapshaper's
`innerX/innerY` (a point guaranteed inside the polygon, not the centroid, which can fall outside
crescent-shaped counties).

## roads-major / roads-minor .topo.json

One TopoJSON object, `roads_us`, polylines. Both files share the property schema:

| prop | values |
|---|---|
| `c` | class: `I` interstate · `U` US highway · `S` state highway · `O` other |
| `t` | type: `f` freeway or tollway · `p` primary · `s` secondary · `u` unpaved · `o` other paved |
| `n` | route number as a string (`'35'`, `'35E'`, `'BUS20'`), `''` if unnumbered |
| `s` | Natural Earth scalerank 3–12; lower is more important |

Split: **major** = `c ∈ {I, U}` or (`c = S` and `t ∈ {f, p}`), 10,489 segments, simplified at 80 m;
**minor** = everything else, 26,230 segments, simplified at 150 m. Ferries, trails, closed and
under-construction roads are dropped. The engine draws shields for `I`, `U` and `S` using `n`.

Natural Earth's road layer is "important roads": complete for interstates and US routes, most state
highways, and a selection of county and local roads; it does not include residential streets.

## population.json

```json
{ "vintage": "...", "fallback2020": ["09001", …], "counties": { "48453": [1363767, 3, 7], … } }
```
Row: `[population, censusRegion, censusDivision]`. Regions: 1 Northeast, 2 Midwest, 3 South, 4 West;
divisions are the nine Census divisions. Nine county equivalents that no longer exist in the 2024
vintage (Connecticut's eight former counties, Valdez-Cordova AK) carry their 2020 estimate and are
listed in `fallback2020`. Total for the 50 states + DC: ~340 M.

## cities.json

```json
{ "fields": ["name","st","lat","lon","pop","tier","fips"],
  "rows": [["New York City","NY",40.7143,-74.006,8804190,"",""], …] }
```
16,637 places with population ≥ 1,000 in the 50 states + DC, sorted by population descending.
`tier`: `C` state capital, `S` county seat, `N` national capital, `''` other. `fips` is the county the
place sits in, `''` when GeoNames has no admin2 code for it (New York City, a few others).
GeoNames feature codes PPLX (neighbourhoods), PPLQ/PPLW (abandoned) and PPLH are excluded.

## lakes / rivers / urban

Clipped to the box −180,17 → −64,72. Lakes and rivers carry `n` (English name, may be `''`) and
`r` (scalerank). Urban areas carry `a` (km²). The engine labels lakes only.

## fonts

MapLibre SDF glyph ranges for four Overpass stacks: `Overpass Regular`, `Overpass SemiBold`,
`Overpass Bold`, `Overpass Italic`, Unicode 0–1023 (Latin, Latin-1, Latin Extended, IPA, spacing
modifiers, combining diacritics). Enough for every US place name. To add scripts, extend the loop in
`pipeline/scripts/mkglyphs.js`.

## Adding a dataset of your own

Keep it out of `data/` (that folder is regenerated) and put it next to the app that uses it.
Any shape works as long as it resolves to `{fips: value}` in the browser. A CSV with a `fips` column is
the most common case:

```js
const text = await (await fetch('results-2024.csv')).text();
const rows = text.trim().split('\n').map(l => l.split(','));
const [h, ...body] = rows; const col = name => h.indexOf(name);
const margin = Object.fromEntries(body.map(r => [r[col('fips')].padStart(5, '0'), +r[col('dem_pct')] - +r[col('rep_pct')]]));
m.setCountyValues(margin, { scale: USMap.scale.diverging([-50, 0, 50], USMap.palettes.redBlue) });
```

Watch for: FIPS stored as integers (loses the leading zero of the 01–09 states; always `padStart(5,'0')`),
Connecticut planning regions vs counties (above), Alaska election districts (not counties; Alaska
reports results by House district, so county-level Alaska maps need an allocation step), and the
two Virginia/Missouri independent cities that merged or split over the years.
