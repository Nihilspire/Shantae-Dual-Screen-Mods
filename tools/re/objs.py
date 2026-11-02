import sys
from h import dump
R=open('/home/claude/work/shantae.gbc','rb').read()
T={}
for k in range(192):
    o=0x0a*0x4000+1+4*k; T[(R[o],R[o+1],R[o+2])]=k
def scan(d):
    out=[]
    for bank in range(8):
        w=d[0x10000+bank*0x1000:0x10000+bank*0x1000+0x1000]
        for i in range(len(w)-2):
            k=T.get((w[i],w[i+1],w[i+2]))
            if k is not None: out.append((bank,0xD000+i if bank else 0xC000+i,k))
    return out
if __name__=='__main__':
    d=dump(sys.argv[1],'o_'+sys.argv[1])
    for b,a,k in scan(d): print(b,hex(a),k)
