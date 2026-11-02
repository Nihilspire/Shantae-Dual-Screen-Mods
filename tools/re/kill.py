# Try to kill one enemy: put Shantae beside it, face it, mash B; dump every 6 frames and watch its node.
import subprocess, sys, json, bisect, os
D='/home/claude/shantae-dual/out/host/drive'; ROM='/home/claude/work/shantae.gbc'
rom=open(ROM,'rb').read()
types=[]
i=0
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
def run(s): return subprocess.run([D,ROM,'-'],input=s,capture_output=True,text=True).stdout
def nodes(d):
    b=d[0x13000:0x14000]; out=[]
    for i in range(32):
        o=i*0x7E
        if o+0x7E>0x1000: break
        n=b[o:o+0x7E]
        out.append(dict(i=i,st=n[0],bank=n[4],pc=n[2]|n[3]<<8,x=n[0x34]|n[0x35]<<8,y=n[0x37]|n[0x38]<<8,raw=n))
    return out
def w16(a,v): return f'poke {a:04X} {v&255:02X}\npoke {a+1:04X} {v>>8:02X}\n'

def attempt(start, node, want, frames=600, tag='k'):
    """start: state, node: index, want: type. returns list of (frame, node dict) samples"""
    s=f'load {start}\n'
    log=[]
    d0=None
    steps=frames//6
    for k in range(steps):
        pass
    # build one script: every 6 frames dump to a numbered file
    os.makedirs('/tmp/kill',exist_ok=True)
    for f in os.listdir('/tmp/kill'):
        if f.startswith(tag+'_'): os.remove('/tmp/kill/'+f)
    sc=s
    for k in range(steps):
        # every 60 frames: refill hearts and re-teleport beside the target (x from last known, done in a 2nd pass)
        if k%10==0:
            sc+='poke CA80 30\n'
        btn='B' if (k%2==0) else 'N'
        sc+=f'run 6 {btn}\ndump /tmp/kill/{tag}_{k:03d}.bin\n'
    return sc

if __name__=='__main__':
    area=sys.argv[1]
    st=f'/tmp/vid/sw0_{area}.st'
    run(f'load {st}\ndump /tmp/kill/base.bin\n') if os.path.isdir('/tmp/kill') else (os.makedirs('/tmp/kill'), run(f'load {st}\ndump /tmp/kill/base.bin\n'))
    d=open('/tmp/kill/base.bin','rb').read()
    cx=d[0xC9FB]|d[0xC9FC]<<8; cy=d[0xC9FD]|d[0xC9FE]<<8
    for n in nodes(d):
        if n['st']==0 and n['pc']: print(n['i'],'type',ptype(n['bank'],n['pc']),'%02x:%04x'%(n['bank'],n['pc']),n['x']-cx,n['y']-cy)

def fight(area, idx, chunks=40, side=-18, tag='f'):
    st=f'/tmp/vid/sw0_{area}.st'
    cur='/tmp/kill/cur.st'
    run(f'load {st}\nsave {cur}\n')
    hist=[]
    for c in range(chunks):
        d=open('/tmp/kill/x.bin','rb').read() if c else None
        r=run(f'load {cur}\ndump /tmp/kill/x.bin\n')
        d=open('/tmp/kill/x.bin','rb').read()
        ns=nodes(d); t=ns[idx]
        hist.append((c,t['st'],ptype(t['bank'],t['pc']),'%02x:%04x'%(t['bank'],t['pc']),t['x'],t['y'], t['raw'][0x60:0x68].hex()))
        print(*hist[-1], 'hp?',d[0xCA80])
        if t['st']==0xFF: break
        px=t['x']+side-26; py=t['y']-28
        face='R' if side<0 else 'L'
        s=f'load {cur}\npoke FF70 3\n'+w16(0xD034,px)+w16(0xD037,py)+'poke CA80 30\n'
        s+=f'run 2 {face}\n'
        for k in range(6): s+=f'run 3 B\nrun 3 N\n'
        s+=f'save {cur}\nshot /tmp/kill/{tag}_{c:03d}.ppm\n'
        run(s)
    return hist

def fight2(area, idx, chunks=40, side=-18, tag='g'):
    st=f'/tmp/vid/sw0_{area}.st'; cur='/tmp/kill/cur.st'
    run(f'load {st}\nsave {cur}\n'); raws=[]; out=[]
    for c in range(chunks):
        run(f'load {cur}\ndump /tmp/kill/x.bin\n'); d=open('/tmp/kill/x.bin','rb').read()
        t=nodes(d)[idx]; raws.append(t['raw'])
        out.append((c,t['st'],'%02x:%04x'%(t['bank'],t['pc']),ptype(t['bank'],t['pc'])))
        if t['st']==0xFF: break
        px=t['x']+side-26; py=t['y']-28
        s=f'load {cur}\npoke FF70 3\n'+w16(0xD034,px)+w16(0xD037,py)+'poke CA80 30\n'+f"run 2 {'R' if side<0 else 'L'}\n"
        for k in range(6): s+='run 3 B\nrun 3 N\n'
        s+=f'save {cur}\nshot /tmp/kill/{tag}_{c:03d}.ppm\n'
        run(s)
    # bytes that only ever decrease and reach 0 / change often
    cand=[]
    for o in range(0x3A,0x7E):
        seq=[r[o] for r in raws[:-1] if r]
        ch=sum(1 for a,b in zip(seq,seq[1:]) if a!=b)
        if ch>=2 and all(b<=a for a,b in zip(seq,seq[1:])): cand.append(('+%02X'%o,seq[0],seq[-1],ch))
    return out,cand
