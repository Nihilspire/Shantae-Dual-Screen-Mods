"""Widescreen feasibility: a picture wider than the Game Boy's, built from a driver dump.
The middle 160x144 stands for the real screen (BG map, window, OAM from the dump); the side strips come from the level
data in the ROM (live VRAM tiles and palettes) and off-screen objects from their cels (SHANTAE-RAM.md "Widescreen").
  import wide; wide.frame(dump_bytes, W=256) -> PIL image;  wide.check(dump_bytes) -> accuracy numbers"""
import os
from PIL import Image
ROMF = os.environ.get('SHANTAE_ROM', '/home/claude/work/shantae.gbc')
rom = open(ROMF, 'rb').read()
def rb(b, a): return rom[a if a < 0x4000 else b * 0x4000 + a - 0x4000]
def rw(b, a): return rb(b, a) | rb(b, a + 1) << 8
def w(d, a): return d[a] | d[a + 1] << 8
def s16(v): return v - 65536 if v > 32767 else v
def rgb(lo, hi):
    c = lo | hi << 8
    return ((c & 31) * 255 // 31, (c >> 5 & 31) * 255 // 31, (c >> 10 & 31) * 255 // 31)

class F:
    """One dump."""
    def __init__(s, d):
        s.d = d; s.v = d[0x18000:0x1C000]; s.lcdc = d[0xFF40]; s.scy = d[0xFF42]; s.scx = d[0xFF43]; s.wy = d[0xFF4A]; s.wx = d[0xFF4B] - 7
        s.camx = w(d, 0xC9FB); s.camy = w(d, 0xC9FD)
        s.camx -= ((s.camx - s.scx + 128) & 255) - 128; s.camy -= ((s.camy - s.scy + 128) & 255) - 128
        s.rx, s.ry = w(d, 0xC9E9), w(d, 0xC9EC); s.rw, s.rh = w(d, 0xC9F4) + 159, w(d, 0xC9F6) + 127
        s.th, s.tb, s.df = d[0xC9F9], d[0xC9FA], d[0xFFDF]
        s.bgp = [[rgb(d[0x1C000 + p * 8 + q * 2], d[0x1C001 + p * 8 + q * 2]) for q in range(4)] for p in range(8)]
        s.obp = [[rgb(d[0x1C040 + p * 8 + q * 2], d[0x1C041 + p * 8 + q * 2]) for q in range(4)] for p in range(8)]
        s.tc = {}
    def level(s, X, Y):
        """(tile, attribute) of the level at world pixel X, Y, or None."""
        if X < s.rx or Y < s.ry or X >= s.rx + s.rw or Y >= s.ry + s.rh or X >= 8192: return None
        e = (s.th << 8) + (Y >> 8) * 64 + (X >> 8) * 2
        if e < 0x4000 or e >= 0x8000: return None
        page, sb = rb(s.tb, e), rb(s.tb, e + 1)
        if not page or not sb or page < 0x40 or page > 0x7E: return None
        a = (page << 8) + ((Y >> 4) & 15) * 32 + ((X >> 4) & 15) * 2
        w0, w1 = rb(sb, a), rb(sb, a + 1); da = (w1 << 8) | (w0 & 0xF0)
        if da < 0x4000 or da > 0x7FF0: return None
        q = ((Y >> 3) & 1) * 2 + ((X >> 3) & 1); b = s.df + (w0 & 15)
        return rb(b, da + q), rb(b, da + 4 + q)
    def bgtile(s, t, at):
        """64 colour indices of a BG tile with its flips applied."""
        k = t << 8 | at
        if k in s.tc: return s.tc[k]
        idx = t if s.lcdc & 0x10 else (256 + t if t < 128 else t); off = (0x2000 if at & 8 else 0) + idx * 16; px = []
        for y in range(8):
            ry = 7 - y if at & 0x40 else y; lo, hi = s.v[off + ry * 2], s.v[off + ry * 2 + 1]
            for x in range(8):
                rx = 7 - x if at & 0x20 else x
                px.append(((lo >> (7 - rx)) & 1) | ((hi >> (7 - rx)) & 1) << 1)
        s.tc[k] = px; return px
    def cels(s):
        """Every object's sprites from its cel: [(screen y of the OAM entry, x, attr, bank, tile data address, node)]."""
        out = []
        for i in range(32):
            o = 0x13000 + i * 0x7E; d = s.d
            if d[o] == 0xFF or d[o + 0x2E] == 0xFF: continue
            hnd = d[o + 0x2A] | d[o + 0x2B] << 8
            if hnd in (0x4F12, 0x4F4E, 0x4F53) or not 0x6200 <= hnd < 0x6400: continue    # drawn into the BG map, or screen-fixed
            bank, cel, var = d[o + 0x2E], d[o + 0x2F] | d[o + 0x30] << 8, d[o + 0x31] & 3
            if not 0x4000 <= cel < 0x7FF0: continue
            lp, tb = rw(bank, cel + 2 * var), rw(bank, cel + 8)
            if not (0x4000 <= lp < 0x8000 and 0x4000 <= tb < 0x8000): continue
            n = rb(bank, lp + 0x20)
            if not 0 < n <= 40: continue
            ox, oy = s16(rw(bank, lp)), s16(rw(bank, lp + 4))
            X = s16(w(d, o + 0x34)) - w(d, 0xFFE1) + s16(w(d, o + 0x39)) + s16(w(d, o + 0x3D))   # nodes and $FFE1/3 are the frame being built
            Y = s16(w(d, o + 0x37)) - w(d, 0xFFE3) + s16(w(d, o + 0x3B)) + s16(w(d, o + 0x3F))
            for k in range(n):
                e = lp + 0x23 + 3 * k; dy, dx, at = rb(bank, e), rb(bank, e + 1), rb(bank, e + 2)
                dy = ((dy - oy) & 255) + oy; dx = ((dx - ox) & 255) + ox   # the layout's bounds say which way the byte wraps
                out.append((Y + dy, X + dx, at, bank, tb + 1 + 2 * k * 16, i))
        return out

def frame(d, W=256, lines=False, cels=True, H=144):
    """The wide picture. Room's end: dark backdrop. lines: mark the real screen's edges."""
    f = F(d); side = (W - 160) // 2; top = 0
    im = Image.new('RGB', (W, H), (14, 10, 22)); px = im.load(); prio = {}
    # the side strips (and everything under the middle, for sprites' sake) from the level
    for sy in range(H):
        Y = f.camy + sy
        for sx in list(range(0, side)) + list(range(side + 160, W)):
            X = f.camx + sx - side
            if X < 0 or Y < 0: continue
            l = f.level(X & ~7, Y & ~7)
            if not l: continue
            T = f.bgtile(l[0], l[1]); c = T[(Y & 7) * 8 + (X & 7)]
            px[sx, sy] = f.bgp[l[1] & 7][c]
            if c and l[1] & 0x80: prio[(sx, sy)] = 1
    if cels:
        for oy, ox, at, bank, ta, node in reversed(f.cels()):
            sx0, sy0 = ox - 8 + side, oy - 16; pal = f.obp[at & 7]
            for yy in range(16):
                ty = 15 - yy if at & 0x40 else yy; a = ta + (ty >> 3) * 16 + (ty & 7) * 2
                if a >= 0x8000: continue
                lo, hi = rb(bank, a), rb(bank, a + 1); Y = sy0 + yy
                if not 0 <= Y < H: continue
                for xx in range(8):
                    tx = 7 - xx if at & 0x20 else xx; c = ((lo >> (7 - tx)) & 1) | ((hi >> (7 - tx)) & 1) << 1; X = sx0 + xx
                    if not c or not 0 <= X < W or side <= X < side + 160: continue
                    if (at & 0x80 or (X, Y) in prio) and px[X, Y] != (14, 10, 22) and (X, Y) in prio: continue
                    px[X, Y] = pal[c]
    # the middle: what the real screen shows
    mid = real(f)
    im.paste(mid, (side, 0))
    # the status bar is the window: keep the level running beside it
    if lines:
        for y in range(0, H, 3):
            for X in (side - 1, side + 160):
                px[X, y] = (255, 255, 255)
    return im

def real(f):
    """160x144 from the BG map, window and OAM, as the LCD would draw them with no mid-frame effects."""
    m = 0x1C00 if f.lcdc & 8 else 0x1800; wm = 0x1C00 if f.lcdc & 0x40 else 0x1800; v = f.v
    im = Image.new('RGB', (160, 144)); px = im.load(); bgc = {}
    win = f.lcdc & 0x20 and f.wy < 144
    for y in range(144):
        for x in range(160):
            if win and y >= f.wy and x >= f.wx:
                xx, yy = x - f.wx, y - f.wy; i = wm + (yy >> 3) * 32 + (xx >> 3)
            else:
                xx, yy = (x + f.scx) & 255, (y + f.scy) & 255; i = m + (yy >> 3) * 32 + (xx >> 3)
            t, at = v[i], v[0x2000 + i]; c = f.bgtile(t, at)[(yy & 7) * 8 + (xx & 7)]
            px[x, y] = f.bgp[at & 7][c]; bgc[(x, y)] = (c, at)
    d = f.d
    for i in range(39, -1, -1):
        o = 0xFE00 + i * 4; sy, sx, tn, fl = d[o] - 16, d[o + 1] - 8, d[o + 2] & 0xFE, d[o + 3]
        if sy <= -16 or sy >= 144 or sx <= -8 or sx >= 160: continue
        for yy in range(16):
            y = sy + yy
            if not 0 <= y < 144 or (win and y >= f.wy): continue
            ty = 15 - yy if fl & 0x40 else yy; a = (0x2000 if fl & 8 else 0) + (tn + (ty >> 3)) * 16 + (ty & 7) * 2; lo, hi = v[a], v[a + 1]
            for xx in range(8):
                x = sx + xx
                if not 0 <= x < 160: continue
                tx = 7 - xx if fl & 0x20 else xx; c = ((lo >> (7 - tx)) & 1) | ((hi >> (7 - tx)) & 1) << 1
                if not c: continue
                bc, bat = bgc[(x, y)]
                if bc and (fl & 0x80 or bat & 0x80): continue
                px[x, y] = f.obp[fl & 7][c]
    return im

def check(d):
    """Accuracy of what the strips rely on, on the visible screen where the truth is known.
    Returns: level cells that match the BG map (of cells inside the room), sprites from cels found in OAM (of those on
    screen), OAM entries explained by cels (of OAM entries in use)."""
    f = F(d); m = 0x1C00 if f.lcdc & 8 else 0x1800; good = tot = 0; bad = []
    ymax = min(f.wy, 144) if f.lcdc & 0x20 else 144
    for cy in range((f.camy + 7) >> 3, (f.camy + ymax - 8 >> 3) + 1):
        for cx in range((f.camx + 7) >> 3, (f.camx + 152 >> 3) + 1):
            l = f.level(cx * 8, cy * 8)
            if not l: continue
            tot += 1; i = m + (cy & 31) * 32 + (cx & 31)
            if f.v[i] == l[0] and (f.v[0x2000 + i] & 0x77) == (l[1] & 0x77): good += 1
            else: bad.append((cx * 8 - f.camx, cy * 8 - f.camy))
    # the frame the nodes describe is the one just written to shadow OAM ($D700 or $D800 in WRAM bank 7), not the one in OAM
    def shadow(base):
        t = {}
        for i in range(40):
            o = 0x17000 + base + i * 4; y, x = d[o], d[o + 1]
            if y and y < 160 and x and x < 168: t[(y, x, d[o + 3] & 0xF7)] = t.get((y, x, d[o + 3] & 0xF7), 0) + 1
        return t
    best = None
    for oam in (shadow(0x700), shadow(0x800)):
        cs = f.cels(); ons = found = 0; used = dict(oam)
        for oy, ox, at, bank, ta, node in cs:
            if 0 < oy < 160 and 0 < ox < 168:
                ons += 1; k = (oy, ox, at & 0xF7)
                if used.get(k): used[k] -= 1; found += 1
        r = (found, ons, sum(oam.values()) - sum(used.values()), sum(oam.values()))
        if best is None or r[0] > best[0]: best = r
    return dict(level=(good, tot), cel=best[:2], oam=best[2:], bad=bad[:6])
