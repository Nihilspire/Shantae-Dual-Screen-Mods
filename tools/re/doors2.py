import json, glob, os
from bfs import HK, key_of, look, act
from allobj import headers, room_objects
from objlist import TYPES
SKIP={106,109,38,99,100,101,102,104,105,112}
out={}
for f in sorted(glob.glob('st/ow_*.st')):
    st=os.path.basename(f)[:-3]; r=look(st); k=key_of(r); H=HK.get(k)
    if not H: continue
    tried=set()
    for e in room_objects(H):
        b,a=e['script']; t=TYPES.get(a,(None,))[0] if b==0x0a else None
        if t in SKIP or t is None: continue
        if (t,e['x2']//64,e['y2']//64) in tried: continue
        tried.add((t,e['x2']//64,e['y2']//64))
        for key in ('U',):
            res=act(st,(e['x1']+e['x2'])//2,e['y1']-2,'run 2\nrun 8 %s\n'%key,'dtmp')
            tk=key_of(res)
            if tk!=k:
                print(H['at'],'type',t,e['x2'],e['y2'],bytes(e['par']).hex(),key,'->',HK.get(tk,{}).get('at'),tk,'state',res['st'],'map %02x'%res['map'])
                os.rename('st/dtmp.st','st/door_%s_%d.st'%(H['at'].replace(':','_'),t))
