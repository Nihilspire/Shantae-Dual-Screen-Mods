import sys
from h import go
from PIL import Image
# tp.py moves out : from teleport menu (tp3), apply moves (e.g. "RRD"), press A, wait, save state out
moves, out = sys.argv[1], sys.argv[2]
s=''.join(f'tap {c}\n' for c in moves)+'run 10\nshot /tmp/menu_'+out+'.ppm\ntap A\nrun 240\n'
go(s, start='tp3', out=out, shot=out)
