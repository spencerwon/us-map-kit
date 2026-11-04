#!/usr/bin/env python3
"""Build data/cities.json from the GeoNames cities1000 dump (CC BY 4.0).
Usage: build_cities.py cities1000.txt out.json
Keeps US places in the 50 states + DC; drops neighbourhood/section records
(PPLX) and abandoned places. Row shape: [name, state, lat, lon, population,
tier, countyFips] where tier is "N" national capital, "C" state capital,
"S" county seat, "" otherwise. Rows are sorted by population, descending.
"""
import csv, json, sys
src, out = sys.argv[1:3]
ST = {'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10','DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19','KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27','MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35','NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44','SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53','WV':'54','WI':'55','WY':'56'}
rows = []
for r in csv.reader(open(src, encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE):
    if r[8] != 'US' or r[10] not in ST: continue
    fcode = r[7]
    if fcode in ('PPLX', 'PPLQ', 'PPLW', 'PPLH'): continue
    pop = int(r[14] or 0)
    tier = {'PPLC': 'N', 'PPLA': 'C', 'PPLA2': 'S'}.get(fcode, '')
    if pop <= 0 and tier not in ('N', 'C'): continue
    fips = ST[r[10]] + r[11] if r[11].isdigit() and len(r[11]) == 3 else ''
    rows.append([r[1], r[10], round(float(r[4]), 4), round(float(r[5]), 4), pop, tier, fips])
rows.sort(key=lambda x: -x[4])
json.dump({'source': 'GeoNames cities1000 (CC BY 4.0)', 'fields': ['name', 'st', 'lat', 'lon', 'pop', 'tier', 'fips'], 'rows': rows},
          open(out, 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(rows), 'places ->', out)
