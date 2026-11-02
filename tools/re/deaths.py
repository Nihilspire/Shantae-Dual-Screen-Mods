import re, bisect, json
rom=open('shantae.gbc','rb').read()
def ad(p): return (p//0x4000,(p%0x4000)+(0x4000 if p>=0x4000 else 0))
types=[];i=0
while rom[0x28000+i*4]==0x40:
    e=rom[0x28000+i*4:0x28000+i*4+4]; types.append((i,e[3],e[1]|e[2]<<8)); i+=1
byb={}
for k,b,a in types: byb.setdefault(b,[]).append((a,k))
for b in byb: byb[b].sort()
def ptype(bank,pc):
    L=byb.get(bank)
    if not L: return None
    j=bisect.bisect_right([a for a,k in L],pc)-1
    return L[j][1] if j>=0 else None
DROP={0x50b3:'any',0x50b9:'2',0x50bf:'4'}
res=[]
for m in re.finditer(b'\xcd\x40\x05(..)\x0e',rom,re.S):
    a=m.group(1)[0]|m.group(1)[1]<<8
    if a not in DROP: continue
    bank,addr=ad(m.start())
    # native routine start: walk back to nearest preceding 'c9' (ret) / 'c3' heuristics: just search scripts calling addresses within 24 bytes before
    cands=[]
    for back in range(0,40):
        x=addr-back
        pat=bytes([0x32,x&255,x>>8,bank])
        for s in re.finditer(re.escape(pat),rom):
            sb,sa=ad(s.start())
            cands.append((back,x,sb,sa))
    best=None
    for back,x,sb,sa in sorted(cands):
        best=(x,sb,sa); break
    if best:
        x,sb,sa=best
        callers=[ad(s.start()) for s in re.finditer(re.escape(bytes([0x32,x&255,x>>8,bank])),rom)]
        for sb,sa in callers:
            res.append(dict(native='%02x:%04x'%(bank,x),drop='%02x:%04x'%(bank,addr),script='%02x:%04x'%(sb,sa),type=ptype(sb,sa)))
    else:
        res.append(dict(native=None,drop='%02x:%04x'%(bank,addr),script=None,type=ptype(bank,addr)))
for r in res: print(r)
json.dump(res,open('/tmp/deaths.json','w'))
