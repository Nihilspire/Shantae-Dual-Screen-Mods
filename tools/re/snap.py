"""Render a gb_snapshot blob (extract output) - BG map full 32x32, screen view, sprites. For design only."""
import sys
from PIL import Image
def load(p): return open(p,'rb').read()
def col(d,pal,obj=False):
    o=0x4125+((32 if obj else 0)+pal*4)*3
    return [tuple(d[o+i*3:o+i*3+3]) for i in range(4)]
def tile(d,bank,idx,ry):
    off=bank*0x2000+idx*16+ry*2; return d[off],d[off+1]
def bgmap(d, which=None):
    lcdc=d[0x4120]; m=(0x1C00 if lcdc&8 else 0x1800) if which is None else which
    im=Image.new('RGB',(256,256))
    for r in range(32):
        for c in range(32):
            t=d[m+r*32+c]; at=d[0x2000+m+r*32+c]
            idx=t if lcdc&0x10 else (256+t if t<128 else t)
            cs=col(d,at&7); bank=1 if at&8 else 0
            for y in range(8):
                lo,hi=tile(d,bank,idx,7-y if at&0x40 else y)
                for x in range(8):
                    rx=7-x if at&0x20 else x
                    im.putpixel((c*8+x,r*8+y),cs[((lo>>(7-rx))&1)|(((hi>>(7-rx))&1)<<1)])
    return im
def screen(d):
    full=bgmap(d); scy,scx=d[0x4121],d[0x4122]
    out=Image.new('RGB',(160,144))
    for y in range(144):
        for x in range(160): out.putpixel((x,y),full.getpixel(((x+scx)&255,(y+scy)&255)))
    lcdc=d[0x4120]
    if lcdc&0x20:
        wy,wx=d[0x4123],d[0x4124]-7
        win=bgmap(d,0x1C00 if lcdc&0x40 else 0x1800)
        for y in range(max(0,wy),144):
            for x in range(max(0,wx),160): out.putpixel((x,y),win.getpixel((x-wx,y-wy)))
    sprites(d,out); return out
def sprites(d,im):
    lcdc=d[0x4120]; tall=bool(lcdc&4); oam=d[0x4080:0x4120]
    for i in range(39,-1,-1):
        y,x,t,a=oam[i*4:i*4+4]; y-=16; x-=8; h=16 if tall else 8
        if tall: t&=0xFE
        cs=col(d,a&7,True); bank=1 if a&8 else 0
        for yy in range(h):
            lo,hi=tile(d,bank,t,h-1-yy if a&0x40 else yy)
            for xx in range(8):
                sx=7-xx if a&0x20 else xx; c=((lo>>(7-sx))&1)|(((hi>>(7-sx))&1)<<1)
                if c and 0<=x+xx<160 and 0<=y+yy<144: im.putpixel((x+xx,y+yy),cs[c])
    return im
if __name__=='__main__':
    d=load(sys.argv[1]); print('LCDC %02x SCY %d SCX %d WY %d WX %d'%tuple(d[0x4120:0x4125]))
    screen(d).resize((480,432),0).save(sys.argv[2]+'_s.png'); bgmap(d).resize((512,512),0).save(sys.argv[2]+'_m.png')
