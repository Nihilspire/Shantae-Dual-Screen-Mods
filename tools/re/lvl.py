import sys
from h import dump, wram
ROM=open('shantae.gbc','rb').read()
def rb(bank,addr): return ROM[bank*0x4000+(addr-0x4000)] if addr>=0x4000 else ROM[addr]
def mdef(w0,w1,dfb):
    bank=dfb+(w0&15); a=(w1<<8)|(w0&0xF0)
    if not 0x4000<=a<0x8000: return None
    return tuple(rb(bank,a+i) for i in range(8))
def mirror(d):
    t=wram(d,1,0,0x400); at=wram(d,1,0x400,0x400); return t,at
def blocks(d):
    t,at=mirror(d); out={}
    for r in range(0,32,2):
        for c in range(0,32,2):
            i=[r*32+c,r*32+c+1,(r+1)*32+c,(r+1)*32+c+1]
            out[(r,c)]=tuple(t[k] for k in i)+tuple(at[k] for k in i)
    return out
