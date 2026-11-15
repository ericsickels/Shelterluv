#!/usr/bin/env bash
# Assemble the Cloudflare Pages site in ./site (the data files are built live by ./functions).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf site && mkdir -p site/fieldguide
cp web/* site/
# The field guide lives at /fieldguide/ (its home-screen app starts there); the old /fieldguide.html points to it.
mv site/fieldguide.html site/fieldguide/index.html
printf '/fieldguide.html /fieldguide/ 301\n' > site/_redirects
cat > site/_headers <<'H'
/*
  Access-Control-Allow-Origin: *
/*.json
  Cache-Control: public, max-age=300
H
echo "Built site/ ($(ls site | wc -l) files)"
