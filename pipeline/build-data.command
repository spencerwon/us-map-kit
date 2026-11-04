#!/bin/bash
# Double-click on a Mac: rebuilds data/ from public sources. Safe to re-run; it never deletes anything outside pipeline/.work.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
./build-data.sh
echo; read -n 1 -s -r -p "Done. Press any key to close."
