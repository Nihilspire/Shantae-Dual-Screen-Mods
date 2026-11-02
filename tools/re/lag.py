import subprocess
from PIL import Image
D='/home/claude/shantae-dual/out/host/drive'
def run(oc, start, script, tag):
    s=f'load st/{start}.st\noc {oc}\n'
    # step frame by frame reading C37D (8-bit counter incremented by the game's main loop)
    for cmd in script:
        s+=cmd+'\n'
    s+=f'shot /tmp/{tag}.ppm\n'
    r=subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True)
    vals=[int(l.split()[1],16) for l in r.stdout.split('\n') if l.startswith('C37D')]
    lag=sum(1 for a,b in zip(vals,vals[1:]) if a==b)
    return lag,len(vals)
script=[]
for i in range(600):
    script.append('run 1 %s'%('RB' if (i//20)%2 else 'R'))
    script.append('peek C37D')
for oc in (0,1):
    print('oc',oc,run(oc,'d4',script,'oc%d'%oc))
