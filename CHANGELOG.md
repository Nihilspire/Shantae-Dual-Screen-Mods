# Shantae Dual 0.45

One APK: Shantae (USA) for Game Boy Color on one screen, a Shantae-styled Link screen on the other.
Built from Metroid Dual 0.45; the NES core is swapped for Game Boy Color and the rest keeps the same structure.

- **Emulator:** libretro-gambatte (GPLv2, github.com/libretro/gambatte-libretro @ 77f2567) with `native/gambatte-dual.patch`
  (side-effect-free peek/poke, CGB palette access, the NO SLOWDOWN overclock, a host-only write/opcode tracer,
  no iostream includes). Statically linked into `libshantaedual.so` with a small frontend (`native/gbcore.c`),
  glue (`native/gbglue.cpp`, which compiles the core's libretro.cpp), the JNI layer (`native/gbjni.c`) and
  `native/cxxrt.c` (operator new/delete etc.), so the .so needs only libc/libm/libdl/liblog. libc++ is used headers-only.
- **Host:** `app/src` (Java, no AndroidX). Game view (160x144, 10:9) with game-themed 16:9 borders, touch pad,
  controller + rebinding, 4 save slots with screenshots + quick save/load + auto state, launcher/pause menu
  (`assets/menu`), Link page (`assets/link`).
- **Nothing from the game ships in the APK.** You choose your ROM on first launch (CRC32 `E994B59B` expected).
  The font, text-box frames and signposts come from that ROM; the border tiles from the running game's VRAM; the Link
  page's item/stone/talisman icons are copied from VRAM the first time you open the in-game inventory.
- **0.2 (removed in 0.28): menus made from the game itself.** On first start (and after changing ROM, GBA MODE or COLORS) the app plays
  the game's opening once with no one watching (`native/extract.c`, a few seconds, hearts fill up on screen) and keeps
  five screen snapshots plus the title theme in the app's private storage (`files/gameassets`):

  | Snapshot | Used for |
  |---|---|
  | Title screen | Launcher art; its "Press Start" banner, cut into caps and a filler, frames the chosen item |
  | File Select | The blue swirl background |
  | Dance Menu | The `<B` header bar (tap = back), the framed black rows, the dance icons on the pause menu |
  | Inventory | Item, stone, talisman, squid and firefly icons (the Link page no longer needs the in-game menu opened) |
  | Status bar | Kept for later (not drawn yet) |
  | Title music (WAV) | SOUND > MENU MUSIC: TITLE THEME (launcher only, 2 s gap between plays), or the 0.1 synth tune |

  The route (power on, wait out the intro, the title's debug code, "Start Debug Game", open the inventory and the
  Dance Menu) is checked at each step by RAM/VRAM fingerprints; if anything doesn't match, the menus keep the 0.1 look.
  It never touches your save. Menus are drawn at Game Boy scale (144 lines landscape, 160 columns portrait) in the
  game's own colours (GBA mode and colour correction included). SYSTEM > MENU STYLE switches back to the 0.1 look;
  REBUILD MENU ART runs the extraction again.
- **0.2: battery saves persist.** The game's own save (SRAM) is loaded from `files/shantae.srm` at start and written
  when it changes (checked every 10 s), on pause, quit and exit. 0.1 kept only save states.

## Screens
| Setup | What happens |
|---|---|
| Surface Duo, app spanned | Game on one screen, Link on the other, split at the hinge. |
| Device with a second display | Link goes to the second display as a Presentation. |
| One screen | Game with borders themed from the area's own tiles (per area and day/night). Hearts, gems, lives and the day/night clock in the borders. Link via Pause > LINK SCREEN or Settings > LINK SIDE PANEL. |
| Anything else | Settings > SCREENS > SPLIT: SIDE BY SIDE / TOP + BOTTOM (+ HINGE GAP), SWAP SCREENS. |

## Controls
Touch pad (AUTO/ON/OFF, opacity), controllers with rebinding (Settings > CONTROLS > CONTROLLER BUTTONS).
**SELECT+START** or Back opens the pause menu. MENU, FAST, SAVE, LOAD, TURBO A/B can be bound.

## Settings
DISPLAY (shape, integer scale, colours GBC LCD / VIVID, frame blend, borders, FPS), SCREENS, CONTROLS, SOUND,
GAMEPLAY (NO SLOWDOWN, GBA MODE), SYSTEM (change ROM, skip launcher, menu style, rebuild menu art, version). The Konami code on the launcher shows
or hides PLAYTEST CODES (infinite hearts/gems, all items, all dances, +heart, squids, lives, and 0.10's ROOM WARP: pick
any of the 68 places the game itself can start at, grouped as towns, overworld, labyrinths, caves and story scenes;
the game loads it like resuming a save there, your save and items untouched; and 0.11's 3D VIEW: level rooms drawn in
3D on the main screen, solid ground as blocks, crates and ledges as boxes, scenery on a back wall, sprites on a plane in
front and the status bar flat at the bottom. 3D CAMERA picks FLAT, TILT, LOW, SIDE, HIGH ANGLE, CLOSE (follows Shantae)
or CYCLE ALL; tapping the picture also steps through them when the touch pad is hidden. Anything that isn't a level
room (menus, maps, the title, fades) shows the normal 2D picture).

- **NO SLOWDOWN** (on by default): memory accesses cost 2 cycles instead of 4, so the CPU runs twice as fast relative
  to video, sound and timers. OAM DMA keeps normal speed (games time it with a cycle-counted wait loop in HRAM).
  0.18: HBlank DMA keeps normal speed too. Shantae streams next frame's sprite tiles with an HBlank DMA (FF55 bit 7,
  ~80 lines) started in vblank; at double speed the main loop reached its next DMA before that one finished, so half-
  written tiles showed as white/garbled patches (file select, cutscenes, big sprites). No dropped VRAM or palette
  writes were involved (`drive`: `drops` prints both counters). Still about twice as many frames with input in the
  heaviest spot tested (317 vs 160 of 600).
- **ALL SPRITES** (0.17, on by default): the GBC draws at most 10 sprites per line (the first 10 in OAM order).
  Busy scenes in Shantae (the Risky Boots fights: cannonballs, Tinkerbats, Risky) put up to 15 on a line, so pieces
  vanish on alternate frames. With this on, gambatte-dual.patch records every line's sprites when mode 3 starts and
  `gbx_draw_overflow()` draws the ones past the 10th into the finished frame (under the line's own sprites, with CGB
  BG priority). PPU timing is untouched, so the game runs identically either way (checked in
  the driver: same frames, only the extra sprite pixels differ). `drive`: `opt dual_sprite_limit off|on`.
- **GBA MODE** (on by default, applies after RESET or a new start): Gambatte's GBA hardware mode, the game's own
  "GBA ENHANCED" mode: brighter colours and the Tinkerbat transformation.

## Link screen (from RAM, see SHANTAE-RAM.md)
- 0.45: with WIDE VIEW on, Water Town Gates had no way out and no way into the town (also Oasis, Zombie Caravan and Bandit Town gates, Dribble Fountain and one more room lost objects). The wider spawn window is now capped at 256 pixels: the game only reads the object lists of the screen columns the window's edges fall in, and wider than one column it could skip the one in between. Enemies now appear 40 pixels past the normal screen. `tests/spawntest.py` checks every place.
- 0.44: FRAME BLEND removed: every frame the game draws is complete, so blending only ever added ghosting, and it broke up big sprites at WIDE VIEW's join.
- 0.43: WIDE VIEW is now one picture, drawn the way the Shantae recomp draws its wide view: from the game's own sprite list as it builds it, the scroll as the game really committed it, and objects drawn into the background (rocks, blocks, gates), which used to appear only once on screen. Rooms stop at their real edges and towns wrap. The drawing is adapted from github.com/vibecodekun/shantaerecomp, PolyForm Noncommercial 1.0.0 (`app/assets/licenses/wide-view-LICENSE.txt`): this app stays noncommercial.
- 0.42: SINGLE SCREEN layout (Settings > SCREENS > LAYOUT): the game fills the screen, and an arrow on its right edge, or the new LINK PANEL button (L1), slides the Link page in over it. Even with a second screen connected.
- 0.41: the vertical line through big sprites at WIDE VIEW's join while scrolling: sprites in the strips were 2 frames ahead of the real picture and now match it.
- 0.40: even steps while scrolling: pictures reach the screen one per refresh, oldest first (FrameQueue), instead of only the latest, which gave a double step then a hold.
- 0.39: WIDE VIEW's strips now follow FRAME BLEND. With it on, the middle doubled as it scrolled while the strips stayed sharp and half a frame ahead, which broke the join.
- 0.38: tearing with WIDE VIEW while scrolling: the emulation thread no longer writes the bitmaps the screen draws from. It hands over finished pixels and the UI thread copies them just before drawing.
- 0.37: WIDE VIEW (Settings > DISPLAY, on by default): on a screen wider than 10:9 the level continues beside the real picture, up to 64 Game Boy pixels each side (48 on 16:9), and enemies show up there before they reach the normal screen. The game runs as usual: the strips come from the level data in the ROM with the live tiles and colours, and from each object's sprite cels (`native/wide.c`). The one change to the game is its spawn window, widened to match by two bytes in the emulator's copy of the ROM, so objects start acting a little earlier; turning WIDE VIEW off puts it back. Past a room's end the borders show as before. `tests/widetest.py`.
- 0.36: new launcher icon (the user's Pixel Icon Lab export): adaptive, round and themed (monochrome) versions.
- 0.35: the 3D VIEW's level engine reworked after a sweep of all 68 places. Collision codes are now read for what they are: real ramps for 45 degree and shallow slopes and slanted ceilings instead of cubes; climbable trunks and pillars as shallow boxes; cactus and icicles as cut-out cards; invisible walls no longer stand up as tall slabs; a tree's branches stay part of the leaves, not stacked boxes. Top faces are one colour along a run (no zebra stripes), side faces one flat colour (no black streaks). Towns get a floor. Tiles the game draws into the BG map itself show on the sprite plane. `tests/view3dsweep.py` (all places, every camera) and `tests/view3dsamples.py`.
- 0.34: the DANCES pop-up says "TAP TO AUTOMATICALLY PERFORM:" (two lines where it doesn't fit).
- 0.33: auto dance: tap a learned dance in the DANCES pop-up (Select or the note button) and the app dances it: Select, then each input on the beat (frame 18 + 64k after Select, played on the game's own frames through N.input, so fast-forward keeps time). Shantae Dual only; tests/dancetest.py taps every row and plays the result on the driver.
- 0.32: Shantae is back on the SHANTAE tab (gone since 0.28), built from the ROM: the inventory's left panel (BG map 7A:7C72) and her sprite cels in bank 7B (body, face, hair, and each Fighter's Gear piece, faint until bought; OBJ palettes 7B:427A).
- 0.31: the item, stone, talisman, squid and firefly icons are built from your ROM at start (the inventory screen's LZSS tilesets 7A:6515 / 7A:7113 and its BG palettes at 7A:7C30), so they are all there from the first boot, unowned ones faded. No more opening the game menu once for icons; OPTIONS > FORGET ICONS is gone.
- 0.30: PROGRESS > MONSTERS is back: 46 enemies (names checked by the user), each lit up the first time it's on
  screen. Pictures are decoded on the page from your ROM (one sprite cel per enemy), in the colours of the area where
  you met it (the game's palette copy at $C400, saved when met; a night copy is replaced by a day one later). Unmet
  entries show where to find them. MONSTERS MET is back on the ending card. Nothing is captured on first start, so the
  extraction is unchanged. Works in Shantae Link (RetroArch) too, once rebuilt.
- 0.29: item icons on the SHANTAE tab are only copied from the inventory screen once its colours have settled
  (bright, and the same as at the page's last look). 0.28 could copy them while the screen faded in and keep them
  black. Icons are kept under a new key, so they're copied once more the next time the inventory is opened.
  `tests/icontest.py` plays the fade and checks every stored icon is a real frame of the open inventory.
- 0.28: the game-styled menus are gone. The launcher, pause menu and Link page all use the plain look (as Shantae
  Link does); SYSTEM > MENU STYLE and Shantae drawn in her gear on the SHANTAE tab went with them. First start only
  records the title theme now (about half the time; SYSTEM > RECORD TITLE MUSIC redoes it); updating re-records it once
  and deletes the old menu snapshots. Item icons still come from the in-game inventory screen the first time it's open.
- 0.27: the bestiary is gone (PROGRESS > MONSTERS, its first-start capture, "monsters met" on the ending card): too
  many monsters were missing or badly pictured in playtesting. First start is quicker (the extraction stops after the
  menus); an existing beasts.bin and the stored pictures (localStorage `sd.mon1`) are deleted. The research stays in
  SHANTAE-RAM.md ("Monsters", "Bestiary capture") and the code in git history (0.26).
- PROGRESS (0.20, was 100%): ITEMS (the old checklist), STORY (the next step from the stones and transformation dances
  she has, hidden until tapped), STATS (play time from the game's frame counter $C377 in play, gems earned/spent, items
  used, hearts lost, times down, dances, nights; counted on this device, a counter jump = a load and isn't counted;
  RESET with a second tap).
- Boss bars (0.20): Risky's ship fight (map $03): Tinker ship HP = node $D276 +$64 ($D2DA, 10 by day), Risky = node
  $D0FC +$63 ($D15F, shown once it drops below 64). Shown only while the node runs the boss's script (bank $1A).
- Night notes (0.20): a moon button on the map opens a card: time to dusk/dawn, double enemy health at night,
  fireflies here (dim on the map by day), the Zombie Caravan only at night.
- 0.26: FF button at the bottom right of the Link screen's tab bar (as in Xenogears Dual): tap toggles the emulator's
  fast-forward (about 3x, sound off), gold while on. The FAST key still works while held. `LinkBridge.ff(mode)`:
  -1 reads, 0 off, 1 on, 2 toggles. Hand-off notes for continuing in Claude Code: CLAUDE.md.
- 0.25: adaptive launcher icon (res/mipmap-anydpi-v26: night-purple background with sparkles to the edges, the two
  screens as the foreground inside the safe zone; made from the pixel-art icon by tools/icon/adaptive.py, older
  Android keeps ic_launcher.png). The map's TO COLLECT HERE card says fireflies are night only (out now / in m:ss).
  The signpost list scrolls by dragging (pixel offset, position bar) instead of paging on a tap.
- 0.24: the night card opens from the map title's timer ("DUSK IN 1:59" / "DAWN IN …" after a sun or moon); the moon
  side button is gone. Monster names: Clump and Scarecrow were swapped, and so were Spider and Bat.
- Bestiary pictures (0.24, removed in 0.27): first-start extraction (native/extract.c, GBX_BEASTS → beasts.bin) captures every monster
  once in daylight: from one saved moment of the debug game, warp to the area (day time poked first), put Shantae at a
  planned spot, remove every other object (some enemies keep them: drawn by a helper object), watch 75 x 4 frames and
  keep the frame where the enemy shows the most sprites. The table (map id, Shantae x/y, the enemy type's script range)
  is native/beasts.h, made by tools/re/beast_plan.py with the driver's `beast` command (the same C code) from the
  extraction's own state (`exbase`). monsters.js cuts the picture by tools/re/beastcut.py's rule. 32 of 35 entries are
  captured; Snake, Giant Snail and one Cackle Mound creature never show in a capture and still get a live picture
  when met. ASSET_VERSION 2 re-runs the extraction once. tools/re/beast_sheet.py draws the pictures with their names.
- Map fix (0.23): a new game starts at Shantae's lighthouse (map $00), whose region (51:4F) also holds Risky's ship fight
  and the credits. The map used the lighthouse's 3072x1008 room header as a "bigger room" and drew the other scenes'
  level data with the lighthouse's tiles under it (a second lighthouse, blank blocks). Regions listed in world.js
  `ALONE` now show only the room she's in, and the lighthouse and the ship are named. The dance list counts 11 dances
  once Tinkerbat is learned outside GBA mode (was "11 OF 10").
- Ending card (0.22, as Metroid Dual's mission report): while the credits roll and on THE END after them (node 0/1
  script PC in bank $1C at $7040 or above; the ending's talk before them runs in bank $16) the whole Link screen shows
  QUEST COMPLETE: the real date and time, play time (the Link's own count, see STATS), completion %, the six
  collection counts, times down, DEV CODES USED if any were, and a signature field you draw your name in
  with a finger (CLEAR / SAVE). SAVE keeps the run with the signature as a small PNG in localStorage `sd.hall` (last 20;
  nothing shows the list yet). The game itself saves nothing at the end (SHANTAE-RAM.md, "Defeat and ending").
- SHANTAE (0.9: STATUS and ITEMS in one tab; the left panel in wide landscape): quarter-accurate hearts and gems,
  time to dusk/dawn, the 12 items as icons with counts (tap one to equip it; the equipped one is named with what it
  does), stones and talismans in one row, Fighter's Gear, and squids still to hand in. Lives, the equipped-item block
  and the collectible counts (all on the 100% tab) were dropped. 0.16: once the game's menu has been opened (the
  icon kit), the tab draws Shantae as the inventory screen does (BG region cols 1-9, rows 1-17 plus her sprites), with
  each Fighter's Gear piece drawn on her where it goes (the inventory sprites after the first 9 non-skin ones, sorted
  by position: tiara top, boots bottom, cuff left, sash middle) and missing pieces faint; items, stones, talismans,
  squids and fireflies use the game's own icons beside her. Without the kit it falls back to the plain layout.
- DANCES (0.15: no longer a tab): pressing Select in play (which starts a dance) pops the list up over the pane: every
  dance with its inputs, learned ones lit (Tinkerbat shown in GBA mode). It closes when Shantae moves (the dance ended,
  she transformed or warped), after 20 s, or on a tap; the note button beside the gear opens it by hand.
- MAP (0.3): the whole room you're in, drawn from the game's level data in your ROM with the tiles and colours in
  VRAM (so day/night and GBA colours match), unexplored parts included. Long rooms show as one strip that follows the
  game camera, with a gold bar under it for where you are in the room (0.8; 0.3-0.7 folded them into rows).
  A blinking dot is Shantae, a box is what the game screen shows. In places made of several rooms (labyrinths) ALL
  ROOMS HERE shows every room of the region on its grid with the current one lit. SIGNPOSTS switches to the 0.1 list
  (the game's own signposts: every area with its West and East neighbours). Before drawing, the map checks the level
  data against the BG map under the camera, so it waits rather than drawing with the wrong tiles. Format: SHANTAE-RAM.md.
  0.4: heart holders, fireflies, baby squids and talismans in the room are marked (grey once collected, from the
  game's own flags) and counted under the map. 0.5: the area's name, where its edges, doors and caves lead (cave
  mouths and ladders are numbered on the map), from `assets/link/world.js` (SHANTAE-RAM.md, "Areas and links").
  0.6: towns. On a town street the map is the whole street (it wraps) with each door numbered, the door Shantae is
  standing at lit, and a DOORS list with every door's name (read from your ROM) and the gates in teal. Inside a
  building the title is the town and building, and the same list shows which door you came through
  (SHANTAE-RAM.md, "Towns").
  0.7: labyrinths. The map marks where you came in (EXIT, with where it leads under the map) and the Guardian Genie
  (G); Dribble Fountain is drawn from its own region (0.5 had mixed it up with Risky's island hideout), so its five baby
  squids now show too. 100%: squids are counted from the game's own pick-up flags, per labyrinth
  (SHANTAE-RAM.md, "Labyrinths").
  0.8: the map polls every tick (was every other), draws a big room's screens around the camera first and the rest on
  the next poll, copies whole metatiles instead of single pixels, only redraws for day/night when the colours really
  changed, keeps itself up to date on the other tabs, and does the one-time ROM scan in small steps instead of before
  the first map. The opening stage is named (Scuttle Town). `tests/linktest.py --time` prints update and render times.
  0.9: tap the map to zoom x2, x4 and back (it keeps following the camera; a tag shows the zoom). Zoomed in, heart
  holders, fireflies, squids and talismans are drawn with the game's own inventory icons (16 px, faded once
  collected). The zoom level is remembered.
  0.14: the map's title is followed by the time to dusk/dawn; ALL ROOMS HERE draws only the rooms (the space between
  them stays black). OPTIONS moved off the tab bar to a gear at the top right of the panel (tap it again to go back).
  0.13: a picture is only drawn and kept once VRAM really holds the room's graphics: each picture records a hash of
  every 8x8 tile it used; it's drawn from settled colours (not a fade, not the all-white flash of a respawn), kept when
  those tiles are the same in the next poll and not blank, and redrawn when most of them stop matching. 0.12 could draw
  and store a room while it was loading (a flat-coloured map after respawning, garbage around cutscenes). Old pictures
  are discarded. Zoom: x1, x2 and ALL (x4 removed); ALL is at the x1 scale and stays wherever you drag it; x1 and x2 can
  be dragged too and drift back to the camera after a few seconds. The side buttons are bigger (34 px, 2x icons).
  0.12: maps are kept. Each room is drawn once into palette bytes and coloured from them, so fades, day/night and
  GBA colours are a quick recolour (0.11 only rechecked colours every 4 s, so a new room sat dark for seconds). The
  bytes are stored per room (gzipped in IndexedDB, or localStorage where the WebView has no IndexedDB): a room you've
  been in appears the moment you enter it, in the colours it had last time, even after a restart; entering a region
  also draws its other rooms in the background. The snapshot the map reads is now 6 times a second (was 3), and the
  VRAM check uses the snapshot's own scroll, so it no longer fails while walking. Layout: the map fills the pane (named
  after the place); tap cycles the zoom (0.13: x1, x2, ALL). Details moved to pop-up cards from buttons down the map's left edge
  (as in Xenogears Link): where the place leads, the town's doors, what's here to collect, all rooms of a labyrinth,
  and signposts. Tap a card to close it. `tests/maptime.py dir` replays a run of dumps the way the app feeds the map
  and prints what it shows each tick (`--passes 2` = again after a reload, `--no-idb` = the localStorage path).
  0.11: the blinking dot is on Shantae (it sat about 26 px left of and 40 px above her: $CB43/$CB45 aren't her
  sprite's middle; SHANTAE-RAM.md, "Level data").
- 100%: completion and per-category counts with location hints, paged.
- OPTIONS (0.14: the gear at the panel's top right): save slots (shared with the pause menu), pause (and forget icons, 0.1 look only).
- With the extracted pieces the Link page uses the Dance Menu's bars and framed panels on the blue swirl.

## Shantae Dual Recomp (alpha)
A second APK, "Shantae Dual Recomp X.Y.apk" (package com.jack.shantaedual.recomp, version `ALPHA` in MainActivity.java): the
same app on the static recompilation at github.com/vibecodekun/shantaerecomp instead of gambatte. Details, license and
how to build: `native/recomp/README.md`. The picture is the world itself as wide as the screen, not side strips.
Noncommercial license, and the library is the game's code translated by machine: for private testing, not public downloads.

## Build
```
bash tools/setup_toolchain.sh      # bionic headers + stub libs + compiler-rt + libc++ headers; clones gambatte, applies the patch
ANDROID_JAR=... bash tools/build_apk.sh   # -> out/Shantae Dual <ver>.apk
```
apt: clang lld llvm aapt zipalign apksigner dalvik-exchange openjdk-17-jdk-headless. android.jar API 33
(github.com/Sable/android-platforms, android-33). Keystore: `tools/shantaedual.keystore`, its password in `tools/shantaedual.keystore.pass` (neither is in git; a build without them makes a new key, which can't update an APK signed with the old one).
`out/libcxx/include` holds the two generated libc++ config headers (`__config_site`, `__assertion_handler`).

## Test
- `make -C native TARGET=host GAMBATTE=... host` -> `out/host/drive rom script` (run/tap/shot/dump/save/load/peek/poke,
  `oc 0|1`, `opt key value`, `trace lo hi max file` (writes with PC, bank, HL, stack), `pctrace file max` (every opcode),
  `trace` lines end with `svbk=` (the WRAM bank at the time of the write),
  `extract dir` (the first-start extraction; `GBHW=GBA|GBC` env picks the hardware mode), `sramsave/sramload path`).
- `tests/menutest.py`, `tests/linktest.py`: render the pages in headless Chromium with a mock Host/Native fed from dumps
  (`linktest.py --kit DIR` adds extracted snapshots, `--ls key=json` presets a stored setting). `tests/menukit.py [GBA|GBC] [outdir]`: the menus with the
  snapshots from `drive extract` (renders contain game art: for checking only). `linktest.py --standin` draws the
  MAP tab with placeholder tiles and no ROM font, for sharing. `tests/preview.py`: the same layouts
  with `tests/standin_kit.js` placeholder pieces and a system font, safe to share.
- `tests/view3dtest.py out dump...`: the 3D view in headless Chromium (SwiftShader WebGL) fed from driver dumps, one
  screenshot per dump (`--cam NAME|CYCLE`, `--rep N` feeds each dump N times, `--stats` prints on/off, the slice and
  per-frame times). Renders contain game art: for checking only.
