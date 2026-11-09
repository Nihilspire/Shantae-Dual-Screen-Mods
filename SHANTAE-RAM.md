# Shantae (USA) GBC: RAM / ROM map used by Shantae Dual

ROM: `Shantae (USA).gbc`, 4 MB, MBC5 + RAM + battery (type $1B), 8 KB SRAM, CRC32 `E994B59B`.
CGB-only, runs in double speed. GBA mode (`gambatte_gb_hwmode = GBA`) shows "GBA ENHANCED!" on the title and unlocks Tinkerbat.

Found with the desktop driver (`native/drive.c`): debug game, poke-and-look, RAM diffs, a write tracer and an
opcode tracer (host build only, `-DGBX_TRACE`). **Verified** = confirmed in the running game. **Likely** = from code
or data, not yet confirmed by play. All addresses are CPU addresses; `w3:Dxxx` means WRAM bank 3 (the game keeps
bank 3 mapped at $D000 during play).

## Save block ($CA70-$CB3B), cleared by new-game init (bank 4 $4805)

| Address | Size | Meaning | Status |
|---|---|---|---|
| $CA70-$CA7B | 12 | Item counts, inventory order: Small Vial, Medium Vial, Large Vial, Float Muffin, Vanish Cream, Exit Candy, Twin Mints, Greedy Jar, Storm Puff, Flash Bolt, Pike Ball, Fireball (shop table at ROM $7C801 gives the destinations) | Verified |
| $CA7D | 2 | Gems, 16-bit LE (max 999) | Verified |
| $CA7F | 1 | Lives | Verified |
| $CA80 | 1 | Hearts, 4 units per heart | Verified |
| $CA82 | 1 | Max hearts, 4 units per heart (starts at 12 = 3 hearts; +4 per Heart Holder) | Verified |
| $CA84 | 1 | Equipped item (0-11, inventory order) | Verified |
| $CA8A | 1 | Baby Warp Squids carried | Verified |
| $CA8B | 1 | Fireflies collected | Verified |
| $CAA0-$CAB3 | 20 | Warp squid mothers, 5 x 4 (debug fills 00 01 02 03) | Likely |
| $CABA | 1 | Fighter's Gear: Cuff (shop "cuff 500") | Likely (shop table) |
| $CABB | 1 | Fighter's Gear: Sash ("sash 400") | Likely (shop table) |
| $CABC | 1 | Fighter's Gear: Boot ("boot 300") | Likely (shop table) |
| $CABD | 1 | Fighter's Gear: Tiara ("tiara 900") | Likely (shop table) |
| $CAC2-$CAC5 | 4 | Shop prerequisites for Cuff, Sash, Boot, Tiara | Likely |
| $CB1B-$CB3B | 33 | Flag bit array. Test: bank 4 $4C5B, clear: $4C2C (args: mask, byte offset from $CB1B) | Verified |
| $CB1B.2 + n | bits | Heart Holder n (table bank $11 $6EFF) | Likely |
| $CB1B.10 + n | bits | Baby Warp Squid n (table bank $11 $6F0F) | Likely |
| $CB1B.42 + n | bits | Firefly n (table bank $11 $6F4F) | Likely |
| $CB38 bits 4-7 | 4 | Elemental stones 1-4 (inventory row 4) | Verified |
| $CB38 bits 0-3 | 4 | Tested next to the stones in the inventory code: stones taken by Risky? | Unknown |
| $CB39 bits 4-7 | 4 | Talismans: Monkey Claw, Elephant Tote, Spider Venom, Harpy Talon | Verified (inventory) |
| $CB3A bits 0-7 | 8 | Dances: Monkey, Elephant, Spider, Harpy, Healing, Warp 1, Warp 2, Warp 4 | Verified (dance menu) |
| $CB3B bits 0-2 | 3 | Dances: Warp 3, Warp 5, Tinkerbat | Verified (0,1); likely (2) |

Dance inputs (from the game's Dance Menu tilemap): Monkey ↓→, Elephant ↓←, Spider ↓A, Harpy ↓B, Healing ↓↑A,
Warp 1 ↓↑←→, Warp 2 ↓↑→←BA, Warp 3 ↓↑→→BA, Warp 4 ↓↑←←BA, Warp 5 ↓↑B←B→, Tinkerbat ↓↑↑ (GBA). Select starts a dance;
the HUD stars are the beat.
**Dance timing (driver, Nov 2):** Select starts the beat; input k is accepted when pressed (held 3 frames) at frame 18 + 64k
after Select, each window about 24 frames wide (Monkey: Down at 8-31, Right at about 68-95). The beat is in phase with Select,
not the music: the same schedule worked after 0, 17 and 41 frames of waiting, in two areas, for all four transforms,
Healing and the warps (Warp 1 from 14: flash, then the town; $CBFD stays the same across the towns). Player cel bank
(node 0 +$2E) after: Monkey 60, Elephant 6F, Spider 77, Harpy 70.

## Live state

| Address | Size | Meaning | Status |
|---|---|---|---|
| $C377 | 2 | Frame counter (16-bit) | Verified |
| $C37A/$C37B/$C37C | 1 each | Stopwatch: frames (counts down from 60), seconds, minutes (bank 1 $426B) | Verified |
| $C39D | 1 | Game state: 2 = playing, 5 = dialogue, 0 = title / file select / menus, 1 = intro | Verified |
| $C389 | 1 | Debug teleport menu index | Verified |
| $C3E9 | 2 | Time of day: +4 per frame, wraps every 16384 frames (4:34). High byte >= $80 = night (the firefly handler, bank $11 $733A, tests bit 7 of $C3EA) | Verified |
| $CA00 | 1 | Screen column of the camera in the current area | Verified |
| $CB18 | 1 | ROM bank of the current map data | Likely |
| $CB43 | 2 | Shantae X (pixels) | Verified |
| $CB45 | 2 | Shantae Y (pixels) | Verified |
| $C9D6 | 2 | Town street position (2 units per pixel, wraps at 1280); see Towns | Verified |
| $CBD6 | 1 | Town door Shantae stands at (0 = none); see Towns | Verified |
| $CBFD | 1 | Map ID ($00-$43). The overworld areas between towns share map IDs; areas are told apart by more than this byte (TODO) | Verified |
| $FF70 | 1 | SVBK (WRAM bank), $FB = bank 3 during play | Verified |
| w3:$D15F | 1 | Risky Boots HP (TASVideos, BizHawk WRAM offset $315F) | From TASVideos |
| w3:$D64C | 1 | Golem HP (TASVideos $364C) | From TASVideos |
| w3:$D2DA | 1 | Tinker ship HP (TASVideos $32DA) | From TASVideos |

## ROM

| Offset | Meaning |
|---|---|
| $3964A3 | LZSS stream (Okumura: 4 KB ring of spaces, r = $FEE, flags LSB-first, 1 = literal) unpacking to the $1800-byte tileset loaded at VRAM bank 1 $8000. ASCII glyph c = tile $100 + c (offset $1000 + c*16); tiles $100-$11F are HUD icons ($0B gem, $0D heart, $1D empty heart, $0E/$1E note, $1C/$0C star, $1B x). Text ink = colour 1, background = colour 3. Text-box frame pieces: `{` `|` `}` DEL `[` `\` `]` |
| bank 1 $41BD | LZSS decompressor (params in HRAM $94-$9B: src, bank $96, dest, VBK, end) |
| $7C801.. | Shop tables: [prereq ptr][name 9 chars][qty][price][dest var][script] |
| $A5FE0.. | Signpost text: "Welcome to X. West: Y, East: Z." for every overworld area |
| bank $11 $6EFF/$6F0F/$6F4F | (byte, mask) flag tables for heart holders / squids / fireflies |

## Debug mode

Title screen: ← ← → x8 ← x6 → → ← x7 → x6 ← x8 → "Start Debug Game". Pause (Start), then Select = teleport list (67
entries, a linear list: Down/Right = next). Teleport codes by row: I0-3, L1-5 (labyrinths: maps $01 $07 $0A $3A $3C),
T1 T4 T6 T8 T9, W1-2, D1 D2 X1-4, F1-5, N1-5 (town gates: $04 $30 $34 $31 $35), M1-3 M@ M!, E/L row, B row (bosses), C rows.
The debug game gives 10 of every item, 500 gems, 99 squids, every dance, stone and talisman, and the 4 bytes $CABA-$CABD.

## First-start extraction (native/extract.c)

What the menu-art route relies on. Overclock must be off (the frame counts assume normal speed). Inputs are taps of
6 frames down / 6 up.

| Step | Wait / input | Check |
|---|---|---|
| Boot | 900 frames, then record the title theme (~87 s, it plays once) | title snapshot at +800 frames: sprites 0-17 = logo highlights, 18-33 = "Press Start" banner (64x29 at 47,89, 8x16 sprites) |
| Debug code | the title code above, run 30, START, run 120 | `$C39D` = 18 (debug menu) |
| Debug game | DOWN, A, run 150 | File Select snapshot (blue swirl = BG tiles at 16..17, 16..17) |
| Play | A, then B until `$C39D` = 2 | status-bar snapshot |
| Inventory | START, wait for the inventory map fingerprint, run 30 | icons: items row 5 + 2*(i/4), col 11 + 2*(i%4); stones row 12, talismans row 15, cols 11 + 2i; squid 1,14; firefly 1,17 |
| Dance Menu | B, wait for map[0] = $B6, map[1] = $B7, map[32] = $C6, run 30 | header `<B` cols 0-2 rows 0-1, bar filler col 3; rows repeat every 3 tile rows from row 2 (top edge, 2 rows of black); right edge col 9; dance icons 3x3 at cols 0 and 10, rows 2 + 3i |

Snapshot (`GB_SNAP_LEN` = 0x4125 + 192): VRAM 0x4000 (both banks) | BG pal 64 | OBJ pal 64 | OAM 160 | LCDC SCY SCX WY WX |
the 64 palette colours as displayed (RGB888, colour correction applied), BG then OBJ.

## Level data (0.3, used by the Link MAP tab)

Found by tracing the BG map refresh while scrolling: the game keeps a 32x32 copy of the BG map in WRAM bank 1
($D000 tiles, $D400 attributes) and copies strips to VRAM with HDMA; the metatile writer is at 00:2654-26BB.

| What | Where / format |
|---|---|
| Room rectangle | $C9E9-$C9EA x0, $C9EC-$C9ED y0 (pixels); $C9F4-$C9F5 width - 160, $C9F6-$C9F7 height - 128 (the view is 160x128 above the status bar) |
| Region (screen table) | $C9F9 = high byte of the table address, $C9FA = its ROM bank. 32 entries per row (64 bytes), 1 row per 256 px of world Y |
| Table entry | 2 bytes: [page, bank] of a screen; 0,0 = no screen. Screen = 16 rows x 16 metatile words (512 bytes) at page << 8 |
| Metatile word | lo, hi: definition at bank `$DF` + (lo & $0F), address (hi << 8) \| (lo & $F0): 4 tile numbers (TL TR BL BR) then 4 CGB attributes. HRAM $DF = definition bank base, $E0 = current screen bank |
| Camera | $C9FB-$C9FC X, $C9FD-$C9FE Y. At the end of a frame these already hold the next frame's camera; SCX/SCY ($FF43/$FF42) are the low bytes of the picture just drawn (SCX = $C9FB - 1 while walking right). BG map index = world tile coordinates mod 32 (a 73/80 metatile self-check at the camera) |
| Shantae | $CB43-$CB44 X, $CB45-$CB46 Y (world pixels). Not her sprite's corner: the middle of her sprites is about (+26, +28) from it and her feet about +49 below (0.11, checked against OAM in towns' outskirts, caves, the overworld and a labyrinth; before 0.11 the map's dot sat up and left of her) |
| Room headers in ROM | room code calls `cd 40 05 20 79 03` (far call to 03:7920), followed by 17 bytes: x0 (2), y0 (2), w-160 (2), h-128 (2), 0, table hi, table bank, $DD, $40, def bank ($DF), 0, 2 more (gfx). 112 headers; rooms of 8192 x 8192 are whole-region rooms (boss arenas, open areas) |

Regions with several rooms are labyrinths (e.g. table B8:4600 = 11 rooms on one grid). Room ids ($CBFD) that share
a region are rooms of the same place. Map $08 is the Gecko Match race (58:4000, a 32-screen strip at y = $480).

### Object placement (0.4)

Found by teleporting Shantae (poke her object's x/y, WRAM bank 3 $D034/$D037 for the player node at $D000) next to a
collectible, then tracing who wrote the new object's script pointer: the placement scanner at 00:0FA9-10FF.

| What | Where / format |
|---|---|
| Room header, full | 17 bytes after `cd 40 05 20 79 03`: x0, y0, w-160, h-128 (16-bit each), $C9F8, screen table hi + bank ($C9F9/$C9FA), $DD, $DE, $DF (metatile definition bank), $C399, **object grid hi + bank ($C39A/$C39B)** |
| Object grid | bank $C39B; entry for screen (row r, col c) at ((\$C39A + r/2) << 8) \| (r & 1) << 7 \| c*4 = far pointer (lo, hi, bank) to a list |
| List | 1 count byte, then 17-byte entries: x right, x left, y bottom, y top (16-bit, the spawn box), RAM byte that marks "already spawned" (2), object script (lo, hi, bank), 4 parameters (copied to object fields +$20..+$23) |
| Scan | each frame, for the screens entering view ($FFC5-$FFCC = view edges, $C39C bits = scan direction); spawns into the list at HRAM $B3/$B4, nodes in WRAM bank 3 (player = $D000; +2 script PC, +$34 x, +$37 y) |
| Scan width | The lists read are those of the screen columns the window's edges are in (00:0FA9 per list: overlap test of the entry's box with $FFC5-$FFCB; marker byte, then node +$27 = the marker's address). A window over 256 wide can lie across three columns and skip the middle one. The game's own is 176; WIDE VIEW keeps it at most 256 (0.45) |
| Object types | 0A:4000 + 4k: `40 lo hi bank` = "go to script". The table runs past index 191 (0A:4338.. used by the big labyrinths) |
| Collected flags | 04:4726 sets, 04:47CE tests: entry = flag table + 2 * param; byte offset from **$CB1B** and mask. Tables in bank $11: talismans $6EEF, heart holders $6EFF, baby squids $6F0F, fireflies $6F4F. Index = param 0 (param 3 for squids) |

| Type | Object | Notes |
|---|---|---|
| 38 | Baby warp squid (11:7440) | param 3 = squid number; on pickup $CA8A (squids held) +1 |
| 99-102 | Talisman pickups (11:7084, 70FC, 7174, 71EC) | also ORs a bit into $CB39 (04:4BFF with mask, offset $1E) |
| 104 | Firefly (11:72F3) | only shown at night ($C3EA bit 7, code at 11:733A) |
| 105 | Heart holder (11:7391) | |
| 106 | Room edge exit (0B:4532) | full-height box at x 40-47 / right edge; param 0 = 1 left, 2 right |
| 110 | Signpost (0B:5ECA) | reads on A (FF8C bit 1); text chosen by param 0 in the room's own code (0B:5F0E: 1 Scarecrow Field, 2 Spiderwood Forest). No list placements found: the other areas' signposts are spawned by room code |
| 111 | Door in the 11-room labyrinth (B8:4600) | param 0 = door number, param 1 = side (1/2); Up starts 11:6859 (walk in) which hands (+$18, number, side) to the room code — destinations are resolved there, not in a table (still open) |
| 109 | (0B:5C32) | 112 placements, param 0: probably gems/pots |

Every collectible placed in a room list (generated by tools/re/allobj.py):

| Collectible | # | Room header | Region | x, y (centre) | Collected flag | Type |
|---|---|---|---|---|---|---|
| Baby squid | 1 | 09:401f (whole region) | 4A:5000 | 1663, 1824 | $CB1C bit 3 | 38 |
| Baby squid | 2 | 09:401f (whole region) | 4A:5000 | 1295, 2287 | $CB1C bit 4 | 38 |
| Baby squid | 3 | 09:401f (whole region) | 4A:5000 | 3447, 1567 | $CB1C bit 5 | 38 |
| Baby squid | 4 | 09:401f (whole region) | 4A:5000 | 4048, 3231 | $CB1C bit 6 | 38 |
| Baby squid | 5 | 09:401f (whole region) | 4A:5000 | 2255, 2663 | $CB1C bit 7 | 38 |
| Baby squid | 6 | 1e:401f | BE:7800 | 4927, 2183 | $CB1D bit 0 | 38 |
| Baby squid | 7 | 1e:401f | BE:7800 | 4206, 1351 | $CB1D bit 1 | 38 |
| Baby squid | 8 | 1e:401f | BE:7800 | 4687, 1679 | $CB1D bit 2 | 38 |
| Baby squid | 9 | 1e:401f | BE:7800 | 3855, 2383 | $CB1D bit 3 | 38 |
| Baby squid | 10 | 1e:401f | BE:7800 | 3343, 551 | $CB1D bit 4 | 38 |
| Baby squid | 11 | 22:401f | 8F:5E00 | 6047, 6015 | $CB1D bit 5 | 38 |
| Baby squid | 12 | 22:401f | 8F:5E00 | 3287, 5855 | $CB1D bit 6 | 38 |
| Baby squid | 13 | 22:401f | 8F:5E00 | 5360, 5087 | $CB1D bit 7 | 38 |
| Baby squid | 14 | 22:401f | 8F:5E00 | 3967, 4663 | $CB1E bit 0 | 38 |
| Baby squid | 15 | 22:401f | 8F:5E00 | 4487, 6183 | $CB1E bit 1 | 38 |
| Baby squid | 16 | 26:401f | CA:5B00 | 5503, 1327 | $CB1E bit 2 | 38 |
| Baby squid | 17 | 26:401f | CA:5B00 | 5135, 1423 | $CB1E bit 3 | 38 |
| Baby squid | 18 | 26:401f | CA:5B00 | 5615, 1007 | $CB1E bit 4 | 38 |
| Baby squid | 19 | 26:401f | CA:5B00 | 2303, 1007 | $CB1E bit 5 | 38 |
| Baby squid | 20 | 26:401f | CA:5B00 | 1056, 455 | $CB1E bit 6 | 38 |
| Firefly | 1 | 0b:4041 | 58:4000 | 2435, 335 | $CB20 bit 3 | 104 |
| Firefly | 2 | 19:4509 | 66:4000 | 1415, 3023 | $CB20 bit 4 | 104 |
| Firefly | 3 | 19:4509 | 66:4000 | 2688, 2952 | $CB20 bit 5 | 104 |
| Firefly | 4 | 19:4521 | 66:4000 | 4026, 5255 | $CB20 bit 6 | 104 |
| Firefly | 5 | 21:43ed | 85:6700 | 639, 2134 | $CB20 bit 7 | 104 |
| Firefly | 6 | 21:43d5 | 85:6700 | 311, 999 | $CB21 bit 0 | 104 |
| Firefly | 7 | 21:57c4 | 9F:4000 | 1394, 341 | $CB21 bit 1 | 104 |
| Firefly | 8 | 21:612d | 8C:5A00 | 4830, 423 | $CB21 bit 2 | 104 |
| Firefly | 9 | 23:4765 | B1:4E00 | 1152, 402 | $CB21 bit 3 | 104 |
| Firefly | 10 | 23:4795 | B1:4E00 | 3544, 2927 | $CB21 bit 4 | 104 |
| Firefly | 11 | 11:405b | A3:6300 | 2832, 1024 | $CB21 bit 5 | 104 |
| Firefly | 12 | 23:477d | B1:4E00 | 1806, 1551 | $CB21 bit 6 | 104 |
| Heart holder | 1 | 11:5d0d | B8:4600 | 543, 412 | $CB1B bit 3 | 105 |
| Heart holder | 2 | 0b:4041 | 58:4000 | 2683, 372 | $CB1B bit 4 | 105 |
| Heart holder | 3 | 11:5d3d | B8:4600 | 1643, 420 | $CB1B bit 5 | 105 |
| Heart holder | 4 | 11:5dcd | B8:4600 | 492, 948 | $CB1B bit 6 | 105 |
| Heart holder | 5 | 19:44c1 | 66:4000 | 2664, 812 | $CB1B bit 7 | 105 |
| Heart holder | 6 | 11:405b | A3:6300 | 2434, 676 | $CB1C bit 0 | 105 |
| Heart holder | 7 | 15:4406 | AB:7400 | 4231, 548 | $CB1C bit 1 | 105 |
| Talisman | 1 | 11:5d85 | B8:4600 | 3882, 422 | $CB22 bit 3 | 101 |
| Talisman | 2 | 11:5d9d | B8:4600 | 5094, 702 | $CB22 bit 4 | 99 |
| Talisman | 3 | 21:612d | 8C:5A00 | 2944, 265 | $CB22 bit 5 | 102 |
| Talisman | 4 | 0b:4041 | 58:4000 | 907, 86 | $CB22 bit 6 | 100 |

All 20 squids are placed objects, 5 per labyrinth in squid-number order: 1-5 Dribble Fountain, 6-10 Golem Mine,
11-15 Cackle Mound, 16-20 Twinkle Palace (as the Shantae Wiki lists them). 0.4 missed 1-5 because Dribble Fountain's only
room header is its small entrance room (548,1083, 160 x 128): the labyrinth itself is the whole region 4A:5000, set
later by 03:7A3D (`cd 40 05 3d 7a 03` + x0, y0, w-160, h-128; bank 09 calls it with 0, 0, 8032, 8064), so its grid
($C399-$C39B = 4D:4A) has to be read for the whole region, not the header's rectangle. Squid n is picked up when bit
n + 10 counted from $CB1B is set (the 100% tab counts these).
The map draws these with collected / not collected from the flags above.

## Areas and links (0.5)

### How warps work
- **Scene jumps:** `cd 6b 05 lo hi bank` (00:056B: reset the stack, far-jump) = "go to scene". Banks keep jump tables of these.
- **Warp code $CBF3:** an exit sets it; the destination bank's code dispatches on it with a `fe NN ca lo hi` chain
  (`fa f3 cb` = ld a,[$CBF3]) to an *entry routine*. For caves the code is **10 x cave + side**.
- **Entry routine:** writes the room number to a per-bank room variable **$C000-$C00F** (bit 7 = arriving from a
  cave) and the arrival point to **$CB71**, then the bank's room dispatcher (`fa 0V c0`, optional `and $7f`, cp chain)
  runs the room's header code. Without a room variable it falls through into the next room header.
- **Edge exits** (type 106, param 0 = 1 left / 2 right) and doors were checked by playing them in the driver
  (tools/re/bfs.py, ring.py: teleport onto the exit, hold the direction, see which room loads).
- **Caves** = region B8:4600, rooms 1-12 (no 10), dispatcher 11:5CD9 on $C000. Inside, ladders/doors are type 111,
  param (cave, side); outside, the cave mouths are types 119 (forests), 124 (water), 131 (wastelands), 141 (desert),
  151 (Mud Bog) with the same (cave, side). Cave → outside: chain 11:5BFB; outside → cave: chains 19:43BB, 21:42CA,
  23:4681, 15:4376 (to stubs 11:582E-5971 that set $C000 = cave, $CB71 = 0/1).
- **Labyrinths** are entered by far jumps from the area's bank: 0B:66DE → bank 22 (Cackle Mound, from Zombie Swamp),
  11:4418 → bank 26 (Twinkle Palace, from Mount Pointy), 15:43A1 → bank 1E (Golem Mine, from Mens Desert);
  Dribble Fountain = region 4A:5000 (banks 09/1B; entered from 0C:597D). Region D4:4D00 (banks 16/17) is Risky's island
  hideout at the end of the game, reached by a scene jump from Scuttle Town's code (12:6BF5); 0.5 had called it Dribble Fountain.

### The overworld ring (left to right; walking off the right edge leads to the next line)

| Area | Room header | Region, corner | Notes |
|---|---|---|---|
| Scuttle Town Gates | 18:403c | 59:7300, 552,8 | door: Scuttle Town |
| Scarecrow Field | 0b:4041 | 58:4000, 32,0 | name from the game's signpost |
| Spiderwood Forest | 19:44c1 | 66:4000, 32,512 | signpost name ("Spider Forest" on the wiki); cave 4 |
| Dribble Fountain Entrance | 0c:5468 | 59:7300, 32,8 | door: Dribble Fountain |
| Waterfall Lake | 21:43d5 | 85:6700, 256,768 | caves 5, 7 |
| Water Town Gates | 18:46ab | 59:7300, 1072,8 | door: Water Town (type 156, param 2) |
| Rain Storm River | 21:57c4 | 9F:4000, 258,136 | |
| Snail Wasteland | 23:477d | B1:4E00, 256,1280 | caves 8, 11 |
| Zombie Swamp | 0b:6333 | 85:6700, 256,256 | door: Cackle Mound |
| Ghost Forest | 19:4509 | 66:4000, 1280,2816 | cave 8; at night the Zombie Caravan Gates (18:51a1, 2096,8) sit between it and Archer Forest |
| Archer Forest | 19:4521 | 66:4000, 1280,5120 | cave 9 (dead end) |
| Mount Pointy | 11:405b | A3:6300, 1024,256 | door: Twinkle Palace |
| Eagle Wasteland | 23:4795 | B1:4E00, 2304,2304 | lower exit: Bandit Town Gates (18:571a, 2608,8) |
| Mud Bog | 21:612d | 8C:5A00, 512,144 | cave 3 (dead end) |
| Oasis Town Gates | 18:4bbf | 59:7300, 1576,8 | door: Oasis Town (type 156, param 3) |
| Ladies Desert | 15:441e | AB:7400, 256,1280 | no right exit; cave 2 to Naga Wasteland |
| Mens Desert | 15:4406 | AB:7400, 256,256 | no left exit; door: Golem Mine |
| Naga Wasteland | 23:4765 | B1:4E00, 256,256 | caves 1 (dead end), 2; right edge back to Scuttle Town Gates |

The opening stage (Risky's attack on Scuttle Town, docks included) is room 1D:402E, region 72:4B00 at 256,1024, 30 x 3 screens.
Side areas reached by caves: Goblin Forest (19:44d9, 66:4000 1280,2304), Hidden Waterfall (21:43ed, 85:6700
256,1752), an unnamed forest area (19:44f1, 66:4000 256,2560). Gecko Match = 20:402b (58:4000 0,1152).
Names: the game's own signposts where it shows them (Scarecrow Field, Spiderwood Forest); the other signpost
texts in the ROM (Dribble Falls, Flushstone, Slime Flats, ...) are never shown and don't match the final world, so the
rest use the Shantae Wiki's names, matched by the links and each area's look.

### Caves (region B8:4600)

| Cave | Room header | Side 1 comes out in | Side 2 comes out in |
|---|---|---|---|
| 1 | 11:5d0d | Naga Wasteland | — |
| 2 | 11:5d25 | Ladies Desert | Naga Wasteland |
| 3 | 11:5d3d | Mud Bog | — |
| 4 | 11:5d55 | Spiderwood Forest | Goblin Forest |
| 5 | 11:5d6d | Goblin Forest | Waterfall Lake |
| 6 | 11:5d85 | — | forest side area (19:44f1) |
| 7 | 11:5d9d | Waterfall Lake | Hidden Waterfall |
| 8 | 11:5db5 | Snail Wasteland | Ghost Forest |
| 9 | 11:5dcd | Archer Forest | — |
| 11 | 11:5de5 | Hidden Waterfall | Snail Wasteland |
| 12 | 11:5dfd | forest side area (19:44f1) | Goblin Forest |

## Labyrinths (0.7)

Each labyrinth is one region played as a single room 8192 x 8192 (camera limits from 03:7920 or 03:7A3D), plus a few
small rooms in the same region for scenes (Dribble Fountain's entrance room; the rooms where Risky takes the stone).
Exits back to the overworld set the warp code $CBF3; the labyrinth's main loop then far-jumps to the overworld bank's
dispatcher (e.g. 1E:43EE → 15:40A2), as in the caves. Played in the emulator: you arrive at the point below, and walking
left from it leads out.

| Labyrinth | Region | Room code | Arrive at (x, y) | Walking out leads to | Guardian Genie (type 39, param 0) | Squids |
|---|---|---|---|---|---|---|
| Dribble Fountain | 4A:5000 | 09, 1B | 556, 1130 (entrance room) | Dribble Fountain Entrance | 3257-3311, 3696-3756 (1) | 1-5 |
| Golem Mine | BE:7800 | 1E, 25 | 4377, 368 | Mens Desert (AB:7400 at 868, 872) | 5185-5239, 2968-3028 (2) | 6-10 |
| Cackle Mound | 8F:5E00 | 22, 25 | 2624, 4976 | Zombie Swamp (85:6700 at 1484, 392) | 3705-3759, 6776-6836 (3) | 11-15 |
| Twinkle Palace | CA:5B00 | 26, 27 | 3848, 1056 | Mount Pointy (A3:6300 at 3176, 584) | 433-487, 1096-1156 (4) | 16-20 |
| Risky's Hideout | D4:4D00 | 16, 17 | — | — | — | — |

- **Type 39 = Guardian Genie** (the caged genie; checked in Golem Mine), one per labyrinth, param 0 = labyrinth 1-4.
- **Stone rooms** (where Risky takes the stone, from the debug list's B row): Dribble Fountain 4A:5000 272,368;
  Golem Mine BE:7800 284,320 (228 x 184); Twinkle Palace CA:5B00 352,216 (416 x 288).
- Types 15 (16 x 16) and 16 (8 x 16) are common to all labyrinths; not identified.

## Dev room warp (0.10)

The game starts every place through one dispatcher: **0A:4919** compares the map id **$CBFD** (cp chain) and far-calls
that map's scene entry, e.g. $07 → 1E:4000 (Golem Mine), $04 → 18:5C07 (Scuttle Town street). Resuming a save goes
through it, and so does the title screen's debug list (title code → "Start Debug Game"/teleport list: 67 entries of
[map id, x, y, 0A:name] built at WRAM 7:$D100; A puts the map id in $C38A and 0A:4DFC copies it to $CBFD with $CBFC = 1).

The app's warp (`gb_warp`, PLAYTEST CODES > ROOM WARP) does the same mid-game, between frames: $CBFF = 1, $CBFC = 1,
$CBFD = id, $CBF3 = 0, the room variables $C000-$C00F and arrival point $CB71 = 0, SVBK = 3, $FF91 = $0A, then the
core's `dualJump` (core patch) sets ROM bank $0A, PC = $4919, SP = $CFFF, unhalts and enables interrupts. The scene
sets up graphics, music and the room; the save block ($CA70-) is untouched. Checked in the desktop driver from the
overworld, a cave, a town street, a building and the opening: every playable id loads and Shantae can walk.
($CBFF = 0 makes Select on that screen open the debug list instead.)

| Id | Name in the menu | Lands in (region, corner) | Kind |
|---|---|---|---|
| $00 | INTRO: LIGHTHOUSE | 51:4F00 0,0 | scene (where a new game starts: camera 0,0 3072x472 inside the header's 3072x1008; region 51:4F also holds $03 and $3F) |
| $01 | DRIBBLE FOUNTAIN | 4A:5000 548,1083 | scene, then play (Risky at the entrance) |
| $02 | SCARECROW FIELD | 58:4000 32,0 | play |
| $03 | RISKY'S SHIP | 51:4F00 32,1198 | scene |
| $04 | SCUTTLE TOWN | 9B:6700 0,0 | town street |
| $05 | SCUTTLE DOCKS (OPENING) | 72:4B00 256,1024 | play |
| $06 | SPIDERWOOD FOREST | 66:4000 32,512 | play |
| $07 | GOLEM MINE | BE:7800 0,0 | play |
| $08 | GECKO MATCH | 58:4000 0,1152 | play |
| $09 | WATERFALL LAKE | 85:6700 256,768 | play |
| $0A | CACKLE MOUND | 8F:5E00 0,0 | play |
| $0B | MUD BOG | 8C:5A00 512,144 | play |
| $0C | SCUTTLE TOWN: MAYOR | 9B:6700 2376,336 | scene |
| $0D | RAIN STORM RIVER | 9F:4000 258,136 | play |
| $0E | MOUNT POINTY | A3:6300 1024,256 | play |
| $0F | GOBLIN FOREST | 66:4000 1280,2304 | play |
| $10 | FOREST SIDE AREA | 66:4000 256,2560 | play |
| $11 | SCUTTLE TOWN ROOM | 9B:6700 2112,344 | scene |
| $12 | (duplicate) | 85:6700 256,768 | play |
| $13 | (blank scene) | — | scene |
| $14 | GHOST FOREST | 66:4000 1280,2816 | play |
| $15 | ARCHER FOREST | 66:4000 1280,5120 | play |
| $16 | DRIBBLE FOUNTAIN ENT. | 59:7300 32,8 | play |
| $17 | SCUTTLE TOWN GATES | 59:7300 552,8 | play |
| $18 | WATER TOWN GATES | 59:7300 1072,8 | play |
| $19 | MENS DESERT | AB:7400 256,256 | play |
| $1A | LADIES DESERT | AB:7400 256,1280 | play |
| $1B | HIDDEN WATERFALL | 85:6700 256,1752 | play |
| $1C | OASIS TOWN GATES | 59:7300 1576,8 | play |
| $1D | ZOMBIE CARAVAN GATES | 59:7300 2096,8 | play |
| $1E | NAGA WASTELAND | B1:4E00 256,256 | play |
| $1F | SNAIL WASTELAND | B1:4E00 256,1280 | play |
| $20 | EAGLE WASTELAND | B1:4E00 2304,2304 | play |
| $21 | (duplicate) | 85:6700 256,768 | play |
| $22 | ARENA | 59:7300 3120,104 | scene |
| $23 | DRIBBLE STONE ROOM | 4A:5000 272,368 | scene |
| $24 | CAVE 1 | B8:4600 256,256 | play |
| $25 | CAVE 2 | B8:4600 768,256 | play |
| $26 | CAVE 3 | B8:4600 1536,256 | play |
| $27 | CAVE 4 | B8:4600 2560,256 | play |
| $28 | CAVE 5 | B8:4600 3072,256 | play |
| $29 | CAVE 6 | B8:4600 3840,256 | play |
| $2A | CAVE 7 | B8:4600 4608,256 | play |
| $2B | CAVE 8 | B8:4600 5376,256 | play |
| $2C | CAVE 9 | B8:4600 256,768 | play |
| $2D | CAVE 11 | B8:4600 768,768 | play |
| $2E | CAVE 12 | B8:4600 1536,768 | play |
| $2F | BANDIT TOWN GATES | 59:7300 2608,8 | play |
| $30 | WATER TOWN | 9B:6700 0,768 | town street |
| $31 | ZOMBIE CARAVAN | 9B:6700 0,1376 | town street |
| $32 | SOUND TEST | — | scene |
| $33 | MIMIC'S STORY | — | scene |
| $34 | OASIS TOWN | 9B:6700 0,1120 | town street |
| $35 | BANDIT TOWN | 9B:6700 0,1632 | town street |
| $36 | ZOMBIE SWAMP | 85:6700 256,256 | play |
| $37 | GOLEM STONE ROOM | BE:7800 284,320 | scene |
| $38 | ENDING | — | scene |
| $39 | SHIP INTERIOR | 59:7300 168,304 | play |
| $3A | TWINKLE PALACE | CA:5B00 0,0 | play |
| $3B | TWINKLE STONE ROOM | CA:5B00 352,216 | scene |
| $3C | RISKY'S ISLAND | D4:4D00 256,0 | scene |
| $3D | RISKY'S HIDEOUT ROOM | D4:4D00 848,528 | scene |
| $3E | RISKY'S HIDEOUT | 59:7300 0,0 | play |
| $3F | CREDITS | 51:4F00 512,512 | scene |
| $40 | SPIDERWOOD (ALT) | 66:4000 32,512 | play |
| $41 | MENS DESERT (ALT) | AB:7400 256,256 | play |
| $42 | ZOMBIE SWAMP (ALT) | 85:6700 256,256 | play |
| $43 | MOUNT POINTY (ALT) | A3:6300 1024,256 | play |

## Towns (0.6)

A town is a street you walk along in game state **$C39D = 5** (big Shantae in front, the place you're at in the text box),
with doors into buildings that are ordinary side-view rooms (state 2). Found by debug-teleporting to each town, walking
one frame at a time while logging RAM, and pressing Up at every door (tools/re/town_up.py).

| What | Where / format | |
|---|---|---|
| Street room | region 9B:6700, x 0, 641 x 129 (the street is 640 px and wraps; the extra column is the wrap) | Verified |
| $C9D6-$C9D7 | Position along the street, 2 units per pixel, wraps at 1280. Camera X ($C9FB) = half of it; Shantae stands at camera + 80 | Verified |
| $CBD6 | Door number Shantae is standing at (1-7), 0 between doors; $CBD9 = 1 while at a door | Verified |
| $CBD0-$CBD2 | Far pointer (lo, hi, bank) to the town's label table, set by 04:6D55 when the street loads | Verified |
| Label table | Door n's name = entry n-1: 3-byte far pointers to strings ended by $80 (ASCII). The street code passes 04:6D55 eight tables and it picks one with $CA7C; in all five towns the eight are the same table | Verified |
| Doors | Placed objects of type 157 (script 04:6029), param 0 = door number; same object grid as the overworld (header bytes $C399-$C39B) | Verified |
| Gates | One of the street's doors (the gates door below) leads back to the town's gate room on the overworld | Verified |

| Town | Map | Street y | Label table | Gates door → | Building rooms (door: room corner) |
|---|---|---|---|---|---|
| Scuttle Town | $04 | 0 | 29:732E | 6 → 59:7300 552,8 | in 9B:6700: 1 Warp Squid Hut 1304,624; 2 Mimic's Dock 2624,336; 3 Bath House 672,360; 4 Save Room 1800,360; 5 Item Shop 248,360; 7 Dance Parlor 1248,360 |
| Water Town | $30 | 768 | 29:765D | 4 → 59:7300 1072,8 | in BB:6200: 1 Firefly Shrine 2864,872; 2 Bath 672,872; 3 Save 1800,872; 5 Warp Squid 1264,872; 6 Bolo's Gazebo 2336,880; 7 Item Shop 248,872 |
| Oasis Town | $34 | 1120 | 29:76CE | 4 → 59:7300 1576,8 | in BB:6200: 1 Gecko Chamber 2816,1400; 2 Bath 672,1384; 3 Save 1800,1384; 5 Warp Squid 1264,1384; 6 Item Shop 248,1384; 7 Sky's Hatchery 2336,1384 |
| Zombie Caravan | $31 | 1376 | 2A:56FC | 4 → 59:7300 2096,8 | in BB:6200: 1 Save Cart 1800,1896; 2 Bathing Wagon 672,1896; 3 Keep Out!! 2336,1896; 5 Warp Squid Wagon 1264,1896; 6 Town Shop 248,1896 (its 7th label, "room7", has no door) |
| Bandit Town | $35 | 1632 | 2A:5ECB | 4 → 59:7300 2608,8 | in BB:6200: 1 Warp Squid Hut 1264,2408; 2 Town Shop 248,2408; 3 Bath House 672,2408; 5 The Rusty Gullet 2336,2408; 6 Advanced Genies! 2848,2416; 7 Save Room 1800,2408 |

Building rooms share a layout per kind: Item/Town Shop at x 248, Bath House 672, Warp Squid Hut 1264, Save Room 1800,
the town's special places at 2336 and up; each town has its own row (Scuttle's in 9B:6700, the others in BB:6200 at
y 872 / 1384 / 1896 / 2408). The building names in the table are the game's labels; the Link page reads them from the
ROM at run time.

### Still open
- 9B:6700 2112,344 / 2376,336 (Scuttle Town story scenes; 2376,336 is the opening with the Mayor) are not named.
- Inside the labyrinths there are no doors between parts: each is one open region, so the map shows it as one place.
  Cackle Mound's stone room and the boss arenas are not identified. Dribble Fountain past its entrance room was not
  reached in the emulator (the debug-list entry stops at a closed gate), so squids 1-5 come from the ROM data only.
  Checked in play (0.7): walking into Golem Mine's squid 6 sets $CB1D bit 0 and adds 1 to $CA8A, as the table says.
- Entering a town from its gate room doesn't work in the desktop driver: after a teleport the LCD stays off (RAM reads
  $39 everywhere, the same as the debug list's broken entry 33), and walking to the door and pressing Up does nothing
  (the door objects are alive). The gate → town links come from the gate objects' parameter (type 156, param = town),
  and every town's own gates door was played and leads back to the matching gate room.

## 3D view (0.11, playtest)
PLAYTEST CODES > 3D VIEW draws level rooms in 3D on the main screen (assets/view3d, a transparent WebView between the
game picture and the touch pad). Per frame the emulation thread passes `C9E9:22,FFDF:1,CB43:4,C39D:1` and the video
snapshot (Native.video layout), taken when runFrame returns: VRAM, OAM and SCX/SCY then all belong to the picture just
drawn. Found while building it:

| Thing | Detail |
|---|---|
| Sprites switched off for the status bar | LCDC bit 1 is 0 at the end of every frame (the game turns sprites off at the status bar's line and on again at the top), so it can't tell whether sprites are shown |
| Status bar | the window layer, map $9C00, WY = 128 in play (104 on town streets), WX = 7 |
| Collision per 8x8 tile | metatile definition bytes 8-11 (TL TR BL BR). Read from labelled level pictures, every code in all 68 places (0.35; meanings from how they sit in the art, not the game's code): 00 open; 02 solid; 04/06 and 36/38 45 degree slopes up/down to the right; 0C+0E shallow up (low, high half), 10+12 shallow down; 08/0A slanted ceilings; 2C pit floor; 2E one-way top (crates, branches); 3A/3C the fill under a one-way ramp; 3E underside of a tree's leaves; 62 invisible wall; 64 climbable (trunks, pillars, recesses in walls), 6C its diagonal edge; 6E cactus, 70 icicles (hazards) |
| Room rectangle | $C9F4 (width) and $C9F6 (height) are the camera's range + 1: a one-screen room reads 1 and 1, so the room is that + 159 by that + 127 |
| Is the picture the room? | state $C39D 2 or 5, LCD on, WY >= 64, and the BG map under the camera matches the level data on >= 70% of 6+ sampled tiles with at least 3 different tile numbers (the title screen matches blank level data otherwise) |

### Object nodes and bosses (0.20)

| What | Where / format |
|---|---|
| Node table | WRAM bank 3, node *i* at $D000 + i*$7E (player = node 0). +0 state ($00 running, $80 system/idle, $FF free), +1 flags, +2..+4 script PC (lo, hi, bank), +5 script loop depth, +6.. loop counters, +$0A.. loop return addresses, +$19..+$1C per-frame native hook (default 00:0C41 = `ret`), +$20..+$23 placement params, +$34/+$35 x, +$37/+$38 y |
| Script interpreter | 00:1342: opcode = [PC], handler from the table at $0632 + 2*op. Op $32 (00:1A46) = far native call (lo, hi, bank); ops at 00:1726 / 00:174D = loop start / loop end (counters at +6) |
| Node alloc / free | 01:4DFA.. initialises a node (+0 = $80, +$16/17, ...); 00:12EE.. frees one (+0 = $FF) |
| 06:7265 | spawns the small "hurt" burst (script 06:72DA); Shantae's own script calls it (04:55A7) when she is hit — not an enemy-defeat event |
| Risky's ship fight (map $03) | Tinker ship = node 5 ($D276, script bank $1A, PC 1A:53xx), HP at +$64 = $D2DA (10 by day); Risky = node 2 ($D0FC, bank $1A, 1A:4Dxx), HP at +$63 = $D15F (64) |
| Golem | $D64C (TASVideos) = node 12 +$64; not checked in the driver |
| Night | enemies have double health at night (reviews); fireflies only at night; Zombie Caravan only at night |

### Monsters (0.21)

The app's monster list and bestiary were removed in 0.27 (too many monsters missing in playtesting). The findings below
still hold; the code (assets/link/monsters.js, native/beasts.h, the driver's `beast`/`exbase`, tools/re/beast_*.py) is in
git history at 0.26.

Any live object's type = the type (0A:4000 table) whose script starts last at or before the node's script PC, in the
same bank (children run inside their parent type's code: a scarecrow's head and sticks are type 108). Enemy code lives
in a few banks ($07 Golem Mine, $0A Cackle Mound, $0B Scarecrow Field, $14/$19/$1E/$21/$22/$23 overworld, $26 Twinkle
Palace). tools/re/monster_sweep.py warps to each area, teleports Shantae across the room and records every on-screen
object's type with a sprite crop (sprites only, from OAM + VRAM in the dump); the list in assets/link/monsters.js was
picked from those crops and named from the Shantae Wiki's per-area enemy lists where the area and look agree (the
labyrinth and cave enemies are named by place). Not every enemy is certain: spider/bat (112/113) and the Golem Mine /
Cackle Mound types especially.

### Defeat and ending (searched after 0.21)

**No saved flag for either.** Killing an enemy writes nothing to the save block ($CA70-$CB3C; traced through a whole
Dark Slime kill), and the game keeps no kill counter. Beating the game writes nothing either: the ending and credits
were played with a trace on the save block and on cartridge RAM ($A000-$BFFF). The only SRAM write came later, from
starting a New Game on the file screen. After the credits, "THE END" stays up until Start resets to the title.

| What | Where / detail | Status |
|---|---|---|
| Script opcodes | handler = word at $0600 + op (ops are even, $00-$C0). $94 lo hi v = write byte; $96 lo hi v = add byte; $5A o v = node[+o] = v; $64 o v = node[+o] += v; $2E = set per-frame hook; $32 lo hi bank = far native call; $58 = free this node; $1C n = wait | Read from handlers |
| $CB70 | 1 while a cutscene holds the player (set with $C3D5 at the start of almost every scripted scene), not a story flag | Verified (130+ writers) |
| Drop routine | 0E:50C5 (entries 0E:50B3 $FF, 0E:50B9 2, 0E:50BF 4 → $FF95): random rolls, spawns the gem/heart an enemy leaves. Called from 37 places in enemy code: the closest thing to a "defeated" event | Verified (slime, bat) |
| Death scripts | the script that calls the drop routine; the node's PC sits there for the death animation, then op $58 frees the node (+0 = $FF). Dark Slime: HP +$63 went 8 → 0, 2 per hit, PC → 21:6CD1, node freed, gem dropped. Bat: PC → 19:513C / 19:5160, node freed | Verified for 2 types |
| HP | no common field: +$63 for the Dark Slime and Risky, +$64 for the Tinker ship, 0 for the bat | Verified |
| Labyrinth enemies | Golem Mine / Cackle Mound enemy banks ($07, $0A, $0C) never call the drop routine: no known death hook | Open |
| Final boss → ending | Risky's Hideout ($3E) code in bank $15 (map entry 15:799D; GB copy bank $17). Script 15:7E16 (GB 17:7B88): cutscene lock, $C002 = 1, effect 06:72CD, spawns two objects (15:7E5C), waits $3C frames, far call 15:7E56 → 16:6E25 = the ending (the same entry the map dispatcher uses for map $38) | Read; ending entry played |
| Ending running | node 1 runs 16:7751 for the whole ending, other nodes in 16:74xx-76xx; $C39D = 5 during the talk, 0 during the credits; credits code 1C:7240 (GB 1C:78BD) | Verified ($38 warp, played with B) |

Kills, looked at again after 0.30 (driver: fight an enemy round by round, diff against the same run whipping the air):

| What | Where / detail | Status |
|---|---|---|
| No lasting record | Kill vs miss on the same timeline: nothing differs in the save block or SRAM; no counter anywhere in WRAM | Verified (Dark Slime) |
| Damage | Each enemy's own script checks for the hit and lowers its own HP with op $64 (00:18B9 writes node +$63 for the slime: 8 → 6 → 4 → 2 → 0, then FE); at 0 the script jumps to its death code (slime 21:6CD1), which (for most overworld enemies) calls the drop routine and ends with op $58 (node freed) | Verified (slime, Werewolf 11:4D00) |
| Spawn mark = per-visit kill memory | List-spawned nodes keep their spawn entry (far pointer) at **+$24..+$26** and their "spawned" mark address at **+$27/+$28**; the mark byte is in **WRAM bank 4** (e.g. w4:D078). The scanner sets it to 1 on spawn and clears it to 0 when the enemy scrolls away (so it can respawn). When the enemy removes itself (death, op $58) the mark **stays 1**, so that placement doesn't come back until the area is entered again (a warp/area load clears every mark) | Verified (slime: killed = gone for the visit, alive = respawns; Werewolf the same) |
| Caveats | Not every enemy has a mark (room-spawned ones: Scarecrow 107, Skeleton 75 have +$27 = 0); a few may free themselves without dying (an Imp 109 node vanished with its HP untouched and its mark left at 1); bank 4 is out of RetroArch's reach | Seen |

Death-script call sites (tools/re/deaths.py; "type" is by address only — the slime, type 149, dies in code placed after
type 148, so attribute a death to the type the node had just before, not to its PC):

| Death script | Drop call | Type by address |
|---|---|---|
| 0B:6B3B | 0B:6B40 | 136 ZOMBIE |
| 11:4951 | 11:496D | 152 WOLF |
| 11:4D00 | 11:4D05 | 152 WOLF |
| 11:5216 | 11:521B | 153 ICE TURTLE |
| 14:4CBB | 14:4CCF | 58 |
| 15:4BFB | 15:4C09 | — |
| 15:4C04 | 15:4C09 | — |
| 15:4C41 | 15:4C4F | — |
| 15:4C4A | 15:4C4F | — |
| 15:648B | 15:6490 | 144 SCORPION |
| 15:6585 | 15:67F2 | 145 SANDWORM |
| 15:6B50 | 15:6B55 | 123 ARCHER |
| 16:47DD | 16:47E2 | 208 |
| 16:508A | 16:508F | 212 |
| 19:512A | 19:5162 | 113 BAT |
| 19:6180 | 19:618E | 114 GOBLIN |
| 19:6189 | 19:618E | 114 GOBLIN |
| 19:7D92 | 19:7D97 | 122 GHOST |
| 1E:65F9 | 1E:6616 | 52 |
| 1E:72AA | 1E:72BB | 55 MINE CREATURE |
| 21:4BD5 | 21:4BDA | 125 FROGFISH |
| 21:5015 | 21:5026 | 126 |
| 21:5E54 | 21:5E59 | 130 REAPER |
| 21:6CD1 | 21:6CD6 | 148 SHADOW JUMPER |
| 22:47FF | 22:4832 | 73 |
| 23:592B | 23:5939 | 133 EAGLE |
| 23:5934 | 23:5939 | 133 EAGLE |
| 23:5F49 | 23:5F57 | 134 NAGA |
| 23:5F52 | 23:5F57 | 134 NAGA |
| 23:6385 | 23:638A | 135 |
| 26:47D5 | 26:47DA | 192 |
| 26:6AE2 | 26:6B12 | 204 |
| 27:55A2 | 27:55A7 | — |

Called from native code with no script caller found: 19:688F, 19:68A7, 19:7069, 19:709F, 1D:616C, 1D:61A3, 1D:61FB, 1D:6236, 1E:578A (types 115, 116, 172, 48 by address).

### Bestiary capture (0.24, removed in 0.27)

| What | Detail |
|---|---|
| Shadow OAM | $D700 / $D800 in WRAM bank 7, double-buffered (DMA source alternates each frame); written by an unrolled copy at 00:2200.. that adds the object's screen x/y to each (dy, dx, attr) entry; the tile numbers stay fixed per slot (each object's pixels are streamed into VRAM by HBlank DMA) |
| Names checked in play | type 107 = Scarecrow (walks), 108 = Clump; 113 = Spider (hangs on a thread); 112 = Bat (the user's check on the device) |
| Daylight | poke $C3E9/$C3EA = 0 before the warp: the area loads with day palettes |
| Not captured | Snake (124, stays under water), Giant Snail (131), Cackle Mound type 37: their nodes never showed sprites (or weren't found) at the sightings tried |

### Widescreen (WIDE VIEW: native/wide.c)

**Since 0.43** the picture is built from the game's own drawing code, ported from the Shantae recomp (addresses are upstream's, each read here against the ROM; the CPU calls `gbx_hook` before the instruction at these):

| Where | What it gives | Status |
|---|---|---|
| 00:0A57, 00:0A5C | LD A,(C9FB) / (C9FD): the VBlank handler copying the scroll to SCX/SCY, once the main loop has finished its frame. In a lag frame C9FB has moved on and the screen hasn't | Upstream, passes widetest's seam check |
| 03:725A, 72F0, 726A, 7300 | ADD A,(HL) on C9D2/C9D4: the scroll is the camera $FFE1/3 plus these. Sprites use the camera alone; bosses drawn in the BG move through them | Upstream |
| 01:667C | LDH A,($D7): DMA has just consumed a shadow OAM page ($FF46), and the page toggles. The page's draw list and the BG objects become this frame's | Upstream, statue test |
| 00:1DC6 | LD A,(HL+): a metasprite before the cull. HL its layout (+32 count, +35 triples), top of the stack the cel (+8 graphics), position FF92/FF94 + FFE1/FFE3, page $FFD9 | Upstream, statue test |
| 01:4F16 | LD A,($FFBD): an object drawn into the BG map before its cull: BC the object, +2E/+2F its picture (cols, rows, tile/attr pairs), +5B/+5F its cell | Upstream, widetest counts them |
| 00:1AEB | LD A,(BC): script op 2C's graphics load: labyrinth pictures and key doors draw from the ROM bytes they asked for | Upstream, not exercised by a test |
| 01:5E0B | The LYC=0 handler before it uploads palettes: the colours the top lines were really drawn with | Upstream, fades not checked closely |
| Room | C9DB-C9E2 camera range + map sectors: pictures are 8-connected drawn sectors less bands of one metatile. Towns: map 67:9B with bounds 0..480, street wraps at 640, art 116 rows | Upstream |

Built at the start of VBlank rather than upstream's line 0, as gambatte runs a frame at a time: nothing drawn from moves in between but the palettes. Not ported: its object activation (bounds read at their consumers) and 157 slots; the spawn patch below stays.

The rest of this section is 0.37's strips; the spawn window and the timing notes still hold. tools/re/wide.py is the first prototype.

A picture wider than 160 px, from driver dumps: the real screen in the middle, side strips from the level data and live
VRAM/palettes, off-screen objects from their cels. Renders in `Renders\Widescreen test`.

| What | Detail | Status |
|---|---|---|
| Spawn window | 01:506A: $FFC5 = camera X - 8 (`sub $08` at 01:506D), $FFC9 = camera X + 168 (`add $A8` at 01:5084); $FFC7/$FFCB the same in Y with - 8, + 152. An object spawns when its list entry's box overlaps this | Traced |
| Despawn window | just above it, 01:5032..: $FFB5 = X - 80, $FFB7 = X + 240, $FFB9 = Y - 72, $FFBB = Y + 216 | Read, not traced |
| Spawn patch | ROM file bytes $506E 08 -> 38 and $5085 A8 -> D8: the X window becomes 56 px past the screen, still inside the despawn window. Births moved to about 48 px past the edge (22 of 60; stock: 24 of 54 within 16 px). Peak drawn nodes 5 -> 6 over 12 rooms. Play changes a little: objects act earlier (the same walk ended elsewhere in 4 of 12 rooms) | Driver |
| Level strips | Level data matches the live BG map on 99.84% of on-screen cells over all warp places. The misses are objects drawn into the BG map (handler 01:4F12) | Driver |
| Object position | Screen X = (+$34) - $FFE1 + (+$39) + (+$3D), Y = (+$37) - $FFE3 + (+$3B) + (+$3F); sprite at OAM (Y + dy, X + dx). dy/dx are bytes: layout words +0 and +4 (the bounds) say which way they wrap. Handlers $62xx-$63xx only | Driver |
| Timing | Nodes and $FFE1/3 at a frame's end show up on screen 2 frames later (a static statue crossing the join: strip 2 px ahead per px/frame of scroll from live nodes, 1 from the last frame's, 0 from the one before; 0.41 draws from that). Earlier notes here said 1 frame: wrong, the cel check against shadow OAM can't see it | Measured |
| Cels vs shadow OAM | In play: 97.1% of cel sprites found there, 94.5% of its entries explained. The rest are objects with other handlers | Driver |
| $FFD7 | XORed with 8 each frame: which VRAM bank the sprite stream goes to, not a flip. Flips are in the layout (+$31 picks it) | Read |
| Limits | A room's end: nothing to show, so one-screen rooms gain nothing. BG-drawn objects off screen aren't in the strips yet (their cels could be). Objects with other handlers aren't either. Colour cycling and tile animation are live, so they match. RetroArch's picture can't be changed from Shantae Link | Seen |
| Truth test | tests/widetest.py: walk until what was in the strip has scrolled onto the real screen, compare pixels | Driver |

### Sprite cels in the ROM (found after 0.29)

Object sprites are stored uncompressed in the ROM. Draw routine 00:1DA3/1DAD, OAM writers jumped to through 00:01AD.. (unrolled at 00:2036..).
`tools/re/sprites.py DUMP OUTDIR` decodes every live node's current cel; `tools/re/smdis.py BANK ADDR N` is a small disassembler.

| What | Detail | Status |
|---|---|---|
| Node | +$2E ROM bank ($FF = nothing drawn), +$2F/30 cel pointer, +$31 layout index (×2 into the cel) | Verified |
| Cel | words +0..+6: up to 4 layouts; word +8: tile block | Verified |
| Tile block | count byte (8x16 sprites), then 32 bytes per sprite, copied each frame to WRAM $C4C0 (00:1E29..) | Verified (byte-equal to the live buffer) |
| Layout | +0..+7 on-screen bounds; +$20 sprite count (≤ $28 a frame in total); +$21 OAM writer address; +$23.. 3 bytes per sprite: dy, dx, attr (palette in bits 0-2). Sprite k uses tiles 2k, 2k+1. $FFD7 ≠ 0 (flipped) uses writer +$7B | Verified (Shantae's 10 sprites match OAM) |
| Coverage | 135 distinct cels in the sw/ow states: 120 decode cleanly (Shantae, Risky, bosses, NPCs, enemies). 15 cels at the ends of banks ($7Fxx) or with odd blocks don't decode yet | Partial |
| Set-cel script ops | `op bank lo hi` → node +$2E/+$2F/+$30, and +$2A/2B = draw handler: $04 (01:4F12), $08 (4F4E), $0A (4F53), $0C/$0E/$18/$1A (62xx/63xx handlers); $06 `op ptr` reads bank lo hi from ptr. Code 00:1418-14F8 | Read from handlers |
| BG-drawn objects | Handler 01:4F12 → 00:0F15 draws the object into the BG map copy instead: cel = w, h, then w*h words (lo tile, hi BG attribute), tiles from the room's tileset. Blocks, doors and breakable rocks use it (types 124, 131, 154 and the cels at $7Fxx that "don't decode" as sprites) | Verified (rendered from live VRAM) |
| Type → cels | Script scan: every set-cel op between a type's start and the next type's start in its bank (tools/re scan in beast_rom.py's notes), plus live sweeps (warp, teleport across the room, record every node's type and cel). Effect cels shared by 30 types: 62:7AE9..63:4000 (puffs/sparks) and 54:49DB.. (explosion), 54:72F8.. (pot breaking) | Verified |
| Palettes | Area OBJ palettes = $C400 after a day warp (palettes 4-5 change per area, 0-3 and 6-7 are the same everywhere) | Verified for 17 areas |
| Names fixed | 131 is a rock block (BG-drawn), **132 = Giant Snail**, **135 = Praying Mantis**; 124 is a block, **126 = Snake** (head out of the water); **115 = Archer** (with bow), 123 = a totem; 37/59/87 are pots, 15 = pickups; Cackle Mound enemies are **73, 74, 75**; Golem Mine enemies 48, 52, 55; 147 rises out of the Mud Bog. 112 is a "?" statue, not the Bat; the old "bat" is 109 (named IMP by the user) | Looked at |
| Full sweep | livesweep over every map id $00-$43, by day and by night (poke $C3EA = $80): no enemy is day-only or night-only (only the fireflies, 104). New enemies: 109, 140, 142 (Mens Desert), 192, 204 (Twinkle Palace), 172/215 Tinkerbats, 208, 209, 211/212, 220 (Risky's Island) | Verified |
| Final list | 46 entries in tools/re/beast_rom.py BEASTS (names from the user, "Bestiary final.png" in Renders); dropped as not enemies: 199, 213, 214, 178 | User-checked names |

## RetroArch (Shantae Link 0.1)

What RetroArch's `READ_CORE_MEMORY` reaches with the Gambatte core, and what the Link app reads instead of the rest.
Found with the driver dumps (503 snapshots: all test states, a warp fade frame by frame, a walk) and a port of RetroArch's
descriptor code (tests/mock_ra.py).

| What | Where / detail | Status |
|---|---|---|
| Gambatte's memory map | C000 WRAM 0, D000 WRAM 1 (**always bank 1**: `rambank1_ptr` = wramdata + 0x1000, not SVBK's bank), FF80 HRAM, 8000 VRAM (**bank 0 only**), FE00 OAM (select `0xFFFFFFE0`: **only FE00-FE1F**), 0000/4000 ROM banks 0/1 (fixed), FF00 I/O, A000 cart RAM, 10000 WRAM 2-7 (select `0xFFFFA000`: **only 10000-11FFF and 14000-15FFF**, i.e. banks 2, 3, 6, 7) | Verified (descriptor code) |
| Not reachable | WRAM banks 4-5, VRAM bank 1, CGB palette RAM, OAM past FE1F | Verified |
| mGBA's memory map (Link 0.7) | ROM 0000/4000, VRAM 8000 (bank 0), WRAM C000 / D000 (bank 1 fixed), OAM FE00 (select `0xFFFFFF60`), I/O FF00 ($80), HRAM FF80 (**$7F bytes**, select `0xFFFFFF80`), IE FFFF (1), cart RAM A000, WRAM 2-7 at 10000 ($6000, no select). RetroArch's preprocessing gives up at that last one (not a power of two) and ignores the failure, so it is matched as a plain range: banks 2-7 all reachable. A 128-byte read at FF80 comes back 127 bytes (RetroArch 1.22 stops at a descriptor's end): read HRAM as FF80-FFFE for both cores | Verified live (RetroArch 1.22.2, buildbot mGBA) |
| Palette copies | OBJ palettes at **$C400**, BG palettes at **$C440** (64 bytes each, BGR555). The colours the game sets and fades to: equal to palette RAM in 345 of 503 snapshots; the rest are fades (palette RAM black, the copy already the new room's) and 4 animated colours (palette 6) in some rooms | Verified |
| Tileset loads | `cd 03 08` (call $0803) + 8 inline bytes: source lo, hi, ROM bank, VRAM dest lo, hi, VRAM bank, length lo, hi. $0803 copies them to HRAM $94-$9B and far-calls the LZSS unpacker 01:41BD. 229 in the ROM: 115 to VRAM bank 0 ($8000, $1800 bytes), 114 to bank 1 ($8000, $1200 or $1800); each room's code loads bank 0 then bank 1 right after it (114 of 115 have a bank-1 load within 48 bytes) | Verified |
| VRAM bank 1 rebuilt | (1) the font/HUD tileset (LZSS 0x3964A3, $1800 bytes, loaded to bank 1 $8000 at start): bank-1 tiles past a room's load are this 99.8% of the time; (2) the room's bank-1 load: match live VRAM bank 0 against the unpacked bank-0 loads and unpack its partner (98.1% of on-screen bank-1 BG tiles right from this alone, 5403 / 5507 over 261 play screens); (3) tiles $000-$04F from the sprite stream (below). With all three the Link map is pixel-identical to Shantae Dual's in the 9 rooms compared. The LZSS ring (4 KB in WRAM bank 2, writes from $FEE) also holds the last 4 KB unpacked, but only covers part of the set | Verified |
| Sprite stream | tiles $000-$04F (1280 bytes) of both VRAM banks: HBlank DMA every frame from WRAM $C4C0 (01:0A96), the two banks taking turns. $C4C0 equals live bank 1 there for 80% of tiles (exactly in 275 of 451 play screens; a frame out of step otherwise) | Verified |
| BG map copy | WRAM 1 $D000 (tiles) / $D400 (attributes), 32x32, copied to VRAM by HDMA strips (see "Level data"): stands in for the BG map's bank-1 attributes in play, and on the inventory screen too (1002 of 1024 attribute bytes equal) | Verified |
| Inventory tilesets | `$0803` loads like the rooms': bank 0 from 7A:6515 ($1800), bank 1 from 7A:7113 (11 bytes later in the ROM; calls at 0x0158A4/AF and 0x0167B8/C3); both match live VRAM 100%. With the BG map copy and the palette copy, every inventory icon is rebuilt pixel for pixel. The screen's BG palettes are in the ROM as loaded: 64 bytes at 7A:7C30 (0x1EBC30, the only full match). Icon blocks (tile/attr, $8800 tiles, map order): see link.js ICON_MAP; 0.31 builds all 22 from the ROM alone (tests/icontest.py: each matches the live screen). The screen's BG map is in the ROM too: `14 12` (20x18) at 7A:7C70, then (tile, attr) words; the left panel (cols 1-9, rows 1-17, Shantae's backdrop) matches live exactly, the icon slots and counts are filled in by code. Shantae is 7 object cels in bank 7B (menu nodes 0-6, sprites at screen (dx, dy - 24)): body 42BA (pal 0), face/hair 44F9 and 48EE, boot 47DF, cuff 4768, sash 46CB, tiara 462E; the menu's OBJ palettes are 64 bytes at 7B:427A (0x1EC27A) | Verified (driver dump and live RetroArch) |
| $FFFE | 3 on GBA hardware, 1 on GBC (0 before the game sets it) | Verified (484/503 = 3 in GBA-mode states) |
| $FF8B | Buttons held (A 1, B 2, Select 4, Start 8, R $10, L $20, U $40, D $80); $FF8D the same in play | Verified (Select, Down) |
| Select | Starts a dance in play; leaves $C28F-$C2B5 set (not a "dancing" flag) | Verified |

## 3DS Virtual Console (Luma plugin feasibility, Nov 2 2026)

Where Nintendo's 3DS VC emulator keeps the Game Boy's memory, for a Luma3DS (3GX) plugin that draws the Link screen
next to the official game. Title `00040000000BE500` (Shantae, USA, product CTR-N-QAVE; the emulator's buildtime.txt
says 28 Jun 2013). Its RomFS holds the same ROM (`rom/CGBB3AE0.963`, CRC32 `E994B59B`), `config.ini` (the emulator's
settings) and `CGBB3AE0.963.patch` (Nintendo's per-game fixes: "FPA" flashing-light dimming at ROM addresses, and a
"title jump"). Found from a GodMode9-decrypted CIA run in Azahar with its GDB stub, matched against driver dumps of the
title screen (scripts: tools/re/vc/). Process addresses are virtual; .code loads at 0x100000 (text), .data at 0x1B6000.

| What | Where / detail | Status |
|---|---|---|
| Pointer table in .data | `0x1BAD98` ROM, `0x1BAD9C` **WRAM** (32 KB, banks 0-7 back to back: bank n at +n*$1000), `0x1BADA0` **VRAM** (16 KB, bank 1 at +$2000), `0x1BADA4` +$90 past HRAM (cart RAM? unchecked), `0x1BADA8` OAM ($A0), `0x1BADAC` **HRAM** (FF80-FFFE), `0x1BADB0` **I/O** (FF00-FF7F, as the CPU reads them) | Verified (two boots, Azahar) |
| Current banks | `0x1BAE70` the WRAM bank in $D000 (WRAM + SVBK*$1000), `0x1BAE74` the VRAM bank in $8000 | Seen once (SVBK 3) |
| Values in Azahar | the heap block: ROM 0x08800010, WRAM 0x08C2CB24, VRAM 0x08C34B34, OAM 0x08C38B44, I/O 0x08C38BF4, HRAM 0x08C38C74; same on two boots. A plugin should read the table rather than these: the heap may lie elsewhere on a real 3DS | Verified (Azahar only) |
| Checks | WRAM banks 1-3 and 7 match gambatte's 12/12 sampled chunks; HRAM's sprite-DMA routine and variables, KEY1 = $FE (double speed), SVBK = $FB match | Verified |
| On a real 3DS (plugin 0.1, New 3DS) | The table held the same heap addresses as in Azahar (WRAM 0x08C2CB24, HRAM 0x08C38C74, I/O 0x08C38BF4, VRAM 0x08C34B34) | Verified (device photo) |
| VC state | u8 at `0x1BB500`: 1 = game running, 11 = VC menu (after a tap). Read by the VC's per-frame switch at 0x102940 | Verified (Azahar) |
| VC input | The VC's input struct at `0x21363C` (filled by 0x108C38 each frame): +0 held, +4/+8 pressed/released, +$14 touching, +$18 touch pressed, +$1C released, +$20/+$24 touch x/y. A tap opens the VC menu (state 11) and pauses the game, even under the plugin's overlay | Verified (Azahar; device: tap pauses) |
| Touch block | 0x108D48, 0x108D64 (`ldrb r1,[sp,#4]` E5DD1004 -> `mov r1,#0` E3A01000) and 0x108D7C (E5DD0004 -> `mov r0,#0` E3A00000): the VC sees no touch, buttons unchanged. Two taps with it: state stays 1, no menu, 60 FPS | Verified (Azahar, patched through GDB) |
| Not found yet | CGB palette RAM (the game's copies at $C400/$C440 do instead) | Open |
