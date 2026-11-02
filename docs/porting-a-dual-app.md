# Porting a PS1 Link app to a "Dual" APK

How Koudelka Dual 0.1 was made from Xenogears Dual 0.13 (Oct 22 2026). Use the same steps for the next game.

Naming: **Dual** = one APK with the emulator core packaged in; **Link** = a companion-only app (e.g. reading a
game that runs in RetroArch). Inside a Dual app the second screen is just "the Link screen".

## What a Dual app is
One APK: pcsx_rearmed (libretro core, GPL, @ c881679) + a small JNI layer (jni/psxlink.c) + a Java host
(game view, touch pad, bezel, screens) + two WebViews: the launcher/pause menu (assets/menu) and the game's
Link page (assets/link = the Link APK's assets/www). Link pages call `window.Native.poll(host, port, mode,
pagesCsv, seq)` and get `onMem({seq,sent,got,err,ok:{page:hex}})` back; Dual answers that from emulator RAM.

## Steps
1. Toolchain (fresh session): `bash tools/setup_toolchain.sh` (bionic headers, pcsx_rearmed, stub sysroot,
   clang wrapper). Needs apt: clang lld llvm aapt zipalign apksigner dalvik-exchange android-sdk-platform-23
   openjdk-17-jdk-headless. Keep `out/lib/arm64-v8a` in the source zip so the core doesn't need rebuilding.
2. Copy the source tree; rename the package everywhere (Java `package`, manifest, and the JNI prefix in
   psxlink.c's `J()` macro, e.g. `Java_com_jack_koudelka_Native_`); rename the native lib in Native.java.
3. MainActivity: VERSION, game IDs (check them with the test driver), prefs name, /sdcard/<Game> folder,
   card and state file names, number of discs (DISCS + the disc queue in startGame), app label, new signing key.
4. Check the Link page's Native calls (`grep -o 'Native\.[a-zA-Z_]*'`) and give LinkNative each one
   (Koudelka needed version(), focusable(), poll(), send()). Drop the previous game's extras.
5. Link page changes, all behind a `DUAL` flag (`window.Native && Native.stateInfo`): skip its start screen,
   move any switches that lived only on the start screen into its settings, add SAVE STATES
   (stateInfo/stateSave/stateLoad + onStateDone), hide host/port/link mode. Ship a .patch against the original.
6. Launcher: rebuild assets/menu from the Link page's own font/panels/art (Koudelka: font extracted to kfont.js).
   Restyle BezelView's "window" frame the same way. New icon.
7. Test: build the core for the desktop (`make -f Makefile.libretro HAVE_PHYSICAL_CDROM=0 LIGHTREC_CUSTOM_MAP=0`;
   the custom map puts RAM at address 0, which readRam treats as missing), link tools/drive.c, boot the real disc,
   dump RAM, and render the Link page in headless Chromium with a mock Native that answers poll() from the dump.
   Compare Native.java's native methods with the .so's exported Java_ symbols.

## Fixes made in Xenogears Dual after 0.13 — carry these into other Dual apps
- **Memory card "not formatted" with the built-in BIOS (0.16, affects every game).** The core flags cards as
  "new" (`McdFlag |= 8`) at power-on, reset and every state load. The HLE BIOS answers `_card_info` with
  EvSpNEW until something is written, and save menus read that as "not formatted" (loading still works).
  Fix: export `McdFlag` in the core's version script and clear bit 8 of both slots in `runFrame` before
  `retro_run`. Check: load a state at a save point, save into a free block.
- **Controller rebinding (0.17).** Settings > Controls > Controller buttons > REBIND. Bindings are a
  keycode -> button map in prefs `keyBinds` (JSON); setting a key that's already used swaps the two.
  The key is captured on ACTION_DOWN and its ACTION_UP is swallowed so it doesn't also press a menu item.
- **Right stick on pads without AXIS_Z (0.16):** read RX/RY instead. Only when Z is missing, because the
  DualShock 4 puts its analog triggers on RX/RY.
- **Link map polling (0.17):** in DUAL the MAP tab polls every 20 ms while moving and 80 ms when still
  (was 40/150, 3D only). Fine since 0.13's vsync-driven pacing.
- Xenogears only: the analog controls program is installed by psxlink.c instead of the cheat engine
  (writes it once into empty RAM after the exe signature matches, calls psxCpu->Clear, stands down if
  the block holds something else), and patches a lw -> lhu bug in its camera-mode check (0x8001785C).

## Koudelka specifics
- Disc IDs (USA): SLUS01051, SLUS01100, SLUS01101, SLUS01102. Boots on the built-in BIOS.
- Koudelka Link roots: A 0x800AF470 (scene at A+0x368: 1 field, 2 battle, 3/4 movie), G 0x800B4DD0.
- Battle menu opens on Triangle; Circle confirms.

## NES games: Metroid Dual (Oct 30 2026) — built from scratch, no existing Link app
Different base from the PS1 apps; reuse it for the next NES game.
- **Core:** libretro-fceumm (GPL) @ ac0d00a, linked statically into one .so with `native/nescore.c` (tiny libretro
  frontend: RGB565 video, 48 kHz audio, overscan 8/8 → 256x224, `nes_peek` reads RAM + mapped pages `Page[a>>11][a]`,
  `nes_ppu_peek` reads `VPage`/`vnapage`/`PALRAM`) and `native/nesjni.c` (`J()` = `Java_com_jack_metroiddual_Native_`).
- **Toolchain without the NDK** (dl.google.com is blocked): `tools/setup_toolchain.sh` sparse-clones bionic headers
  (aosp-mirror/platform_bionic) and compiler-rt builtins (llvm/llvm-project), makes stub libc/libm/libdl/liblog from
  bionic's .map.txt files, and builds with `clang --target=aarch64-linux-android23`. android.jar API 33 from
  github.com/Sable/android-platforms (android-33), so targetSdk 33 / resizeable (needed for Duo spanning).
- **Host:** game in a custom View (triple-buffered RGB565 bitmaps).
  DualLayout: Duo hinge via `com.microsoft.device.display.DisplayMask` (reflection + uses-library required=false);
  else Presentation on a second display; else single screen (Link overlay or side panel); manual SPLIT + HINGE GAP.
- **Frame pacing (0.2 — carry into any Dual app that paces by audio).** 0.1 paced emulation with blocking AudioTrack
  writes; the buffer drains in bursts, so frames reached the screen in clumps (2 in one refresh, 0 in the next) =
  judder. 0.2: `VSync.java` (Choreographer on its own HandlerThread, measured refresh period) wakes the emu thread
  each refresh; if the display is within 2% of the NES rate (or a multiple: 120/144 Hz), run exactly one frame per
  N refreshes, else an accumulator (90 Hz). `AudioOut.java` writes non-blocking and resamples by ±0.5% to keep its
  ~80 ms buffer half full (dynamic rate control). Simulated at 59.94/60/90/120/144 Hz: no underruns.
  Settings > SHOW FPS overlays emulated fps, measured Hz and audio buffer fill.
- **16:9 borders themed by the game itself:** every 20 frames the emu thread dumps PPU memory; BezelTheme picks the most
  common solid BG tile in the nametables (with its attribute palette), takes its 16x16 metatile, tiles it dimmed at
  the game's pixel scale, and frames the picture in that palette's brightest colour. Changes per area automatically.
  On single screen the borders also show EN/tanks/missiles/area/time in the ROM font.
- **No game assets in the APK:** ROM picked with ACTION_OPEN_DOCUMENT, copied to filesDir; font/sprites/map/item table read
  from it at runtime (`Native.rom(off,len)` base64). Verify with CRC32 of the data after the iNES header.
- **Link bridge:** `Native.mem("addr:len,...")` → hex, `pal()`, `chr()` (live sprite table), `rom()`, `menu()`, `close()`.
- **Test:** `native/drive.c` (run/tap/shot/dump/save/load/peek/poke script). Poke items in, die, and compare the game's
  own password bytes with the JS port. Render pages in Playwright with a mock Native fed from the dump.
- Metroid RAM/ROM map: see README.md in the source zip.

## Linux / ROCKNIX port (Anbernic RG DS) — Metroid Dual 0.21–0.22 (Oct 30 2026)
Source in `linux/`. One C program, same core (nescore.c), runs the Android pages (link.js, menu.js) unchanged.
- **Pages without a browser:** QuickJS (quickjs-ng) on its own thread with `shim.js` — just enough DOM/canvas:
  fillRect/drawImage/save/clip/restore on RGBA buffers in C, createElement('canvas'), localStorage → JSON file,
  timers, pointer events, atob/btoa, Image for "slot:N" thumbnails. `window.Native` / `window.Host` are C functions
  mirroring MainActivity's LinkBridge / Host. Menu rows that only make sense on Android hide on `info.linux`.
- **Windows:** "Metroid Dual" (game + menu) and "Metroid Dual Bottom" (Link). ROCKNIX's sway config already moves
  titles containing "Bottom" to the second panel and powers it on; the app also places windows by sway output name
  (RG DS: top DSI-2, bottom DSI-1; SDL display names are xdg-output descriptions ending "(DSI-1)") and runs swaymsg
  move/fullscreen once mapped. Touch: the bottom Goodix panel is on sway seat1 — SDL2 binds every wl_seat, so it works.
  Controller focus lock = `SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS=1`.
- **Drawing:** both windows share one GLES2 context (functions via SDL_GL_GetProcAddress, so the binary needs only
  libSDL2/libc/libm). Falls back to SDL_Renderer (no 3D) if GL fails. 3D view = `linux/gl3d.c`, a direct C port of
  Renderer3D.java; fragment shader asks for highp (Mali mediump is fp16). R3 toggles; Link OPTIONS and Dev settings too.
- **Pacing:** vsync detected from how long the top window's swap blocks in the first 60 frames, else timer pacing;
  audio via SDL queue with ±0.5% rate control.
- **Build:** host `make host` (clang + system SDL2) for testing under Xvfb or headless sway (two HEADLESS outputs,
  grim screenshots; `MD_SCRIPT` drives key/tap/shot). Device: `make arm64` with `python3 -m ziglang cc -target
  aarch64-linux-gnu.2.36` against SDL 2.26 headers and a stub libSDL2 (`gen_sdlstub.sh`).
- **Package:** `ports/MetroidDual.sh` (sources /etc/profile, sets output names) + `ports/metroiddual/` (binary, assets,
  README; player adds the ROM). SIGTERM from the quit hotkey still saves "auto".

## Link-only fork for RetroArch: Metroid Link 0.1 (Oct 31 2026)
The Link page on its own, reading a game that runs in RetroArch instead of a built-in core. This reuses the page
unchanged apart from a few hooks guarded by `RA = window.Native && Native.raStatus`. Reuse it for any Link page.
- **RetroArch network commands** (UDP 55355; Settings > Network > Network Commands, or `network_cmd_enable`):
  `READ_CORE_MEMORY <hex addr> <n>` → `READ_CORE_MEMORY <addr> XX XX …` or `… -1 <error>` (older/cheevos builds:
  `READ_CORE_RAM`, same reply shape), `GET_STATUS` → `GET_STATUS PLAYING nes,<name>` / `CONTENTLESS`,
  `SAVE_STATE_SLOT n`, `LOAD_STATE_SLOT n`, `MENU_TOGGLE`. Reads stop at the end of the core's memory descriptor.
- **FCEUmm's memory map:** CPU address space in 1 KB pages (RAM $0000-$07FF, cartridge RAM $6000-$7FFF), plus
  palette RAM at `$80003000` (PPU_BIT), nametables at $80002000 and OAM at $80004000. Pattern tables (CHR) are not
  exposed, so `chr()` returns "" and the page falls back to the sprites in the ROM.
- **Client design:** a background thread keeps a cache of the page's requested ranges. It merges ranges within 128
  bytes in the same 1 KB page, so the 12 Metroid ranges become a few UDP requests. `mem()` returns the cache
  instantly, and the page never waits on the network. `running()` must mean "RetroArch answers and has content",
  not "memory read OK": link.js only calls mem() while running() is true. If `READ_CORE_MEMORY` gets no reply
  while other commands do, the client toggles to `READ_CORE_RAM`.
- **Android** (`linkapp/`, package com.jack.metroidlink, no native code, ~65 KB): WebView + RetroArch.java.
  The ROM comes from ACTION_OPEN_DOCUMENT (tap the waiting screen). The host:port dialog is under OPTIONS >
  RETROARCH. `tools/build_link_apk.sh` copies `app/assets/link` in at build time, so it shares the page.
- **ROCKNIX** (`linux/metroidlink.c`, `make link-arm64`): one SDL window "Metroid Link Bottom" (sway puts it on the
  bottom panel), with QuickJS + shim.js as in Metroid Dual and no controller subsystem (RetroArch owns the pad).
  `ports/MetroidLink.sh` starts the Link screen, focuses the top output, then runs
  `retroarch --config … --appendconfig retroarch-link.cfg -L fceumm_libretro.so ROM`. The appended config turns
  network commands on for that launch only. The Link screen is killed when RetroArch exits.
- **Testing without RetroArch:** `mock_ra.py` answers the commands like RetroArch's command.c, from an emulator memory
  dump (modes: memory / ramonly / nomap). Run RetroArch.java on the desktop JVM, and the Linux build under Xvfb with
  `ML_SCRIPT`.

## Second NES game: Mario 2 Dual 0.1 (Oct 31 2026) — Super Mario Bros. 2 (USA) Rev 1 on the Metroid Dual 0.45 base
How the NES base was moved to another game. Source zip has README.md + RAM-MAP.md.
- **Port steps:** copy the tree, drop `linux/`, `linkapp/` and the room/3D tools; rename package, JNI prefix (`J()`),
  lib name, prefs, keystore (sed over *.java/*.c/Makefile/manifest/build_apk.sh, including the MainActivity path in
  build_apk.sh); new CRC (`SMB2_CRC = 0xCA594ACE`); new `Nes.java` constants; GameView HUD; cheats; BezelTheme key
  per level+area. `out/android/*.so` was not in Metroid's 0.45 zip: rebuild once with `make -C native TARGET=android`.
  Pin fceumm: `setup_toolchain.sh` now checks out ac0d00a after cloning.
- **Find the font in the ROM:** dump a screen with text, read the nametable tile ids for known letters, then search the
  ROM for the pattern-table bytes (SMB2: BG tiles $D0-$F7 = 0-9 A-Z - ? . , at file 0x2BD10). nesgfx.js now takes a
  `FONT_MAP` string instead of Metroid's fixed 64-tile order. Menus check the font length (0x300 here) — update it.
- **Disassembly without running it:** the Xkeeper0/smb2 repo ships a prebuilt asm6f; running external binaries was
  refused, so labels were read from `src/*.asm` as text and ROM tables located by byte-pattern search (tile quads,
  solidness table, character stats). Build a label→address list from `ram.asm` with a small parser.
- **Stats the game doesn't keep → write them into RAM bytes it never uses** (`native/smb2track.c`, called from
  `nes_run`, reset on load/state load): play time, deaths, levels cleared and by whom. Pick "FOR RENT" bytes with no
  references in the disassembly, then confirm they stay 0 over a long run with the tracker disabled. They travel with
  save states and the game's own RAM clear resets them for a new game.
- **Level warp for tests/cheats:** poke CurrentLevel + `_Init`, CurrentWorld, area/page/transition = 0, GameMode = 1
  → the game runs its own title card into that level (no life lost).
- **SELECT+START opens the pause menu** in the emu loop (once per press; masked from the game while held).
- **3D view, game-aware version:** when the game keeps its level decoded in RAM, classify each on-screen cell by the
  metatile under it instead of guessing from tile numbers. Mapping that checked out with 0 mismatches: screen→world =
  camera + screen; screen→nametable = scroll mirrors (as Metroid). Self-check each frame (sample cells: tile-quad from
  ROM == nametable tile, ≥90%) and fall back to flat when it fails (title cards, Bonus Chance, subspace).
  "Background" = far plane with a half-scale copy of the area's own non-sky metatiles, faded toward the sky colour,
  wrapped horizontally in the shader (NPOT textures can't use GL_REPEAT in GLES2), a flat ground colour below it.
- **3D testable on the desktop:** split into `Scene3D.java` (pure Java: geometry, atlas, mask, backdrop) and
  `Renderer3D.java` (GL). `tests/scene3d`: SceneDump runs Scene3D on a drive `snap`, view.html renders it in headless
  Chromium (WebGL1 = GLES2) with the FS string extracted from Renderer3D.java. `standin` flag = flat colours for
  previews without game art.
- **Link map from decoded level data:** draw the whole area once into an offscreen canvas (live BG pattern table +
  palette + ROM tile quads), close view follows the player, whole view folds long areas into strips. Markers come from
  tile ids (grass contents, locked doors, mushroom spots) and the area's raw enemy list (key, crystal, boss, exit).
- **Mario 2 Dual 0.2 (Nov 1) — 3D fixes worth carrying into any 3D view:**
  - Games that animate BG tiles by CHR bank swaps (SMB2: every 8 frames) change the pattern table constantly. Don't
    key texture rebuilds on CHR; key the background on level/area/palette/level data. Update textures in place
    (`glTexSubImage2D`) instead of re-specifying them each change.
  - Mapping self-check: skip cells whose graphics the game swaps at run time (doors, grass, cherries); keep the 3D
    through short partial misses (≥60% match, up to ~30 frames, same area), drop at once on a blank/redrawn screen.
    Fade the background in/out (0.08/frame) instead of popping. `tests/scene3d/MapCheck` runs one Scene3D over
    per-frame snapshots and prints mapping, fade and rebuilds per frame.
  - Doors: not a mid-depth cut-out (it floated off its wall). On the back wall; in a solid wall an opaque recess whose
    jambs are the neighbouring blocks' side faces.
  - Background only under a lit sky (palette 0 not black): in caves/at night the "sky" is darkness and the far copy of
    the walls read as a ghost. Box-filter the half-size copy and sample it LINEAR (sky colour in transparent texels).
- **Mario 2 Dual 0.3–0.4 (Nov 1) — Link screen and 3D polish:**
  - *A companion screen that isn't busy:* map first (most of the screen); a one-line strip that shows only what is live
    (hearts, cherries, star/stopwatch timers, mushrooms found); tabs MAP / WORLDS / OPTIONS; guide as a 5 s toast.
    The close map must follow the game camera, not re-centre on the player each tick (that read as a wipe/redraw).
  - *Item icons from the ROM at start-up instead of shipping or drawing them:* find each item's sprite tiles via the
    game's enemy tilemap (tile-pair ids; odd id = $1000 table on 8x16 sprites) and byte-search the CHR in the ROM;
    keep file offsets + "mirror right half" flags in icons.js and RAM-MAP.md. Games that build palettes at run time
    need the sprite palette set in code. Keep drawn fallbacks for icons whose tiles are spread over banks.
  - *3D only during actual play:* switch the GL view off (flat picture) whenever the game isn't in its play state
    (SMB2: `$0100 != $C0` or GameMode `$04EC != 0` — title, story, character select, title cards, pause, game over,
    bonus game) and back on after ~10 frames of play, so transitions don't show 3D garbage.
  - *Ledges that sit on a body (SMB2 hills/houses):* classify the body tiles as solid blocks too, otherwise the top
    renders as a floating overhang.
  - Offer only the camera presets that suit the game (SMB2: TILT, LOW) and sanitise the stored pref.
  - Test note: `tests/linkplay.py` plays 48 KB memory dumps (`drive dump`), not the 16 KB `snap` files.

## Game Boy Color games: Shantae Dual 0.1 (Oct 31 2026) — Shantae (USA) on the Metroid Dual 0.45 base, core swapped
Reuse this base for the next GBC game. Source zip has README.md + SHANTAE-RAM.md.
- **Core:** libretro-gambatte (GPLv2) @ 77f2567 + `native/gambatte-dual.patch`. Frontend `native/gbcore.c` (RGB565
  160x144, 32768 Hz "sinc" audio, core options from a table: hwmode/colour correction/frame mix), `native/gbglue.cpp`
  `#include`s the core's libretro.cpp (its `gb` object is static) and exports C accessors. The patch adds `GB::peek/poke`
  (CPU view through `cart_.rmem()`/current WRAM, VRAM and SRAM banks, `ioamhram_` for FE00+) and `cgbpal()`.
- **C++ core without the NDK:** libc++ *headers only* (sparse clone llvmorg-18.1.8 `libcxx/include` +
  `libcxxabi/include`), a hand-written `__config_site` (no threads/localization/exceptions/wide chars) and
  `__assertion_handler` (copy of vendor/llvm/default_assertion_handler.in), `-fno-exceptions -fno-rtti
  -D_LIBCPP_DISABLE_EXTERN_TEMPLATE`, `template class std::basic_string<char>;` in the glue (two members stayed
  external otherwise) and `native/cxxrt.c` (operator new/delete, __cxa_pure_virtual, __cxa_guard_*,
  __libcpp_verbose_abort, __dso_handle). Remove `<sstream>`/`<fstream>` includes (unused, need localization).
  Check: `llvm-nm -D --undefined-only` vs the stub libs' exports must be empty.
- **Overclock for a core that has none (NO SLOWDOWN):** in gambatte's cpu.cpp every `cycleCounter += 4` becomes
  `+= GBX_M` = `4 >> (gbx_overclock & !mem_.oamDmaActive())`: the CPU runs 2x relative to PPU/APU/timers. OAM DMA must
  keep normal speed — games wait for it with a cycle-counted loop in HRAM, and returning early (stack in WRAM during
  DMA) hangs the game with the LCD off. Measure lag as frames with no write to $FF00.
- **Desktop RE tools in the driver (host build, `-DGBX_TRACE`):** `trace lo hi max file` logs every write in a range
  with PC, ROM bank, HL and the stack (finds callers through far-call trampolines); `pctrace file max` logs every
  opcode (finds code loops); a small Python SM83 disassembler on top of mgbdis's opcode tables. Beware sampling
  aliasing: samples every 300 frames hide anything that ticks every 60 frames.
- **GBC font in a compressed tileset:** find the text-box tilemap (window map, attributes in VRAM bank 1), take the
  glyph tiles, search the ROM; when not found, trace the VRAM writes back to the decompressor (Shantae: Okumura LZSS,
  4 KB ring of spaces, r=0xFEE) and port it (RomGfx.lzss). gbgfx.js draws GB 2bpp (row = lo, hi), CGB BGR555
  colours, and the game's text-box frame from its own tiles.
- **Icons without shipping art:** the Link page copies item/stone/talisman icons from live VRAM (`Native.video()` =
  VRAM 0x4000 | BG pal 64 | OBJ pal 64 | OAM | LCDC SCY SCX WY WX) when it recognises the in-game inventory tilemap,
  then caches them as data URLs in localStorage. Draw all 4 BG colours; clear only a light panel colour in the corners.
- **Game data from the ROM instead of guessing:** shop tables (name, qty, price, destination WRAM variable) gave the
  item order and gear variables; the new-game init routine lists the whole save block; the game's signpost text gives
  official area names and neighbours. The game's own debug mode (Shantae: title code → debug game + teleport list)
  is the fastest way to get states in every map.
- **GBC BezelTheme:** most common 2x2 BG tile pair above the window (status bar), CGB attributes (palette, bank,
  flips), keyed per map + day/night.
- **Shantae Dual 0.2 (Nov 1) — menus made from the game itself (reusable for any Dual app):**
  - *Extract on first start instead of shipping art.* `native/extract.c` loads the ROM into the core, plays a fixed
    route with no one watching (boot, title, the game's debug code, "Start Debug Game", inventory, Dance Menu) and
    hands over snapshots: VRAM both banks | BG/OBJ palettes | OAM | LCDC SCY SCX WY WX | the 64 palette colours *as
    displayed* (`gb.gbcToRgb32`, so colour correction and GBA mode are baked in). Each step waits for a RAM state
    (`$C39D`) or a BG-map fingerprint, never for a fixed frame count alone, and returns an error code per failed
    check; the UI then keeps the old look. Overclock off during the route. ~2.5 s on desktop for ~7000 frames.
  - *Music too:* record the title theme from the core's audio during the route (mono 22050 Hz WAV, ~3.8 MB) and play it
    with MediaPlayer on the launcher only, with a 2 s gap between loops.
  - *Asset cache key* = asset format version + ROM CRC + every core option that changes the look (GBA mode, colour
    correction). Re-extract when it changes, never while a game is running; skip-launcher starts the game first.
    Extraction must not touch the battery save: the frontend loads SRAM only for real sessions.
  - *Cutting a menu kit from screens (gbkit.js):* BG region → canvas with CGB attributes; 3-slice a sprite banner with
    "each row's most common colour" as the one-pixel filler (removes the words; count transparency, or a curl's colour
    wins in near-empty rows); rows/panels from the game's list screen (top edge, black body, right edge mirrored for
    the left, the "between rows" tile with its lower part held for the last row). Colours come from the pixels (darkest
    of the header palette = title ink). Validate with a map fingerprint; any mismatch → null → old look.
  - *Draw at the game's own scale* (144 lines landscape / 160 columns portrait) so the font and pieces are 1:1; two
    columns like the game's list when the rows don't fit, one scrolling column otherwise; long labels wrap onto the
    row's second line with the value right-aligned.
  - *Previews for the user without game art:* `tests/standin_kit.js` replaces `GbKit.build` with flat placeholder pieces;
    Playwright `page.route('**/gbkit.js')` appends it, and the font is left out so text uses the system font.
  - *Battery saves:* 0.1 never persisted SRAM. Load it after `retro_load_game`, keep a copy, write (tmp + rename) only
    when it differs: every ~600 frames, on pause, quit and exit.
- **Shantae Dual 0.3 (Nov 1) — whole-room maps from a GBC game's level data (the method carries to other GBC games):**
  - *Find the level format from the BG refresh, not the tile data.* A trace of VRAM BG-map writes while scrolling was
    empty: the game edits a WRAM copy of the BG map and HDMAs strips. So trace `$FF51-$FF55` first (HDMA source/dest),
    then trace writes to the WRAM copy *with the WRAM bank* (`drive` trace lines now end with `svbk=`; most hits in
    $D000-$DFFF are other banks' objects). The real writer read 2-byte words through a screen table; `pctrace` a few
    frames before it to get the table base and bank variables.
  - *Verify by matching, not by reading code:* build every 2x2 metatile (4 tiles + 4 attributes) from the WRAM BG copy
    and look each one up among all candidate words in the map bank. All 256 matched, and their addresses gave the
    strides (row 0x20 bytes, screen 0x200, table 64 bytes per screen row).
  - *Rooms from the ROM:* the room header loader reads inline bytes after a far call; byte-search that call
    (`cd 40 05 20 79 03`) to list all 112 rooms with rectangles, regions and definition banks. Rooms sharing a region
    = one place (labyrinths draw as one grid of rooms). "Areas that share a map ID" were separate rooms, not a byte.
  - *Draw with live VRAM tiles + the snapshot's displayed colours* (day/night, GBA mode match), and self-check before
    drawing: compare the BG map under the camera with the level data (world tile mod 32); draw only at ≥70%.
    Re-render when the room changes, colours at most every 6 s. Cache the ROM room scan (derived numbers only) in
    localStorage keyed by the header checksum; drop the 4 MB of bank buffers after the scan.
  - `linktest.py --standin` swaps `ShantaeMap._Tiles.prototype.get` for flat palette colours and drops the ROM font.
- **Shantae Dual 0.4 (Nov 1) — collectible markers: finding where a game places objects:**
  - *Teleport, then catch the spawn.* Find the player's object node (search WRAM for her x/y at fixed offsets; Shantae:
    bank 3 $D000, x +$34, y +$37), poke it to sweep a room, and scan WRAM after each stop for object nodes whose
    script pointer lies inside the collectible's script (the field is a *program counter*, so it points into the
    script, not at its start). That gave a heart holder's exact position; tracing writes to the new node then showed
    the spawner (00:0FA9: per-screen placement lists) — byte-searching for spawn code never could, because placed
    objects are created from data, and the 1781 inline spawns in room code are a different path.
  - *Then enumerate statically:* the room header's last 3 bytes point at a per-screen grid of lists (17-byte entries:
    box, "spawned" byte, script, 4 params). Decoding every room's grid listed all 7 heart holders, 12 fireflies,
    4 talismans and 15 of 20 baby squids, each with its flag-table index — the table of locations went straight into
    SHANTAE-RAM.md. A param that indexes a flag table can differ per type (squids use param 3).
  - *Collected or not* comes from the game's own flag tables ((offset, mask) pairs from a base) — read the save bytes
    every update and grey the marker; counts of what's left go under the map.
  - Doors (type 111 in Shantae) carry only (door number, side); the destination is resolved by room code — a dead end
    for a static map without emulating the warp. Record it as open rather than guessing.
- **Shantae Dual 0.5 (Nov 1) — area names and where exits lead:**
  - *Play the exits instead of reading them:* a BFS in the desktop driver (tools/re/bfs.py) teleports onto every edge
    exit of every room it reaches, holds the direction, and records which room header loads (room = region + corner
    from RAM). It walked the whole overworld ring in minutes. Poke the player only while the right WRAM bank is mapped
    (set SVBK first).
  - *Warp codes decode statically once you find the dispatcher:* exits set a code (Shantae $CBF3; caves: 10 x cave +
    side), a `cp NN / jp z` chain per bank maps it to an entry routine, the entry routine writes a room variable
    ($C000-$C00F) + arrival point ($CB71), and a second chain per bank maps the room variable to a room header.
    Parse both chain shapes generically (tools/re/scenes.py) — every cave link then fell out, matching both the
    objects' (cave, side) params and the wiki. Find the chains by searching for `ld a,[var]` followed by `fe/ca` runs,
    and the variables by searching for writes to them (`ea lo hi`).
  - *Names:* the ROM's signpost texts were mostly beta leftovers (only 2 are ever shown). Match the ring order from
    play to a community map (Shantae Wiki) and check it against facts you can verify (which region/tileset, which
    collectibles sit there, which labyrinth a door far-jumps into). Keep names in a small table keyed by RAM values
    (world.js); ship facts only, no text from the game.
- **Shantae Dual 0.6 (Nov 1) — town streets and buildings:**
  - *Debug teleport, then walk one frame at a time and log RAM.* Diffing dumps while holding Right found the street
    position ($C9D6, wraps) and a byte that steps through 1..7 between zeros = the door you're standing at ($CBD6).
    Then press Up at each door (tools/re/town_up.py walks until $CBD6 = n) and record the room that loads: all 32
    doors of the 5 towns in one run. Work from states reached by walking, not by teleporting: a teleport onto a
    town gate left the LCD off, while every door played from a walked-in state.
  - *Names the game shows are in the ROM, so read them at run time instead of shipping them:* search the ROM for the
    text a screen shows, look for 3-byte far pointers just before it (a label table), then search for the table's
    address → the routine that installs it (Shantae 04:6D55, which also leaves the pointer in RAM at $CBD0). The Link
    page keeps only the table address per town and reads the strings from the player's ROM.
  - *A non-play game state can still be a normal room:* the town street (state 5, big sprite in front) is level data
    like any room, so the same renderer and self-check work. Only the player position differs (always mid-screen:
    camera + 80) and the room wraps — draw it as one strip, wrap the camera box, and list the doors under it.
- **Shantae Dual 0.7 (Nov 1) — labyrinths and the missing collectibles:**
  - *A room header's rectangle isn't always the room the player walks.* Shantae's first labyrinth has one header (its
    small entrance room); a cutscene later widens the camera limits to the whole region with a second loader (03:7A3D,
    8 inline bytes). Decoding objects only inside header rectangles missed its 5 squids. Find every routine that writes
    the room-rectangle variables (`ea lo hi` byte search) and the calls to each, then decode a region's object grid for
    the whole region.
  - *Check identities against screens before shipping names.* The debug teleport list's labyrinth row led to a beach
    with Risky, not a fountain: region D4:4D00 was Risky's hideout, not Dribble Fountain as 0.5 assumed. One
    screenshot per named place would have caught it.
  - *Exits by walking from the arrival point:* debug-teleporting into each labyrinth lands where the entrance puts
    you; walking left and reading the room that loads gives the way out without decoding the warp codes.
  - *Use the game's own collected flags for counts.* The squid count had been estimated (held + 4 per warp dance);
    the pickup flags (bit n + 10 from $CB1B) give the real number and per-labyrinth progress. Confirm one bit in play
    (walk into a squid, watch the byte change) before trusting the formula.
  - *One object type per labyrinth with a labyrinth-number param* was the Guardian Genie (checked by screenshot); use
    it as a map landmark.
- **Shantae Dual 0.8 (Nov 1) — a map that reads well on the device and appears quickly (any Link map):**
  - *Don't fold long rooms into rows.* On the Duo a 30 x 3-screen room folded into two rows was hard to read. Show one
    strip instead: fit the whole room when it fills at least half the box, otherwise zoom so the short side fills the
    box (capped at 6 screens across) and scroll to follow the game camera, gliding halfway each poll. A 2 px gold bar
    under the strip shows where the view is in the room. One `viewport()` + `place()` pair replaces layout/fold code,
    and markers are clipped to the map box (labels clamped inside it).
  - *Measure before optimising:* `linktest.py --time` wraps the update and prints per-call times plus a re-render
    benchmark (`ShantaeMap._bench(Native, cold)`). On desktop the whole 30 x 3 room took ~40 ms from only 5 ROM banks,
    so the wait on the phone was mostly cadence and doing everything before showing anything, not the bridge.
  - *What made it appear sooner:* poll every tick on the map tab (was every other) and every 5th tick on other tabs so
    it's warm when you switch; for a big new room draw only the screens around the camera first and the whole room on
    the next poll; copy whole metatiles as cached 32-bit blocks with plain loops (`subarray().set()` per row allocates
    and was slower than the old per-pixel loop); key the day/night refresh on the palette bytes so an unchanged room
    isn't redrawn every 6 s; read the one-time ROM room scan 16 banks per poll instead of before the first map.
- **Shantae Dual 0.9 (Nov 1) — tap-to-zoom map and one status tab:**
  - *Tap to zoom, no gestures:* the map's draw returns its box and the page registers one tap area on it that cycles
    x1 / x2 / x4 (remembered). The zoom multiplies the viewport scale (capped near one game screen), the view keeps
    following the camera, and a small tag shows the level. Zoomed in, collectibles are drawn with the inventory icons
    the page already has (kit or captured from VRAM) at 16 px, faded once collected — the map module takes an
    `icon(key)` callback instead of knowing about the kit.
  - *Merge tabs by asking what each line is for:* STATUS + ITEMS became one SHANTAE tab: hearts + gems on one line,
    time to dusk/dawn, the 12 items as icon + count (tap to equip; only the equipped item is named, with its effect),
    stones and talismans in one icon row, gear names, and squids still to hand in. Dropped: lives, the separate
    "equipped" block, per-item names, and the collectible counts that the 100% tab already shows. Map the old saved
    tab id to the new one so nobody lands on a missing tab.
- **Shantae Dual 0.10 (Nov 1) — dev room warp through the game's own map-start dispatcher (works for any game that
  resumes saves by a map/level id):**
  - *Find how the game starts a place, not how it travels.* The title debug list only sets a map id; follow the id
    (`ea fd cb` / `fa fd cb` byte search) to the routine that resumes a save: Shantae's 0A:4919 is a `cp id / jp z`
    chain where each case far-calls the map's scene entry. Jumping there with the id set re-enters the game exactly
    like a load, and the save block in RAM is untouched.
  - *Jump without a code stub:* two lines in the core patch (`CPU::dualJump`: write the MBC bank register through the
    normal memory write, set PC and SP, unhalt, `ei`) called between frames on the emu thread. Clear whatever selects
    a sub-room or arrival point first (Shantae: $C000-$C00F, $CB71, the pending exit code $CBF3), otherwise a warp from
    a cave can arrive at the cave's exit coordinates in the new area.
  - *Test every id in the driver* (`warp NN` command): warp, run 500 frames, hold Right, check the room and that the
    player moved. 57 of 68 ids are playable, the rest are story scenes (incl. a hidden sound test and the credits).
    Name each one from a screenshot before putting it in the menu.
- **Shantae Dual 0.11 (Nov 1) — a 3D view as a WebGL page over the game (no Java GL, any Dual app):**
  - *Put it in a transparent WebView* between the game View and the touch pad (`setBackgroundColor(0)`, created the first
    time it is switched on). The page hides its canvas whenever the screen isn't a level room, so the 2D picture shows
    through — no view switching. The emu thread hands over one string per frame (`seq|RAM hex|video base64`, ~22 KB);
    the page polls it in requestAnimationFrame and skips frames it already has.
  - *Level from the ROM, not the BG map:* a 1024x512 slice around the camera built from the region's metatile words
    (layout + collision bytes 8-11), painted with the live VRAM tiles and displayed colours; re-centred every 256 px,
    repainted when a used tile or BG colour changes (fades, animation), mesh rebuilt only when which cells count as
    sky changes (tiles still loading). Build ~20-30 ms on desktop, per-frame work under 1 ms.
  - *Snapshot timing:* take it when runFrame returns. RAM camera variables already hold the next frame; use the scroll
    registers' low bytes for the picture's camera so sprites (OAM) and level stay locked.
  - *LCDC at frame end lies about sprites* when the game switches them off for the status bar: don't test bit 1.
    Drop sprites under the window; draw the window (status bar) flat over the picture where the 2D game has it.
  - *Gate on the game state too, not only a BG self-check:* the title screen matched blank level data. Require ≥3
    different matching tile numbers, and play/town states only.
  - *Ledge depth vs sprites:* put the sprite plane just in front of the ledge boxes (crates), inside the solid blocks,
    or the player walks "behind" every crate in the flat view.
  - *Check a player-position variable against OAM before drawing with it:* Shantae's $CB43/$CB45 is 26 px left of and
    28 px above her sprites' middle — the Link map's dot had been off by that since 0.3.
  - `tests/view3dtest.py` = the page in headless Chromium (SwiftShader WebGL) with a mock bridge fed from driver dumps;
    `--stats` prints on/off, slice and timings per dump. Sweep a few hundred dumps to catch false triggers.
- **Shantae Dual 0.12 (Nov 1) — a Link map that's ready when you arrive, and text on pop-up cards:**
  - *Find the real wait before caching.* `tests/maptime.py` replays dumps taken every 6 frames the way the app feeds the
    page (RAM fresh each 100 ms tick, the video snapshot only every N frames). It showed the map drew 0.4 s after a room
    change — during the fade-in, so in near-black colours — and a 4 s colour re-check left it dark for seconds. The
    "10 s" on the phone was mostly that, not drawing time.
  - *Draw once into palette bytes* (BG palette * 4 + colour per pixel), colour with a 32-entry table into the canvas.
    Fades, day/night and GBA colours become a recolour; take the live colours only once they've held for ~0.5 s and
    aren't all dark, else the ones stored with the room.
  - *Keep the bytes per room*: memory LRU + IndexedDB, gzipped with CompressionStream (a 30 x 3-screen room is ~40 KB;
    all rooms a few MB), localStorage fallback where IndexedDB is missing. A stored room shows the moment its RAM
    variables change, before VRAM is even loaded; a live redraw once per session checks it. Spare polls draw the
    region's other rooms while its tiles are in VRAM.
  - *Self-check against the snapshot's own scroll* (SCX/SCY), not RAM's camera: the snapshot is older than RAM, so the
    BG-map check failed while walking. Snapshot every 10 frames instead of 20.
  - *Pop-up cards (as Xenogears Link):* the map gets the whole pane, named in the panel title; small buttons down its
    left edge (icon + count: ways out, doors, still to collect, all rooms, signposts) open a card over the map; tapping
    the card closes it. Default zoom fills the pane (never closer than one game screen); tap cycles FILL, x2, x4, ALL.
- **Shantae Dual 0.13 (Nov 1) — don't keep a picture drawn from the wrong graphics:**
  - *A BG-map match isn't enough before storing.* Tile numbers matched while a room was loading (respawn's white flash,
    cutscenes swapping graphics), so 0.12 stored a flat-coloured or garbled map for good. Keep a hash of every 8x8 tile
    a picture used; draw only from settled colours (not a fade; not one flat colour — palette animation changes only a
    few entries, so "settled" = fewer than 7 of 32 colours changed), skip mostly-blank tiles, accept a drawing only when
    its tiles are unchanged ≥150 ms later, and redraw when <80% of them still match. Use time, not "a new snapshot",
    for these checks: a still screen sends the identical snapshot string. Rename the store when its rules change.
  - *Zoom by what the user means:* x1 (fill, follows the camera), x2, ALL (x1 scale, stays where you drag it); every
    view drags (tap acts on release if the finger didn't move; x1/x2 drift back to the camera after 4 s).

- **Shantae Dual 0.14–0.18 (Nov 1) — Link-screen polish and frame-alternating sprites:**
  - *Sprite flicker: measure before blaming the core or reaching for frame blending.* Log OAM every frame (`peek FE00
    160` per `run 1`) and count sprites per line (8x16 if LCDC bit 2). Shantae flips every sprite between VRAM bank 1 and
    bank 0 each frame — tile double-buffering, each frame complete — so MIX only added ghosting. The real cause was busy
    fights with up to 15 sprites on a line, over the hardware's 10. **Shantae 0.17 "ALL SPRITES"** (gambatte patch,
    ppu.cpp): at mode-3 start record the line's registers and every sprite on it from raw OAM; after the frame (in
    retro_run, before blending) draw the ones past the 10th — under the first 10 (lower OAM priority), CGB BG priority
    recomputed from VRAM (map/window, attribute bank/flip/priority bits). PPU timing untouched, so game state stays
    identical; diff frames on/off in the driver to confirm only sprite pixels change. Works for any GBC game.
  - *Overclock (NO SLOWDOWN) must also hold normal speed during HBlank DMA* (0.18; `dmaActive()` = OAM DMA or
    `lcd_.hdmaIsEnabled()`). Shantae streams next frame's sprite tiles with an HBlank DMA started in vblank (~80 lines);
    at 2x the main loop kicked its next DMA before that one finished → white/garbled sprite patches (file select,
    cutscenes). Diagnose by diffing driver frames oc 0 vs oc 1, then counting dropped VRAM/palette writes (`drops`:
    both 0 here, which pointed at DMA timing) and tracing FF51-FF55 writes.
  - *Draw the hero from the game's own inventory screen:* cut her BG region from the captured inventory snapshot, add
    the skin/base sprites, and sort the remaining sprites into gear pieces by screen position (top = tiara, bottom =
    boots, left = cuff, middle = sash) so each owned piece is drawn on her and missing ones faint (alpha ~0.22).
    Items/stones/talismans beside her use the captured icons. Lay it out for the short 4:3 pane (figure 136 px tall
    after a one-line header), not only portrait.
  - Small UI wins the user asked for: a gear icon in the panel's corner instead of an OPTIONS tab; a pop-up list on the
    game's own button (Select → dance list) instead of a tab; the dusk/dawn timer next to the area name on the map.
- **Shantae Dual 0.20 (Nov 1) — PROGRESS tab, boss bars, night notes; a defeat event is still missing:**
  - *Stats without a native tracker:* the Link page diffs what it already reads each 100 ms tick (gems, item counts,
    hearts, day/night bit) and counts play time from the game's own frame counter ($C377). A jump of more than ~600
    frames in that counter = a state or save was loaded: skip that tick's differences. Kept in localStorage.
  - *Boss HP lives in the boss's object node* (bank-3 nodes every $7E bytes). Show a bar only while that node runs the
    boss's script (check the script PC's bank/range), or the address is just another object's data.
  - *Finding "enemy defeated" is the hard part:* scripted bytecode enemies, no common HP field, and driver combat
    automation rarely lands kills (the driver's `run N` keeps the previous buttons if none are given — use a dummy
    letter like `N`). A pctrace diff between a "kill" window and a quiet window found 06:7265, which turned out to be
    Shantae's own hurt burst. Confirm a candidate event visually on several enemies before building on it.
- **Shantae Dual 0.21 (Nov 1) — a monster list without a kill event ("lit up when met"):**
  - *Name any live object by its script PC:* the game's type table (0A:4000, script start per type) sorted per bank;
    a node's type = the last type start at or before its PC in the same bank. Children (heads, projectiles) run inside
    the parent type's code, so they map to the parent. Works for any scripted game with a type → script table.
  - *Build the list by sweeping, not guessing:* `tools/re/monster_sweep.py` warps to each area, teleports the player
    across the room in 120 px steps, and saves a sprites-only crop (OAM + VRAM from the dump) for every on-screen type.
    One contact sheet of ~85 crops was enough to pick the enemies and match names to the wiki's per-area lists.
  - *Exclude the player from crops by her sprite middle* (node + 26, 28 here), not her node position.
  - *Picture on the device:* cut from the live video snapshot (sprites near the node, away from Shantae), stored per
    entry as a data URL; a later picture taken with Shantae further away replaces a close one.
- **Shantae, after 0.21 — searching for "defeated" and "game beaten" flags:**
  - *Check whether a flag exists before hunting it:* trace the save block (and cartridge RAM) through one kill and
    through the ending + credits. Shantae writes nothing for either; the only SRAM write afterwards was a New Game.
    The scripted ending is reached from the last map's own code, not via the map id variable.
  - *Decode the script VM's opcode table first* (here: handler = word at $0600 + op, even ops): then `$94 lo hi v`
    (write byte) and `$32 lo hi bank` (far native call) can be byte-searched across the ROM, which is how the final-boss
    → ending script and the 37 enemy death paths were found.
  - *A dependable kill in the driver:* teleport the player beside the enemy every 36 frames, face it, alternate B
    3 frames on / 3 off, refill hearts, dump each chunk (`tools/re/kill.py`). Watch the node: HP byte falling, then PC
    jumping to a death script, then +0 = $FF. Some sweep "enemies" were statues or out of reach — check a screenshot.
  - *The usable defeat event is the shared item-drop routine* the death scripts call (0E:50C5). Attribute a death to
    the type the node had just before, not to the death script's address (shared code sits after another type's).
- **Shantae Dual 0.22 (Nov 1) — ending card on the Link screen (as Metroid Dual's mission report):** with no "game
  beaten" byte, detect the credits by which code is running: node 0/1's script PC in the credits' own part of a bank
  (Shantae: bank $1C at $7040+, also THE END). Check the range against ~190 saved states first — the same bank's lower
  half ran another scene. Snapshot the stats once when it turns on, keep the signature box the same size after SAVE
  (resizing cleared the drawing), and give `linktest.py` a `--drag` stroke option to test drawing.
- **Shantae Dual 0.23 (Nov 1) — a region isn't always one place; showreel renders:**
  - *Story scenes can share a region with nothing to do with each other:* Shantae's new-game lighthouse, Risky's ship
    fight and the credits all sit in region 51:4F, and the lighthouse's header (3072x1008) is bigger than its camera
    limits (3072x472). The "camera rect inside a bigger listed room = an overworld area" rule then drew the credits
    scene under the lighthouse with the wrong tiles. Keep a per-region list of "separate scenes" and show only the live
    room there. Test every place a new game passes through, not only the warp list's playable areas.
  - *Showreel renders (`tests/showreel.py` + `showreel_clips.py`):* the driver plays scripted buttons and dumps every
    2 frames; one browser context feeds the dumps to the Link page one per tick (shared localStorage/IndexedDB, so
    monsters seeded from a sweep and maps drawn in a warm-up pass carry over), page taps/drags/JS at given steps, game
    frame x3 over the 640x480 Link screen, ffmpeg at 29.86 fps. ~30 s per 5 s clip. Game art: user's folder only.
- **Shantae Dual 0.24 (Nov 1) — a bestiary captured on first start, the same for everyone:**
  - *Capture inside the first-start extraction, not when met* (live pictures came out in day or night colours). From
    one saved moment of the debug game: poke daytime, warp, put the player at a planned spot, free every other object
    (or keep them: some enemies are drawn by a helper object), watch ~300 frames and stop on the frame with the most
    target sprites (save state, scan, reload, replay). Each capture reloads the same base state, so captures don't
    depend on each other and the desktop plan matches the device exactly.
  - *Plan with the shipped C code:* the driver's `beast` command runs the capture; `exbase` saves the extraction's own
    state before it; tools/re/beast_plan.py searches positions around earlier sightings and writes native/beasts.h.
  - *Picking the enemy's sprites:* not the player's, inside the box around the target's nodes, then the biggest group of
    touching sprites at a node (fallback: the biggest group around them). This game streams each object's pixels into
    fixed OAM tiles by HDMA, so metasprites can't simply be rebuilt from the ROM.
  - *Let the user check the names on one sheet* (tools/re/beast_sheet.py): two pairs of names were swapped and one
    "enemy" turned out to be a statue type; the device player sees them in context.
- **Shantae Dual 0.25 (Nov 1) — adaptive icon, drag scrolling:** an `<adaptive-icon>` in res/mipmap-anydpi-v26
  (aapt v1 handles it) with a full-bleed background layer (sparkles to the edges) and the pixel art inside the 66/108
  safe zone, so launchers fill the whole circle. Lists that paged on a tap scroll by dragging (pixel offset + position
  bar). Collectibles that only appear at night say so ("NIGHT ONLY: IN m:ss").
- **Shantae Dual 0.26 (Nov 1) — FF button, hand-off to Claude Code:** the Xenogears-style FF button at the bottom right
  of the Link tab bar toggles the emulator's fast-forward through `LinkBridge.ff(mode)` (-1 read, 0/1 set, 2 toggle;
  the frame loop ORs it with the held FAST key). For moving a project to Claude Code: a CLAUDE.md at the repo root
  (layout, toolchain, build, driver commands, tests, RE tools, standing rules, open issues), the RE scripts that lived
  outside the repo copied into tools/re, the driver save states shipped as a separate zip, and tools/fixpaths.py to
  rewrite the absolute paths the scripts were written with.
- **Shantae Dual 0.27 (Nov 1) — bestiary removed; first build in Claude Code on Windows + WSL:**
  - *A "collect them all" list has to be complete to be fun.* With no defeat event, sightings-based "met" and 3 of 35
    pictures missing (5 more weak), playtesting found too many monsters missing, so the feature came out rather than
    shipping half a list. Before building one in another Dual app, check the whole roster can be named and pictured.
  - *Removing a feature cleanly:* drop its stored data on the device too (`localStorage.removeItem`, delete the asset
    file at start-up), map a saved sub-view id that no longer exists to a default, and leave the research in the RAM
    doc with a pointer to the git tag/version that had the code. Bump ASSET_VERSION only if the remaining extraction
    output changes; dropping one file doesn't need a re-extract.
  - *Building on WSL with the repo on the Windows drive:* bionic's kernel headers have names that differ only by case
    (xt_connmark.h / xt_CONNMARK.h), so the sysroot folder must be case-sensitive (`fsutil file setCaseSensitiveInfo
    <dir> enable`, only on an empty folder; new subfolders inherit it). WSL's `/tmp` can be a tmpfs wiped when WSL idles
    out between commands, so keep test outputs under a home folder. A newer clang (21) builds the same .so a few KB
    smaller.
- **Shantae Dual 0.28 (Nov 1) — game-styled menus removed:** the user preferred one look across Shantae Dual and its
  RetroArch companion (which can't run the first-start extraction), so the menus cut from the game's own screens went
  and the plain look (drawn sky, the ROM's font and text-box frames) is the only one. Keep a drawn look that needs no
  extraction in every Dual app from the start: it is what a companion app without an emulator can show, and dropping
  a second look later is mostly deleting `if (kit)` branches. When the extraction output shrinks, change the asset key
  so devices redo it once (it also clears the old files), and make the extraction fail when its one remaining output
  doesn't come out, or "ready" never becomes true and it reruns every start.
- **Shantae Dual 0.29 (Nov 1) — copy art from the live screen only once it has settled:** anything copied once and
  kept (icons from the inventory screen) must wait out fades: require bright colours that match the previous look.
  Don't test against one "final" frame: menu icons animate (sparkles, turning items), so collect every frame of the
  open screen and accept any of them (tests/icontest.py). Change the storage key when a fix makes kept data suspect.
- **Shantae Dual 0.30 (Nov 2) — a bestiary from the ROM instead of from screenshots:** 0.24's bestiary played the
  game to each enemy and cut its sprites off the screen; too many were missing or wrong (under water, off screen, the
  wrong object). What worked instead:
  - *Find the sprite stream's source.* Trace writes to the buffer the game DMAs sprite tiles from (Shantae $C4C0): the
    writer copied straight from ROM, uncompressed. Its caller showed the object's fields (bank + cel pointer) and the
    cel format (layout words, tile block, (dy, dx, attr) per sprite). Check the decoder on the player first, against
    the live OAM and buffer byte for byte.
  - *Map types to cels two ways.* Scan each object type's script code for the "set cel" opcodes (op, bank, address;
    keep only pointers that decode), and run live sweeps (warp to every map id, by day and by night; teleport the
    player across the room; record every node's type and cel, visible or not). The sweep finds cels set by native
    code and shows which types really live where; drop cels shared by many types (puffs, explosions).
  - *Expect background-drawn objects:* big blocks, doors and rocks used another handler that writes the BG map, so
    their "cels" are tile/attribute grids. Two of the old bestiary's names (Giant Snail, Snake) were such blocks.
  - *Let the user name them from a sheet* with each entry's area and time of day (from the sweeps), then build the
    list from that. Area palettes weren't plain ROM tables (built by code and faded in), so the page saves the game's
    WRAM palette copy at the moment an enemy is first met, which also works through RetroArch.
- **Shantae Dual 0.31 (Nov 2) - menu icons from the ROM, not from the screen:** 0.17-0.30 copied the item icons out
  of VRAM the first time the player opened the inventory, so they were missing on a new game and needed a settle check
  (0.29). A screen the game builds from a tileset load is often all in the ROM: the tileset loads (here LZSS via one
  routine with inline arguments) were already mapped for the map, and a search of the ROM for the live 64-byte palette
  RAM found it stored as loaded. That leaves only the BG map: copy each icon's 2x2 (tile, attribute) block from one dump
  with everything owned into a small table in the page (layout numbers, not art). Test each built icon against every
  frame of the live screen. Now every icon is there from the first boot, in both the app and the RetroArch companion.
  0.32 did the same for the menu's character portrait: search the ROM for the live BG map as (tile, attribute) words and
  for each palette, and decode the menu's sprite objects with the game's cel format. Once one screen's art is found in
  the ROM, the rest of that screen is usually stored next to it (here map and palettes sat right after each other).
- **Shantae Dual 0.33 (Nov 2) - auto dance from a measured beat:** before reading any dance code, sweep press timings
  on the desktop driver (input k at frame a + P*k after the trigger, check the player's cel bank). The beat turned out
  to start from the Select press, not the music, so one fixed schedule (18 + 64k frames, about 24 frames of slack)
  works anywhere. Play it through the host's scripted-input queue on emulated frames, so fast-forward can't break the
  timing, and test end to end: tap the page row, take the string it sends, and replay it on the driver.
- **Shantae Link 0.1 (Nov 1) — a Dual app's Link page as a RetroArch companion (GBC; after Metroid Link):**
  - *Read the core's memory map through RetroArch's own code before designing.* `READ_CORE_MEMORY` goes through the
    core's `SET_MEMORY_MAPS` descriptors and RetroArch's `mmap_preprocess_descriptors`/`command_memory_get_descriptor`.
    Gambatte's map has surprises you only see that way: WRAM bank 1 is fixed at D000 (not the SVBK bank), its select
    masks make WRAM banks 4-5 and OAM past FE1F unreachable, and VRAM bank 1 and palette RAM aren't there at all. Port
    those two functions into the mock server (tests/mock_ra.py) so every test reaches exactly what RetroArch would.
  - *Look for the game's own copies of what the core hides.* Many games keep shadow palettes in WRAM for fades (Shantae
    $C400/$C440: search WRAM for the 64-byte palette RAM in a few dumps) and a WRAM copy of the BG map. They hold the
    colours a fade is heading to, which is what a map wants anyway.
  - *Rebuild VRAM from the ROM when the core won't show it.* Trace who writes the HRAM parameters of the game's
    decompressor during a room load: Shantae calls $0803 with 8 inline bytes (source, bank, dest, VRAM bank, length).
    Byte-search every such call, pair each bank-0 load with the bank-1 load next to it, and pick the pair whose bank-0
    output matches live VRAM bank 0: 98% of bank-1 tiles came out right. Then fill what a room load doesn't cover from
    what was there before (Shantae: the font tileset loaded at start) and from buffers the game DMAs in each frame
    (its sprite stream at $C4C0): the map then matched the Dual app's pixel for pixel. Compare renders with equal waits;
    a big room drawn in pieces looks like a mismatch otherwise.
  - *Host features become RAM reads:* the game's joypad byte (HRAM) replaces the host's Select callback, its hardware
    flag ($FFFE) the GBA-mode pref, `WRITE_CORE_MEMORY` the equip poke, `SAVE/LOAD_STATE_SLOT` the slots, `MENU_TOGGLE`
    the pause menu, `FAST_FORWARD` (toggle only) the FF button. Things that live in the emulator (first-start
    extraction, overclock, 3D view, warps) don't carry over; list them for the user.
  - *Then check against a real RetroArch (0.2).* The mock was right about every address, but the real 1.22.2 nightly
    lacked `SAVE_STATE_SLOT` (no reply, like an unknown command), couldn't report its slot or fast-forward state, and
    counted hotkey commands arriving in one frame as one press. SAVE to slot n = 20 x `STATE_SLOT_MINUS` (stops at -1),
    n + 1 x `STATE_SLOT_PLUS`, `SAVE_STATE`, 50 ms apart. Test fast-forward by the game's own frame counter. Feed the
    page from a paused live snapshot (`ra_snapshot.py`) to render it on real memory. Driver states load in RetroArch once
    converted field by field to the stock core's layout (labelled fields; RASTATE + RZIP around them).
  - *Menu screens are loaded the same way as rooms (0.3):* the inventory's tilesets were `$0803` loads too, and the
    game's WRAM copy of the BG map held its attributes, so the icons came back pixel for pixel. Gate a one-time
    capture on "the snapshot was fully stood in" (ra.js `videoComplete()`), checked after taking the snapshot: gating
    the call itself deadlocked, because on that screen nothing else asked for a snapshot.
  - *Support a second core by its memory map, read block by block (Link 0.7, mGBA):* "everything loads but the map"
    was one short read. mGBA's HRAM descriptor is $7F bytes (IE at FFFF apart) and RetroArch 1.22 stops a read at a
    descriptor's end, so a 128-byte HRAM read came back 127 bytes and was dropped as incomplete; only the map read HRAM.
    Size every block to the smallest descriptor any supported core uses, and note that RetroArch ignores a failed
    `mmap_preprocess_descriptors` (mGBA's select-less $6000 WRAM 2-7 block): later descriptors keep the core's values
    and match as plain ranges. Port each core's `_setupMaps` into the mock and run the page tests per core.
  - *Keep the page shared:* one adapter (ra.js) builds the same `window.Native` the Dual app has, on a dumb Java
    transport (`read("addr:len,...")` from a cache the poll thread fills). The page only needs an `RA` flag for the
    setup screen and a few option rows, and the same page tests run in both modes.

## Game Boy Advance games: Super Mario Advance Dual 0.1 (Nov 1 2026) — SMA (USA, Europe) on the Mario 2 Dual 0.1 base, core swapped
Reuse this base for the next GBA game. Source zip has README.md + RAM-MAP.md.
- **Core:** mGBA, libretro fork (MPL-2.0, github.com/libretro/mgba @ 7a12d6d; GPL-compatible but not GPL — the user
  chose it for accuracy). No Makefile.libretro any more: configure once with CMake (`-DBUILD_LIBRETRO=ON`, everything
  else off, `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`) and copy the libretro target's source list and `-D` flags into
  `native/mgba_sources.txt` / the Makefile. `M_CORE_GB` must stay on (libretro.c doesn't build without it). Android
  needs `-DHAVE_STRTOF_L` (bionic has it inline) and no `HAVE_FUTIMES` (API 26). Plain C, no libc++. HLE BIOS built in.
- **Frontend:** `native/gbacore.c` `#include`s mGBA's `libretro.c` (its `core` is static) → direct pointers for
  `gba_peek/gba_read` over the whole address space (`02` EWRAM, `03` IWRAM, `04` IO, `05` palette, `06` VRAM, `07` OAM,
  `08` ROM). RGB565 240x160, 65536 Hz audio, core options answered from a table (HLE BIOS, idle-loop removal, colour
  correction, frame blending). Battery save: `retro_get_memory_data(SAVE_RAM)` loaded after load_game, written
  (tmp + rename) only when it differs — every 600 frames, on pause, quit and onPause.
- **NO SLOWDOWN for mGBA:** `native/mgba-dual.patch` wraps ThumbStep/ARMStep in arm.c: the cycles an instruction adds
  are halved (with a carried remainder). Halt/IntrWait still skip to the next event, so idle time is unaffected.
- **Stats tracker without spare game RAM:** keep it in C (`native/smatrack.c`) and append it to every state file
  (`"SMAT"` + 64 bytes after the core's state; files without it still load). Simpler than finding unused bytes.
- **RE tools (host build, `-DGBX_TRACE`):** a store hook in GBAStore8/16/32 → `trace lo hi max file` (frame, address,
  size, value, PC, LR); `rec N buttons file` appends IWRAM every frame for numpy diffing. capstone for Thumb
  disassembly (`pip install capstone`; don't name your script `dis.py`). SMA's code is unoptimised C, so variables
  are plain globals and literal pools point straight at them.
- **Finding things fast on GBA:** (1) the level buffer: take each on-screen 16x16 cell's 4 BG map entries as a
  signature and search RAM for an array whose equal/unequal pattern matches (found SMA's u16 level at `02000000` in
  one pass); (2) the metatile table: search the ROM for one cell's 4 map entries, then the pointer table that points
  at it; (3) collision: for every metatile id, build a floor of it under the player in a save state and see if he
  stands (SMA: id's high byte = collision group); (4) fonts and HUD tiles are raw 4bpp in the ROM (check tile
  alignment: SMA's start at `…7C`); LZ77 (BIOS type 0x10) scan found almost nothing, so try raw first.
  Teleport by poking X/Y *and* their copies.
- **3D view on GBA (Scene3D):** BG0 = level, cells classified by metatile group; the game's own parallax layers (BG2
  under BG1) on the far plane instead of a half-scale copy; BG3 (HUD) drawn flat; OBJ sprites as 8x8 quads (1D/2D
  mapping, flips, priority vs BG0 → mask). Atlas rebuilt from what's on screen every frame (512x512 slots); far
  layers and HUD redrawn only when a fingerprint changes (3.8 ms → was 13.7 ms on desktop JVM). Only draw the far
  layers near the screen: games stream map columns as the camera moves, so the rest of a BG map is stale.
  Camera = BG0 scroll + whole wraps chosen to keep the player on screen.
- **Link page on GBA:** `Native.video()` = VRAM 0x18000 | palette 0x400 | OAM 0x400 | IO 0x60 (base64, ~1/s);
  area map drawn into an ImageData from the ROM metatile tables + live BG tiles; the player's portrait from the OAM
  entries overlapping his screen box. `window.STANDIN` = flat colours + system font for previews.
- Menus: `gbagfx.js` (4bpp font with ink + shade tones, BGR555 colours), launcher on a drawn sky/hills with a cream
  card like SMA's pause screen; screen base 240x160 (portrait 240 wide).
- **SMA Dual 0.2 (Nov 1) — GBA menu graphics captured from the game, and reading a GBA game's state properly:**
  - *First-start capture on GBA* (`native/extract.c`, same idea as Shantae 0.2): `gba_set_savedir(tmp)` → load →
    a per-frame state machine on the game's state bytes (title: wait N frames then tap Start; menus/char select: tap A
    every 20 frames; in level: wait 60 then Start; pause: wait 40 then snapshot) → unload → savedir back. Snapshot =
    IO 0x60 | PAL 0x400 | VRAM 0x18000 | OAM 0x400 per screen ("SMAX" file, ~200 KB for two). ~700 frames, 0.6 s on
    desktop. Validate each shot (BG control values, OAM tile ids at known slots) and return a distinct error code.
    The JNI call does load + capture + unload itself, so Java just runs it on the emu thread from the launcher;
    a START pressed meanwhile is queued (`pendingStart`) instead of blocking the UI on `emu.call`.
  - *Look in OAM, not only the BGs.* SMA's pause panel isn't a BG at all: render each BG's visible window at its
    scroll (`win.py`) — if the panel is in none, it's sprites. Here: 16x16 OBJs in 2D mapping (tile row stride 32),
    one corner/edge/side/fill each, flipped by OAM bits → a clean 9-slice. Size the card in whole 16 px pieces.
  - *Title screens are good backdrops:* SMA's title has the logo/Mario/copyright as OBJs, so BG2 (sky) + BG0 (ground
    strip) is a logo-free scene for free.
  - *A game's "state" is often several bytes.* SMA's 1992 = 1 both in a level and at character select; the true test is
    mode 19B0 + sub-mode 1991 + 1992. Find these by logging all three every 5 frames through a route (`probe.py`) and
    fix every consumer at once (Java constants, Link JS module, native tracker, 3D self-check).
  - *Save-bit layouts from code, then checked:* `rtrace` (read hook) on the save bytes while the pause screen counts
    them gave the read loop; level L owns bits L*5..L*5+4. "This visit" byte turned out to be a bitmask in the same
    order — draw which coins, not how many.
  - *Level warp on games that reload the level number from the save block:* poke it at character select after the
    unpack (wait a few frames, re-poke if overwritten), and reset the stats tracker's "last level" so the jump isn't
    counted as a clear.
  - Ship the core's licence text in assets (`assets/licenses/`) and name it in SYSTEM; MPL-2.0 needs the (patched)
    source of mGBA's files available — the source zip covers it.
- **SMA Dual 0.3 (Nov 1) — mapping a GBA game's objects from its spawn code:**
  - *The live slot may not hold the type.* SMA's object slots kept only a class byte; the type number was the spawn
    function's argument. Trace writes to one slot while it spawns → the spawn routine → its table reads.
  - *`rtrace` the per-type tables:* a read of `table + type` during a spawn gives the type directly (address − base).
    A read of the record's X from ROM gives the level's object list (here 6-byte records: type, tile x, tile y; lone
    `0x00FF` ends it; pointer table indexed level·11 + area number).
  - *Count types across every list:* ids that occur exactly once per level × 5 were the Ace Coins (5 per level), and
    the collect code confirmed `bit = type − 0x6F`. With that, the Link map shows every collectible's position from the
    ROM before it spawns, coloured by the save bits.
  - *Check ids against the parent game:* SMA kept SMB2's enemy ids (Xkeeper0/smb2 `Enemy_*`), so most names come free;
    confirm one in the emulator and that bosses sit in the right levels.
  - *HUD loops give "max" variables:* the heart-drawing loop's bound was `[mushrooms] + 2` — read the drawing code
    instead of hunting RAM for a max value.
  - *Contents of unknown grass/blocks:* write the id into the level buffer next to the player, press the action button,
    wait (giant items take seconds), screenshot.
- **SMA Dual 0.4 (Nov 1) — 3D fixes and a livelier UI:**
  - *Test the 3D over a sequence, not one dump.* `tests/scene3d/SceneSeq` runs one Scene3D over ~200 consecutive dumps
    (menus → level start → play → pause). It showed the real bug: the mapping check failed for whole stretches (vertical
    flag set late, camera wrap wrong when the player is above the screen), so the view flipped between 3D and a flat
    wall. Fix: try every candidate (layout × scroll wraps near the player) and keep the best-matching one; hold the 3D
    through partial matches for 30 frames in the same level/area.
  - *Outside play, show the 2D picture inside the GL view* (texture from the frame buffer, RGB565 upload) instead of a
    3D guess at title / menus / pause / transitions; 3D after 8 frames of play. No view switching, no surface churn.
  - *Far layers: draw only the on-screen part.* Margins beyond it showed stale map columns as garbage at the edges.
  - *"Drab" UI:* saturated selection bar with white text, big text on short menus, panels sized to their content,
    ON/OFF pills, category colour chips; on the Link page the captured title backdrop, coloured tabs, ribbons, a colour
    per world, a character-coloured header band.
- **SMA Dual 0.5 (Nov 1) — low / turned 3D cameras:**
  - *Build past the screen edges from level data:* a margin of cells (4 tiles) whose tiles come from the level buffer +
    ROM tile quads (the BG map there isn't streamed in yet). Widen the shader's edge discard to match.
  - *Don't trust the player position for the camera wrap* (pits, deaths): score every wrap inside the area, tie-break
    by distance to the player.
  - *Sky colour = what the far layers show along the top of the screen* when palette colour 0 isn't visible
    (7-1: black colour 0 behind a light sky layer); "most common colour overall" picked jungle green instead.
  - *Real in-game renders go to the user's desktop folder only,* never into the chat (game art). `SIZE=1920x1080` on
    `tests/scene3d/shot.py` for full-size renders.
- **SMA Dual 0.6 (Nov 1):** the Mario 2 "ledge on a body" fix had to be redone here — carry it into every 3D port
  from the start: opaque scenery directly under a block cell, down to the first gap (mostly-opaque edge tiles too),
  is built as block, so hill caps and bodies are one solid. Check with a low/turned camera, where it shows most.
- **SMA Dual 0.7 (Nov 1) — stacked hills at different depths:** hills are rectangles of body metatiles under a cap
  row; one drawn over another starts inside it (a left-edge body tile or a cap tile cutting into the other's body —
  SMA even has separate "cap over body" ids 123/124). Union-find the hill metatiles into pieces (break across a row at
  a left edge / after a right edge, down a column at a cap), add "in front of" edges at those cuts, nest = longest chain,
  and pull each piece forward by nest × 0.75 depth (thicker toward the camera, side faces where it steps out). Work on
  a window of metatiles around the screen (not just the screen) so the order doesn't pop while scrolling.
- **SMA Dual 0.8 (Nov 1):**
  - *Sprites in a block-extruded 3D view go on the blocks' front plane* (z = front face + ε), not mid-depth: at z = 0
    their feet project above the ground's front edge and enemies look like they float. Follow stepped-forward hills
    (nest at the block under the feet).
  - *UI feedback "too drab" then "too harsh, hard to read":* the middle ground that worked — dark ink (#4a2c12) on
    cream, a soft gold selection bar with an outline and dark text (white-on-orange read badly in the 8 px font),
    red titles without shadows, ON/OFF as coloured words not pills, colours blended toward cream for bands/chips/tabs,
    thin brown card outlines, backdrop washed 35% toward white. Saturated colour as a small accent, not a fill.
- **SMA Dual 0.9 (Nov 1) — affine sprites in the 3D view:** giant sprites are affine (OAM attr0 bit 8), often in a
  double-size box (bit 9) and mirrored by the matrix (pa = −1). Read pa/pb/pc/pd (s8.8) from attribute 3 of OAM entries
  4p..4p+3 (p = attr1 bits 9–13), place each tile by the inverse matrix around the box centre (x + w, y + h for
  double-size), and reverse the quad winding when the inverse's determinant is negative or face culling drops it.
  Drawn plainly at the box corner, the giant Shy Guy floated 16 px above its platform.
- **SMA Dual 0.10 (Nov 1) — item icons from the game's sprite sheet, and a one-row map:**
  - *Icons without shipping art:* many games keep a fixed sprite sheet in OBJ VRAM during play. Add a "1-1 in play"
    shot to the first-start capture (before pausing: the pause panel overwrites part of the sheet) and cut 16x16 icons
    from it. Get each item's tile + OBJ palette from OAM while it's on screen: poke a grass/block id into the level
    buffer next to the player and pull it; enemies frozen with the stopwatch byte; subspace via a potion door for the
    mushroom; the HUD's own hearts are OAM 0/1 (also the capture's validity check). Rendering the sheet in all 16
    palettes settles the rest by eye. Keep a fallback to the drawn look per icon (blank sprite → no icon).
  - Pause-screen icons can sit on a filled square: clear corner-coloured pixels connected to the edge.
  - Lay status cards out for 16 px icon rows at 1:1 (downscaled pixel art reads badly); faded (alpha ~0.3) = not yet.
  - *"Map has several rows":* replace a folded whole-area view with one strip at the area's full height (full width for
    vertical areas) that follows the player with a dead zone (still while in the middle 40%, eases after) and a thin
    position bar — no re-centring every tick.

## 3DS port: frame pacing and the old 3DS (Shantae Dual 3DS 0.11-0.13, Nov 2 2026)
- **A loop locked to the screen's VBlank halves, it doesn't slow down gently.** Run a frame, draw, `gspWaitForVBlank()`:
  at 17 ms a frame misses the refresh and waits for the next, so the game runs at exactly 30 (and the music with it).
  An exact 30 (or 20) means "a little over budget", not "twice too slow".
- **Measure on the device before optimising:** a timing line per part (emulator frame / top screen / bottom screen /
  slowest loop, averaged over a second, `svcGetSystemTick`) on a settings page, and a New 3DS toggle for the old 3DS's
  CPU (`osSetSpeedupEnable(false)`: 268 MHz, no L2) so it can be checked without an old 3DS.
- **Frame skip: choose N from the measured costs, don't pay back time owed.** Each loop runs the fewest N frames with
  N x emu + draw + 1 ms <= N refreshes and shows the last. "Run however many frames we're behind" locks in after any
  pause: 3 frames take 3 refreshes, which owes 3 again (seen in Azahar: 20 shown at a cost that fits 60).
- **Frame skip can't fix an emulator frame that's over 16.7 ms on its own** (gambatte on Shantae: 24 ms at old 3DS
  speed). Look at what the patch added to the core's hot paths first: a per-memory-access macro reading a global cost
  ~8% of the instructions.
- **Azahar's tick counter counts emulated instructions** (no cache stalls), so it ranks code changes well but reads
  about half the device's time (11.3 vs 24.0 ms).
