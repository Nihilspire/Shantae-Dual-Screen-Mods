"""widetest.py [OUTDIR] - WIDE VIEW (native/wide.c) on the desktop driver.
  1. Truth test: walk until what was beside the real picture has scrolled onto the real screen, and compare the pixels. It
     predicted that picture, so they should agree, apart from things that move or animate.
  2. The spawn window follows the side and goes back to the game's own at side 0.
  3. The view stays off on screens that aren't level rooms.
  4. Cost per call.
OUTDIR: also saves a still per room (contains game art: for the Renders folder only)."""
import os, subprocess, sys, time
from PIL import Image
ROOT = '/home/claude/shantae-dual'; DRIVE = ROOT + '/out/host/drive'; ROMF = '/home/claude/work/shantae.gbc'; W = '/home/claude/work/ws/t'
os.makedirs(W, exist_ok=True)
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
SIDE = 48; BACK = (0, 0, 0)
def drive(s): return subprocess.run([DRIVE, ROMF, '-'], input=s, capture_output=True, text=True).stdout
def w(d, a): return d[a] | d[a + 1] << 8
fails = []
# 1. the strip ahead of her vs the real screen once it has scrolled in
tot = same = 0; rows = []
for room, key, name in (('05', 'R', 'docks'), ('14', 'R', 'forest'), ('19', 'R', 'desert'), ('0B', 'R', 'mud bog'), ('1E', 'R', 'hills'), ('09', 'R', 'cliffs'), ('43', 'R', 'snow'), ('0E', 'R', 'pines'), ('28', 'R', 'cave'), ('06', 'R', 'woods')):
    s = 'view %d\nload /home/claude/work/st/d4.st\nwarp %s\nrun 450\nrun 130 %s\nshot %s/a.ppm\nwideinfo\ndump %s/a.bin\n' % (160 + 2 * SIDE, room, key, W, W)
    s += 'run 60 %s\nshot %s/b.ppm\nwideinfo\ndump %s/b.bin\n' % (key, W, W)
    o = drive(s)
    info = [list(map(int, l.split()[1:])) for l in o.split('\n') if l.startswith('wide ')]
    a = Image.open(W + '/a.ppm').convert('RGB'); b = Image.open(W + '/b.ppm').convert('RGB')
    da, db = open(W + '/a.bin', 'rb').read(), open(W + '/b.bin', 'rb').read()
    def cam(d):
        x, y = w(d, 0xC9FB), w(d, 0xC9FD); x -= ((x - d[0xFF43] + 128) & 255) - 128; y -= ((y - d[0xFF42] + 128) & 255) - 128; return x, y
    ax, ay = cam(da); bx, by = cam(db); moved = bx - ax
    n = m = 0
    # pixels right of a's real picture that are on b's real screen, above the status bar (a 160 wide: a one-screen place, nothing to test)
    if moved > 0 and ay == by and info[0][0] > 160 and info[1][0] > 160:
        la, ta, lb, tb = info[0][1], info[0][2], info[1][1], info[1][2]
        pa, pb = a.load(), b.load()
        for y in range(0, 128):
            for x in range(la + 160, min(a.width, la + 160 + moved)):
                ca = pa[x, y + ta]
                if ca == BACK: continue
                n += 1; m += ca == pb[x - moved - la + lb, y + tb]
    pct = 100.0 * m / n if n else -1
    animated = da[0x1C000:0x1C040] != db[0x1C000:0x1C040]      # colour cycling (water): the same tiles in other colours, not a miss
    rows.append((name, moved, n, round(pct, 1), 'colours cycled' if animated else ''))
    if animated: n = m = 0
    tot += n; same += m
    if OUT: a.resize((a.width * 3, a.height * 3), Image.NEAREST).save('%s/Native - %s.png' % (OUT, name))
    if n and pct < 85: fails.append('truth %s %.1f%%' % (name, pct))
print('strip predicted the real screen:', rows)
print('  overall %d/%d = %.2f%%' % (same, tot, 100.0 * same / max(1, tot)))
if tot < 15000 or same / max(1, tot) < 0.93: fails.append('truth overall')
# 1b. the seam itself: on each frame while scrolling (NO SLOWDOWN on, both ways), the world around the picture must be on the camera
# the real picture was drawn with: the offset that makes the level match has to be 0, 0 for each of them
sys.path.insert(0, ROOT + '/tools/re')
import wide, collections
def offset(d, ppm, xs):
    f = wide.F(d); im = Image.open(ppm).convert('RGB'); px = im.load(); res = {}
    for dy in range(-2, 3):
        for dx in range(-3, 4):
            mp = {}; tot = 0
            for sy in range(4, 124, 6):
                for sx0 in xs:
                    sx = sx0 + 48
                    X, Y = f.camx + dx + sx0, f.camy + dy + sy
                    l = f.level(X & ~7, Y & ~7) if X >= 0 and Y >= 0 else None
                    if not l: continue
                    k = (l[1] & 7, f.bgtile(l[0], l[1])[(Y & 7) * 8 + (X & 7)]); mp.setdefault(k, collections.Counter())[px[sx, sy]] += 1; tot += 1
            res[(dx, dy)] = sum(v.most_common(1)[0][1] for v in mp.values()) / max(1, tot)
    return max(res, key=lambda k: res[k])
off = collections.Counter(); offm = collections.Counter()
for room in ('14', '05', '0B', '19'):
    s = 'view 256\nload /home/claude/work/st/d4.st\noc 1\nwarp %s\nrun 450\nrun 110 R\n' % room
    for k in range(10): s += 'run 3 %s\nshot %s/m%d.ppm\nwideinfo\ndump %s/m%d.bin\n' % ('R' if k < 5 else 'L', W, k, W, k)
    o = drive(s); info = [list(map(int, l.split()[1:])) for l in o.split('\n') if l.startswith('wide ')]
    for k in range(10):
        if info[k][1] != 48 or info[k][2] != 0: continue         # near a room's end the picture isn't in the middle: not this check
        dk = open('%s/m%d.bin' % (W, k), 'rb').read(); pk = '%s/m%d.ppm' % (W, k)
        off[offset(dk, pk, list(range(-46, -2, 4)) + list(range(162, 206, 4)))] += 1
        offm[offset(dk, pk, list(range(2, 158, 4)))] += 1
print('seam offsets while scrolling, around the picture:', dict(off), 'in it:', dict(offm))
if set(off) != {(0, 0)} or set(offm) != {(0, 0)}: fails.append('seam %s %s' % (dict(off), dict(offm)))
# 1b2. sprites at the join: a statue (room 41) doesn't move in the world, so while walking past it both its part in the strip and its
# part in the middle must sit where the camera says, or it splits along the join (the barrel, 0.37-0.40)
def grey(p): return abs(p[0] - p[1]) < 14 and abs(p[1] - p[2]) < 14 and 8 < p[0] < 235
def camera(d):
    x, y = w(d, 0xC9FB), w(d, 0xC9FD); x -= ((x - d[0xFF43] + 128) & 255) - 128; y -= ((y - d[0xFF42] + 128) & 255) - 128; return x, y
JS = 57
s = 'view %d\nload /home/claude/work/st/d4.st\noc 1\nwarp 41\nrun 450\nrun 1\nshot %s/still.ppm\ndump %s/still.bin\nrun 85 R\n' % (160 + 2 * JS, W, W)
for k in range(24): s += 'run 1 R\nshot %s/j%d.ppm\ndump %s/j%d.bin\n' % (W, k, W, k)
drive(s)
sp = Image.open(W + '/still.ppm').convert('RGB').load(); c0 = camera(open(W + '/still.bin', 'rb').read())
mask = [(x, y, sp[x, y]) for y in range(40, 112) for x in range(88, 125) if grey(sp[x, y])]
joff = [collections.Counter(), collections.Counter()]
for k in range(24):
    px = Image.open('%s/j%d.ppm' % (W, k)).convert('RGB').load(); c = camera(open('%s/j%d.bin' % (W, k), 'rb').read()); dx, dy = c[0] - c0[0], c[1] - c0[1]
    if not (88 - dx + 8 < JS <= 124 - dx - 8): continue
    for part in (0, 1):
        pts = [(x - dx, y - dy, col) for x, y, col in mask if ((x - dx) >= JS) == bool(part) and 0 <= y - dy < 122]
        if len(pts) < 30: continue
        best = max(((sum(1 for X, Y, col in pts if 0 <= X + ox < 274 and 0 <= Y + oy < 124 and px[X + ox, Y + oy] == col), ox, oy) for oy in range(-2, 3) for ox in range(-4, 5)))
        joff[part][best[1:]] += 1
print('statue at the join, offset from where the camera says: strip', dict(joff[0]), 'middle', dict(joff[1]))
if set(joff[0]) != {(0, 0)} or set(joff[1]) != {(0, 0)}: fails.append('join %s' % joff)
# 1b3. objects drawn into the BG map (rocks, blocks, gates) are in the world around the picture, not only once on screen: warp 1F has
# 81 such tiles off the real screen 160 frames along, and what's drawn there still has to match once it scrolls in
o = drive('view 256\nload /home/claude/work/st/d4.st\nrun 2\nwarp 1F\nrun 450\nrun 160 R\nwideinfo\nshot %s/a.ppm\ndump %s/a.bin\nrun 60 R\nwideinfo\nshot %s/b.ppm\ndump %s/b.bin\n' % (W, W, W, W))
info = [list(map(int, l.split()[1:])) for l in o.split('\n') if l.startswith('wide ')]
a = Image.open(W + '/a.ppm').convert('RGB').load(); b = Image.open(W + '/b.ppm').convert('RGB').load()
moved = camera(open(W + '/b.bin', 'rb').read())[0] - camera(open(W + '/a.bin', 'rb').read())[0]
n = m = 0
for y in range(128):
    for x in range(info[0][1] + 160, min(256, info[0][1] + 160 + moved)):
        if a[x, y + info[0][2]] != BACK: n += 1; m += a[x, y + info[0][2]] == b[x - moved - info[0][1] + info[1][1], y + info[1][2]]
print('BG-drawn objects: %d tiles off the real screen, %d/%d pixels right once on it' % (info[0][3], m, n))
if info[0][3] < 20 or n < 2000 or m / max(1, n) < 0.85: fails.append('BG objects %s %d/%d' % (info[0], m, n))
# 2. the spawn window
s = 'load /home/claude/work/st/d4.st\nwarp 05\nrun 450\nview 256\nrun 30\ndump %s/s.bin\nview 160\nrun 30\ndump %s/o.bin\n' % (W, W)
drive(s)
for f, want in (('s', (-48, 208)), ('o', (-8, 168))):     # side 48 asks for 56, capped at 48: 256 wide (spawntest.py)
    d = open('%s/%s.bin' % (W, f), 'rb').read(); got = (w(d, 0xFFC5) - w(d, 0xFFE1), w(d, 0xFFC9) - w(d, 0xFFE1))
    print('spawn window', f, got, 'want', want)
    if got != want: fails.append('window %s %s' % (f, got))
# 3. off on non-level screens
o = drive('view 256\nload /home/claude/work/st/d4.st\nrun 3\nwideinfo\nrun 2 T\nrun 120\nwideinfo\n')
vals = [int(l.split()[1]) for l in o.split('\n') if l.startswith('wide ')]
print('in play, then the inventory:', vals)
if vals != [256, 160]: fails.append('gate %s' % vals)
# 4. cost
s = 'load /home/claude/work/st/d4.st\nwarp 14\nrun 450\n'
t0 = time.time(); drive(s + 'run 3000\n'); t1 = time.time(); drive('view 256\n' + s + 'run 3000\n'); t2 = time.time()
print('3000 frames: %.3f s without, %.3f s with: %.3f ms per frame (host -O1 build)' % (t1 - t0, t2 - t1, ((t2 - t1) - (t1 - t0)) / 3000 * 1000))
print('RESULT', 'PASS' if not fails else 'FAIL ' + '; '.join(fails))
