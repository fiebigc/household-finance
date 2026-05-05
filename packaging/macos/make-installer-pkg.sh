#!/usr/bin/env bash
# Builds a signed or unsigned Apple installer package (.pkg) from an existing Tauri app bundle.
#
# Prerequisites:
#   1. macOS host with Xcode command-line tools (`pkgbuild` ships with Xcode CLT).
#   2. Run a release build first, e.g. `npm run desktop:build`.
#
# Output:
#   dist-installer/Household-Finance-<version>.pkg    (drops into /Applications on install)
#
# Optional signing (Developer ID Installer certificate):
#   export PKG_SIGN_IDENTITY="Developer ID Installer: Your Name (TEAMID)"
#   bash packaging/macos/make-installer-pkg.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle/macos"
OUT_DIR="$ROOT/dist-installer"
STAGE="$OUT_DIR/pkg-stage-root"
IDENTIFIER="${PKG_IDENTIFIER:-local.finances.household}"

VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"

if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo >&2 "Missing bundle directory:"
  echo >&2 "  $BUNDLE_DIR"
  echo >&2 "Build the app first:"
  echo >&2 "  npm run desktop:build"
  exit 1
fi

APP_PATH="$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.app' -print -quit)"

if [[ -z "$APP_PATH" ]]; then
  echo >&2 "No macOS app bundle found under:"
  echo >&2 "  $BUNDLE_DIR"
  echo >&2 "Build it first:"
  echo >&2 "  npm run desktop:build"
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE/Applications"
ditto "$APP_PATH" "$STAGE/Applications/$(basename "$APP_PATH")"

mkdir -p "$OUT_DIR"

PKG_UNSIGNED="$OUT_DIR/Household-Finance-${VERSION}-unsigned.pkg"
PKG_FINAL="$OUT_DIR/Household-Finance-${VERSION}.pkg"

pkgbuild \
  --root "$STAGE" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location "/" \
  "$PKG_UNSIGNED"

if [[ -n "${PKG_SIGN_IDENTITY:-}" ]]; then
  productsign \
    --sign "$PKG_SIGN_IDENTITY" \
    "$PKG_UNSIGNED" \
    "$PKG_FINAL"
  rm -f "$PKG_UNSIGNED"
  echo "Signed installer:"
  echo "  $PKG_FINAL"
else
  mv "$PKG_UNSIGNED" "$PKG_FINAL"
  echo "Unsigned installer (Gatekeeper may require right-click Open the first time):"
  echo "  $PKG_FINAL"
fi

rm -rf "$STAGE"
echo "Done."
