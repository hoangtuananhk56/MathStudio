#!/bin/bash
# Builds MathStudio-macOS.pkg (on macOS: pkgbuild / productbuild ship with Xcode tools).
#   bash installer/macos/build-pkg.sh https://<user>.github.io/<repo> [out-dir] [version]
set -euo pipefail
SITE="$1"
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

pkgbuild --root "$WORK/payload" --install-location / --scripts "$WORK/scripts" \
  --identifier vn.mathstudio.word --version "$VERSION" "$WORK/component.pkg"
productbuild --distribution "$HERE/distribution.xml" --resources "$HERE/resources" \
  --package-path "$WORK" "$OUT/MathStudio-macOS.pkg"
rm -rf "$WORK"
echo "Built $OUT/MathStudio-macOS.pkg"
