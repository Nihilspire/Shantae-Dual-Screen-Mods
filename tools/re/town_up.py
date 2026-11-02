import subprocess, sys
from PIL import Image
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'../../out/host/drive')
def run(s): return subprocess.run([D,__import__('os').environ.get('SHANTAE_ROM','shantae.gbc'),'-'],input=s,capture_output=True,text=True).stdout
def pv(out):
    r={}
    for l in out.split('\n'):
        if ':' in l and not l.startswith(('load','frames')): k,v=l.split(':',1); r[k]=v.split()
    return r
Q='peek C39D 1\npeek CBFD 1\npeek C9E9 22\npeek CBD6 1\npeek C9D6 2\npeek CBF3 1\npeek C000 16\n'
def walk_to(state, spot, save):
    # walk right one frame at a time until CBD6 == spot (max 800 frames), save state
    s=f'load st/{state}.st\nrun 20\n'
    for i in range(800): s+='run 1 R\npeek CBD6 1\n'
    out=run(s); vals=[int(l.split()[1],16) for l in out.split('\n') if l.startswith('CBD6')]
    n=next(i for i,v in enumerate(vals) if v==spot)+1+8  # step a few frames into the spot
    run(f'load st/{state}.st\nrun 20\nrun {n} R\nrun 10\nsave st/{save}.st\n')
def up(state, tag, wait=300):
    out=run(f'load st/{state}.st\nrun 2\nrun 8 U\nrun {wait}\n'+Q+f'save st/{tag}.st\nshot /tmp/{tag}.ppm\n')
    Image.open(f'/tmp/{tag}.ppm').resize((320,288),0).save(f'{tag}.png')
    return pv(out)
if __name__=='__main__':
    st=sys.argv[1]; n=int(sys.argv[2])
    for k in range(1,n+1):
        walk_to(st,k,f'{st}_s{k}')
        r=up(f'{st}_s{k}',f'{st}_u{k}')
        c=[int(x,16) for x in r['C9E9']]
        print(k,'st',r['C39D'][0],'map',r['CBFD'][0],'room %02X:%02X00 %d,%d'%(c[17],c[16],c[0]|c[1]<<8,c[3]|c[4]<<8),'spot',r['CBD6'][0],'cbf3',r['CBF3'][0],'c000',''.join(r['C000']))
