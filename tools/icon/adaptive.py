"""Adaptive launcher icon (0.25) from the 48x48 pixel-art icon: background = the icon's night purple with its sparkles
spread to the edges (so a circle, squircle or square mask is filled), foreground = the two screens, centred inside the
66 dp safe zone. Layers are 72 art pixels across (1 art pixel = 1.5 dp), written per density with nearest scaling."""
import os, random
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
src = Image.open(os.path.join(ROOT, 'app/res/mipmap-xxxhdpi/ic_launcher.png')).convert('RGBA').resize((48, 48), Image.NEAREST)
BG = (34, 14, 58, 255)
P0, P1 = (7, 10), (38, 35)                       # the two panels' box in the 48 grid
def inside(x, y): return P0[0] <= x <= P1[0] and P0[1] <= y <= P1[1]
N = 72
bg = Image.new('RGBA', (N, N), BG); fg = Image.new('RGBA', (N, N), (0, 0, 0, 0))
sp, bp, fp = src.load(), bg.load(), fg.load()
ox = oy = 14                                      # panel group centre (22.5) -> layer centre (36)
for y in range(48):
    for x in range(48):
        c = sp[x, y]
        if c[3] == 0 or c == BG: continue
        if inside(x, y): fp[x + ox, y + oy] = c
        else: bp[x + ox, y + oy] = c              # the icon's own sparkles, where they were
# more sparkles toward the edges so the whole mask is lit, same colours as the icon's
cols = [(248, 240, 224, 255), (176, 112, 232, 255), (248, 192, 72, 255)]
rnd = random.Random(7)
placed = 0
while placed < 26:
    x, y = rnd.randrange(2, N - 2), rnd.randrange(2, N - 2)
    r = ((x - 36) ** 2 + (y - 36) ** 2) ** 0.5
    if r < 25 or bp[x, y] != BG: continue
    bp[x, y] = cols[placed % 3]; placed += 1
for name, px in (('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)):
    d = os.path.join(ROOT, 'app/res/mipmap-' + name); os.makedirs(d, exist_ok=True)
    bg.resize((px, px), Image.NEAREST).save(os.path.join(d, 'ic_launcher_background.png'))
    fg.resize((px, px), Image.NEAREST).save(os.path.join(d, 'ic_launcher_foreground.png'))
d = os.path.join(ROOT, 'app/res/mipmap-anydpi-v26'); os.makedirs(d, exist_ok=True)
open(os.path.join(d, 'ic_launcher.xml'), 'w').write('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
''')
# preview: circle and squircle masks
prev = Image.new('RGBA', (2 * 432 + 40, 432), (240, 240, 240, 255))
full = Image.alpha_composite(bg.resize((432, 432), Image.NEAREST), fg.resize((432, 432), Image.NEAREST))
from PIL import ImageDraw
m = Image.new('L', (432, 432), 0); ImageDraw.Draw(m).ellipse([0, 0, 431, 431], fill=255)
prev.paste(full, (0, 0), m)
m2 = Image.new('L', (432, 432), 0); ImageDraw.Draw(m2).rounded_rectangle([0, 0, 431, 431], radius=130, fill=255)
prev.paste(full, (472, 0), m2)
prev.save('/tmp/icon_adaptive_preview.png')
