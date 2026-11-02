import subprocess, sys
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'../../out/host/drive')
def scan_at(state, x, y, night):
    s=f'load st/{state}.st\n'+('poke C3EA 80\npoke C3E9 00\n' if night else '')+f'poke D034 {x&255:02X}\npoke D035 {x>>8:02X}\npoke D037 {y&255:02X}\npoke D038 {y>>8:02X}\nrun 40\ndump /tmp/so.bin\n'
    subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True)
    d=open('/tmp/so.bin','rb').read(); b3=d[0x10000+3*0x1000:0x10000+4*0x1000]
    hits=[]
    # object nodes: +2..4 script (lo,hi,bank); x at +0x34, y at +0x37
    for i in range(0,0x1000-0x40):
        if b3[i+4]==0x11 and 0x70<=b3[i+3]<=0x76:
            hits.append(('%02x:%02x%02x'%(b3[i+4],b3[i+3],b3[i+2]), b3[i+0x34]|b3[i+0x35]<<8, b3[i+0x37]|b3[i+0x38]<<8))
    return hits
if __name__=='__main__':
    st=sys.argv[1]; x0,x1,step=[int(v,16) for v in sys.argv[2:5]]; ys=[int(v,16) for v in sys.argv[5].split(',')]
    night=len(sys.argv)>6
    seen=set()
    for y in ys:
        for x in range(x0,x1,step):
            for h in scan_at(st,x,y,night):
                if h not in seen: seen.add(h); print(hex(x),hex(y),h)
