#!/usr/bin/env bash
# Rebuilds every file in data/ from public sources.
# Needs: node 18+ (mapshaper + fontnik), python3, curl, unzip.
# Run from anywhere: pipeline/build-data.sh        (or double-click build-data.command on a Mac)
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${KIT}/pipeline/.work"
OUT="${KIT}/data"
mkdir -p "$WORK" "$OUT/fonts"
cd "$WORK"

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

log "Tools"
command -v node >/dev/null || { echo "node is required (https://nodejs.org)"; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }
if ! command -v mapshaper >/dev/null; then npm install -g mapshaper; fi
[ -d node_modules/fontnik ] || { npm init -y >/dev/null; npm install fontnik >/dev/null; }

NE="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master"
fetch() { [ -s "$2" ] || { echo "  fetching $2"; curl -sSL --retry 3 -o "$2" "$1"; }; }

log "Download sources (skipped when already present in pipeline/.work)"
fetch "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json" counties-10m.json
for ext in shp dbf shx prj; do fetch "$NE/10m_cultural/ne_10m_roads_north_america.$ext" "ne_10m_roads_north_america.$ext"; done
fetch "$NE/geojson/ne_10m_lakes.geojson" ne_10m_lakes.geojson
fetch "$NE/geojson/ne_10m_rivers_lake_centerlines.geojson" ne_10m_rivers_lake_centerlines.geojson
fetch "$NE/geojson/ne_10m_urban_areas.geojson" ne_10m_urban_areas.geojson
fetch "https://download.geonames.org/export/dump/cities1000.zip" cities1000.zip
[ -s cities1000.txt ] || unzip -o -q cities1000.zip
for f in Regular SemiBold Bold Italic; do
  case $f in
    Regular) u="https://fonts.gstatic.com/s/overpass/v19/qFda35WCmI96Ajtm83upeyoaX6QPnlo6_PPrOQ.ttf";;
    SemiBold) u="https://fonts.gstatic.com/s/overpass/v19/qFda35WCmI96Ajtm83upeyoaX6QPnlo6IvTrOQ.ttf";;
    Bold) u="https://fonts.gstatic.com/s/overpass/v19/qFda35WCmI96Ajtm83upeyoaX6QPnlo6G_TrOQ.ttf";;
    Italic) u="https://fonts.gstatic.com/s/overpass/v19/qFdU35WCmI96Ajtm81GgSdXCNs-VMF0vNLADepqP.ttf";;
  esac
  fetch "$u" "Overpass-$f.ttf"
done

log "Counties + states (us-atlas, Census 1:10m cartographic boundaries)"
cp counties-10m.json "$OUT/counties.topo.json"
mapshaper -i counties-10m.json -target counties -each 'cx=this.innerX; cy=this.innerY; area=this.area' -o centroids.csv format=csv
mapshaper -i counties-10m.json -target states   -each 'cx=this.innerX; cy=this.innerY' -o state_centroids.csv format=csv
python3 "$KIT/pipeline/scripts/build_index.py" counties-10m.json centroids.csv state_centroids.csv "$OUT/counties-index.json"

log "Roads (Natural Earth 1:10m North America supplement, US only)"
# Field codes (see docs/DATA.md): c = I interstate / U US highway / S state / O other
#                                 t = f freeway-tollway / p primary / s secondary / u unpaved / o other paved
mapshaper -i ne_10m_roads_north_america.shp -rename-fields cls=class,typ=type \
  -filter 'country=="United States" && cls!="U/C" && cls!="Closed" && typ!="Ferry" && typ!="Trail"' \
  -each 'c=cls=="Interstate"?"I":cls=="Federal"?"U":cls=="State"?"S":"O"; t=typ=="Freeway"||typ=="Tollway"?"f":typ=="Primary"?"p":typ=="Secondary"?"s":typ=="Unpaved"?"u":"o"; n=number||""; s=scalerank; delete cls; delete continent; delete country; delete divided; delete length; delete note; delete number; delete prefix; delete rank; delete scalerank; delete state; delete typ; delete uident' \
  -filter remove-empty -o roads_us.json format=geojson precision=0.0001
mapshaper -i roads_us.json -filter 'c=="I" || c=="U" || (c=="S" && (t=="f"||t=="p"))' \
  -simplify interval=80 keep-shapes -o "$OUT/roads-major.topo.json" format=topojson quantization=400000
mapshaper -i roads_us.json -filter '!(c=="I" || c=="U" || (c=="S" && (t=="f"||t=="p")))' \
  -simplify interval=150 keep-shapes -o "$OUT/roads-minor.topo.json" format=topojson quantization=400000

log "Water + urban areas (Natural Earth 1:10m, clipped to US extent)"
BBOX=-180,17,-64,72
mapshaper -i ne_10m_lakes.geojson -clip bbox=$BBOX -filter remove-empty -each 'n=name_en||name||""; r=scalerank; this.properties={n:n,r:r}' -simplify interval=120 keep-shapes -o "$OUT/lakes.topo.json" format=topojson quantization=400000
mapshaper -i ne_10m_rivers_lake_centerlines.geojson -clip bbox=$BBOX -filter remove-empty -each 'n=name_en||name||""; r=scalerank; this.properties={n:n,r:r}' -simplify interval=150 keep-shapes -o "$OUT/rivers.topo.json" format=topojson quantization=400000
mapshaper -i ne_10m_urban_areas.geojson -clip bbox=$BBOX -filter remove-empty -each 'this.properties={a:Math.round(area_sqkm)}' -simplify interval=250 keep-shapes -o "$OUT/urban.topo.json" format=topojson quantization=400000

log "Cities and towns (GeoNames cities1000)"
python3 "$KIT/pipeline/scripts/build_cities.py" cities1000.txt "$OUT/cities.json"

log "Population (Census county estimates, vintage 2024 + 2020 for discontinued counties)"
fetch "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv" co-est2024-alldata.csv
fetch "https://www2.census.gov/programs-surveys/popest/datasets/2010-2020/counties/totals/co-est2020-alldata.csv" co-est2020-alldata.csv
python3 "$KIT/pipeline/scripts/build_population.py" co-est2024-alldata.csv co-est2020-alldata.csv "$OUT/counties-index.json" "$OUT/population.json"

log "Map label fonts (Overpass -> MapLibre glyph PBFs)"
node "$KIT/pipeline/scripts/mkglyphs.js" "$OUT/fonts"

log "Manifest"
python3 "$KIT/pipeline/scripts/write_manifest.py" "$OUT"
echo; echo "Done. data/ is rebuilt:"; du -sh "$OUT"
