"""Render CGB BG / window / sprite layers from a driver dump (for designing the extraction)."""
import sys
from PIL import Image
def rgb(lo,hi):
    c=lo|hi<<8; return ((c&31)*255//31,((c>>5)&31)*255//31,((c>>10)&31)*255//31)
def tiles(d):
    return d[0x18000:0x1C000], d[0x1C000:0x1C040], d[0x1C040:0x1C080]
def render_map(d, mapbase, w=32, h=32, lcdc=None):
    v,bgp,_=tiles(d); lcdc=d[0xFF40] if lcdc is None else lcdc
    im=Image.new('RGB',(w*8,h*8))
    for r in range(h):
        for c in range(w):
            t=v[mapbase+r*32+c]; at=v[0x2000+mapbase+r*32+c]
            idx=t if lcdc&0x10 else (256+t if t<128 else t)
            off=(0x2000 if at&8 else 0)+idx*16; p=at&7
            cols=[rgb(bgp[p*8+k*2],bgp[p*8+k*2+1]) for k in range(4)]
            for y in range(8):
                ry=7-y if at&0x40 else y; lo=v[off+ry*2]; hi=v[off+ry*2+1]
                for x in range(8):
                    rx=7-x if at&0x20 else x
                    im.putpixel((c*8+x,r*8+y),cols[((lo>>(7-rx))&1)|(((hi>>(7-rx))&1)<<1)])
    return im
def bg_screen(d):
    lcdc=d[0xFF40]; m=0x1C00 if lcdc&8 else 0x1800
    full=render_map(d,m)
    scx,scy=d[0xFF43],d[0xFF42]
    out=Image.new('RGB',(160,144))
    for y in range(144):
        for x in range(160): out.putpixel((x,y),full.getpixel(((x+scx)&255,(y+scy)&255)))
    return out
if __name__=='__main__':
    d=open(sys.argv[1],'rb').read()
    print('LCDC %02x SCX %d SCY %d WY %d WX %d'%(d[0xFF40],d[0xFF43],d[0xFF42],d[0xFF4A],d[0xFF4B]))
    bg_screen(d).resize((320,288),0).save(sys.argv[2])

def sprites(d, im=None, only=None):
    """Draw 8x16/8x8 OBJ layer over im (or transparent)."""
    v,_,obp=tiles(d); lcdc=d[0xFF40]; tall=bool(lcdc&4)
    if im is None: im=Image.new('RGBA',(160,144),(0,0,0,0))
    oam=d[0xFE00:0xFEA0]
    for i in range(39,-1,-1):
        y,x,t,a=oam[i*4:i*4+4]; y-=16; x-=8
        if only and not only(i,x,y): continue
        h=16 if tall else 8
        if tall: t&=0xFE
        bank=0x2000 if a&8 else 0; p=a&7
        cols=[None]+[rgb(obp[p*8+k*2],obp[p*8+k*2+1]) for k in (1,2,3)]
        for yy in range(h):
            sy=h-1-yy if a&0x40 else yy
            off=bank+t*16+sy*2; lo=v[off]; hi=v[off+1]
            for xx in range(8):
                sx=7-xx if a&0x20 else xx
                c=((lo>>(7-sx))&1)|(((hi>>(7-sx))&1)<<1)
                if c and 0<=x+xx<160 and 0<=y+yy<144: im.putpixel((x+xx,y+yy),cols[c]+((255,) if im.mode=='RGBA' else ()))
    return im
