import sys, subprocess
from h import go
from PIL import Image
# usage: seq.py start out "cmd;cmd" n step  -> grid of n shots every step frames after cmds
start,out,cmds,n,step=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),int(sys.argv[5])
pad=sys.argv[6] if len(sys.argv)>6 else ''
go(cmds.replace(';','\n'), start=None if start=='-' else start, out=out, shot='g0')
ims=[Image.open('g0.png')]
for i in range(1,n):
    go(f'run {step} {pad}', start=out, out=out, shot='g%d'%i); ims.append(Image.open('g%d.png'%i))
cols=min(n,4); rows=(n+cols-1)//cols
W=Image.new('RGB',(320*cols,288*rows))
for i,im in enumerate(ims): W.paste(im,((i%cols)*320,(i//cols)*288))
W.save('grid.png')
