#!/usr/bin/env python3
"""Write data/manifest.json: one entry per data file with size, source, licence
and the field codes the engine relies on. The engine reads this file first.
Usage: write_manifest.py data_dir"""
import json, os, sys, datetime
d = sys.argv[1]
def sz(f): return os.path.getsize(os.path.join(d, f)) if os.path.exists(os.path.join(d, f)) else None
layers = {
  "counties": {"file": "counties.topo.json", "format": "topojson", "objects": ["counties", "states", "nation"], "key": "id = 5-digit county FIPS (string); states id = 2-digit FIPS",
               "source": "us-atlas 3.0.1 (U.S. Census Bureau cartographic boundary files, 1:10m)", "license": "ISC (us-atlas) / public domain (Census)"},
  "counties-index": {"file": "counties-index.json", "format": "json", "shape": "{states:{fips:{name,abbr,lon,lat}}, counties:{fips:[name, stateFips, lon, lat, areaSqMi]}}",
               "source": "derived from counties.topo.json (inner label points via mapshaper)", "license": "public domain"},
  "roads-major": {"file": "roads-major.topo.json", "format": "topojson", "objects": ["roads_us"], "fields": {"c": "I interstate | U US highway | S state | O other", "t": "f freeway/tollway | p primary | s secondary | u unpaved | o other paved", "n": "route number ('' if none)", "s": "Natural Earth scalerank 3-12 (lower = more important)"},
               "source": "Natural Earth 1:10m roads, North America supplement, US only; interstates, US highways, state freeways/primaries", "license": "public domain"},
  "roads-minor": {"file": "roads-minor.topo.json", "format": "topojson", "objects": ["roads_us"], "fields": "same as roads-major", "source": "Natural Earth 1:10m roads NA supplement; state secondary and other paved roads", "license": "public domain"},
  "lakes": {"file": "lakes.topo.json", "format": "topojson", "fields": {"n": "name", "r": "scalerank"}, "source": "Natural Earth 1:10m lakes", "license": "public domain"},
  "rivers": {"file": "rivers.topo.json", "format": "topojson", "fields": {"n": "name", "r": "scalerank"}, "source": "Natural Earth 1:10m rivers + lake centerlines", "license": "public domain"},
  "urban": {"file": "urban.topo.json", "format": "topojson", "fields": {"a": "area km2"}, "source": "Natural Earth 1:10m urban areas", "license": "public domain"},
  "population": {"file": "population.json", "format": "json", "shape": "{counties:{fips:[population, censusRegion 1-4, censusDivision 1-9]}}", "source": "Census Bureau county population estimates, vintage 2024 (2020 vintage for Connecticut's former counties and Valdez-Cordova AK)", "license": "public domain"},
  "cities": {"file": "cities.json", "format": "json rows", "fields": ["name", "st", "lat", "lon", "pop", "tier (N national capital, C state capital, S county seat, '' other)", "fips (5-digit county, '' if unknown)"],
             "source": "GeoNames cities1000 dump (places with population >= 1,000)", "license": "CC BY 4.0 — attribute GeoNames (geonames.org)"},
  "fonts": {"file": "fonts/{fontstack}/{range}.pbf", "format": "MapLibre SDF glyphs", "stacks": ["Overpass Regular", "Overpass SemiBold", "Overpass Bold", "Overpass Italic"], "source": "Overpass (Delta Airlines / Red Hat) via Google Fonts, rendered with fontnik", "license": "SIL Open Font License 1.1"}
}
for k, v in layers.items():
    if "{" not in v["file"]: v["bytes"] = sz(v["file"])
man = {"name": "us-map-kit data", "built": datetime.date.today().isoformat(), "crs": "WGS84 lon/lat", "extent": "50 states + DC (+ PR/territories in counties layer)", "layers": layers}
json.dump(man, open(os.path.join(d, "manifest.json"), "w"), indent=1)
print("manifest.json written")
