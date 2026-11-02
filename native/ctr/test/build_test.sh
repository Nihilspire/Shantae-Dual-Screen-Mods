#!/bin/bash
# build_test.sh - the 3DS alpha with CTR_TEST: Game Boy buttons, Link-screen taps and fast-forward played from a
# compiled-in script by frame (Azahar's keyboard input can't be driven headless). Out: /home/claude/work/ctr/test-build.
# Default script: title -> new game -> through the opening text -> walk right -> tap PROGRESS, tap SHANTAE ->
# Select (dance list) -> fast-forward. Pad bits are libretro joypad ids: B 1<<0, SELECT 1<<2, START 1<<3, RIGHT 1<<7, A 1<<8.
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
T=${1:-/home/claude/work/ctr/test-build}
mkdir -p "$T"
if [ -n "$2" ]; then { echo '#define TEST_SCRIPT \'; sed '$!s/$/ \\/' "$2"; } > "$T/test_script.h"   # $2: entries, one a line
else {
  echo '#define TEST_SCRIPT \'
  # one Start once the title takes it (more would open the game's pause menu), A through File Select, B through the
  # opening text, walk right, tap PROGRESS (held ~3 s), tap SHANTAE, Select for the dance list, then fast-forward
  echo '  {1500, 8, 1u<<3, -1, -1, 0}, {1700, 8, 1u<<8, -1, -1, 0}, {1850, 8, 1u<<8, -1, -1, 0}, {2000, 8, 1u<<8, -1, -1, 0}, \'
  for f in $(seq 2150 30 4300); do echo "  {$f, 6, 1u<<0, -1, -1, 0}, \\"; done
  # 0.3: walk right with the MAP tab open; tap the map (x2), tap again (ALL), drag it, tap (x1); then fast-forward
  echo '  {4400, 600, 1u<<7, -1, -1, 0}, {4450, 1, 0, 140, 230, 0}, {4700, 1, 0, 160, 120, 0}, {4850, 1, 0, 160, 120, 0}, \'
  echo '  {4950, 60, 0, -1, -1, 0, 3, 0}, {5100, 1, 0, 160, 120, 0}, {5450, 240, 1u<<7, -1, -1, 1}'
} > "$T/test_script.h"; fi
rm -f "$T/obj/main.o" "$T/obj/linkscr.o"                  # they include test_script.h, which make doesn't track
export DEVKITPRO=/opt/devkitpro DEVKITARM=/opt/devkitpro/devkitARM
make -j8 -C "$HERE" GAMBATTE=$HOME/src/gambatte OUT="$T" EXTRA="-DCTR_TEST -I$T" 2>&1 | grep -E 'error|3dsx' | tail -3
