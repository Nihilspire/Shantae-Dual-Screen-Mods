"""Static scene graph: warp codes ($CBF3) -> entry routines (set $C000 room, $CB71 entry) -> room dispatchers -> headers."""
import re
R=open(__import__('os').environ.get('SHANTAE_ROM','shantae.gbc'),'rb').read()
def rb(b,a): return R[b*0x4000+(a-0x4000)] if a>=0x4000 else R[a]
HDR=re.escape(bytes([0xcd,0x40,0x05,0x20,0x79,0x03]))
headers={}
for m in re.finditer(HDR,R): headers[(m.start()//0x4000,0x4000+m.start()%0x4000)]=1
def chain(bank, at):
    """'fe NN ca LO HI' repeated -> {NN: addr}"""
    out={}; a=at
    while rb(bank,a)==0xfe and rb(bank,a+2)==0xca:
        out[rb(bank,a+1)]=rb(bank,a+3)|rb(bank,a+4)<<8; a+=5
    return out
def dispatchers():
    """'fa 0V c0' (ld a,[$C00V]) [and mask] then a cp chain -> {(bank, V): {room: header addr, 'mask': m}}"""
    D={}
    for V in range(16):
        for m in re.finditer(re.escape(bytes([0xfa,V,0xc0])),R):
            b=m.start()//0x4000; a=0x4000+m.start()%0x4000+3
            mask=0xff
            if rb(b,a)==0xe6: mask=rb(b,a+1); a+=2
            c=chain(b,a)
            if len(c)>=2:
                hd={k:v for k,v in c.items() if (b,v) in headers}
                if hd: D.setdefault((b,V),{}).update(hd); D[(b,V)]['mask']=mask
    return D
def next_header(bank, addr, span=0x120):
    c=[a for (b,a) in headers if b==bank and addr<=a<addr+span]
    return min(c) if c else None
def entry(bank, addr):
    """entry routine -> (room var V, value, CB71 entry point, jp target)"""
    var=val=c71=jp=None
    for i in range(0,40):
        if rb(bank,addr+i)==0x3e and rb(bank,addr+i+2)==0xea:
            t=rb(bank,addr+i+3)|rb(bank,addr+i+4)<<8
            if 0xc000<=t<=0xc00f and var is None: var,val=t-0xc000,rb(bank,addr+i+1)
            if t==0xcb71 and c71 is None: c71=rb(bank,addr+i+1)
        if rb(bank,addr+i)==0xc3 and jp is None and i>8: jp=rb(bank,addr+i+1)|rb(bank,addr+i+2)<<8
    return var,val,c71,jp
D=None
def resolve(bank, addr):
    """destination room header (bank, addr) and entry point of a scene entry routine"""
    global D
    if D is None: D=dispatchers()
    var,val,c71,jp=entry(bank,addr)
    if (bank,addr) in headers: return (bank,addr),c71
    if var is not None and (bank,var) in D:
        d=D[(bank,var)]; h=d.get(val & d['mask'])
        if h: return (bank,h),c71
    h=next_header(bank, jp if jp else addr)
    return ((bank,h) if h else None),c71
def code_chains():
    """dispatch on [$CBF3]: 'fa f3 cb' + optional stuff then cp chain -> {(bank,addr of chain): {code: (bank, entry)}}"""
    out={}
    for m in re.finditer(re.escape(bytes([0xfa,0xf3,0xcb])),R):
        b=m.start()//0x4000; a=0x4000+m.start()%0x4000+3
        for skip in range(0,8):
            c=chain(b,a+skip)
            if len(c)>=2: break
        if len(c)<2: continue
        res={}
        for code,t in c.items():
            if rb(b,t)==0xcd and rb(b,t+1)==0x6b and rb(b,t+2)==0x05:   # far jump
                res[code]=(rb(b,t+5), rb(b,t+3)|rb(b,t+4)<<8)
            else: res[code]=(b,t)
        out[(b,a)]=res
    return out
if __name__=='__main__':
    CC=code_chains()
    for (b,a),c in CC.items():
        print('chain %02x:%04x'%(b,a))
        for code,(eb,ea) in sorted(c.items()):
            room,c71=resolve(eb,ea)
            print('   code %3d (%02x) -> %02x:%04x entry %s room %s'%(code,code,eb,ea,c71,('%02x:%04x'%room) if room else '-'))
