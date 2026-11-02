import sys
from h import go
from PIL import Image
# pk.py start "addr=val,addr=val" name  -> inventory + dance menu shots side by side
start, pokes, name = sys.argv[1], sys.argv[2], sys.argv[3]
p=''.join(f'poke {a} {v}\n' for a,v in (x.split('=') for x in pokes.split(',') if x))
go(p+'run 2\ntap T\nrun 120', start=start, shot='pa')
go(p+'run 2\ntap T\nrun 120\ntap B\nrun 160', start=start, shot='pb')
W=Image.new('RGB',(640,288)); W.paste(Image.open('pa.png'),(0,0)); W.paste(Image.open('pb.png'),(320,0)); W.save(name+'.png')
