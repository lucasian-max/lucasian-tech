#!/bin/sh
# Regenerate probe-slow.html: the real page, with the device module delayed 9s.
set -e
cd "$(dirname "$0")/.."
sed 's#src="includes/ipod/web-music-ipod.esm.js#src="/slowmod9/includes/ipod/web-music-ipod.esm.js#' \
  index.html > probe-slow.html
echo "wrote probe-slow.html"
