#!/usr/bin/env bash
# Generates PNG thumbnails for all templates using the local dev server.
# Requires: curl, python3, and either pdftoppm (poppler-utils) or ImageMagick convert.
# Usage: scripts/generate-template-previews.sh [server_url]
#   server_url defaults to http://localhost:8000

set -euo pipefail

SERVER="${1:-${MKCV_SERVER:-http://localhost:8000}}"
OUTPUT_DIR="frontend/assets/template-previews"
SAMPLE_YAML="scripts/sample-cv.yaml"
TARGET_W=300
TARGET_H=424

if [ ! -f "$SAMPLE_YAML" ]; then
  echo "ERROR: $SAMPLE_YAML not found. Run from the project root." >&2
  exit 1
fi

if command -v pdftoppm &>/dev/null; then
  CONVERTER=pdftoppm
elif command -v convert &>/dev/null; then
  CONVERTER=imagemagick
else
  echo "ERROR: Neither pdftoppm (poppler-utils) nor ImageMagick 'convert' found." >&2
  echo "  macOS:  brew install poppler" >&2
  echo "  Debian: apt-get install poppler-utils" >&2
  exit 1
fi

echo "Converter: $CONVERTER"
echo "Server:    $SERVER"
mkdir -p "$OUTPUT_DIR"

templates=$(curl -sf "$SERVER/api/templates" | python3 -c "
import sys, json
print(' '.join(json.load(sys.stdin)['templates']))
")

if [ -z "$templates" ]; then
  echo "ERROR: No templates returned from $SERVER/api/templates" >&2
  exit 1
fi

count=0
for name in $templates; do
  echo -n "  $name ... "

  payload=$(python3 -c "
import json, sys
yaml = open('$SAMPLE_YAML').read()
print(json.dumps({'yaml': yaml, 'template': sys.argv[1]}))" "$name")

  tmpdir=$(mktemp -d)

  http_code=$(curl -sf -o "$tmpdir/cv.pdf" -w "%{http_code}" \
    -X POST "$SERVER/api/preview/pdf" \
    -H "Content-Type: application/json" \
    -d "$payload") || http_code="000"

  if [ "$http_code" != "200" ] || [ ! -s "$tmpdir/cv.pdf" ]; then
    echo "SKIP (server returned $http_code)"
    rm -rf "$tmpdir"
    continue
  fi

  if [ "$CONVERTER" = "pdftoppm" ]; then
    pdftoppm -r 150 -f 1 -l 1 -png "$tmpdir/cv.pdf" "$tmpdir/page"
    page_file=$(ls "$tmpdir"/page*.png | head -1)
    if command -v convert &>/dev/null; then
      convert "$page_file" -resize "${TARGET_W}x${TARGET_H}!" "$OUTPUT_DIR/$name.png"
    else
      cp "$page_file" "$OUTPUT_DIR/$name.png"
    fi
  else
    convert -density 150 "$tmpdir/cv.pdf[0]" \
      -resize "${TARGET_W}x${TARGET_H}!" \
      "$OUTPUT_DIR/$name.png"
  fi

  rm -rf "$tmpdir"
  echo "done"
  count=$((count + 1))
done

echo ""
echo "Generated $count thumbnail(s) in $OUTPUT_DIR/"
