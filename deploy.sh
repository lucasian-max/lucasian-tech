#!/bin/sh
# Deploy to Cloudflare Pages.
#
# The apex zone serves /app.js and /styles.css with max-age=14400 no matter what
# _headers says, so a stale shell can outlive a deploy by four hours. The shell
# URLs therefore carry a version stamp, and this script derives it from the files
# themselves — never hand-bump it.
set -e
cd "$(dirname "$0")"

DIST=$(mktemp -d)
V=$(cat app.js styles.css includes/ipod/web-music-ipod.esm.js | shasum -a 256 | cut -c1-8)

cp -R index.html 404.html styles.css app.js assets includes _headers "$DIST/"
# rewrite every ?v=... in the shell to the current stamp
sed -i '' "s/?v=[A-Za-z0-9]*/?v=$V/g" "$DIST/index.html"

echo "shell version: $V"
grep -o '?v=[a-z0-9]*' "$DIST/index.html" | sort -u

npx --yes wrangler@latest pages deploy "$DIST" \
  --project-name=ipod --branch=main --commit-dirty=true
rm -rf "$DIST"
