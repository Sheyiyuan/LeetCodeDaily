#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
icon_source="$project_root/apps/extension/assets/icon.svg"
icon_directory="$project_root/apps/extension/public/icons"
release_directory="$project_root/release"
version=$(node -p "require('$project_root/apps/extension/package.json').version")

mkdir -p "$icon_directory" "$release_directory"
if command -v rsvg-convert >/dev/null 2>&1; then
  for size in 16 32 48 128; do
    rsvg-convert -w "$size" -h "$size" "$icon_source" \
      -o "$icon_directory/icon-$size.png"
  done
else
  for size in 16 32 48 128; do
    test -s "$icon_directory/icon-$size.png" || {
      echo "rsvg-convert is unavailable and icon-$size.png is missing" >&2
      exit 1
    }
  done
  echo "rsvg-convert unavailable; using checked-in PNG icons" >&2
fi

cd "$project_root"
CI=true pnpm --filter @leetcode-daily/extension build

cd "$project_root/apps/extension/dist"
zip -q -r -FS "$release_directory/leetcode-daily-$version.zip" .
echo "$release_directory/leetcode-daily-$version.zip"
