import sys
ROM=open(__import__('os').environ.get('SHANTAE_ROM','shantae.gbc'),'rb').read()
def rb(b,a): return ROM[b*0x4000+(a-0x4000)] if a>=0x4000 else ROM[a]
TYPES={}
for k in range(1024):                       # entries are `40 lo hi bank`; the table ends where that marker stops
    o=0x0a*0x4000+1+4*k
    if ROM[o-1]!=0x40: break
    TYPES[0x4000+4*k]=(k,ROM[o]|ROM[o+1]<<8,ROM[o+2])
def lists(tb,thi,rows=32,cols=32):
    """Object placement grid: entry (row,col) at bank tb, (thi+row>>1)<<8 | (row&1)<<7 | col*4: far ptr (lo,hi,bank) to [count][17-byte entries]."""
    out={}
    for r in range(rows):
        for c in range(cols):
            a=((thi+(r>>1))<<8)|((r&1)<<7)|(c*4)
            if a>=0x8000: continue
            lo,hi,bk=rb(tb,a),rb(tb,a+1),rb(tb,a+2)
            p=lo|hi<<8
            if not bk or not 0x4000<=p<0x8000: continue
            out[(r,c)]=(bk,p)
    return out
def entries(bk,p):
    n=rb(bk,p); E=[]
    for i in range(n):
        e=[rb(bk,p+1+17*i+j) for j in range(17)]
        w=lambda o: e[o]|e[o+1]<<8
        E.append(dict(raw=bytes(e).hex(), x1=w(0),x2=w(2),y1=w(4),y2=w(6),flag=w(8),script=(e[12],e[10]|e[11]<<8),par=e[13:17]))
    return E
def describe(s):
    b,a=s
    if b==0x0a and a in TYPES: k,t,tb=TYPES[a]; return 'type%d(%02x:%04x)'%(k,tb,t)
    return '%02x:%04x'%(b,a)
if __name__=='__main__':
    tb,thi=int(sys.argv[1],16),int(sys.argv[2],16)
    seen=set()
    for (r,c),(bk,p) in sorted(lists(tb,thi).items()):
        if (bk,p) in seen: continue
        seen.add((bk,p))
        for e in entries(bk,p):
            print('screen r%d c%d  x %5d-%5d y %5d-%5d flag %04x %s par %s'%(r,c,e['x1'],e['x2'],e['y1'],e['y2'],e['flag'],describe(e['script']),bytes(e['par']).hex()))
