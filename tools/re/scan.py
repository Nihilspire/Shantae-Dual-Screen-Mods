import subprocess, json
D='/home/claude/shantae-dual/out/host/drive'
def peeks(state, spec):
    s=f'load st/{state}.st\n'+''.join(f'peek {a} {n}\n' for a,n in spec)
    out=subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True).stdout
    r={}
    for l in out.split('\n'):
        if ':' in l and not l.startswith('load') and not l.startswith('frames'):
            k,v=l.split(':',1); r[k]=v.split()
    return r
if __name__=='__main__':
    res={}
    for k in range(110):
        r=peeks(f'sw{k}',[('C9F0',32),('CBFD',1),('C39D',1),('CB43',4),('FF42',2)])
        res[k]=r
        print(k, r['CBFD'][0], r['C39D'][0], ' '.join(r['C9F0'][8:12]), ' '.join(r['CB43']))
    json.dump(res,open('scan.json','w'))
