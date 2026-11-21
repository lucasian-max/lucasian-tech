#!/bin/sh
set -eu
cd "$(dirname "$0")"

DIST=$(mktemp -d)
cleanup() { rm -rf "$DIST"; }
trap cleanup EXIT INT TERM

set -- app.js styles.css includes/ipod/web-music-ipod.esm.js

if command -v sha256sum >/dev/null 2>&1; then
  V=$(cat "$@" | sha256sum | cut -c1-8)
elif command -v shasum >/dev/null 2>&1; then
  V=$(cat "$@" | shasum -a 256 | cut -c1-8)
else
  echo "deploy.sh: need sha256sum or shasum to stamp the shell" >&2
  exit 1
fi

for item in index.html 404.html styles.css app.js assets includes _headers \
            robots.txt sitemap.xml; do
  if [ -e "$item" ]; then
    cp -R "$item" "$DIST/"
  fi
done

sed "s/?v=[A-Za-z0-9]*/?v=$V/g" index.html > "$DIST/index.html"

for required in index.html 404.html styles.css app.js robots.txt sitemap.xml \
                includes/ipod/web-music-ipod.esm.js \
                includes/ipod/data/us/en-US.json \
                includes/ipod/data/us/index.json; do
  if [ ! -e "$DIST/$required" ]; then
    echo "deploy.sh: missing $required" >&2
    exit 1
  fi
done

echo "shell version: $V"
grep -o '?v=[A-Za-z0-9]*' "$DIST/index.html" | sort -u || true

npx --yes wrangler@latest pages deploy "$DIST" \
  --project-name=ipod --branch=main --commit-dirty=true
