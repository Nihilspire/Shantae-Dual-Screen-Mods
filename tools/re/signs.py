import subprocess, sys
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'../../out/host/drive')
def try_at(state, x, y, key='B'):
    s=f'load st/{state}.st\nrun 2\npoke D034 {x&255:02X}\npoke D035 {x>>8:02X}\npoke D037 {y&255:02X}\npoke D038 {y>>8:02X}\nrun 30\nrun 4 {key}\nrun 40\npeek C39D 1\npeek CB43 4\n'
    out=subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True).stdout
    v={l.split(':')[0]:l.split(':')[1].split() for l in out.split('\n') if ':' in l and not l.startswith(('load','frames'))}
    return v['C39D'][0], v['CB43']
if __name__=='__main__':
    st=sys.argv[1]; x0,x1,step,y=[int(v) for v in sys.argv[2:6]]; key=sys.argv[6] if len(sys.argv)>6 else 'B'
    for x in range(x0,x1,step):
        c,p=try_at(st,x,y,key)
        if c!='02': print(x,c,p)
