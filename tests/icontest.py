"""icontest.py - the Link page's item, stone, talisman, squid and firefly icons, built from the ROM (0.31), against the
in-game inventory.

  python3 tests/icontest.py [--page DIR]
Plays d4.st with every item, stone and talisman owned, opens the inventory and dumps a run of frames once it has faded
in. Then loads the page on the first dump and checks each icon it built from the ROM is pixel for pixel the same
2x2 block of the live inventory screen, in one of the dumped frames (stones sparkle and the Pike Ball turns, so a
frame match is enough). --page: another copy of app/assets/link."""
import argparse, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as SR
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--page', default=SR.ROOT + '/app/assets/link')
a = ap.parse_args()
D = '/home/claude/work/icontest31'; os.makedirs(D, exist_ok=True)
N = 24
if not os.path.exists(D + '/o%02d.bin' % (N - 1)):
    s = 'load /home/claude/work/st/d4.st\nrun 20\n' + ''.join('poke %04X 1\n' % x for x in range(0xCA70, 0xCA7C)) + \
        'poke CB38 F0\npoke CB39 F0\nrun 2 T\nrun 90\n' + ''.join('run 3\ndump %s/o%02d.bin\n' % (D, k) for k in range(N))
    subprocess.run([SR.DRIVE, SR.ROMF, '-'], input=s, capture_output=True, text=True)
dumps = [open('%s/o%02d.bin' % (D, k), 'rb').read() for k in range(N)]

# where each icon sits on the inventory screen (row, col of its top-left tile)
WHERE = dict([('item%d' % i, (5 + 2 * (i >> 2), 11 + 2 * (i & 3))) for i in range(12)] +
             [('stone%d' % i, (12, 11 + 2 * i)) for i in range(4)] + [('tal%d' % i, (15, 11 + 2 * i)) for i in range(4)] +
             [('squid', (1, 14)), ('firefly', (1, 17))])
LIVE = r"""([v64, where]) => {
  const G = GbGfx, v = G.b64(v64), out = {};
  for (const k in where) {
    const [row, col] = where[k], c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'), lcdc = v[0x4120], m = (lcdc & 8) ? 0x1C00 : 0x1800;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = m + (row + dy) * 32 + col + dx, t = v[i], at = v[0x2000 + i];
      const idx = (lcdc & 0x10) ? t : (t < 128 ? 256 + t : t), px = G.decode(v, ((at & 8) ? 0x2000 : 0) + idx * 16), p = at & 7, cols = [];
      for (let q = 0; q < 4; q++) cols.push(G.cgb(v[0x4000 + p * 8 + q * 2], v[0x4000 + p * 8 + q * 2 + 1]));
      G.drawTile(x, px, dx * 8, dy * 8, cols, !!(at & 0x20), !!(at & 0x40));
    }
    out[k] = Array.from(x.getImageData(0, 0, 16, 16).data).join(',');
  }
  return out;
}"""
ROMSIDE = r"""() => { const out = {};
  for (const k of ShantaeIcons.keys()) { const c = ShantaeIcons.get(k); if (!c) { out[k] = null; continue; }
    out[k] = Array.from(c.getContext('2d').getImageData(0, 0, 16, 16).data).join(','); }
  return out; }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(SR.mock(dumps[0]))
    pg.goto('file://' + a.page + '/index.html'); pg.wait_for_timeout(800)
    built = pg.evaluate(ROMSIDE)
    live = [pg.evaluate(LIVE, [SR.video(d), WHERE]) for d in dumps]
    b.close()
def same(rom, lv):          # the page clears the panel colour behind an icon: compare only where the ROM icon is opaque
    r = list(map(int, rom.split(','))); l = list(map(int, lv.split(',')))
    return all(r[i * 4 + 3] == 0 or r[i * 4:i * 4 + 4] == l[i * 4:i * 4 + 4] for i in range(256)) and sum(r[3::4]) > 255 * 8
bad = []
for k in WHERE:
    n = sum(1 for lv in live if built.get(k) and same(built[k], lv[k]))
    print('%-8s %s, matches %d of %d frames' % (k, 'built' if built.get(k) else 'MISSING', n, N))
    if not n: bad.append(k)
print('page errors:', errs or 'none')
print('RESULT', 'PASS' if not bad and not errs and len(built) == len(WHERE) else 'FAIL ' + ' '.join(bad))
