import subprocess, sys
D='/home/claude/shantae-dual/out/host/drive'
def lag(oc, start, script, tag):
    s=f'load st/{start}.st\noc {oc}\ntrace FF00 FF00 10000000 /tmp/lag{tag}.txt\n'+script+f'\nshot /tmp/{tag}.ppm\n'
    subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True)
    fr=set(int(l.split('f=')[1].split()[0]) for l in open(f'/tmp/lag{tag}.txt'))
    lo,hi=min(fr),max(fr)
    return sum(1 for f in range(lo,hi+1) if f not in fr), hi-lo+1
scr=sys.argv[2] if len(sys.argv)>2 else 'run 600 R'
for oc in (0,1): print(sys.argv[1],'oc',oc,lag(oc,sys.argv[1],scr.replace(';','\n'),f'{sys.argv[1]}{oc}'))
