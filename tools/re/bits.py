from h import go
from PIL import Image, ImageChops
base='CB38=0,CB39=0,CB3A=0,CB3B=0'
def shots(pokes):
    p=''.join(f'poke {a} {v}\n' for a,v in (x.split('=') for x in pokes.split(',') if x))
    go(p+'run 2\ntap T\nrun 120', start='d4', shot='pa')
    go(p+'run 2\ntap T\nrun 120\ntap B\nrun 160', start='d4', shot='pb')
    return Image.open('pa.png').copy(), Image.open('pb.png').copy()
b0=shots(base)
res=[]
for a in ['CB38','CB39','CB3A','CB3B']:
    for bit in range(8):
        s=shots(base.replace(a+'=0', f'{a}={1<<bit:x}'))
        da=ImageChops.difference(s[0],b0[0]).getbbox(); db=ImageChops.difference(s[1],b0[1]).getbbox()
        res.append((a,bit,da,db,s))
        print(a,bit,'inv',da,'dance',db)
# make a gallery of changed ones
ch=[r for r in res if r[2] or r[3]]
W=Image.new('RGB',(640,288*len(ch)))
for i,r in enumerate(ch): W.paste(r[4][0],(0,288*i)); W.paste(r[4][1],(320,288*i))
W.resize((320,144*len(ch))).save('bits.png')
