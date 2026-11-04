#!/usr/bin/env python3
"""Build data/population.json from Census Population Estimates (public domain).
Usage: build_population.py co-est2024-alldata.csv co-est2020-alldata.csv counties-index.json out.json
Output: {"vintage": "...", "counties": {fips: [population, censusRegion, censusDivision]}}
Counties that no longer exist in the 2024 vintage (Connecticut's 8 counties, Valdez-Cordova AK)
take their 2020 estimate from the 2010-2020 file so every polygon in counties.topo.json has a value."""
import csv, json, sys
new, old, index, out = sys.argv[1:5]
def load(path, col):
    d = {}
    for r in csv.DictReader(open(path, encoding='latin-1')):
        if r['SUMLEV'] == '050': d[r['STATE'] + r['COUNTY']] = [int(r[col]), int(r['REGION']), int(r['DIVISION'])]
    return d
pop = load(new, 'POPESTIMATE2024'); fallback = load(old, 'POPESTIMATE2020')
idx = json.load(open(index))['counties']
res = {}; used_fallback = []
for fips in idx:
    if fips in pop: res[fips] = pop[fips]
    elif fips in fallback: res[fips] = fallback[fips]; used_fallback.append(fips)
    elif fips == '02261' and '02063' in pop and '02066' in pop:   # Valdez-Cordova split into Chugach + Copper River in 2019
        res[fips] = [pop['02063'][0] + pop['02066'][0], pop['02063'][1], pop['02063'][2]]; used_fallback.append(fips)
json.dump({'vintage': 'Census Bureau Population Estimates, vintage 2024 (2020 vintage for discontinued counties)', 'fallback2020': used_fallback, 'counties': res}, open(out, 'w'), separators=(',', ':'))
print(len(res), 'counties with population;', len(used_fallback), 'from the 2020 vintage ->', out)
