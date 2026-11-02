import subprocess, sys, os
from PIL import Image
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'../../out/host/drive'); ROM=__import__('os').environ.get('SHANTAE_ROM','shantae.gbc')
def go(script, start=None, out=None, shot='cur', scale=2):
    s=''
    if start: s+=f'load st/{start}.st\n'
    s+=script.strip()+'\n'
    if out: s+=f'save st/{out}.st\n'
    if shot: s+=f'shot /tmp/{shot}.ppm\n'
    r=subprocess.run([D,ROM,'-'],input=s,capture_output=True,text=True)
    if shot:
        Image.open(f'/tmp/{shot}.ppm').resize((160*scale,144*scale),0).save(f'{shot}.png')
    return r.stdout
def dump(start, name):
    go('dump /tmp/%s.bin'%name, start=start, shot=None)
    return open('/tmp/%s.bin'%name,'rb').read()
def wram(d, bank, off, n=1): o=0x10000+bank*0x1000+off; return d[o:o+n]
if __name__=='__main__':
    print(go(sys.argv[1].replace(';','\n'), start=sys.argv[2] if len(sys.argv)>2 and sys.argv[2]!='-' else None, out=sys.argv[3] if len(sys.argv)>3 else None))
