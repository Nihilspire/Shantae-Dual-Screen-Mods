"""Render a whole region (screen table) from ROM level data + a dump's VRAM tiles/palettes."""
import sys
from PIL import Image
ROM=open(__import__('os').environ.get('SHANTAE_ROM','shantae.gbc'),'rb').read()
def rb(bank,a): return ROM[bank*0x4000+(a-0x4000)] if a>=0x4000 else ROM[a]
def rgb(lo,hi): c=lo|hi<<8; return ((c&31)*255//31,((c>>5)&31)*255//31,((c>>10)&31)*255//31)
def render(tbank,thi,dfb,d,rows,cols,r0=0,c0=0):
    v=d[0x18000:0x1C000]; pal=d[0x1C000:0x1C040]
    P=[[rgb(pal[p*8+k*2],pal[p*8+k*2+1]) for k in range(4)] for p in range(8)]
    tc={}
    def tile(t,at):
        k=(t,at)
        if k in tc: return tc[k]
        idx=256+t if t<128 else t   # LCDC bit4=0: 8800 mode
        off=(0x2000 if at&8 else 0)+idx*16
        im=Image.new('RGB',(8,8)); px=im.load(); cols=P[at&7]
        for y in range(8):
            ry=7-y if at&0x40 else y; lo=v[off+ry*2]; hi=v[off+ry*2+1]
            for x in range(8):
                rx=7-x if at&0x20 else x
                px[x,y]=cols[((lo>>(7-rx))&1)|(((hi>>(7-rx))&1)<<1)]
        tc[k]=im; return im
    out=Image.new('RGB',(cols*256,rows*256),(40,0,40))
    for R in range(rows):
        for C in range(cols):
            e=(thi<<8)+(r0+R)*64+(c0+C)*2
            p,b=rb(tbank,e),rb(tbank,e+1)
            if p==0 and b==0: continue
            for y in range(16):
                for x in range(16):
                    a=(p<<8)+y*32+x*2; w0=rb(b,a); w1=rb(b,a+1)
                    db=dfb+(w0&15); da=(w1<<8)|(w0&0xF0)
                    if not 0x4000<=da<0x8000: continue
                    df=[rb(db,da+i) for i in range(8)]
                    for q in range(4):
                        out.paste(tile(df[q],df[4+q]),(C*256+x*16+(q&1)*8,R*256+y*16+(q>>1)*8))
    return out
if __name__=='__main__':
    d=open(sys.argv[1],'rb').read()
    tb,th,dfb,rows,cols=[int(x,16) for x in sys.argv[2:7]]
    r0=int(sys.argv[8]) if len(sys.argv)>8 else 0
    im=render(tb,th,dfb,d,rows,cols,r0)
    im.save(sys.argv[7]); print(im.size)
