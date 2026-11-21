#!/bin/sh
# Deploy to Cloudflare Pages.
#
# The apex zone serves /app.js and /styles.css with max-age=14400 no matter what
# _headers says, so a stale shell can outlive a deploy by four hours. The shell
# URLs therefore carry a version stamp, and this script derives it from the files
# themselves — never hand-bump it.
#
# Portable on GNU/Linux and macOS: write the stamped HTML to the staging
# directory instead of relying on in-place editing, and hash with whichever of
# sha256sum / shasum is installed.
set -eu
cd "$(dirname "$0")"

DIST=$(mktemp -d)
cleanup() { rm -rf "$DIST"; }
trap cleanup EXIT INT TERM

# Hash the mutable shell assets in a fixed order. posts.js is optional.
set -- app.js styles.css
if [ -f posts.js ]; then
  set -- "$@" posts.js
fi
set -- "$@" includes/ipod/web-music-ipod.esm.js

if command -v sha256sum >/dev/null 2>&1; then
  V=$(cat "$@" | sha256sum | cut -c1-8)
elif command -v shasum >/dev/null 2>&1; then
  V=$(cat "$@" | shasum -a 256 | cut -c1-8)
else
  echo "deploy.sh: need sha256sum or shasum to stamp the shell" >&2
  exit 1
fi

# Copy the site. Optional files (posts.js) are skipped when absent.
for item in index.html 404.html styles.css app.js assets includes _headers \
            robots.txt sitemap.xml posts.js; do
  if [ -e "$item" ]; then
    cp -R "$item" "$DIST/"
  fi
done

# Rewrite every ?v=... in the shell to the current stamp. Streaming to a new
# file keeps this portable on both GNU and BSD sed.
sed "s/?v=[A-Za-z0-9]*/?v=$V/g" index.html > "$DIST/index.html"

# Fail loudly if a required file or the music catalog did not make it.
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
