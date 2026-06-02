#!/usr/bin/env bash
set -euo pipefail

export DART_SUPPRESS_ANALYTICS=true

CACHE_ROOT="${VERCEL_CACHE_DIR:-$PWD/.vercel-cache}"
FLUTTER_HOME="$CACHE_ROOT/flutter"
PUB_CACHE="$CACHE_ROOT/pub-cache"
FLUTTER_CHANNEL="${FLUTTER_CHANNEL:-stable}"

export PUB_CACHE

if [ ! -x "$FLUTTER_HOME/bin/flutter" ]; then
  rm -rf "$FLUTTER_HOME"
  git clone https://github.com/flutter/flutter.git "$FLUTTER_HOME" --depth 1 -b "$FLUTTER_CHANNEL"
fi

export PATH="$FLUTTER_HOME/bin:$PATH"

flutter --version
flutter config --enable-web
flutter pub get
flutter build web --release
