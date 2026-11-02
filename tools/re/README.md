Reverse-engineering scripts used for SHANTAE-RAM.md (Python 3 + Pillow). Set SHANTAE_ROM=/path/to/shantae.gbc;
`h.py` drives `out/host/drive` (states in ./st). rooms.py lists every room header, region.py renders a region from
a `drive dump`, spawns.py lists the inline object spawns, snap.py renders gb_snapshot blobs, gbdis.py disassembles.
objlist.py decodes an object grid (`objlist.py <bank> <hi>`, from the room header / $C39A-$C39B), allobj.py lists
every placed object in every room (and wrote the collectible table in SHANTAE-RAM.md), sweep_obj.py teleports
Shantae across a room looking for live objects, door.py tries a door.
town_up.py walks a town street to each door and presses Up (where every door leads).
scenes.py decodes the warp codes ($CBF3 chains -> entry routines -> room dispatchers -> headers); bfs.py, ring.py and
ringl.py play every edge exit / door in the driver and record where it leads (links.json); exits.py, doors2.py and
signs.py are the single-shot versions.
kill.py puts Shantae beside an enemy and mashes B, logging its node each chunk (fight / fight2); deaths.py lists every
script that calls the enemy drop routine (0E:50B3/B9/BF).

0.26 hand-off: the helpers that had lived only in the work folder are now here too — lzss.py (the game's LZSS
decoder), render.py (BG/window/sprite layers from a dump), tp.py / walk.py / seq.py (driver walking and frame grids),
lag.py / lag2.py, scan.py, sweep.py / sweepall.py, objs.py, pk.py, sheet.py, bits.py; extra/ holds two older
node/sweep helpers. They use absolute paths (/home/claude/work, /home/claude/shantae-dual): see tools/fixpaths.py.
