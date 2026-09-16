#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
MANIFEST="docs/preservation/manifest.json"
FIXTURES="${ROUTE_MATRIX_FIXTURES:-{}}"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing $MANIFEST. Run: npm run manifest" >&2
  exit 1
fi

node <<'NODE' > /tmp/think5-route-matrix.tsv
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('docs/preservation/manifest.json', 'utf8'));
let fixtures = {};
try { fixtures = JSON.parse(process.env.ROUTE_MATRIX_FIXTURES || '{}'); }
catch (error) { console.error('ROUTE_MATRIX_FIXTURES must be valid JSON'); process.exit(2); }
for (const page of manifest.pages || []) {
  let route = page.route;
  if (page.dynamic) {
    if (!fixtures[route]) continue;
    route = fixtures[route];
  }
  if (page.public) console.log(['public', page.route, route].join('\t'));
  else if (Array.isArray(page.roles) && page.roles.length) console.log(['protected', page.route, route].join('\t'));
}
NODE

failures=0
while IFS=$'\t' read -r kind pattern route; do
  [[ -z "${kind:-}" ]] && continue
  if [[ "$kind" == "public" ]]; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}${route}")" || code="000"
    if [[ "$code" != "200" ]]; then
      echo "FAIL public $pattern ($route): expected 200, got $code"
      failures=$((failures + 1))
    else
      echo "PASS public $pattern"
    fi
    continue
  fi

  result="$(curl -sS -o /dev/null -w '%{http_code}\t%{redirect_url}' "${BASE_URL}${route}")" || result=$'000\t'
  code="${result%%$'\t'*}"
  redirect="${result#*$'\t'}"
  if [[ ! "$code" =~ ^30[2378]$ ]] || [[ "$redirect" != *"/auth/signin"* ]]; then
    echo "FAIL protected $pattern ($route): expected auth redirect, got $code -> $redirect"
    failures=$((failures + 1))
  else
    echo "PASS protected $pattern"
  fi
done < /tmp/think5-route-matrix.tsv

rm -f /tmp/think5-route-matrix.tsv

if (( failures > 0 )); then
  echo "$failures route-matrix check(s) failed" >&2
  exit 1
fi

echo "Route matrix passed"
