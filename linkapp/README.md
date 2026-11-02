# Shantae Link 0.8 (RetroArch)

0.8: the page from Shantae Dual 0.34, so the Link screen matches Dual's, except auto dance (Dual 0.33-0.34: tap a dance
in the DANCES pop-up and the app performs it). That needs the emulator to press buttons, so in Shantae Link the pop-up
stays the list it was ("SELECT, THEN ON THE BEAT:"); the page only offers auto dance when `DUAL && N.input`. Also
Dual-only, as before: BACK TO GAME (Dual's Link overlay) and state thumbnails.

0.7: works with the mGBA core too. Its HRAM descriptor is $7F bytes (FF80-FFFE; IE at FFFF is its own), and RetroArch
1.22 stops a read at a descriptor's end, so ra.js's 128-byte HRAM read came back short and was dropped: the map (which
reads $FFDF) never drew, and Select and GBA mode weren't seen. ra.js now reads FF80-FFFE, right for both cores. Tested
against tests/mock_ra.py with mGBA's map (`--core mgba`): maps and icons pixel-identical to Shantae Dual's. Then on a
live RetroArch 1.22.2 with the buildbot mGBA core (Windows): every read reached what the mock predicts (128-byte HRAM
read: 127 bytes; banks 4-5 reachable), and the page rendered from live memory drew the map and the SHANTAE tab with
every icon; `$FF8B` read 04 with Select held. mGBA reports the system as `game_boy_advance` in GET_STATUS (not checked).
0.6: Shantae on the SHANTAE tab again (from the ROM, as Shantae Dual 0.32); the RetroArch address setting is gone (always this device, port 55355).
0.5: the page from Shantae Dual 0.31: every icon is built from your ROM (PICK ROM), no need to open the game's inventory.
0.4: the page from Shantae Dual 0.30: PROGRESS > MONSTERS (46 enemies, pictures decoded from your ROM in the colours
of the area where you met them; the palette copy at $C400 and the object nodes in WRAM bank 3 are both reachable), and
0.29's icon fix (icons copied only once the inventory has settled). Tested against the mock in headless Chromium.
0.3: the item, stone, talisman, squid and firefly icons work: open the game's inventory once, as in Shantae Dual's
plain look. Checked against Shantae Dual's icons in headless Chromium and on a live RetroArch: pixel-identical.
0.2: tested against a real RetroArch (1.22.2 nightly, Nov 2025, Windows, buildbot Gambatte): every read reached what
the mock predicted, the Java transport read the same bytes as direct requests, and the page rendered from live memory
drew the same maps as Shantae Dual in the three rooms tried (incl. Golem Mine and the heaviest bank-1 room). That
RetroArch has no `SAVE_STATE_SLOT`, so SAVE now steps the slot (see below). Not yet run on the device.
0.1: first version, tested against tests/mock_ra.py only.

The Shantae Dual Link screen on its own: an Android app for the second screen that reads Shantae (USA) running in
RetroArch, the way Xenogears Link and Metroid Link do. Same page as Shantae Dual (`app/assets/link`), plus `ra.js`,
which builds the page's `window.Native` from RetroArch's network commands. No native code and nothing from the game:
the player picks their own ROM (for the map, the font and the signposts).

## Setting up
1. **RetroArch Nightly** (Stable works, but for Jack its Network Commands setting doesn't stick after a restart).
2. Settings > Network > **Network Commands: ON**, **Network Command Port: 55355**.
3. Core: **Gambatte** or **mGBA**. Load Shantae (USA) (CRC32 `E994B59B`). GBA mode (core option "Emulated Hardware: GBA") works too.
4. Start Shantae Link (on the second screen), tap **PICK ROM** and pick the same ROM file.
5. RetroArch must run on the same device: the app always talks to 127.0.0.1:55355 (0.6 dropped the ADDRESS setting).

The app never takes input focus, so the controller stays with RetroArch.

## How it reads the game
- `linkapp/src/.../RetroArch.java`: UDP to RetroArch. A thread sends `READ_CORE_MEMORY` for every block the page asked
  for in the last 2.5 s (256-byte pages clipped to the core's memory regions), all at once, then collects the replies
  (RetroArch answers every queued command in one frame). `GET_STATUS` and `VERSION` once a second. `read()` answers
  from the cache and never waits.
- `linkapp/ra.js`: Shantae Dual's `Native` calls on top of that. What the Gambatte core lets `READ_CORE_MEMORY` reach,
  and what stands in for the rest, is in SHANTAE-RAM.md ("RetroArch"):
  - WRAM bank 3 (object nodes) is at `0x11000`, bank 1 at `D000` whatever SVBK says, banks 2/6/7 at `0x10000`/`0x14000`/`0x15000`.
  - Palettes come from the game's own copies at `$C400` (OBJ) and `$C440` (BG).
  - VRAM bank 1 tiles are rebuilt: the font/HUD tileset from the ROM, then the room's bank-1 tileset (the room's
    bank-0 tileset is found by matching live VRAM, and the load right after it is unpacked, LZSS), then tiles
    $000-$04F from the sprite stream buffer at `$C4C0`.
  - GBA mode from `$FFFE`, the Select press (dance list) from `$FF8B`.

## What doesn't work (or works differently) with RetroArch
| Shantae Dual feature | In Shantae Link |
|---|---|
| Menu art from the first-start extraction (title, file select, Dance Menu bars, panels, inventory icons) | Not available: there is no emulator in the app to play the opening. The page uses its plain (0.1) look. |
| Shantae drawn in her Fighter's Gear on the SHANTAE tab | Needs the extracted inventory screen: not shown (the plain layout: hearts, gems, timer, items, stones, talismans, gear names, squids). |
| Item icons | Work (0.5): built from the ROM picked with PICK ROM, like the map and bestiary. Before 0.5 (0.3-0.4): copied from the in-game inventory once open. The inventory loads its tilesets through the same `$0803` routine (bank 0 `7A:6515`, bank 1 `7A:7113`) and the game's WRAM 1 copy of the BG map holds its attributes, so ra.js stands both in; icons are only copied from a snapshot where both were (`Native.videoComplete()`). |
| Save states with thumbnails (OPTIONS) | Slots 1-4 are RetroArch's own state slots. LOAD uses `LOAD_STATE_SLOT`. SAVE: RetroArch 1.22.2 has no `SAVE_STATE_SLOT` and can't report its current slot, so the app steps the slot down to -1 and up to the slot (`STATE_SLOT_MINUS`/`PLUS`, 50 ms apart: presses in the same frame count once), then `SAVE_STATE`. It takes about 1.3 s and leaves RetroArch's own slot on that number. No thumbnails, and the app can't see which slots hold a state, so LOAD is always offered. |
| Pause menu | RETROARCH MENU opens RetroArch's menu (`MENU_TOGGLE`). |
| FF button | Works (`FAST_FORWARD`: the game's frame counter went from 60 to ~1250 a second and back), but RetroArch only has a toggle and won't report it (`GET_CONFIG_PARAM fast_forward` is unsupported): if fast-forward is switched in RetroArch itself, the button shows the opposite until tapped again. Speed is RetroArch's fast-forward ratio (unlimited by default), not Dual's 3x. |
| Dance list pops up on Select | Works from the game's button byte, polled ~10 times a second: a very quick Select tap (under ~100 ms) can be missed. |
| GBA mode (Tinkerbat in the dance list) | Read from the game (`$FFFE`), so it follows RetroArch's core option. |
| Map colours | From the game's palette copies: these hold the colours a fade is heading to, so the map doesn't darken during fades (Dual waits it out), and the 4 colours some rooms animate (water) stay still. RetroArch's colour correction setting isn't known: colours are the raw GBC ones. |
| Map tiles | VRAM bank 1 rebuilt (font/HUD tileset, the room's bank-1 load, the sprite stream from `$C4C0`): the map came out pixel-identical to Shantae Dual's in all 9 rooms compared (overworld, night, town street, labyrinth, the heaviest bank-1 room). Tiles the game animates after loading can differ. The first map after a start waits up to 2.5 s while the ROM is scanned (kept afterwards). |
| Map, PROGRESS, STATS, boss bars, ending card, night card, signposts, towns, labyrinths | Work (same RAM, read through RetroArch). |
| Equip an item by tapping it | Works (`WRITE_CORE_MEMORY` to `$CA84`). |
| Playtest codes, room warp, 3D view, NO SLOWDOWN, ALL SPRITES, borders, touch pad | Dual app only (they live in the emulator). |
| Other GB cores | Gambatte and mGBA (0.7) work. Others (SameBoy, Gearboy, TGB Dual...) aren't tested: their memory maps may put WRAM banks or HRAM elsewhere. |
| WRAM banks 4-5, OAM past `$FE1F` | Out of reach in Gambatte's memory map (mGBA reaches banks 4-5); nothing in the page needs them. |
| Stats (play time, gems, deaths...) | Counted by the Link page as in Dual, but only while Shantae Link is running. |

## Build and test
```
bash tools/build_link_apk.sh                         # -> out/Shantae Link <VERSION>.apk (VERSION in linkapp MainActivity.java)
python3 tests/ratest.py DUMP                         # RetroArch.java on the desktop JVM against tests/mock_ra.py
python3 tests/linktest.py DUMP out --ra [--ra-state norom|badrom|noreply|nogame|wrong]   # the page in RetroArch mode
python3 tests/mock_ra.py DUMP_OR_DIR --port 55355    # a stand-in RetroArch for the app itself
```
Against a real RetroArch (from WSL its address is the Windows side, `ip route` default, e.g. 172.21.144.1):
```
python3 tests/ra_state.py TEMPLATE.state DRIVER.st "/mnt/c/RetroArch-Win64/states/Gambatte/Shantae (USA).state9"
#   then LOAD_STATE_SLOT 9 (TEMPLATE: any state RetroArch's Gambatte saved; the stock core has 2 more state fields)
python3 tests/ra_snapshot.py live.json HOST                                   # every block ra.js reads, game paused
python3 tests/linktest.py DUMP out --ra --ra-blocks live.json --wait 6000     # the page on that live memory
RA_HOST=HOST java -cp out/ratest RaCheck 55355 c000:256,11000:256             # the Java transport, read only
```
To get a live game into play without save states (mGBA can't load the driver's): start RetroArch with
`--appendconfig` holding `network_remote_enable = "true"`, `network_remote_enable_user_p1 = "true"`,
`config_save_on_exit = "false"` (nothing is written to retroarch.cfg), then send the network RetroPad UDP 55400:
`struct.pack('<iiiiHxx', 0, 1, 0, button_id, 1 or 0)` (B 0, SELECT 2, START 3, UP 4, DOWN 5, LEFT 6, RIGHT 7, A 8), e.g.
the title's debug-game code as native/extract.c enters it.

`tests/mock_ra.py` (`--core gambatte|mgba`; `linktest.py --ra-core`, `ratest.py --core`) answers with that core's memory
map run through a port of RetroArch's descriptor code
(`mmap_preprocess_descriptors`, `command_memory_get_descriptor`), so the tests reach exactly what RetroArch reaches.
Keystore: `tools/shantaelink.keystore`, alias `shantaelink`, password in `tools/shantaelink.keystore.pass` (neither is in git; keep both: updates must use the same key).
