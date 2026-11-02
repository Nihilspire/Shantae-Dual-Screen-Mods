"""Rewrites the absolute paths the test and RE scripts were written with, for a new machine.

The scripts assume:
  /home/claude/shantae-dual   this repo
  /home/claude/work           work folder: shantae.gbc (the ROM) and st/ (driver save states, from the test-states zip)
Usage: python3 tools/fixpaths.py NEW_REPO NEW_WORK      (e.g. ~/shantae-dual ~/shantae-work)
Run once after unpacking. Or skip this and make those two paths exist (symlinks are fine).
"""
import os, sys, pathlib
repo, work = (os.path.abspath(os.path.expanduser(p)) for p in sys.argv[1:3])
root = pathlib.Path(__file__).resolve().parent.parent
n = 0
for p in list(root.glob('tests/*.py')) + list(root.glob('tools/**/*.py')):
    if p.name == 'fixpaths.py': continue
    s = p.read_text(); t = s.replace('/home/claude/shantae-dual', repo).replace('/home/claude/work', work)
    if t != s: p.write_text(t); n += 1; print('fixed', p.relative_to(root))
print(n, 'files')
