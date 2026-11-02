import subprocess, sys
D='/home/claude/shantae-dual/out/host/drive'
def edge(state, d, steps=80):
    s=f'load st/{state}.st\npoke CB3A FF\n'
    for i in range(steps):
        s+=f'run 20 {d}\nrun 10 {d}A\npeek CBFD\npeek CB43 4\npoke CA80 0C\n'
    s+='save st/walk_tmp.st\n'
    out=subprocess.run([D,'shantae.gbc','-'],input=s,capture_output=True,text=True).stdout.split('\n')
    ids=[l.split()[1] for l in out if l.startswith('CBFD')]
    pos=[l[6:] for l in out if l.startswith('CB43')]
    for i,x in enumerate(ids):
        if x!=ids[0]: return ids[0], x, i, pos[i-1]
    return ids[0], None, None, pos[-1]
if __name__=='__main__':
    for d in 'RL': print(d, edge(sys.argv[1], d))
