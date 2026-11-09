# Shantae Dual — notes for Claude Code

This file is the hand-off. It was written when the project moved from claude.ai to Claude Code at 0.26. Read it
first. Then read `CHANGELOG.md` for features and history (`README.md` is the public GitHub page), and `SHANTAE-RAM.md` for everything known about the game's RAM,
ROM, objects and script VM.

## What this is
One Android APK for a 3DS-style dual-screen handheld:
- **Top screen:** Shantae (USA, GBC, ROM CRC32 `E994B59B`) running on a patched libretro-gambatte.
- **Bottom screen:** the "Link" companion page. It's 4:3, with a 320x240 logical canvas at 2x.
  It reads the game's RAM live and shows the map, inventory, dances, progress and options.

The project was built from Metroid Dual 0.45 (NES). Its sibling projects are Xenogears Dual, Mario 2 Dual and SMA Dual.
The cross-project lessons are in `docs/porting-a-dual-app.md`. That file is a copy of the claude.ai project doc
"porting-a-dual-app.md"; keep both in step if you can.

**No game data ships in the APK.** The user picks the ROM on first launch. A one-time, headless "extraction" then plays
the game's title screen to record the title music into private
storage.

## Layout
```
app/
  src/com/jack/shantaedual/
    MainActivity.java   Frame loop, input, save slots, the two screens, and the WebView bridges.
                        LinkBridge holds the @JavascriptInterface methods the Link page calls as N.*
    Native.java         JNI declarations
    Gb.java, GameView.java, FrameQueue.java, PanelArrow.java, PanelGeom.java, TouchPadView.java, DualLayout.java, BezelTheme.java, RomGfx.java, AudioOut.java, VSync.java
  assets/link/          Link page (plain JS, canvas):
    link.js             Tabs, panels, ending card, FF button
    map.js              Map and map cards
    world.js            Place names and links
    monsters.js         Bestiary (0.30: pictures decoded from the ROM)
                        (link.js ICON_MAP: the inventory icons, built from the ROM since 0.31; FIG: Shantae on
                        the SHANTAE tab, from the ROM since 0.32)
    shantae.js, gbgfx.js
  assets/menu/          Launcher and pause menu
  assets/view3d/        Experimental 3D view
  res/                  Icons: the user's Pixel Icon Lab export (0.36) as ic_launcher*, adaptive + round + monochrome.
                        Shantae Link's are in linkapp/res, copied over these by its build.
                        tools/icon/adaptive.py made the old ones: running it would overwrite the new layers
  AndroidManifest.xml   versionCode and versionName
native/
  gbcore.c/.h           Frontend over gambatte: peek/poke, snapshots, states
  gbjni.c               JNI
  extract.c             First-start extraction (the title music)
  wide.c                WIDE VIEW: the world around the real picture, ported from the recomp (license in app/assets/licenses), and the spawn window
  drive.c               Desktop test driver (out/host/drive)
  recomp/               gbcore.h on the Shantae recomp instead of gambatte: the "Shantae Dual Recomp" alpha. See its README.md
  gbglue.cpp, cxxrt.c, jni.map, Makefile
  gambatte-dual.patch   Applied to libretro-gambatte @ 77f2567
tools/
  setup_toolchain.sh, build_apk.sh, mkstubs.py, stubs/, include/   Build
  shantaedual.keystore  Signing key (not in git; password in shantaedual.keystore.pass). Keep both: updates need the same key
  icon/adaptive.py
  re/                   Reverse-engineering scripts (see tools/re/README.md); re/extra has two older helpers
  fixpaths.py           Rewrites the absolute paths in the scripts (see "Paths")
tests/
  linktest.py, menutest.py, preview.py, maptime.py, view3dtest.py, showreel.py, showreel_clips.py, standin.png
docs/porting-a-dual-app.md
out/                    Build output
  libcxx/include/       The two generated libc++ config headers; keep them
  android/libshantaedual.so
  Shantae Dual X.Y.apk
```

## Toolchain (Linux or WSL on Windows)
The build doesn't use the NDK or Gradle. It cross-compiles with clang against a stub bionic sysroot, then packages with
aapt v1, javac, dx, zipalign and apksigner.
```
sudo apt install clang lld llvm aapt zipalign apksigner dalvik-exchange openjdk-17-jdk-headless git python3-pil
pip install playwright && playwright install chromium     # for tests/*.py (headless Chromium)
# android.jar API 33: https://github.com/Sable/android-platforms (android-33/android.jar)
#   Put it at ~/src/platforms/android-33/android.jar, or set ANDROID_JAR
bash tools/setup_toolchain.sh   # clones bionic, compiler-rt, libc++ 18.1.8 headers and gambatte@77f2567 (+ patch) into ~/src
```
`setup_toolchain.sh` builds `out/sysroot` and `out/builtins`. The sysroot is not in the zip; regenerate it with the
script.

For the RE tools you also need mgbdis (https://github.com/mattcurrie/mgbdis), cloned into ~/src/mgbdis, for full-bank
disassembly. `tools/re/gbdis.py` is the small built-in disassembler.

## Build
```
bash tools/build_apk.sh        # -> out/Shantae Dual <VERSION>.apk  (rebuilds the .so if native/ changed)
make -C native TARGET=host GAMBATTE=$HOME/src/gambatte host     # -> out/host/drive (desktop driver)
```
**Bump the version on every build.** Change all three:
- `VERSION` in MainActivity.java
- `android:versionCode` in AndroidManifest.xml (build_apk.sh syncs versionName)
- the title line of CHANGELOG.md (README.md is the public GitHub page: it has no version)

Bump `ASSET_VERSION` in MainActivity.java only when the extraction output changes; that forces a re-extract on the
device.

## Paths
The tests and RE scripts were written with absolute paths:
- `/home/claude/shantae-dual`: this repo
- `/home/claude/work`: the work folder, holding `shantae.gbc` (the ROM, not in the repo) and `st/` (driver save states)

On a new machine, either create those paths (symlinks are fine), or run:
```
python3 tools/fixpaths.py <repo dir> <work dir>
```
The save states are in the separate zip "Shantae Dual test states.zip". Unzip it so the `.st` files land in
`<work dir>/st/`. Some scripts also read or write `/tmp/...` scratch files; that's harmless. The RE scripts read
`SHANTAE_ROM` where noted.

Useful states:
- `d4.st`: the debug game, used as the base for warps
- `after_end.st`: the credits
- `night_walk.st`
- `sw*.st`: room sweeps
- `lk*.st`: Link screen checks
- `door_*` and `ow_*`: door and overworld tests


**This machine (Windows + WSL Ubuntu, set up Nov 1 2026 for 0.26):**
- Repo: `C:\Users\Jackson\Desktop\Claude\Shantae\shantae-dual`, linked as `/home/claude/shantae-dual` (no fixpaths
  needed). Work folder `/home/claude/work` is a real WSL folder: `shantae.gbc`, `st/` (313 states), `lzss.py` (symlink to
  tools/re/lzss.py; the tests import it from there), `smoke/` (scratch dumps and renders).
- `out/` is marked case-sensitive (`fsutil file setCaseSensitiveInfo`), because the bionic kernel headers have names
  that differ only by case (xt_connmark.h / xt_CONNMARK.h). If `out/` is ever deleted, recreate it empty, set the flag,
  then run setup_toolchain.sh.
- `/tmp` in WSL is tmpfs and is wiped when WSL idles out between commands. Keep anything that must survive (extractions,
  dumps) under `/home/claude/work`, or do it all in one script run.
- Run scripts as `wsl.exe -d Ubuntu -e bash /mnt/c/.../script.sh` rather than inline `bash -c` (PowerShell quoting).
- Toolchain: system clang 21 (the .so it builds is about 4 KB smaller than 0.26's), android.jar at
  `~/src/platforms/android-33`, sources in `~/src` (bionic, llvm, libcxx, gambatte @ 77f2567 + patch). No ffmpeg on
  PATH (Playwright has one at `~/.cache/ms-playwright/ffmpeg-1013`) and no mgbdis yet.
- Recomp checkout: `/home/claude/work/recomp/shantaerecomp` (pin d870bd2, with generated/ and roms/). Build with `RECOMP=` that path. Its driver states are in `/home/claude/work/rc` (made by tests/recomptest.py).
- `linktest.py --standin` still draws the map from real level tiles with the ROM font: check before posting any render.

## Desktop driver (out/host/drive)
```
out/host/drive shantae.gbc script.txt      # or "-" to read the script from stdin
```
Commands:

| Command | What it does |
|---|---|
| `run N [keys]` | Run N frames with keys held. Keys: `U D L R A B`, `T` (Start), `E` (Select) |
| `tap K` | Press key K once |
| `shot f.ppm` | Screenshot |
| `dump f.bin` | Full RAM/VRAM dump, the format the Link tests read |
| `save f.st` / `load f.st` | Save state |
| `peek ADDR [n]` / `poke ADDR V` | Read or write memory. `w3:` style WRAM banks as in link.js |
| `warp code` | Dev-room warp, see SHANTAE-RAM.md "Dev room warp" |
| `trace lo hi max file` / `untrace` / `pctrace file max` | Write tracer and opcode tracer (host build only) |
| `extract dir` | The first-start extraction. Env `GBHW=GBA` or `GBHW=GBC` picks the hardware |
| `wav f.wav` | Audio capture |
| `sramsave` / `sramload` | Battery save |
| `oc 0\|1` | The overclock |
| `opt key value` | Core option |
| `view W` | WIDE VIEW's width (160 off); `shot` then saves the whole picture |
| `wideinfo` | Prints `wide width left top bgout`: the picture's width, where the real picture sits in it, BG object tiles off the real screen |
| `reset` | Reset |
| `drops` | Item drops |
| `echo` | Print text |

Gotchas:
- Dialogue advances with **B**, not A.
- Pressing Start after THE END starts a new game, which writes SRAM.

## Tests (headless Chromium via Playwright, fed from driver dumps)
- `tests/linktest.py dump.bin out.png --size 640x480 --tabs world`: renders the Link page with a mock `Native`.
  - `--standin`: placeholder art.
  - `--tap x,y`, `--drag x0,y0,x1,y1`, `--card ways|doors|items|rooms|night` (a map card), `--ls key=json`: interactions and settings.
  - `--time`: timings.
  - `--anim dir`: one shot per dump.
  - The mock must offer every `N.*` method the page calls. Add new bridge methods to the mock string, as `ff` was.
- `tests/recomptest.py [WORK]`: the recomp backend on out/recomp/host/drive: picture sizes, state repeats, warps, every warp id, reload, sound rate, extraction, menu rows. `DANCE_RECOMP='' tests/dancetest.py`: auto dance on it (`'opt recomp_easy_dance 0;...'` for its options).
- `tests/widetest.py [OUT]`: WIDE VIEW: what was beside the picture against the real screen after scrolling, the seam, a sprite at the join, BG-drawn objects, spawn window, on/off, cost.
- `tests/spawntest.py [VIEW]`: every warp place, WIDE VIEW off and on: no object placed by the level may be missing with it on (the spawn window cap).
- `tests/paneltest.py [OUT]`: SINGLE SCREEN: panel sizes on a desktop JVM, the Link page at the panel's size (whole pixels, taps, a dance closes the panel), the menu row. The slide and the arrow are Android views, not covered.
- `tests/framequeuetest.py`: FrameQueue on a desktop JVM: double steps and holds when the emulator and UI thread swap order.
- `tests/dancetest.py`: auto dance: taps each row of the DANCES pop-up, plays the page's N.input string on the driver.
- `tests/icontest.py [--page DIR]`: the 22 icons the page builds from the ROM against the live inventory screen.
- `tests/menutest.py`: launcher and pause menu. `tests/preview.py`: the menus with a system font, safe to share.
- `tests/maptime.py`: map feed timing.
- `tests/view3dtest.py`: the 3D view. `tests/view3dsweep.py OUT [--ids 05,14] [--cams ...]`: every warp place in every camera beside
  the 2D game, contact sheets, codes and overlay per place. `tests/view3dsamples.py OUT`: full-size stills and walking clips.
- `tests/preview.py`: layouts with stand-in art.
- `tests/showreel.py OUTDIR [clip...]` and `tests/showreel_clips.py`: the 5-second feature clips and stills (ffmpeg).
- `tests/showreel_gifs.py OUTDIR [run town compare rocks layout dance]`: the 10-second GIFs of what's new since 0.34 (`Renders/Showreel 0.44`). layout and dance use real game and page frames, with the screen switch, slide and arrow drawn from the Android code's numbers.

## Standing rules from the user
- Bump the version on every build.
- Deliver the APK and a source zip to `C:\Users\Jackson\Desktop\Claude\Shantae\`. Name them "Shantae Dual X.Y.apk" and
  "Shantae Dual X.Y source.zip"; the zip has the top folder `shantae-dual/` and includes out/libcxx and
  out/android/libshantaedual.so.
- Test every change on the desktop driver and in headless Chromium before delivering.
- Game art:
  - **Preview images posted in chat must not contain game art.** Crop to our own UI, or use stand-in graphics.
  - Images and renders that use in-game graphics go in the desktop folder; renders go in `...\Shantae\Renders`.
- Update `docs/porting-a-dual-app.md` (and the claude.ai project doc, when available) with lessons worth carrying to
  other Dual apps.
- The user tests on the device and reports back with photos. Changes still waiting for the device check are listed
  under "Open issues".

## Architecture notes worth knowing before editing
**Frame loop and fast-forward**
- The frame loop is in MainActivity (search for `boolean fast =`).
- Fast-forward runs 3x frames with sound off. It is on when the FAST key is held (`specialBits` bit 3) or when `ffOn`
  is set (the 0.26 FF button, `LinkBridge.ff(mode)`: -1 read, 0 off, 1 on, 2 toggle).

**Link page**
- The Link page polls `N.mem("w3:D000:7E,C3E9:2,...")` style specs; the result is hex.
- Redrawing goes through `draw()`, which uses panel/tab/tap helpers in link.js. `tap(x,y,w,h,fn,dragFn)` registers hit
  boxes each frame.
- The tab bar is `drawTabs()`. The FF button takes the right 28 px when `DUAL && N.ff`.

**Objects and the script VM**
- Object nodes live in WRAM bank 3 at `$D000 + i*$7E`.
- Fields: `+0` state, `+2..4` script PC, `+$34` x, `+$37` y.
- The type table is at `0A:4000`.
- Opcode handlers are at `$0600 + op`. See SHANTAE-RAM.md.

**Defeat and ending**
- No flag is saved for either.
- Enemy deaths go through the drop routine at `0E:50C5` (entries `50B3`, `50B9`, `50BF`).
- The credits are node 0/1 running bank `$1C` at a PC of `$7040` or higher. The ending card triggers off that.

**Map and day/night**
- Region `51:4F` holds three scenes: the lighthouse, Risky's ship and the credits. `world.js ALONE` keeps the map from
  joining them.
- Day/night is the timer at `$C3E9/$C3EA`.

**Bestiary (0.20-0.26 by screenshots, removed in 0.27, back in 0.30 from the ROM)**
- `assets/link/monsters.js`: LIST of 46 enemies `[types, name, where, cel]`, names checked by the user. An entry lights
  up when a node of that type is on screen (type = the 0A:4000 type whose script starts last at or before the node's
  PC); the page saves the 64-byte OBJ palette copy at `$C400` with it (localStorage `sd.mon2`). The picture is the cel
  decoded from the ROM through `N.rom` (format: SHANTAE-RAM.md "Sprite cels in the ROM"). No extraction involved.
- The list comes from `tools/re/beast_rom.py` (BEASTS, plus the review sheet with areas and day/night) and
  `tools/re/sprites.py` (cel decoder). Keep the two lists in step. The 0.24 capture (beasts.bin, extract.c) stays gone;
  the app still deletes an old beasts.bin and link.js an old `sd.mon1`.

## Game-styled menus (removed in 0.28)
0.2-0.27 cut menu art from the game's own screens on first start (title, file select, status bar, inventory and
Dance Menu snapshots; app/assets/*/gbkit.js) and drew the launcher, pause menu and Link page with it, plus Shantae in
her gear on the SHANTAE tab. The user asked for it to go: both apps now use the one plain look (night sky, the game's
font and text-box frames). The extraction only records the title theme (ASSET_VERSION 3). The code is in git at
`ea87695` (0.27) if it's ever wanted back.

## Shantae Link (RetroArch companion, linkapp/)
A second APK, "Shantae Link X.Y.apk" (package com.jack.shantaelink, own version in linkapp MainActivity `VERSION`):
the same Link page reading Shantae (USA) in RetroArch's Gambatte core over network commands. Details, setup and the
list of what doesn't work with RetroArch: `linkapp/README.md`. RAM facts: SHANTAE-RAM.md "RetroArch".
- Always 127.0.0.1:55355 (0.6 removed the address setting).
- `linkapp/src/.../RetroArch.java`: UDP transport (Xenogears Link style: all reads out, then replies; cached blocks).
- `linkapp/ra.js`: builds `window.Native` from `window.RA`; the build inserts it as the page's first script. Shared
  page code checks `RA = !!(N && N.ra)` (setup screen `raIdle()`, RetroArch state slots, menu, address, PICK ROM, FF).
- Build: `bash tools/build_link_apk.sh` (keystore tools/shantaelink.keystore + .pass, not in git). Bump its `VERSION`
  and `android:versionCode` in linkapp/AndroidManifest.xml on every build.
- Tests: `tests/ratest.py DUMP` (transport vs `tests/mock_ra.py`), `tests/linktest.py DUMP out --ra [--ra-state ...]`.
  When the shared page changes, run linktest in both modes.
- Live test: RetroArch 1.22.2 nightly at `C:\RetroArch-Win64` (network commands on, port 55355, now with the buildbot
  gambatte_libretro.dll). From WSL it answers on the Windows side's address (`ip route` default), not 127.0.0.1.
  Driver states load there after `tests/ra_state.py` (the stock core has 2 extra state fields). That build has no
  `SAVE_STATE_SLOT` and no `GET_CONFIG_PARAM state_slot`/`fast_forward`; hotkey commands give no reply and presses in
  one frame count once. Recipes in linkapp/README.md.

## Open issues / next steps
- **0.45 to check on the device: Water Town Gates' exits and town door with WIDE VIEW on** (the user's report, Nov 8). Cause: the scanner 00:0FA9 is only run for the screen columns (256 px) the spawn window's edges are in; the 0.37-0.44 window (side + 8 each way, 290 wide on 16:9) could lie across three columns and skip the middle one, so one-screen rooms lost their placed objects. wide.c caps the margin at 48 (SPAWN_MAX, window 256). spawntest.py: 11 places lost objects before, none after. Trade-off: objects wake 40 px past the real screen, not at a 57 px strip's edge.
- **0.43 WIDE VIEW's new renderer: the user reports "Looks right" on the device (Nov 6).** That was the overall verdict, not an item-by-item check of rocks and blocks, towns, a boss arena locking or dialogue. The user's choice was the recomp's wide rendering only, on gambatte (no translated code ships, so "nothing from the game ships" holds). It replaces the strips of 0.37-0.42. Not ported: the recomp's taller views, room zoom, 157 object slots and object activation; a crowded room can still run out of the game's 32 slots. Width limit 288 (GB_WIDE_MAX).
- **0.42 SINGLE SCREEN not yet on the device** (MainActivity setPanel/syncPanel, DualLayout's first branch, PanelArrow, PanelGeom; after Xenogears Dual 0.24-0.25's panel, without its 16:9 bars as WIDE VIEW fills the sides). To check: the slide and arrow, the page's whole-pixel size, touches beside the panel reaching the game and touch pad, a controller staying on the game while the panel is touched, the second screen when the layout changes while the game runs. Choices made: the game keeps running under the panel; Select doesn't open it (a dance list is waiting when it's opened by hand); tapping a dance closes it; a spanned Duo is treated as one screen.
- **Recomp alpha 0.1 (Shantae Dual Recomp, native/recomp) has never run on Android.** Tested on the desktop driver only (tests/recomptest.py, dancetest with DANCE_RECOMP): the library's symbols were checked against the stubs, but the first device run is the real test of loading, speed, GameView's changing picture size. Known limits: the Link map's camera box is still 160 wide; Link only reads the first 32 of the 157 object slots; colours are the recomp's, without the COLORS setting; picture size changes when a dialogue opens (upstream's ui_fit). Not for public release: noncommercial license, and the library is the game's code translated by machine.
- **The "tear" is fixed: confirmed on the user's device on 0.41 (Nov 6).** It was a vertical line through the barrel while scrolling, at the join: sprites in the strips ran 2 frames ahead of the middle (wide.c gb_wide_track; widetest 1b2, a statue in room 41). The barrel's room wasn't among the warp rooms' arrival stills, so the driver test uses the statue. 0.38 (hand-off through the UI thread), 0.39 (strips follow FRAME BLEND) and 0.40 (FrameQueue) stay in but didn't address this report. On 0.43's new renderer the user saw the line again only with FRAME BLEND on, so 0.44 removed FRAME BLEND (the cause wasn't looked into). The barrel is in the opening stage, map 4B:72 (warp 05), around world x 3300-3640, found on the level data only; poking CB43-46 doesn't move Shantae. **WIDE VIEW** otherwise to check: lining up with
  the real picture, bosses and ambushes with the wider spawn window. Known limits: rocks and blocks drawn as BG are missing from the
  strips until on screen; in the 3DS app since 0.15-alpha; not in Shantae Link (can't change RetroArch's picture).
- **0.36 / Shantae Link 0.12 icons not yet on the device.** native/ctr/Makefile takes the 3DS icon from app/res/mipmap-xhdpi/ic_launcher.png,
  so the next 3DS build picks up the new Dual icon too.
- **0.35 3D view rework not yet on the device** (repaint cost especially: about 3 ms on desktop in rooms with animated colours, repainted
  often). Known leftovers: a top row of 2E over a climbable recess is scenery, so a notch shows in the ledge above (room 09); room 3E's
  dotted fill makes big grey walls.
- **0.33 auto dance not yet on the device** (Dual only): tap a dance in the DANCES pop-up. All 11 pass on the driver
  (tests/dancetest.py); not checked with a player holding buttons at the same time.
- **0.32 / Shantae Link 0.6 not yet on the device**: Shantae back on the SHANTAE tab (from the ROM); Link 0.6 has no
  address setting (always 127.0.0.1:55355).
- **3DS 0.16-alpha (0.45's spawn window cap) not yet on the device.** Check Water Town Gates' exits and door with WIDE VIEW on.
- **3DS 0.15-alpha WIDE VIEW runs on the user's New 3DS** (native/ctr/README.md): first reading 60 FPS, GB 8.6 TOP 1.6 LINK 0.8 MAX 17.8 ms, 11.0 of 16.7 ms, room not recorded. Still unlooked-at on the 3DS build: the busiest rooms' timing, towns, boss arenas, dialogue. wide.c's speed work reaches Android at its next build (byte-identical shots on the driver).
- **3DS 0.14-alpha not yet on the device** (native/ctr): ROM icons, Shantae, auto dance, MONSTERS. Its auto dance joins a
  running beat after the player's own Select (native/ctr/README.md); Android's danceFor always presses Select, so it should
  miss the beat after a player's Select. Not yet checked or fixed on Android.
- **0.31 / Shantae Link 0.5 not yet on the device**: icons built from the ROM (no menu visit needed, unowned ones faded).
- **0.30 bestiary not yet on the device**: tested on recorded driver dumps (Spider, Kappa, Ghost lit up), all 46
  pictures decoded on the page, both Dual and RetroArch modes. Shantae Link 0.4 carries it; neither checked on the
  device or on a live RetroArch yet.
- **Not yet confirmed on the device:** the 0.25 adaptive icon, firefly night-only note and signpost drag scrolling, the
  0.26 FF button, and 0.27 (bestiary gone; first build from this machine, clang 21 .so).
- **Shantae Link 0.3 not yet on the device**: tested against the mock, a live RetroArch 1.22.2 on Windows (reads,
  transport, page on live memory, FF, slot stepping) and in headless Chromium.

## Version history
Per-version notes are in CHANGELOG.md (feature bullets) and docs/porting-a-dual-app.md (lessons). Latest:
- 0.45: spawn window capped at 256 wide (Water Town Gates' exits and door, and 10 more places).
- 0.44: FRAME BLEND removed (setting, wide.c's blending and its test). A saved `blend` pref is ignored; the core's option stays `disabled`.
- 0.43: WIDE VIEW redrawn with the recomp's wide rendering: the app gets one picture instead of a picture and strips (native/wide.c, cpu.cpp's gbx_hook).
- Shantae Dual Recomp 0.1-alpha: the app on the static recompilation (native/recomp), a separate install. Same Java as Dual: Dual's next build carries Native.view, the larger picture buffers and the app's version() too, and needs its usual bump.
- 0.42: SINGLE SCREEN layout, an arrow slides Link in over the game.
- 0.41: WIDE VIEW's strip sprites on the same frame as the middle (the user's vertical line through the barrel).
- 0.40: FrameQueue: one picture per refresh, oldest first (double step then hold while scrolling).
- 0.39: WIDE VIEW's strips follow FRAME BLEND (the join broke while scrolling with it on).
- 0.38: frames reach the screen through the UI thread (tearing with WIDE VIEW).
- 0.37: WIDE VIEW, the level continues beside the picture on wide screens (native/wide.c, spawn window patched in memory).
- 0.36 / Shantae Link 0.12: new launcher icons for both apps.
- 0.35: 3D view engine rework (ramps, cards, one-colour tops and sides, no invisible-wall slabs, town floor, BG overlay).
- 0.34: dance pop-up header reads TAP TO AUTOMATICALLY PERFORM.
- 0.33: auto dance (tap a dance in the pop-up; Shantae Dual only).
- Shantae Link 0.11: the freeze card also shows Android's ANR reason (Close on the dialog, Android 11+). Dialog still ~1 in 10
  for a friend; page stalls ruled out (under 170 ms at CPU / 6); FLAG_NOT_FOCUSABLE still the suspect.
- Shantae Link 0.10: map polling as Xenogears Link's (RetroArch.setHot/setPace, ra.js pacing, ShantaeMap.track). Not yet
  measured live: on Nov 3 the Windows RetroArch opened no command port (network_cmd_enable is on; cause unknown).
- Shantae Link 0.9: freeze report (N.beat / N.lastHang, as Xenogears Link 2.0.0.18) for a friend's "isn't responding"
  dialog; open question whether FLAG_NOT_FOCUSABLE causes it (linkapp/README.md).
- Shantae Link 0.8: the Dual 0.34 page (all of Dual's Link screen except auto dance, which needs N.input).
- Shantae Link 0.7: works with RetroArch's mGBA core (HRAM read as FF80-FFFE; mock `--core mgba`); checked on a live
  mGBA (mgba_libretro.dll now in C:\RetroArch-Win64\cores; network RetroPad recipe in linkapp/README.md).
- 0.32 / Shantae Link 0.6: Shantae on the SHANTAE tab from the ROM; Link's RetroArch address setting removed.
- 0.31 / Shantae Link 0.5: every inventory icon built from the ROM at start.
- Shantae Link 0.4: the 0.30 page (bestiary) and the 0.29 icon fix.
- 0.30: bestiary back, 46 enemies with pictures decoded from the ROM.
- Shantae Link 0.3: inventory icons in RetroArch mode (copied only when ra.js `videoComplete()`).
- Shantae Link 0.2: checked against a live RetroArch; SAVE steps the slot (no SAVE_STATE_SLOT in 1.22.2).
- Shantae Link 0.1 (RetroArch companion, linkapp/).
- 0.29: inventory icons only copied once the screen has settled (0.28 could keep black ones).
- 0.28: game-styled menus removed (one plain look; extraction records the title theme only).
- 0.27: bestiary removed; first build in Claude Code (Windows + WSL).
- 0.26: FF button, this hand-off.
- 0.25: adaptive icon, night-only note, signpost drag.
- 0.24: bestiary capture, timer opens the night card, name swaps.
- 0.23: lighthouse map fix, showreel.
- 0.22: ending card.
