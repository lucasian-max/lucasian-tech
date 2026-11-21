#!/bin/sh
set -e
cd "$(dirname "$0")/.."
sed 's#src="includes/ipod/web-music-ipod.esm.js#src="/slowmod9/includes/ipod/web-music-ipod.esm.js#' \
  index.html > probe-slow.html
echo "wrote probe-slow.html"
