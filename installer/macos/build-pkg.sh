#!/bin/bash
# Builds MathStudio-macOS.pkg (on macOS: pkgbuild / productbuild ship with Xcode tools).
#   bash installer/macos/build-pkg.sh https://<user>.github.io/<repo> [out-dir] [version]
# The offline version (experimental) carries the add-in (dist-offline/, from `npm run build:offline`)
# and a local https server (swiftc, from Xcode tools):
#   bash installer/macos/build-pkg.sh --offline [out-dir] [version]
set -euo pipefail
SITE="$1"
OFFLINE=0
NAME=MathStudio-macOS.pkg
if [ "$SITE" = "--offline" ]; then OFFLINE=1; SITE=https://localhost:44317; NAME=MathStudio-macOS-Offline.pkg; fi
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${2:-$ROOT/dist-installers}"
VERSION="${3:-1.0.0}"
WORK="$OUT/macos-build"
rm -rf "$WORK"
APP="$WORK/payload/Library/Application Support/MathStudio"
mkdir -p "$APP/fonts" "$WORK/scripts"

node "$ROOT/scripts/make-manifest.mjs" "$SITE" "$APP/manifest.xml"
cp "$ROOT/vendor/fonts/STIXTwoMath-Regular.otf" "$ROOT/vendor/fonts/texgyretermes-math.otf" "$ROOT/vendor/fonts/latinmodern-math.otf" "$APP/fonts/"
cp "$ROOT/vendor/fonts/STIX-OFL.txt" "$ROOT/vendor/fonts/GUST-FONT-LICENSE.txt" "$APP/fonts/"
cp "$HERE/Uninstall MathStudio.command" "$APP/"
chmod +x "$APP/Uninstall MathStudio.command"
cp "$HERE/scripts/postinstall" "$WORK/scripts/"
chmod +x "$WORK/scripts/postinstall"

if [ "$OFFLINE" = 1 ]; then
  test -f "$ROOT/dist-offline/office-js/office.js" || { echo "dist-offline missing: run npm run build:offline first"; exit 1; }
  cp -R "$ROOT/dist-offline" "$APP/site"
  touch "$APP/offline"
  for arch in arm64 x86_64; do
    swiftc -O -target "$arch-apple-macos11" "$HERE/server/main.swift" -o "$WORK/server-$arch"
  done
  lipo -create "$WORK/server-arm64" "$WORK/server-x86_64" -output "$APP/MathStudioServer"
  rm -f "$WORK"/server-*
  mkdir -p "$WORK/payload/Library/LaunchAgents"
  cp "$HERE/vn.mathstudio.server.plist" "$WORK/payload/Library/LaunchAgents/"
  cp "$HERE/scripts/offline-setup" "$WORK/scripts/"
  chmod +x "$WORK/scripts/offline-setup"
fi

pkgbuild --root "$WORK/payload" --install-location / --scripts "$WORK/scripts" \
  --identifier vn.mathstudio.word --version "$VERSION" "$WORK/component.pkg"
productbuild --distribution "$HERE/distribution.xml" --resources "$HERE/resources" \
  --package-path "$WORK" "$OUT/$NAME"
rm -rf "$WORK"
echo "Built $OUT/$NAME"
