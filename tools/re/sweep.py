import subprocess, json
from PIL import Image
D='/home/claude/shantae-dual/out/host/drive'
res=[]
for k in range(0,110):
    s='load st/tp3.st\n'+'tap D\n'*k+'run 10\nshot /tmp/m.ppm\ntap A\nrun 300\n'
    s+='peek C389 2\npeek CBFD 1\npeek CB18 1\npeek CA00 4\npeek C39D 3\npeek FF70 1\nshot /tmp/s%d.ppm\nsave st/sw%d.st\n'%(k,k)
    r=subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True)
    vals={l.split(':')[0]:l.split(':')[1].split() for l in r.stdout.split('\n') if ':' in l and not l.startswith('load')}
    res.append((k,vals))
    print(k, vals)
json.dump(res,open('sweep.json','w'))
