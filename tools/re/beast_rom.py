"""Bestiary straight from the ROM (after 0.29): one cel per enemy, drawn with its area's OBJ palette.
Types and cels were mapped by tools/re/sprites.py plus a script scan (set-cel ops) and live sweeps; see SHANTAE-RAM.md
"Sprite cels in the ROM". PALS = file of "AREA C400: 64 bytes" lines (driver: warp AREA by day, run 400, peek C400 64).
usage: beast_rom.py PALS OUT.png"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sprites import cel, pal_from
from PIL import Image, ImageDraw

# name, types, area (map id), cel, sure
BEASTS = [   # names checked by the user against "Bestiary check 2.png" (after 0.29); dropped: 199 sun wheel,
             # 214 fire bug, 178 tinker knight, 213 vase (not enemies)
    ('CLUMP', [108], 0x02, '64:4311', 1), ('SCARECROW', [107], 0x02, '62:6C38', 1),
    ('SPIDER', [113], 0x0F, '6E:6E9D', 1), ('GOBLIN', [114], 0x0F, '79:6539', 1),
    ('SNAKE', [126], 0x09, '8B:493B', 1), ('FROG', [125], 0x09, '88:755C', 1),
    ('WATER SERPENT', [127], 0x09, '8B:4E8B', 1), ('AARDVARK BEE', [150], 0x1A, 'AF:765C', 1),
    ('SENTIENT TOMATO', [116], 0x0D, '9B:426F', 1), ('REAPER', [130], 0x0D, 'DB:7225', 1),
    ('GIANT SNAIL', [132], 0x1F, 'C9:4780', 1), ('PRAYING MANTIS', [135], 0x1F, 'DB:507C', 1),
    ('ZOMBIE', [136], 0x36, 'C7:724A', 1), ('BLOB', [117, 118], 0x14, 'B0:49AD', 1),
    ('KAPPA', [121], 0x14, 'C8:55BC', 1), ('GHOST', [122], 0x14, 'C8:69F8', 1),
    ('ARCHER', [115], 0x15, '8B:77C3', 1), ('TOTEM', [123], 0x15, 'DD:692A', 1),
    ('WEREWOLF', [152], 0x0E, 'A8:6FBD', 1), ('ICE TURTLE', [153], 0x0E, 'DC:715B', 1),
    ('GRYPHON', [133], 0x20, 'DA:6927', 1), ('HANGING SHADOW', [147], 0x0B, '9B:55D0', 1),
    ('SHADOW JUMPER', [148], 0x0B, 'A5:7BA6', 1), ('DARK SLIME', [149], 0x0B, 'A8:4F26', 1),
    ('SCARAB', [144], 0x1A, 'D9:60C6', 1), ('SCORPION F', [139], 0x1A, 'A9:5550', 1),
    ('SANDWORM', [145], 0x1A, 'D9:72E6', 1), ('NAGA', [134], 0x1E, 'DC:4F5B', 1),
    ('GOLEM', [48], 0x07, '81:41F3', 1), ('CONSTRUCT', [52], 0x07, '81:7D43', 1),
    ('MINE SLUG', [55], 0x07, '80:44D9', 1), ('SHADE', [73], 0x0A, '95:66CC', 1),
    ('SHADOW IMP', [74], 0x0A, '96:4BB2', 1), ('SKELETON', [75], 0x0A, '98:5B00', 1),
    ('DOLL', [189], 0x2C, 'C9:6238', 1), ('GATE', [190], 0x24, 'C9:6519', 1),
    # found later by the day/night sweeps of every map id
    ('IMP', [109], 0x02, '63:75D5', 1), ('SCORPION M', [140], 0x19, 'AA:629F', 1),
    ('CROW', [142], 0x19, 'D8:6829', 1), ('GARY', [192], 0x3A, 'D0:7589', 1),
    ('BOB', [204], 0x3A, 'DC:7BD9', 1),
    ('FLYING TINKERBAT', [211, 212], 0x3C, 'E0:48D6', 1), ('STEAM TINKERBAT', [208], 0x3C, 'E0:4219', 1),
    ('TINKER STACK', [209], 0x3C, 'E0:50D2', 1), ('TINKERBAT', [172, 215], 0x05, '7D:4DC8', 1),
    ('RISKY BOOTS', [220], 0x3C, '5F:6BFB', 1)]

# warp ids (SHANTAE-RAM.md "Dev room warp"); a warp lands in a region that can hold several places
AREAS = {0x02: 'SCARECROW FIELD', 0x06: 'SPIDERWOOD FOREST', 0x07: 'GOLEM MINE', 0x09: 'WATERFALL LAKE',
         0x0A: 'CACKLE MOUND', 0x0B: 'MUD BOG', 0x0D: 'RAIN STORM RIVER', 0x0E: 'MOUNT POINTY',
         0x0F: 'GOBLIN FOREST', 0x10: 'FOREST SIDE AREA', 0x14: 'GHOST FOREST', 0x15: 'ARCHER FOREST',
         0x16: 'DRIBBLE FOUNTAIN ENT.', 0x17: 'SCUTTLE TOWN GATES', 0x18: 'WATER TOWN GATES', 0x19: 'MENS DESERT',
         0x1A: 'LADIES DESERT', 0x1B: 'HIDDEN WATERFALL', 0x1C: 'OASIS TOWN GATES', 0x1D: 'ZOMBIE CARAVAN GATES',
         0x1E: 'NAGA WASTELAND', 0x1F: 'SNAIL WASTELAND', 0x20: 'EAGLE WASTELAND', 0x2F: 'BANDIT TOWN GATES',
         0x36: 'ZOMBIE SWAMP', 0x3A: 'TWINKLE PALACE', 0x3E: "RISKY'S HIDEOUT", 0x01: 'DRIBBLE FOUNTAIN',
         0x05: 'SCUTTLE DOCKS', 0x08: 'GECKO MATCH', 0x39: 'SHIP INTERIOR', 0x3C: "RISKY'S ISLAND",
         0x40: 'SPIDERWOOD FOREST', 0x41: 'MENS DESERT', 0x42: 'ZOMBIE SWAMP', 0x43: 'MOUNT POINTY',
         0x12: 'WATERFALL LAKE', 0x21: 'WATERFALL LAKE', 0x04: 'SCUTTLE TOWN', 0x30: 'WATER TOWN',
         0x31: 'ZOMBIE CARAVAN', 0x34: 'OASIS TOWN', 0x35: 'BANDIT TOWN', 0x22: 'ARENA', 0x37: 'GOLEM STONE ROOM'}
for i in range(0x24, 0x2F): AREAS[i] = 'CAVE %d' % ({0x2C: 9, 0x2D: 11, 0x2E: 12}.get(i, i - 0x23))
INSIDE = {0x07, 0x0A, 0x3A, 0x3E} | set(range(0x24, 0x2F))   # dungeons and caves: no day/night

def sightings(day, night, types):
    """-> [(area, 'DAY'|'NIGHT'|'DAY+NIGHT'|'ANY')] from livesweep outputs (area -> type -> cels)."""
    seen = {}   # by place name: the ALT warps and duplicates land in the same place
    for when, sw in (('DAY', day), ('NIGHT', night)):
        for a, ts in sw.items():
            a = int(a, 16)
            if any(str(t) in ts for t in types):
                k = seen.setdefault(AREAS.get(a, 'MAP $%02X' % a), [a in INSIDE, set()]); k[1].add(when)
    when = lambda v: 'ANY TIME' if v[0] else {'DAY': 'DAY ONLY', 'NIGHT': 'NIGHT ONLY'}.get('+'.join(sorted(v[1])), 'DAY+NIGHT')
    return [(n, when(v)) for n, v in sorted(seen.items(), key=lambda kv: (kv[1][0], kv[0]))]   # outdoors first

if __name__ == '__main__':   # beast_rom.py PALS OUT.png [DAY.json [NIGHT.json...]]
    import json
    pals = {}
    for l in open(sys.argv[1]):
        p = l.split(); pals[int(p[0], 16)] = bytes(int(x, 16) for x in p[2:66])
    day = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
    night = {}
    for f in sys.argv[4:]:
        for a, ts in json.load(open(f)).items(): night.setdefault(a, {}).update(ts)
    cw, ch, cols = 200, 136, 5
    rows = (len(BEASTS) + cols - 1) // cols
    S = Image.new('RGBA', (cols * cw, rows * ch), (70, 74, 96, 255)); d = ImageDraw.Draw(S)
    for n, (name, types, area, c, sure) in enumerate(BEASTS):
        im = cel(int(c[:2], 16), int(c[3:], 16), pal_from(pals[area]))
        x, y = n % cols * cw, n // cols * ch
        sc = min(2, 80 // max(im.width, 1), 80 // max(im.height, 1)) or 1
        m = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
        if m.width > 146 or m.height > 76: m.thumbnail((146, 76))
        S.paste(m, (x + (cw - m.width) // 2, y + 2 + (76 - m.height) // 2), m)
        d.text((x + 3, y + 80), '%d %s%s' % (n, name, '' if sure else ' ?'), fill=(255, 255, 160, 255) if sure else (255, 170, 120, 255))
        seen = sightings(day, night, types) or [(AREAS.get(area, '?'), 'NOT SEEN IN SWEEPS')]
        for k, (a, when) in enumerate(seen[:4]):
            txt = '+%d MORE PLACES' % (len(seen) - 3) if k == 3 and len(seen) > 4 else '%s: %s' % (a, when)
            d.text((x + 3, y + 92 + 10 * k), txt, fill=(170, 225, 255, 255))
    S = S.resize((S.width * 2, S.height * 2), Image.NEAREST)
    S.save(sys.argv[2]); print(S.size)
