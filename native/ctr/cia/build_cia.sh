#!/bin/bash
# build_cia.sh - Shantae Dual 3DS as a .cia (HOME Menu title), from the .3dsx build's ELF.
#   needs: makerom (3DSGuy/Project_CTR) and bannertool (carstene1ns/3ds-bannertool) in $TOOLS (default
#   /home/claude/work/ctr/tools), Playwright (the banner sound), Pillow (the icon and banner).
# Art is the project's own: banner/make_art.py (an original pixel wordmark, no game logo or font). The banner is
# silent (banner/render_jingle.py, the "Sequin Nights" opening, is kept but no longer used).
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd); ROOT=$(cd "$HERE/../.." && pwd)
TOOLS=${TOOLS:-/home/claude/work/ctr/tools}
OUT=${OUT:-$ROOT/out/ctr}
VER=$(grep -E '^VERSION' "$HERE/Makefile" | sed 's/.*:= *//')
B=$OUT/cia; mkdir -p "$B"
python3 "$HERE/banner/make_art.py" "$B"
python3 -c "import wave,sys; w=wave.open(sys.argv[1],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(32728); w.writeframes(bytes(4*3273)); w.close()" "$B/silence.wav"
"$TOOLS/bannertool-bin" makebanner -i "$B/banner.png" -a "$B/silence.wav" -o "$B/banner.bnr"   # silent banner
"$TOOLS/bannertool-bin" makesmdh -s "Shantae Dual 3DS" -l "Shantae Dual 3DS $VER: Shantae (USA) + a Link screen" \
    -p "Jack" -i "$B/icon.png" -o "$B/icon.icn"
"$TOOLS/makerom-bin" -f cia -o "$OUT/Shantae Dual 3DS.cia" -target t -exefslogo \
    -elf "$OUT/shantaedual3ds.elf" -rsf "$HERE/cia/shantaedual.rsf" -icon "$B/icon.icn" -banner "$B/banner.bnr" \
    -major "$(echo $VER | cut -d. -f1)" -minor "$(echo $VER | cut -d. -f2 | cut -d- -f1)" -micro 0
ls -la "$OUT/Shantae Dual 3DS.cia"
