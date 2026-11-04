# USMap engine reference

`engine/usmap.js` defines one global, `USMap`. Load MapLibre GL JS 4.x and topojson-client 3.x
before it, plus `engine/maplibre-css.js` (the engine injects that stylesheet itself).

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"></script>
<script src="engine/maplibre-css.js"></script>
<script src="engine/usmap.js"></script>
```

All FIPS codes are **strings**: 5 digits for counties (`'48453'`), 2 for states (`'48'`).
Numbers are accepted and zero-padded, but strings avoid surprises with leading zeros.

---

## `USMap.create(options) → Promise<map instance>`

Resolves once counties, states and cities are drawn. Roads and water keep loading in the background
(see events).

| option | default | meaning |
|---|---|---|
| `container` | `'#map'` | CSS selector or element. Give it a size; the engine fills it. |
| `dataRoot` | `'data/'` | Folder holding the files from `data/` (relative to the page or absolute). |
| `theme` | `'auto'` | `'atlas-light'`, `'atlas-dark'`, any key you add to `USMap.themes`, or `'auto'` (follows `prefers-color-scheme` and a `data-theme` attribute on `<html>`, live). |
| `states` | `'50dc'` | Which county equivalents to load: `'50dc'` (50 states + DC), `'all'` (adds PR and territories), or an array of 2-digit state FIPS. |
| `layers` | all on | `{urban, water, roads, cities, countyLabels, stateLabels}`. `roads` may be `true`/`'all'`, `'major'` (interstates, US and state highways only, skips the 6 MB minor file), or `false`. |
| `interactive` | `true` | Hover highlight, pointer cursor, click/hover events. |
| `tooltip` | `null` | `(county, mapEvent) → html string \| falsy`. When set, the engine positions a tooltip next to the cursor. Style `.usmap-tooltip` yourself. |
| `onProgress` | `null` | `(stage, fraction)`; stages: `counties`, `water`, `urban`, `roads`, `roads-minor`, `done`. |
| `bounds` | lower 48 | Initial `[[w,s],[e,n]]`. |
| `fitPadding` | `20` | Padding for the initial fit and `fitUS()`; a number or `{top,bottom,left,right}` (use it to keep the map clear of a side panel). |
| `minZoom` / `maxZoom` | `2.6` / `15` | |
| `navControl` | `true` | The +/− control, bottom right. |
| `glyphs` | `'fonts/{fontstack}/{range}.pbf'` | Glyph URL template, relative to `dataRoot`. |
| `preserveDrawingBuffer` | `false` | Set `true` if you need `m.map.getCanvas().toDataURL()` for PNG export. |

### Instance properties

- `map` — the underlying `maplibregl.Map`. Use it for anything the engine does not wrap (extra
  sources/layers, `fitBounds`, `on('moveend')`…).
- `index.counties: Map<fips, CountyRecord>`, `index.states: Map<fips, StateRecord>`,
  `index.cities: CityRecord[]` (sorted by population, descending).
- `themes` — same as `USMap.themes`. `version`.

```ts
CountyRecord = { fips, name, state /*2-digit*/, stateAbbr, stateName, lon, lat, areaSqMi, bbox:[w,s,e,n]|null }
StateRecord  = { fips, name, abbr, lon, lat, counties: fips[] }
CityRecord   = { name, st, lat, lon, pop, tier /*''|'S' seat|'C' capital|'N'*/, fips /*county or ''*/, rank }
```

### Lookups

- `county(fips) → CountyRecord | undefined`
- `state(fips) → StateRecord | undefined`
- `countyAt(lngLat) → CountyRecord | null` — resolves against rendered features, so the point must be
  inside the current viewport.
- `search(text, {limit = 12, counties = true, cities = true}) → Result[]`
  Matches county and city names, prefix first, with an optional `, ST` suffix (`'Travis, TX'`).
  Large cities outrank same-named counties.
  `Result = { kind:'county'|'city', label, sub, fips, county?, city?, lon, lat, score }`.

### Colouring counties (thematic layer)

- `setCountyValues(values, {scale, opacity = 0.72, clearOthers = false})`
  `values` is `{fips: value}` or a `Map`. Each value goes through `scale` (a `USMap.scale.*`
  function) to a colour. `null`/`NaN` values clear the county. With `clearOthers`, counties absent
  from `values` are cleared too.
- `setCountyColors({fips: cssColor}, opacity)` — explicit colours, no scale.
- `clearCountyValues()`
- `setCountyState(fips, {…})` / `getCountyState(fips)` — raw `feature-state` merge/read. Keys the
  engine itself uses: `color`, `opacity`, `value`, `hover`, `sel`. Add your own (the tracker uses `v`).
- `setCountyPaint(colorExpression, opacityExpression?)` — replace the `county-fill` paint expressions
  wholesale, for example to map a custom state key to colours:
  ```js
  m.setCountyPaint(['match', ['coalesce', ['feature-state', 'v'], 0], 1, '#2aa392', 2, '#7ab8e3', 'rgba(0,0,0,0)']);
  ```
- `setStateColors({stateFips: cssColor}, opacity = 0.6)` — colours whole states on a `state-fill`
  layer that sits under the county fill (created on first call).

### Selection and camera

- `select(fips | null)` — draws a highlight outline around one county.
- `flyToCounty(fips, fitBoundsOptions?)`, `flyToState(fips, opts?)`, `flyToCity(cityRecord, flyToOpts?)`
- `fitCounties(fipsArray, opts?)` — frames a set of counties (a district, a media market, a route).
- `fitUS(opts?)` — back to the lower 48 with the configured padding.

### Layers and themes

- `setLayerVisible(group, bool)` — groups: `roads`, `cities`, `water`, `urban`, `countyLabels`,
  `stateLabels`, or any raw layer id (`'road-shield'`, `'county-line'`…).
- `setTheme(name)` — swaps every basemap colour live. Emits `theme`.
- `destroy()`

### Events — `on(event, fn) → unsubscribe`, `off(event, fn)`

| event | payload |
|---|---|
| `county:click` | `{fips, county, lngLat, point, originalEvent}` |
| `county:hover` | same (fires on every mousemove over a county) |
| `county:leave` | `{}` |
| `map:click` | `{lngLat}` — a click on no county (water, outside the US) |
| `progress` | `{stage, pct}` |
| `layer:loaded` / `layer:error` | `{layer}` / `{layer, error}` |
| `basemap:complete` | — all lazy layers in |
| `theme` | `{theme}` |
| `ready` | the instance (also what the promise resolves with) |

---

## `USMap.scale` — value → colour functions

Each returns a function `v → cssColor | null` that also carries `kind`, `domain`/`breaks`/`mapping`
and `colors`, which `USMap.legend` reads.

- `sequential([min, max], colors)` — continuous ramp through the palette.
- `diverging([min, mid, max], colors)` — `mid` maps to the palette centre (use for margins, swings).
- `threshold([b1, b2, …], colors)` — classed: `colors[i]` for `b(i-1) ≤ v < b(i)`; `colors.length` must be `breaks.length + 1`.
- `categorical({key: color}, fallback?)` — for winners, parties, categories.

## `USMap.palettes`

`redBlue` / `blueRed` (9-step diverging, Republican red ↔ Democratic blue), `teal`, `amber`,
`purple`, `grey` (7-step sequential), `party` (`{D, R, I, G, L, O}`), `categorical` (8 hues).
Pass any array of CSS hex colours instead; `USMap.util.interpolatePalette(colors, t)` is exposed.

## `USMap.legend(element, spec)`

Renders a legend into `element` (selector or node) from `{title, scale, format?, labels?}` or from
`{title, items:[{color, label}]}`. Continuous scales draw a ramp with end (and mid) labels; threshold
and categorical scales draw swatch rows. Classes: `.usmap-legend`, `.t`, `.ramp`, `.ends`, `.row`, `.sw`.

## `USMap.themes`

```js
USMap.themes['campaign'] = Object.assign({}, USMap.themes['atlas-light'], { land: '#ffffff', county: '#c9c9c9' });
USMap.create({ theme: 'campaign', … });
```
Keys: `land, water, waterLine, waterLabel, urban, nation, state, county, countyFill, hover, select,
iFill, iCase, uFill, uCase, sFill, sCase, oFill, oCase, unpaved, label, labelMuted, halo, countyLabel,
cityDot, cityDotRing`. Themes with "dark" in the name get the dark city-marker sprites.

## Layer ids (for `m.map.addLayer(def, beforeId)` and `setLayerVisible`)

In draw order: `background, urban, lakes, lakes-line, rivers, county-fill, county-hover, county-line,
county-select, state-line, nation-line, road-unpaved, road-minor-case, road-minor, road-state-case,
road-state, road-us-case, road-us, road-i-case, road-i, road-shield, water-label, county-label,
city-dot-5 … city-dot-1, city-label-5 … city-label-1, state-label`. A thematic point layer usually
goes before `county-label`; a district outline before `state-line`.

Sources: `counties` (features carry `properties.fips`, `properties.name`, numeric `id`), `states`,
`nation`, `county-points`, `state-points`, `cities`, `urban`, `lakes`, `rivers`, `roads-major`,
`roads-minor`.
