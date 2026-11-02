# Shantae Dual 3DS (0.13-alpha)

0.13-alpha (Nov 2 2026), after the device's timing line at OLD 3DS SPEED read GB 24.0 TOP 3.6 LINK 4.8 MAX 52.1 ms:
- The Game Boy frame alone is over 16.7 ms at 268 MHz without the L2 cache, so FRAME SKIP can only get ~41 game fps
  (the "40ish" seen) and the music stays slow; the core itself has to get faster.
- **Core:** `gambatte-dual.patch`'s NO SLOWDOWN macro `GBX_M` read the global `gbx_overclock` and both DMA states on
  every emulated memory access, even with the overclock off. `CPU::process` now reads it once (`gbxOc`) and the DMA
  check only runs with the overclock on. Same RAM as before after 1200 frames with `oc 0` and `oc 1` (driver). The
  Android build gets it too (same patch).
- **The core at -O3** (`CORE_OPT` in the Makefile; the rest stays -O2).
- Azahar GB ms per frame (counts instructions, not the device's cache stalls): 11.3 before, 10.9 -O3, 10.4 the macro,
  **9.7** both. The sinc vs cc audio resampler made no difference (11.3 / 11.6).
- **Target: the New 3DS** (the user's call). The old 3DS is best-effort: playable with FRAME SKIP, below full speed.
  Not pursued: the Link screen and drawing on the second core (~8 ms, still not enough), profiling gambatte on the
  device, a faster GBC core.

0.12-alpha (Nov 2 2026):
- **Why OLD 3DS SPEED showed exactly 30:** the loop runs a Game Boy frame, draws, then waits for the screen's next
  refresh. A loop a little over 16.7 ms misses the refresh and waits for the one after, so every frame takes two: the
  game (not just the picture) runs at half speed.
- **Timing** on the SETTINGS page's bottom line (from the second before the menu opened): `GB` a Game Boy frame,
  `TOP` the top screen (picture, borders, cache flush), `LINK` the Link screen's work and drawing, both per shown
  frame, and `MAX` the slowest loop (includes the 10-second file writes). Gold when GB + TOP + LINK is over 16.7 ms.
  The title bar shows "60 FPS, 30 SHOWN" when fewer pictures are shown than frames run.
- **FRAME SKIP** (SETTINGS > SYSTEM; acts only at the old 3DS's speed, OLD 3DS SPEED or a real old 3DS): each loop
  runs the fewest N Game Boy frames that fit in N refreshes, from running averages of the costs (1 ms spare, up to 4),
  and shows the last, so the game and music keep their speed. Off by default.
  - First try (paying back the frames owed since the last loop) locked in at 20 shown after the menu in Azahar:
    3 frames take 3 refreshes, which owes 3 again. The rule was simulated (a 59.83 Hz screen, +-15% cost noise) before the rewrite:
    13 + 4.5 ms is 30 game fps without skip, 56 with it (29 shown); 15 + 4 ms 30 -> 55 (16 shown).
- **Tested:** `linkhost` (env `MS=drawn,gb,top,link,max` fakes the timing line): the three SYSTEM rows, the button
  rows, a 0.11 file (frame skip off). Azahar in New 3DS mode with both on: 55 shown as without it, timing line
  GB 11.3 TOP 1.5 LINK 0.5 MAX 18.6 (Azahar's numbers, not the device's). The 0.11 setting carried over.

0.11-alpha (Nov 2 2026):
- **OLD 3DS SPEED** (gear menu > SETTINGS, the SYSTEM box under BORDERS): on a New 3DS, runs the CPU as an old 3DS
  does, for checking that the app keeps up there: `osSetSpeedupEnable(false)` (268 MHz, no L2 cache) and NO SLOWDOWN
  off. It takes effect at once and is kept in `shantae-link.cfg` (0.10's file still loads, with it off). The New 3DS's
  124 MB memory mode and its extra buttons stay. An old 3DS shows "NEW 3DS ONLY".
- **Tested:** `linkhost` (env `PREFS=file` loads and saves a settings file, `O3DS=1` draws the menu as on an old 3DS):
  the toggle, saving it, loading a 0.10-size file, BORDERS and the button rows on the re-laid-out page. Azahar in old
  3DS mode ("NEW 3DS ONLY", tap ignored) and in New 3DS mode (the toggle turns ON). Azahar doesn't emulate the clock
  change, so the slowdown itself is only seen on the device.

0.10-alpha (Nov 2 2026), from the Android app (map.js cards, link.js boss bars):
- **Map cards:** buttons down the MAP's left edge with an icon and a count; tap one for its card over the map, tap the
  card or the button again to close it.
  - **WAYS:** where the room leads (left/right edges, caves, doors, a labyrinth's EXIT, a Guardian Genie). The world.js
    tables are in `linkscr.c` (`worldRoom`, `worldLinks`).
  - **DOORS** (town streets and buildings): the town's doors with their names from the ROM's label tables; the door she
    stands at ($CBD6) is lit, the gates are teal.
  - **ITEMS:** heart holders, fireflies, squids and talismans here, left / all got, with the night-only note.
  - **ROOMS:** all the rooms of the region (caves, Eagle/Naga/Snail Wasteland ...) drawn from the level data with the
    tiles in VRAM a slice a frame once the room she's in is checked, hers bright and the rest dimmed.
  - **SIGNS:** the signposts read from the ROM ("Welcome to ...", $A5F00), chained east, dragged to scroll.
  - **NIGHT:** tap the dusk/dawn timer in the title bar: time to night or dawn, double health at night, fireflies here.
  - On the map: town door numbers, cave numbers, EXIT and G tags (the game's font has other symbols at `<`, `>` and `=`,
    so arrows are drawn).
- **Boss bars:** the Tinker ship and Risky Boots in the ship fight (map $03), on every page above the tabs.
- **Settings page** (gear menu > SETTINGS, which replaces the BORDERS button): BORDERS ON/OFF, and the buttons for Game
  Boy A, B, Start, Select and fast-forward. Tap a row, press the new 3DS button (A B X Y L R ZL ZR START SELECT); a
  button already in use swaps over. DEFAULTS puts them back. Kept in `shantae-link.cfg` (0.9's file still loads). The
  D-pad, L+X / L+Y and Start+Select (quit) stay as they are; while L is held, X and Y don't reach the game.
- **Tested:**
  - `linkhost` (new steps `m:X,Y` menu tap, `k:N` button press; env `MENUTAPS`): every card on Scarecrow Field, Scuttle
    and Water Town, a cave, Eagle Wasteland and the Golem Mine; sign scrolling; boss bars from a ship-fight state made
    with the driver (`warp 03`); binding and swapping, DEFAULTS, BORDERS.
  - Azahar: the MAP tab and a card, the menu's SETTINGS page waiting for a button, and a 0.9 `.cfg` loading.
  - Not tested: the new buttons on hardware (an emulator's buttons can't be driven headless), boss bars in Azahar.

0.9-alpha (Nov 1 2026), from the Android app's Link page:
- **PROGRESS > ITEMS / STORY / STATS** (link.js drawProgress):
  - **ITEMS:** the completion checklist.
  - **STORY:** the stones and the step of 9, and a hint for the next step, hidden until tapped.
  - **STATS:** play time, gems earned and spent, items used, hearts lost, times down, dances and nights. They're counted
    as on Android, from the game's frame counter `$C377` (a jump over 600 frames is a load and isn't counted). RESET
    asks "SURE?" first, and the date counting started is shown.
- **Borders setting:** BORDERS ON/OFF in the gear menu. Off leaves the sides of the top screen black.
- **Ending card** while the credits roll (node 0/1 in bank `$1C` at `$7040`+): the date and time, play time, completion,
  the checklist and times down. Sign it with the stylus; SAVE appends it (date, numbers, the signature as bits) to
  `shantae-endings.bin`. CLEAR wipes the signature.
- **Files** next to the ROM: `shantae-link.cfg` (the setting, the PROGRESS view, the stats; written every ~10 s, on
  opening the menu and on quit), `shantae-endings.bin`.
- **Tested:**
  - `linkhost`: each view, RESET's confirm, and the ending card from `after_end.st` signed with pen strokes (`w:`
    steps) and saved.
  - Azahar: BORDERS OFF from the menu, STATS counting in play (time, hearts, a dance), and the saved `.cfg`.
  - Not tested: the ending card in the real frontend (it needs the credits).

0.8-alpha (Nov 1 2026):
- **Menu (gear, top right of the touch screen):** pauses the game and shows three state slots side by side, each with a
  picture of the game when it was saved and the place, SAVE and LOAD (greyed when empty), and RESUME and QUIT. B, Start
  or the gear also resume. The slots are `shantae.st1`-`st3`, each with a `shantae.th1`-`th3` (picture and place), next
  to the ROM. Slot 1 is the old single state, and L+X / L+Y still save and load it. The FPS shows in the menu's title bar.
- **Borders hold still:** the theme is picked once per map section (region, map and day or night), about 1 s after
  arriving so it isn't caught mid-fade, and kept until the section changes. Before, it followed the most common tile on
  screen and changed as the game scrolled.
- **Tested:**
  - `linkhost`: the menu taps, and the border unchanged across 700 frames of walking in three sections.
  - Azahar (`test/build_test.sh DIR SCRIPT`, a script of taps): open, save slot 2, resume, walk, reopen, load; she's
    back where she was saved.

0.7-alpha (Nov 1 2026):
- **CIA crash fix:** the installed CIA died on a real 3DS with a data abort (translation fault). `cia/shantaedual.rsf`
  had no `IORegisterMapping`/`MemoryMapping`, so the DSP memory NDSP writes to (`1ff00000-1ff7ffff`) wasn't mapped.
  The .3dsx never hit it because it runs inside a host title that has those mappings, and Azahar doesn't enforce them,
  so it's only checkable on hardware.
- **Banner:** silent, and only thick 3D pixel text, "SHANTAE / 3DS MOD", with a transparent background. The HOME
  Menu icon is unchanged.
- **Borders:** place names are kept to lines of 8 letters (up to 3), so they stay off the game's frame. Long words
  are split ("SCARE-" / "CROW", "LIGHT-" / "HOUSE", "WATER-" / "FALL", "WASTE-" / "LAND"). On the left, the
  9-letter labels became "ALL / FOUND" and "FLIES / AT NIGHT".

0.6-alpha (Nov 1 2026): **a .cia as well as the .3dsx.**
- **Build:** `bash native/ctr/cia/build_cia.sh`, after the `make`. It needs makerom 0.19.0 (3DSGuy/Project_CTR) and
  bannertool 1.2.3 (carstene1ns/3ds-bannertool), unpacked in `/home/claude/work/ctr/tools` (the `makerom-bin` and
  `bannertool-bin` links).
- **Title:** `000400000F5D3100` (homebrew range), spec in `cia/shantaedual.rsf`: SD card access, New 3DS 804 MHz +
  L2 cache, and the 124 MB mode on a New 3DS.
- **HOME Menu icon and banner** (`banner/make_art.py`): an original pixel wordmark ("SHANTAE" / "DUAL", gold to
  orange with a purple outline and shadow) on a night sky with sparkles, a crescent moon and a gold flourish. It's
  drawn letter by letter, with no game logo, font or art.
- **Banner sound** (`banner/render_jingle.py`): the first 2.9 s of "Sequin Nights", the Android launcher's original
  tune (`assets/menu/music.js`), rendered offline in headless Chromium and faded out.
- **ROM location:** an installed CIA has no folder of its own, so it looks in `sdmc:/3ds/` (shantae.gbc, or any .gbc
  that is Shantae (USA)) and then `sdmc:/3ds/shantae-dual/`.
- **Tested in Azahar:** `azahar -i` installed it; booting the installed title found the ROM in `sdmc:/3ds` and
  reached the title screen with the Link screen.
- **Not checked:** the HOME Menu icon, banner and sound (Azahar boots the title without a HOME Menu), and
  installing it with FBI on a real 3DS.

0.5-alpha (Nov 1 2026):
- **Where the ROM goes:** the same folder as the .3dsx (`argv[0]` from the Homebrew Launcher). The app looks for
  `shantae.gbc` there, else any `.gbc` there that is Shantae (USA) by CRC32 (so `Shantae (USA).gbc` works as it is),
  then the old `sdmc:/3ds/shantae-dual/`. Without a path in `argv[0]` (some loaders, Azahar) it looks in `sdmc:/3ds`.
- `shantae.srm`, `shantae.st1` and `shantae-icons.bin` are written next to the ROM it found. An `icons.bin` from
  0.2-0.4 isn't read: the icons are captured again the next time the inventory is open.
- **Tested in Azahar:** with no ROM it names the folder it looked in; `Shantae (USA).gbc` in that folder, with the
  old folder moved away, was found by its CRC and booted.

0.4-alpha (Nov 1 2026):
- **Left border:** shows what's still to find in this room: heart holders, fireflies, squids and talismans as
  found/there (from the map's object lists and the game's collected flags), with the game's icons once captured and
  drawn shapes before. It reads NOTHING TO FIND or ALL FOUND, and FIREFLIES AT NIGHT by day.
- Hearts, gems and lives came off the border (0.3): the game's own status bar shows them.

0.3-alpha (Nov 1 2026):
- **Map zoom and drag:**
  - Tap the map to cycle x1, x2, ALL; the level shows in the map's corner.
  - Drag with the stylus; x1/x2 drift back to the camera ~4 s after letting go, and ALL stays where it's left.
  - Taps act on release without movement, so a drag never switches a tab or equips an item.
- **Top-screen borders:** a port of BezelTheme.java.
  - The 80 px each side is the most common textured background tile on screen, darkened, so it follows the area and
    day/night.
  - The game is framed in that palette's darkest and brightest colours.
  - The right border shows the place (two lines of 10) and the time to dusk or dawn.
  - The borders are redrawn only when the area, the time of day or what they show changes.
- **Tested:**
  - `linkhost`: zoom levels, drag and drift back; borders for the lighthouse, a cave, Scarecrow Field at night,
    Golem Mine and Water Town; the left border's counts in Scarecrow Field (1 heart holder, 1 firefly, 1 talisman)
    and Golem Mine (2 squids).
  - Azahar (`TOP=` output, test script with taps and a drag): the borders and every zoom level in play.

## 0.2-alpha

0.2-alpha (Nov 1 2026):
- **Inventory icons:** copied from VRAM the first time the in-game inventory is open (same screen fingerprint and
  2x2 blocks as link.js), kept on the SD card in `icons.bin`, and shown on the SHANTAE page (items, stones,
  talismans) and on the map close up.
- **MAP tab** (`linkmap.c`, a C port of map.js steps 1-2):
  - the room you're in, drawn from the level data in the ROM with live VRAM tiles and the game's colours
  - the box for what the game screen shows, Shantae's blinking dot, and the position bar
  - heart holders, fireflies (dim by day), squids and talismans, grey once collected; Guardian Genies
  - a new room is drawn about 600 metatiles a frame, so entering one doesn't stall the game
  - pictures are kept as palette bytes (fades and day/night recolour for free); the last 6 rooms stay in memory
  - Android's checks before keeping a picture, ported: BG map vs level data, settled colours, tiles not blank and
    the same a moment later
- **Fix:** in the game's menus (inventory, Dance Menu) the map keeps the room's own colours instead of taking the
  menu's palettes.
- **Tested:** `linkhost` on driver states. The collectibles match the table in SHANTAE-RAM.md (Scarecrow Field:
  talisman 4, firefly 1, heart holder 2; Golem Mine: squids 7 and 10), and the map is pixel-identical after a trip
  through the menus. Azahar ran the MAP tab in play.
- **Not yet:** map cards (ways out, doors, signposts, all rooms, night card), zoom and drag, rooms remembered on the
  SD card across restarts.

## 0.1-alpha

A native Nintendo 3DS homebrew app (`.3dsx`, Homebrew Launcher):
- **Top screen:** Shantae (USA) on the same patched gambatte core as the Android app (`../gbcore.c` +
  `gambatte-dual.patch`).
- **Bottom touch screen:** a Link screen in C (`linkscr.c`).

No game data ships. The player puts the ROM at `sdmc:/3ds/shantae-dual/shantae.gbc`, and the battery save
(`shantae.srm`) and the state (`shantae.st1`) are written next to it.

Status (Nov 1 2026):
- **Tested on the desktop:** the Link screen, in the real core with driver states (`linkhost`, below).
- **0.1-alpha built:** `Shantae Dual 3DS 0.1-alpha.3dsx`, devkitARM GCC 16.1 + libctru. It's clean at `-Wall
  -Wextra`; the 1.5x scaler uses lookup tables because the ARM11 has no divide instruction.
- **Runs in Azahar 2126.2** (headless: `test/azahar_shot.sh` + `test/build_test.sh`). It boots, loads the ROM from
  the SD card and plays from the title into the lighthouse opening and the docks. The Link screen follows live
  (place, dusk timer, hearts, items). The PROGRESS and SHANTAE taps switch pages, Select in play pops up the dance
  list, and fast-forward runs. Sheet: `Renders/3DS 0.1-alpha Azahar test (scripted play).png` (game art, desktop only).
- Azahar's keyboard input can't be driven headless (X keys never reach it, even with a window manager). The test
  build (`CTR_TEST`) plays buttons, taps and fast-forward from a compiled-in script, so the 3DS button-to-Game-Boy
  mapping in `main.c` is the one part only real hardware checks.
- **Checked on a New 3DS (0.9-alpha, Nov 2 2026):** the CIA installs and runs (the 0.7 DSP/VRAM mapping fix holds),
  the silent 3D-text banner, the gear menu (3 slots, BORDERS ON/OFF), borders locked per area, PROGRESS
  ITEMS/STORY/STATS. All as intended. The user ran the whole build except the ending card.
- **Not checked:** the ending card on hardware, and anything on an Old 3DS.
- **devkitPro in WSL** came from devkitPro's official Docker image (`devkitpro/devkitarm`, pulled with skopeo).
  devkitpro.org and its package server answer 403 to this machine.
- Why a 3DS and not a DS: a DS runs Shantae at about 55-65% speed in GameYob (`nds/README.md`). The 3DS's ARM11
  (268 MHz, or 804 MHz on a New 3DS) and 128 MB of RAM run the full gambatte core.

## Files
| File | What it is |
|---|---|
| `main.c` | libctru frontend (see the table below) |
| `linkscr.c/.h` | The Link screen in C: SHANTAE page, PROGRESS page, dance list on Select, tabs |
| `linkhost.c` | Desktop test: loads the ROM + a driver state in the desktop core and writes the Link screen as a PPM |
| `Makefile` | devkitARM build -> `out/ctr/Shantae Dual 3DS.3dsx` (icon from the Android launcher icon) |

`main.c` in detail:
| Part | Detail |
|---|---|
| Top screen | The game at 1.5x (240x216), centred |
| Bottom screen | Link screen, redrawn 6 times a second |
| Sound | NDSP, silent if the DSP firmware dump is missing |
| Battery save | Written every ~10 s and on exit |
| Fast-forward | R held, 3x, no sound (R, A, B, Start, Select: changeable in the menu's SETTINGS) |
| States | L+X save, L+Y load |
| Quit | Start+Select saves and quits |
| NO SLOWDOWN | On for the New 3DS only (off while OLD 3DS SPEED is on) |

The Link screen, in detail:
| Page | Shows |
|---|---|
| SHANTAE | Area name, time to dusk or dawn, hearts by quarters, gems, 12 items with counts (tap one to equip it), stones, talismans, Fighter's Gear, dances, squids to hand in |
| PROGRESS | Completion % and counts, the same numbers as the Dual app |
| Dance list | Pops up on Select in play for ~5 s, closes on a tap |

## Build and test
```
dkp-pacman -S 3ds-dev                                   # once (devkitPro pacman: apt.devkitpro.org)
make -C native/ctr GAMBATTE=$HOME/src/gambatte          # -> out/ctr/Shantae Dual 3DS.3dsx
```
Desktop check of the Link screen (in `/home/claude/work/ctr`; the pictures use the ROM's font, so keep them out of
chat): build `linkhost.c` + `linkscr.c` + `../gbcore.c` with `out/host/libgambatte.a`, then run
`linkhost ROM STATE OUT.ppm [frames] ["x,y;..." taps] [select]`.

## Compared with the Android app (alpha)
- **Same:** the emulation core, NO SLOWDOWN (New 3DS), battery save, fast-forward, a save state, equipping by touch,
  the dance list, completion counts.
- **Not yet:**
  - rooms remembered across restarts (the map, zoom, drag and map cards are in)
  - a launcher with the title music, an FF toggle (fast-forward is hold-only), the 3D view (story, stats, the ending
    card, a borders setting and 3 state slots came in 0.9-alpha; map cards, boss bars and key rebinding in 0.10)
- **Not at all:** Android screen modes (split, hinge, overlay), the touch-pad overlay, the WebView menus.
