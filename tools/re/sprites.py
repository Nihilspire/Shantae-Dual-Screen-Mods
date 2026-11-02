"""Decode object sprite cels straight from the ROM.
Node +$2E bank, +$2F/30 cel. Cel: 4 words -> layouts (picked by node +$31), word +8 -> tile block (count of 8x16 sprites, then 32 bytes each).
Layout: +0..7 bounds, +$20 sprite count, +$21 OAM writer routine, +$23.. (dy, dx, attr) per 8x16 sprite, tiles 2k, 2k+1."""
import sys, os
from PIL import Image
rom = open('/home/claude/work/shantae.gbc', 'rb').read()
def rb(bank, a): return rom[a if a < 0x4000 else bank * 0x4000 + a - 0x4000]
def rw(bank, a): return rb(bank, a) | rb(bank, a + 1) << 8
def s8(v): return v - 256 if v > 127 else v

def pal_from(opal):
    def col(p, i):
        c = opal[p * 8 + i * 2] | opal[p * 8 + i * 2 + 1] << 8
        return ((c & 31) * 255 // 31, (c >> 5 & 31) * 255 // 31, (c >> 10 & 31) * 255 // 31, 255)
    return col

def cel(bank, cp, col, variant=0):
    lp = rw(bank, cp + 2 * variant); tb = rw(bank, cp + 8)
    if not (0x4000 <= lp < 0x8000 and 0x4000 <= tb < 0x8000): return None
    nt = 2 * rb(bank, tb); n = rb(bank, lp + 0x20)
    if not 0 < n <= 40 or nt > 160: return None
    ents = [(s8(rb(bank, lp + 0x23 + 3 * k)), s8(rb(bank, lp + 0x24 + 3 * k)), rb(bank, lp + 0x25 + 3 * k)) for k in range(n)]
    x0 = min(e[1] for e in ents); y0 = min(e[0] for e in ents)
    W = max(e[1] for e in ents) - x0 + 8; H = max(e[0] for e in ents) - y0 + 16
    if W > 256 or H > 256: return None
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for k, (dy, dx, at) in enumerate(ents):
        for half in range(2):
            ti = 2 * k + half
            if ti >= nt: continue
            t = tb + 1 + ti * 16
            for r in range(8):
                lo, hi = rb(bank, t + r * 2), rb(bank, t + r * 2 + 1)
                for c in range(8):
                    v = (lo >> (7 - c) & 1) | (hi >> (7 - c) & 1) << 1
                    if not v: continue
                    xx = 7 - c if at & 0x20 else c; yy = r + half * 8
                    if at & 0x40: yy = 15 - yy
                    im.putpixel((dx - x0 + xx, dy - y0 + yy), col(at & 7, v))
    return im

if __name__ == '__main__':
    dump = open(sys.argv[1], 'rb').read(); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    col = pal_from(dump[0x1C040:0x1C080])
    for i in range(32):
        nd = dump[0x13000 + i * 0x7E:0x13000 + i * 0x7E + 0x7E]
        if nd[0] == 0xFF or nd[0x2E] == 0xFF: continue
        bank, cp = nd[0x2E], nd[0x2F] | nd[0x30] << 8
        im = cel(bank, cp, col, nd[0x31] & 3)
        print('node %2d bank %02X cel %04X variant %d -> %s' % (i, bank, cp, nd[0x31], im and im.size))
        if im: im.resize((im.width * 4, im.height * 4), Image.NEAREST).save('%s/node%02d_%02X_%04X.png' % (out, i, bank, cp))


