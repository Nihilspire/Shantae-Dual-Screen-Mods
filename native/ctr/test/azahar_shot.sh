#!/bin/bash
# azahar_shot.sh APP.3dsx OUTDIR "STEPS" - boot a 3DS homebrew in Azahar (AppImage unpacked in /home/claude/work/azahar)
# headless under Xvfb with Mesa's software OpenGL, play STEPS, screenshot the window.
# STEPS: "w:SECONDS" wait, "k:KEY" tap an X key, "h:KEY:SECONDS" hold, "s:NAME" save OUTDIR/NAME.png.
# The ROM must be on Azahar's SD card: ~/.local/share/azahar-emu/sdmc/3ds/shantae-dual/shantae.gbc (put there by the
# caller). Screens show game art: keep OUTDIR under /home/claude/work or the desktop Renders folder, never in chat.
APP=$(readlink -f "$1"); OUT=$2; STEPS=$3
AZ=${AZAHAR:-/home/claude/work/azahar/squashfs-root/usr/bin/azahar}
mkdir -p "$OUT"
export DISPLAY=:78 LIBGL_ALWAYS_SOFTWARE=1 QT_QPA_PLATFORM=xcb
pkill -f 'Xvfb :78' 2>/dev/null || true; rm -f /tmp/.X78-lock
Xvfb :78 -screen 0 1280x1024x24 >/dev/null 2>&1 & XV=$!
sleep 1
# a window manager, so Qt's window becomes active and takes keyboard input (without one it ignores the keys)
command -v openbox >/dev/null && { openbox >/dev/null 2>&1 & WM=$!; sleep 1; }
"$AZ" -w "$APP" >"$OUT/azahar.log" 2>&1 & AP=$!
sleep 8
# No window manager: put the main window at (0,0) at a fixed size, so screen positions are the same every run, and
# click into the picture so Qt gives it keyboard focus.
WIN=$(xdotool search --pid $AP --onlyvisible --name 'Azahar' 2>/dev/null | head -1 || true)
[ -z "$WIN" ] && WIN=$(xdotool search --pid $AP --onlyvisible 2>/dev/null | head -1 || true)
if [ -n "$WIN" ]; then
  xdotool windowmove "$WIN" 0 0 windowsize "$WIN" 853 526 2>/dev/null || true
  sleep 1
  xdotool windowactivate --sync "$WIN" 2>/dev/null || xdotool windowfocus "$WIN" 2>/dev/null || true
  xdotool mousemove 426 120 click 1 2>/dev/null || true
  sleep 0.5; xdotool getwindowgeometry "$WIN" >/dev/null 2>&1   # openbox may add a title bar: read the origin back
  eval $(xdotool getwindowgeometry --shell "$WIN" 2>/dev/null); OX=${X:-0}; OY=${Y:-0}
fi
echo "window $WIN: $(xdotool getwindowgeometry "$WIN" 2>/dev/null | tr '\n' ' ')" >> "$OUT/azahar.log"
# STEPS also takes "c:X:Y" (click at window coordinates; the bottom screen's 320x240 starts near (266,259))
for s in $STEPS; do
  IFS=: read -r op a b <<< "$s"
  case $op in
    w) sleep "$a" ;;
    k) xdotool keydown "$a"; sleep 0.2; xdotool keyup "$a"; sleep 0.2 ;;
    h) xdotool keydown "$a"; sleep "$b"; xdotool keyup "$a" ;;
    c) xdotool mousemove $((a + ${OX:-0})) $((b + ${OY:-0})) mousedown 1; sleep 0.2; xdotool mouseup 1; sleep 0.2 ;;
    s) import -window root -crop 853x526+${OX:-0}+${OY:-0} +repage "$OUT/$a.png" ;;
  esac
done
kill $AP 2>/dev/null || true; sleep 1; kill -9 $AP 2>/dev/null || true; kill ${WM:-} 2>/dev/null || true; kill $XV 2>/dev/null || true
grep -iE 'error|fail|crash|exception' "$OUT/azahar.log" | grep -viE 'libEGL|MESA|ZINK' | head -10 || true
