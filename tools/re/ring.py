"""Walk the overworld ring to the right from Scarecrow Field, saving a state in every room (ow_<header>.st)."""
import json, subprocess
from bfs import HK, key_of, look, act
from allobj import room_objects
from objlist import TYPES
st='sw9'; r=look(st); order=[]
for step in range(30):
    k=key_of(r); H=HK[k]; at=H['at']
    if at in order: break
    order.append(at)
    subprocess.run(['cp',f'st/{st}.st',f'st/ow_{at.replace(":","_")}.st'])
    ex=[e for e in room_objects(H) if e['script'][0]==0x0a and TYPES.get(e['script'][1],(0,))[0]==106 and e['par'][0]==2]
    moved=False
    for e in ex:
        y=r['py'] if e['y2']<=r['py']<=e['y1'] else e['y1']-24
        t=act(st,e['x2']-28,y,'run 220 R\n','ring_tmp')
        if key_of(t)!=k and t['st']==2: st='ring_%d'%step; subprocess.run(['cp','st/ring_tmp.st',f'st/{st}.st']); r=t; moved=True; break
    if not moved: print('stuck at',at); break
print(order)
json.dump(order,open('ring.json','w'))
