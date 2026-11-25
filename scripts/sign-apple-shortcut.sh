#!/bin/sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/shortcuts/cool-joule-workout.plist"
out="$root/public/shortcuts/cool-joule-workout.shortcut"

if ! command -v shortcuts >/dev/null || ! command -v plutil >/dev/null; then
  echo "Need macOS shortcuts and plutil to sign the Apple Shortcut." >&2
  exit 1
fi

plutil -lint "$src"
tmp="$(mktemp -t cool-joule-shortcut).shortcut"
plutil -convert binary1 -o "$tmp" "$src"
mkdir -p "$(dirname "$out")"
shortcuts sign --mode anyone --input "$tmp" --output "$out"
chmod 644 "$out"
rm -f "$tmp"
echo "Signed $out"
