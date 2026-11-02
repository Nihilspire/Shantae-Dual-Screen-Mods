# Sweep each warp area: teleport Shantae across the room, record live object nodes -> type (by script PC range), crop.
import subprocess, json, sys, os, bisect
from PIL import Image
D='/home/claude/shantae-dual/out/host/drive'; ROM='/home/claude/work/shantae.gbc'
T=json.load(open('/tmp/vid/types.json'))
byb={}
for k,b,a in T: byb.setdefault(b,[]).append((a,k))
for b in byb: byb[b].sort()
def ptype(bank,pc):
    L=byb.get(bank)
    if not L: return None
    i=bisect.bisect_right([a for a,k in L],pc)-1
    return L[i][1] if i>=0 else None
def run(s): return subprocess.run([D,ROM,'-'],input=s,capture_output=True,text=True).stdout
def nodes(d):
    b=d[0x13000:0x14000]; out=[]
    for i in range(32):
        o=i*0x7E
        if o+0x7E>0x1000: break
        n=b[o:o+0x7E]
        out.append((i,n[0],n[4],n[2]|n[3]<<8,n[0x34]|n[0x35]<<8,n[0x37]|n[0x38]<<8))
    return out
def bgr(lo,hi):
    v=lo|hi<<8; return ((v&31)*255//31,((v>>5)&31)*255//31,((v>>10)&31)*255//31)
def sprites_near(d, sx, sy, mx, my, cx, cy):
    oam=d[0xFE00:0xFEA0]; vram=d[0x18000:0x1C000]; op=d[0x1C040:0x1C080]; lcdc=d[0xFF40]; h=16 if lcdc&4 else 8
    mx-=cx; my-=cy
    keep=[]
    for i in range(40):
        oy=oam[i*4]-16; ox=oam[i*4+1]-8
        if oam[i*4]==0 or oam[i*4]>=160: continue
        ccx=ox+4; ccy=oy+h/2
        if abs(ccx-sx)>24 or ccy<sy-40 or ccy>sy+16: continue
        if abs(ccx-mx)<14 and my-44<ccy<my+8: continue
        keep.append(i)
    if not keep: return None
    img=Image.new('RGBA',(160,144),(0,0,0,0)); px=img.load()
    for i in reversed(keep):
        oy=oam[i*4]-16; ox=oam[i*4+1]-8; t=oam[i*4+2]; a=oam[i*4+3]
        if h==16: t&=0xFE
        for y in range(h):
            ry=h-1-y if a&0x40 else y; tt=t+(ry>>3); r=ry&7
            base=(0x2000 if a&8 else 0)+tt*16+r*2; lo=vram[base]; hi=vram[base+1]
            for x in range(8):
                b=x if a&0x20 else 7-x
                v=((lo>>b)&1)|(((hi>>b)&1)<<1)
                X=ox+x; Y=oy+y
                if v and 0<=X<160 and 0<=Y<144:
                    pi=(a&7)*8+v*2; px[X,Y]=bgr(op[pi],op[pi+1])+(255,)
    bb=img.getbbox()
    if not bb: return None
    c=img.crop(bb); bgim=Image.new('RGB',c.size,(0,0,0)); bgim.paste(c,(0,0),c)
    return bgim.resize((c.size[0]*3,c.size[1]*3),0)
area=sys.argv[1]; out=sys.argv[2]; night=len(sys.argv)>3
os.makedirs(out,exist_ok=True)
base=f'load /home/claude/work/st/d4.st\nwarp {area}\nrun 300 N\n'+('poke C3EA 80\npoke C3E9 00\n' if night else '')
run(base+f'save /tmp/vid/sw0_{area}.st\ndump /tmp/vid/sw0_{area}.bin\n')
d=open(f'/tmp/vid/sw0_{area}.bin','rb').read()
r=d[0xC9E9:0xC9E9+16]; x0=r[0]|r[1]<<8; y0=r[3]|r[4]<<8; w=(r[11]|r[12]<<8)+160; h=(r[13]|r[14]<<8)+128
px=d[0x13000+0x34]|d[0x13000+0x35]<<8; py=d[0x13000+0x37]|d[0x13000+0x38]<<8
print('room',x0,y0,w,h,'player',px,py, 'state', d[0xC39D])
found={}
ys=[py] if h<=300 else sorted(set([py]+list(range(y0+64, y0+h, 192))))
for y in ys:
  for x in range(x0+40, x0+w-40, 120):
    s=f'load /tmp/vid/sw0_{area}.st\npoke FF70 3\npoke D034 {x&255:02X}\npoke D035 {x>>8:02X}\npoke D037 {y&255:02X}\npoke D038 {y>>8:02X}\nrun 30 N\ndump /tmp/vid/sw_{area}.bin\nshot /tmp/vid/sw_{area}.ppm\nrun 20 N\ndump /tmp/vid/sw2_{area}.bin\nshot /tmp/vid/sw2_{area}.ppm\n'
    run(s)
    for dn,sn in ((f'/tmp/vid/sw_{area}.bin',f'/tmp/vid/sw_{area}.ppm'),(f'/tmp/vid/sw2_{area}.bin',f'/tmp/vid/sw2_{area}.ppm')):
      d=open(dn,'rb').read(); cx=d[0xC9FB]|d[0xC9FC]<<8; cy=d[0xC9FD]|d[0xC9FE]<<8
      if d[0xC39D]!=2: continue
      im=Image.open(sn)
      for i,act,bank,pc,nx,ny in nodes(d):
        if i==0 or act!=0 or not pc: continue
        t=ptype(bank,pc)
        sx,sy=nx-cx,ny-cy
        if t is None or not (0<=sx<160 and 0<=sy<144): continue
        key=t
        if key in found: continue
        spr=sprites_near(d, sx, sy, d[0x13034]|d[0x13035]<<8, d[0x13037]|d[0x13038]<<8, cx, cy)
        if spr is None: continue
        fn=f'{out}/t{t}_{area}.png'; spr.save(fn)
        found[key]=dict(type=t,area=area,pc='%02X:%04X'%(bank,pc),x=nx,y=ny,file=fn)
        print('type',t,'%02X:%04X'%(bank,pc),nx,ny)
json.dump(found,open(f'{out}/found_{area}.json','w'))
