#!/bin/bash
# Double-click on a Mac: starts a local web server for this folder and opens the county tracker.
# Browsers block data files when a page is opened straight from the filesystem, so the apps need this.
cd "$(dirname "$0")"
PORT=8765
echo "Serving $(pwd) at http://localhost:$PORT  (close this window to stop)"
( sleep 1; open "http://localhost:$PORT/county-tracker.html" ) &
python3 -m http.server $PORT
