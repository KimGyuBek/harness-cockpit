#!/bin/sh
# 쓰고 있는 mod 폴더(기본 ~/mods/harness-cockpit)의 hooks · tests 를 이 저장소로 가져온다.
# mod 는 그 폴더에서 고치고(열린 세션에 바로 반영된다), 올릴 때 이 스크립트로 맞춘다.
# 사용: tools/sync-live.sh [mod 폴더]
set -e
SRC="${1:-$HOME/mods/harness-cockpit}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$SRC/hooks" ] || { echo "hooks 폴더가 없다: $SRC" >&2; exit 1; }
rm -rf "$ROOT/hooks" "$ROOT/tests"
cp -R "$SRC/hooks" "$SRC/tests" "$ROOT/"
git -C "$ROOT" status --short hooks tests
