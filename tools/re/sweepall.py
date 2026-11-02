import subprocess, sys
D='/home/claude/shantae-dual/out/host/drive'
def objects_at(state, x, y):
    s=f'load st/{state}.st\nrun 2\npoke D034 {x&255:02X}\npoke D035 {x>>8:02X}\npoke D037 {y&255:02X}\npoke D038 {y>>8:02X}\nrun 30\ndump /tmp/sa.bin\n'
    subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True)
    d=open('/tmp/sa.bin','rb').read(); b3=d[0x10000+3*0x1000:0x10000+4*0x1000]
    # walk the object list from HRAM $B3/$B4
    out=[]; p=d[0xFFB3]|d[0xFFB4]<<8; n=0
    while 0xD000<=p<0xE000 and n<60:
        o=p-0xD000; node=b3[o:o+0x60]
        out.append(((node[4],node[2]|node[3]<<8), node[0x34]|node[0x35]<<8, node[0x37]|node[0x38]<<8, node[0x20:0x24].hex()))
        p=node[0]|node[1]<<8; n+=1
    return out
if __name__=='__main__':
    st=sys.argv[1]; x0,x1,step,y=[int(v) for v in sys.argv[2:6]]
    seen={}
    for x in range(x0,x1,step):
        for (b,a),ox,oy,par in objects_at(st,x,y):
            k=(b,a>>4,ox//16,oy//16)
            if k not in seen: seen[k]=1; print(x,'%02x:%04x'%(b,a),ox,oy,par)
