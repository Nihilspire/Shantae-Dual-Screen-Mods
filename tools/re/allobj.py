import re, json
from objlist import ROM, rb, TYPES, entries, describe
R=ROM
def headers():
    out=[]
    for m in re.finditer(re.escape(bytes([0xcd,0x40,0x05,0x20,0x79,0x03])),R):
        a=m.start(); h=R[a+6:a+23]
        if not any(h): continue
        out.append(dict(at='%02x:%04x'%(a//0x4000,0x4000+a%0x4000),x=h[0]|h[1]<<8,y=h[2]|h[3]<<8,w=(h[4]|h[5]<<8)+160,h=(h[6]|h[7]<<8)+128,
                        th=h[9],tb=h[10],df=h[13],oh=h[15],ob=h[16]))
    return out
def room_objects(H):
    seen=set(); objs=[]
    r0,r1=H['y']>>8,min(31,(H['y']+H['h']-1)>>8); c0,c1=H['x']>>8,min(31,(H['x']+H['w']-1)>>8)
    for r in range(r0,r1+1):
        for c in range(c0,c1+1):
            a=((H['oh']+(r>>1))<<8)|((r&1)<<7)|(c*4)
            if a>=0x8000 or not H['ob']: continue
            lo,hi,bk=rb(H['ob'],a),rb(H['ob'],a+1),rb(H['ob'],a+2); p=lo|hi<<8
            if not bk or not 0x4000<=p<0x8000 or bk>0xff: continue
            for e in entries(bk,p):
                k=(e['x1'],e['y1'],e['flag'],e['script'])
                if k in seen: continue
                seen.add(k); objs.append(e)
    return objs
if __name__=='__main__':
    from collections import Counter
    C=Counter(); per={}
    for H in headers():
        if H['w']>=8000: continue
        for e in room_objects(H):
            b,a=e['script']
            k=TYPES[a][0] if b==0x0a and a in TYPES else describe(e['script'])
            C[k]+=1; per.setdefault(k,[]).append((H['at'],e['x2'],e['y2'],e['par'][0],e['flag']))
    print(sorted(C.items(), key=lambda x: -x[1] if isinstance(x[0],int) else 0)[:60])
    for k in (99,100,101,102,103,104,105):
        print(k, len(per.get(k,[])), per.get(k))
    json.dump({str(k):v for k,v in per.items()}, open('/tmp/allobj.json','w'))
