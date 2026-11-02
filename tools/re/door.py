import subprocess, sys
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'../../out/host/drive')
def door(state, x, y):
    s=f'load st/{state}.st\nrun 5\npoke D034 {x&255:02X}\npoke D035 {x>>8:02X}\npoke D037 {y&255:02X}\npoke D038 {y>>8:02X}\nrun 30\npeek CB43 4\nrun 8 U\nrun 200\npeek CBFD 1\npeek CB43 4\npeek C9E9 5\nshot /tmp/door.ppm\n'
    out=subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True).stdout
    return [l for l in out.split('\n') if ':' in l and not l.startswith('load')]
if __name__=='__main__':
    print(door(sys.argv[1], int(sys.argv[2]), int(sys.argv[3])))
