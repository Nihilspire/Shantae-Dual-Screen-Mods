import subprocess, sys
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'../../out/host/drive')
def peekvars(lines):
    r={}
    for l in lines.split('\n'):
        if ':' in l and not l.startswith(('load','frames')):
            k,v=l.split(':',1); r[k]=v.split()
    return r
def state_vars(state, pre=''):
    s=f'load st/{state}.st\n{pre}run 2\npeek CBFD 1\npeek C9E9 22\npeek CB43 4\npeek C39D 1\n'
    return peekvars(subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True).stdout)
def room_of(v):
    c=[int(x,16) for x in v['C9E9']]
    return dict(map=int(v['CBFD'][0],16), x=c[0]|c[1]<<8, y=c[3]|c[4]<<8, w=(c[11]|c[12]<<8)+160, h=(c[13]|c[14]<<8)+128, reg='%02X:%02X00'%(c[17],c[16]))
def go(state, x, y, inputs, save=None):
    s=f'load st/{state}.st\nrun 2\npoke D034 {x&255:02X}\npoke D035 {x>>8:02X}\npoke D037 {y&255:02X}\npoke D038 {y>>8:02X}\nrun 20\n'
    s+=inputs+'run 240\npeek CBFD 1\npeek C9E9 22\npeek CB43 4\npeek C39D 1\nshot /tmp/ex.ppm\n'
    if save: s+=f'save st/{save}.st\n'
    v=peekvars(subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True).stdout)
    return room_of(v), v['CB43'], v['C39D']
if __name__=='__main__':
    st=sys.argv[1]
    print('start', room_of(state_vars(st)))
    print(go(st, int(sys.argv[2]), int(sys.argv[3]), sys.argv[4].replace(';','\n')+'\n'))
