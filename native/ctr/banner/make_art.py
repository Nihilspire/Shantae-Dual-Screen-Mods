"""make_art.py OUTDIR - the 3DS HOME Menu icon (48x48) and banner (256x128) for Shantae Dual 3DS: an original pixel
wordmark ("SHANTAE" / "DUAL") in a warm gold-to-orange with a purple outline and shadow, on a night sky with sparkles,
a crescent moon and (banner) a gold flourish. Drawn here letter by letter; no game art, logo or font."""
import os, sys, random
from PIL import Image

# a blocky, rounded 5x7 alphabet drawn for this project (only the letters needed)
GLYPH = {
    'S': ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    ' ': ['.....'] * 7,
}
GRAD = [(255, 246, 176), (255, 228, 120), (250, 200, 72), (246, 168, 48), (236, 128, 40), (220, 96, 40), (196, 72, 44)]
OUTLINE, SHADOW = (58, 16, 80), (20, 4, 40)

def sky(w, h, seed):
    im = Image.new('RGB', (w, h))
    top, bot = (58, 24, 104), (12, 4, 24)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(w): im.putpixel((x, y), c)
    rnd = random.Random(seed)
    for _ in range(w * h // 90):                                  # sparkles: dots and little crosses
        x, y = rnd.randrange(w), rnd.randrange(h)
        c = rnd.choice([(255, 255, 255), (255, 200, 240), (200, 220, 255), (255, 236, 160)])
        im.putpixel((x, y), c)
        if rnd.random() < 0.25 and 0 < x < w - 1 and 0 < y < h - 1:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): im.putpixel((x + dx, y + dy), tuple(v // 2 + 40 for v in c))
    return im

def moon(im, cx, cy, r):                                          # a crescent: a disc minus an offset disc
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r and (x - cx - r // 2) ** 2 + (y - cy + r // 3) ** 2 > (r * 0.85) ** 2:
                if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), (255, 244, 200))

def word(im, text, x0, y0, s, gap=1):
    """Draws text at scale s (pixels per glyph pixel): shadow, outline, then the gradient fill."""
    cells = set()
    for i, ch in enumerate(text):
        g = GLYPH[ch]
        for gy, row in enumerate(g):
            for gx, v in enumerate(row):
                if v == '#': cells.add((i * (5 + gap) + gx, gy))
    def fill(px, py, c):
        for yy in range(py, py + s):
            for xx in range(px, px + s):
                if 0 <= xx < im.width and 0 <= yy < im.height: im.putpixel((xx, yy), c)
    o = max(1, s // 3)                                            # outline thickness in screen pixels
    for (gx, gy) in cells:                                        # shadow, down-right
        fill(x0 + gx * s + o + max(1, s // 2), y0 + gy * s + o + max(1, s // 2), SHADOW)
    for (gx, gy) in cells:                                        # outline
        for dx in (-o, 0, o):
            for dy in (-o, 0, o):
                fill(x0 + gx * s + dx, y0 + gy * s + dy, OUTLINE)
    for (gx, gy) in cells:                                        # the gold-to-orange fill, top to bottom
        for yy in range(s):
            c = GRAD[min(6, (gy * s + yy) * 7 // (7 * s))]
            for xx in range(s):
                X, Y = x0 + gx * s + xx, y0 + gy * s + yy
                if 0 <= X < im.width and 0 <= Y < im.height: im.putpixel((X, Y), c)
        if gy == 0 or (gx, gy - 1) not in cells:                  # a light top edge on each block
            for xx in range(s):
                X, Y = x0 + gx * s + xx, y0 + gy * s
                if 0 <= X < im.width and 0 <= Y < im.height: im.putpixel((X, Y), (255, 252, 220))

def word3d(im, text, x0, y0, s, depth, gap=1):
    """Thick 3D text: an extruded side going down-right (dark purple, lit at the top), a dark outline, then the
    gold-to-orange face. Nothing else is drawn, so the background stays transparent."""
    cells = set()
    for i, ch in enumerate(text):
        for gy, row in enumerate(GLYPH[ch]):
            for gx, v in enumerate(row):
                if v == '#': cells.add((i * (5 + gap) + gx, gy))
    def fill(px, py, w, h, c):
        for yy in range(py, py + h):
            for xx in range(px, px + w):
                if 0 <= xx < im.width and 0 <= yy < im.height: im.putpixel((xx, yy), c)
    o = max(1, s // 3)
    for d in range(depth + o, 0, -1):                             # the extrusion, back to front
        t = d / (depth + o)
        c = (int(150 - 110 * t), int(52 - 40 * t), int(170 - 110 * t), 255)
        for (gx, gy) in cells: fill(x0 + gx * s + d - o, y0 + gy * s + d - o, s + 2 * o, s + 2 * o, c)
    for (gx, gy) in cells: fill(x0 + gx * s - o, y0 + gy * s - o, s + 2 * o, s + 2 * o, OUTLINE + (255,))
    for (gx, gy) in cells:                                        # the face
        for yy in range(s):
            fill(x0 + gx * s, y0 + gy * s + yy, s, 1, GRAD[min(6, (gy * s + yy) * 7 // (7 * s))] + (255,))
        if (gx, gy - 1) not in cells: fill(x0 + gx * s, y0 + gy * s, s, 1, (255, 252, 220, 255))

def width(text, s, gap=1): return (len(text) * (5 + gap) - gap) * s

def flourish(im, cx, y, half):
    """A gold line of small diamonds under the wordmark, with a four-point sparkle at each end."""
    def put(x, y, c):
        if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), c)
    for x in range(cx - half, cx + half + 1):
        put(x, y, (220, 140, 48)); put(x, y + 1, (120, 60, 40))
    for x in range(cx - half + 6, cx + half - 5, 8):              # diamonds along it
        for dx, dy in ((0, -2), (-1, -1), (0, -1), (1, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
            put(x + dx, y + dy, (255, 228, 120) if abs(dx) + abs(dy) < 2 else (236, 160, 56))
    for ex in (cx - half - 6, cx + half + 6):                     # sparkles at the ends
        for d in range(-4, 5):
            c = (255, 252, 220) if abs(d) < 2 else (255, 200, 120)
            put(ex + d, y, c); put(ex, y + d, c)

def main(out):
    os.makedirs(out, exist_ok=True)
    icon = sky(48, 48, 7); moon(icon, 40, 7, 5)
    word(icon, 'SHANTAE', (48 - width('SHANTAE', 1)) // 2, 8, 1)
    word(icon, 'DUAL', (48 - width('DUAL', 2)) // 2, 22, 2)
    icon.save(os.path.join(out, 'icon.png'))
    ban = Image.new('RGBA', (256, 128), (0, 0, 0, 0))             # banner: only the 3D text, transparent behind
    word3d(ban, 'SHANTAE', (256 - width('SHANTAE', 5)) // 2 - 3, 14, 5, 7)
    word3d(ban, '3DS MOD', (256 - width('3DS MOD', 5)) // 2 - 3, 66, 5, 7)
    ban.save(os.path.join(out, 'banner.png'))
    # a preview (both, scaled up, the banner on grey to show its transparency) for checking
    prev = Image.new('RGB', (256 * 2 + 48 * 4 + 24, 256), (0, 0, 0))
    bg = Image.new('RGBA', (256, 128), (150, 150, 160, 255)); bg.alpha_composite(ban)
    prev.paste(bg.convert('RGB').resize((512, 256), Image.NEAREST), (0, 0)); prev.paste(icon.resize((192, 192), Image.NEAREST), (536, 32))
    prev.save(os.path.join(out, 'preview.png'))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
