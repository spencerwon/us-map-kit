# Recipe: polling and election maps

`apps/political-example.html` is the starting point. It is 60 lines of app code on top of the engine
and demonstrates the four map types you will need most. This page walks through turning it into a real
project.

## 1. Choose the map type by the question

| question | map | scale | palette |
|---|---|---|---|
| Who is ahead, and by how much? | margin choropleth | `diverging([-M, 0, +M], redBlue)` | symmetric around 0 so a 50/50 county is neutral grey |
| Who won? | winner map | `categorical(party)` | flat party colours |
| How did it move since last time? | swing map | `diverging([-S, 0, +S], …)` with value = margin now − margin then | |
| How engaged / how big? | turnout, votes cast, population | `sequential([lo, hi], teal)` | one hue, light → dark |
| Which bucket? (safe / lean / toss-up) | classed | `threshold([-15,-5,5,15], 5 colours)` | few, nameable classes |
| Where is the poll's sample? | points or state fill | `setStateColors` or a point layer | |

Choropleths colour **area**, and a margin map of county area overstates rural land. Two standard
correctives are both available: colour by margin but add a point layer sized by total votes
(`m.map.addLayer` with `circle-radius` from a `sqrt` of votes), or show the two-way vote *share*
with opacity scaled by votes (`setCountyState(fips, {color, opacity})`).

## 2. Get the data into `{fips: value}`

- **Election returns**: MIT Election Lab county presidential returns (CSV, FIPS column), state SoS
  files, or the AP/NYT feeds a newsroom licenses. Pad FIPS to 5 characters.
- **Polling crosstabs**: polls are rarely county-level. Map them at the level they were fielded
  (state → `setStateColors`; media market or region → `fitCounties`/colour the member counties with
  one value), and label the map with the sample size and dates.
- **Modelled estimates** (MRP, demographic projections): county-level, treat as a sequential or
  diverging value and say it is modelled in the legend title.
- **Demographics** (ACS via the Census API): `https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E&for=county:*`
  returns state + county codes; concatenate them for FIPS.

Alaska reports by state House district, not borough; Connecticut switched to planning regions in 2022.
See DATA.md.

## 3. Wire it up

```js
const m = await USMap.create({ container: '#map', dataRoot: '../data/', layers: { roads: 'major', urban: false } });
const results = await (await fetch('results.json')).json();          // {fips: {dem, rep, total}}
const margin = Object.fromEntries(Object.entries(results).map(([f, r]) => [f, 100 * (r.dem - r.rep) / r.total]));
const scale = USMap.scale.diverging([-60, 0, 60], USMap.palettes.redBlue);
m.setCountyValues(margin, { scale, opacity: 0.78 });
USMap.legend('#legend', { title: '2024 margin (D − R)', scale, format: v => (v > 0 ? '+' : '') + v });
m.on('county:click', e => showDetail(results[e.fips], e.county));
```

For a time slider (several elections), precompute one value map per year and call
`setCountyValues` on input; it is cheap enough to run on every tick of a range slider.

## 4. Design notes

- **Red/blue is a convention, not a law of nature**: the `redBlue` palette is Republican-red on the
  negative end. If your value is `rep − dem`, use `blueRed`.
- Put the **legend title** to work: "2024 margin (D − R, pts), 3,112 counties reporting" tells the
  reader what they are looking at; "Legend" does not.
- The basemap's roads and city labels sit above the fill. For a dense choropleth, turn off
  `urban` and use `roads: 'major'` so the colour reads; keep city labels, they are how people
  orient.
- Themes: a dark theme and a diverging palette fight each other at the pale centre (`#f7f7f7` on
  `#1b1e22`). For dark presentations use a palette whose centre is mid-grey, or lower the opacity.
- Hover tooltips should show the raw numbers (votes, share, turnout), not just the colour's value.

## 5. What to build next, in the order it usually pays off

1. **Detail panel** on click: county name, the numbers, a small bar of candidates, link to source.
2. **State filter**: `m.flyToState(fips)` plus `setCountyValues(…, {clearOthers:true})` with only
   that state's counties, so the scale can rescale to the state.
3. **Districts layer**: congressional districts from Census cartographic boundaries, built with the
   same pipeline flags, added as a line layer under `state-line`; colour with `feature-state` the
   same way.
4. **Compare mode**: two value maps, a swing computed client-side, a toggle.
5. **Export**: create the map with `preserveDrawingBuffer: true`, then
   `m.map.getCanvas().toDataURL('image/png')` gives a PNG of the current view.
