"""Explore room links by playing: walk off every edge exit and press Up at every door-like object, in the driver."""
import subprocess, json, sys, os
from allobj import headers, room_objects
from objlist import TYPES
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'../../out/host/drive')
HS=headers()
def key_of(r): return '%s|%d|%d|%d|%d'%(r['reg'],r['x'],r['y'],r['w'],r['h'])
HK={}
for H in HS: HK.setdefault('%02X:%02X00|%d|%d|%d|%d'%(H['tb'],H['th'],H['x'],H['y'],H['w'],H['h']),H)
def peekvars(out):
    r={}
    for l in out.split('\n'):
        if ':' in l and not l.startswith(('load','frames')):
            k,v=l.split(':',1); r[k]=v.split()
    return r
Q='peek CBFD 1\npeek C9E9 22\npeek CB43 4\npeek C39D 1\n'
def room_of(v):
    c=[int(x,16) for x in v['C9E9']]; p=[int(x,16) for x in v['CB43']]
    return dict(map=int(v['CBFD'][0],16), x=c[0]|c[1]<<8, y=c[3]|c[4]<<8, w=(c[11]|c[12]<<8)+160, h=(c[13]|c[14]<<8)+128,
                reg='%02X:%02X00'%(c[17],c[16]), px=p[0]|p[1]<<8, py=p[2]|p[3]<<8, st=int(v['C39D'][0],16))
def run(script):
    return peekvars(subprocess.run([D,'shantae.gbc','-'],input=script,capture_output=True,text=True).stdout)
def look(state): return room_of(run(f'load st/{state}.st\nrun 2\n'+Q))
def act(state, x, y, inputs, save):
    s=f'load st/{state}.st\nrun 2\npoke D034 {x&255:02X}\npoke D035 {x>>8:02X}\npoke D037 {y&255:02X}\npoke D038 {y>>8:02X}\nrun 20\n'+inputs+'run 200\n'+Q+f'save st/{save}.st\n'
    return room_of(run(s))
def kind(e):
    b,a=e['script']
    if b!=0x0a or a not in TYPES: return None
    k=TYPES[a][0]; p=e['par']
    if k==106: return 'edge'
    if k not in (38,99,100,101,102,104,105,109,113) and 1<=p[0]<=24 and p[1] in (1,2): return 'door'
    return None
if __name__=='__main__':
    seeds=[s for s in sys.argv[1:]] or ['sw%d'%i for i in range(67)]
    links=json.load(open('links.json')) if os.path.exists('links.json') else {}
    seen={}; queue=[]
    for s in seeds:
        r=look(s)
        if r['st']!=2: continue
        k=key_of(r)
        if k not in seen: seen[k]=s; queue.append((s,r))
    n=0
    while queue:
        st,r=queue.pop(0); k=key_of(r); H=HK.get(k)
        if not H: print('no header for',k); continue
        objs=[e for e in room_objects(H) if kind(e)]
        for e in objs:
            K=kind(e); cx=(e['x1']+e['x2'])//2
            oid='%s@%d,%d'%(K,e['x2'],e['y2'])
            if k in links and oid in links[k]: continue
            if K=='edge':
                left=e['par'][0]==1
                x=e['x2']+28 if left else e['x2']-28
                y=r['py'] if e['y2']<=r['py']<=e['y1'] else e['y1']-24
                inp=f'run 220 {"L" if left else "R"}\n'
            else:
                x=cx; y=e['y1']-1; inp='run 2\nrun 8 U\n'
            n+=1; sv='lk%d'%n
            t=act(st,x,y,inp,sv)
            tk=key_of(t)
            if t['st']!=2 or tk not in HK: tk=k        # cut-scene, boss intro or a room without a header: not a plain link
            res={'to':tk if tk!=k else None,'map':t['map'],'land':[t['px'],t['py']],'par':list(e['par']),'type':TYPES[e['script'][1]][0]}
            links.setdefault(k,{})[oid]=res
            if tk!=k:
                print(H['at'],k,oid,'->',tk, HK.get(tk,{}).get('at'))
                if tk not in seen and t['st']==2: seen[tk]=sv; queue.append((sv,t))
            else: os.remove(f'st/{sv}.st') if os.path.exists(f'st/{sv}.st') else None
        json.dump(links,open('links.json','w'),indent=0)
