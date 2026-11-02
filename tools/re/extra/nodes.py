import subprocess, sys
D='/home/claude/shantae-dual/out/host/drive'; ROM='/home/claude/work/shantae.gbc'
def run(s): return subprocess.run([D,ROM,'-'],input=s,capture_output=True,text=True).stdout
def w3(d): return d[0x10000+3*0x1000:0x10000+4*0x1000]
def nodes(d):
    b=w3(d); out=[]
    for i in range(32):
        o=i*0x7E
        if o+0x7E>0x1000: break
        n=b[o:o+0x7E]
        pc=(n[4],n[2]|n[3]<<8)
        out.append(dict(i=i,act=n[0],fl=n[1],pc=pc,x=n[0x34]|n[0x35]<<8,y=n[0x37]|n[0x38]<<8,raw=n))
    return out
if __name__=='__main__':
    d=open(sys.argv[1],'rb').read()
    for n in nodes(d):
        if n['pc'][1]: print(n['i'],hex(n['act']),hex(n['fl']),'%02X:%04X'%n['pc'],n['x'],n['y'],n['raw'][0x5c:0x6a].hex(' '))
