#!/usr/bin/env bash
# Regenerates engine/maplibre-css.js from the pinned MapLibre stylesheet.
set -e; cd "$(dirname "$0")/../.."
V=4.7.1
curl -sSL "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/$V/maplibre-gl.css" -o /tmp/maplibre-gl.css
node -e "const fs=require('fs');const css=fs.readFileSync('/tmp/maplibre-gl.css','utf8');fs.writeFileSync('engine/maplibre-css.js','// MapLibre GL JS $V stylesheet, injected by usmap.js so apps need no external <link> (BSD-3). Regenerate with pipeline/scripts/css2js.sh\nwindow.__MAPLIBRE_CSS='+JSON.stringify(css)+';\n');"
echo "engine/maplibre-css.js regenerated for MapLibre $V"
