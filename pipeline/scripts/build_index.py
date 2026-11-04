#!/usr/bin/env python3
"""Build data/counties-index.json from the us-atlas TopoJSON plus the two
centroid CSVs mapshaper wrote. Usage:
  build_index.py counties.topo.json centroids.csv state_centroids.csv out.json
Output shape (see docs/DATA.md):
  {"vintage": "...", "states": {fips: {"name","abbr","lon","lat"}},
   "counties": {fips: [name, stateFips, lon, lat, areaSqMi]}}
"""
import csv, json, sys
topo, cfile, sfile, out = sys.argv[1:5]
ABBR = {'01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','60':'AS','66':'GU','69':'MP','72':'PR','78':'VI'}
t = json.load(open(topo))
states = {}
for g in t['objects']['states']['geometries']:
    states[g['id']] = {'name': g['properties']['name'], 'abbr': ABBR.get(g['id'], g['id'])}
for r in csv.DictReader(open(sfile)):
    if r['FID'] in states:
        states[r['FID']]['lon'] = round(float(r['cx']), 3); states[r['FID']]['lat'] = round(float(r['cy']), 3)
counties = {}
FALLBACK = {'51610': (-77.171, 38.882, 2)}   # Falls Church, VA: no polygon at 1:10m
for r in csv.DictReader(open(cfile)):
    if r['cx'] == '':
        lon, lat, sqmi = FALLBACK.get(r['FID'], (None, None, 0))
    else:
        lon, lat, sqmi = round(float(r['cx']), 3), round(float(r['cy']), 3), float(r['area']) / 2_589_988.11
    counties[r['FID']] = [r['name'], r['FID'][:2], lon, lat, round(sqmi)]
json.dump({'vintage': 'us-atlas 3.0.1 (Census cartographic boundaries, 1:10m)', 'states': states, 'counties': counties},
          open(out, 'w'), separators=(',', ':'))
print(len(states), 'states/territories,', len(counties), 'county equivalents ->', out)
