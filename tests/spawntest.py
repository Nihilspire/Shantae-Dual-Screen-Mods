"""spawntest.py - WIDE VIEW's wider spawn window must never lose objects the game would have.
For every warp place: the object scripts alive after arriving and after walking a little, with WIDE VIEW off (160) and on (274, a 16:9
screen). On must have everything off has. Background: the game only scans the object lists of the screen columns (256 pixels) its spawn
window's edges are in, so a window wider than 256 can skip the column in between (Water Town Gates lost its exits and town door)."""
import collections, subprocess, sys
DRIVE = '/home/claude/shantae-dual/out/host/drive'; ROMF = '/home/claude/work/shantae.gbc'; W = '/home/claude/work/ws'
VIEW = int(sys.argv[1]) if len(sys.argv) > 1 else 274
def scripts(d):
    """Objects by where they came from: a placed object by its list entry's 'spawned' byte (node +$27, set by 00:105B), one the room's own
    code made by its script's bank. Not by the script's address: an object woken earlier is further along its script."""
    c = collections.Counter()
    for i in range(1, 32):
        b = 0x13000 + i * 0x7E
        if d[b] == 0xFF: continue
        mark = d[b + 0x27] | d[b + 0x28] << 8
        c['placed %04X' % mark if mark else 'made in bank %02X' % d[b + 4]] += 1
    return c
def alive(view, warp, walk):
    subprocess.run([DRIVE, ROMF, '-'], input='view %d\nload /home/claude/work/st/d4.st\noc 1\nwarp %s\nrun 450\n%sdump %s/sp.bin\n' % (view, warp, walk, W), capture_output=True, text=True)
    return scripts(open(W + '/sp.bin', 'rb').read())
lost = []; made = []
for n in range(0x44):
    warp = '%02X' % n
    for walk in ('', 'run 90 R\n'):
        a, b = alive(160, warp, walk), alive(VIEW, warp, walk)
        miss = a - b
        when = 'arrived' if not walk else 'walked'
        placed = {k: v for k, v in miss.items() if k.startswith('placed')}
        if placed: lost.append((warp, when, placed))
        # what the room's own code makes (drips, shots, bursts) comes and goes with timing: listed, not failed
        other = {k: v for k, v in miss.items() if not k.startswith('placed')}
        if other: made.append((warp, when, other))
print('places checked: %d, placed objects lost when WIDE VIEW is on: %d' % (0x44, len({l[0] for l in lost})))
for l in lost: print('  ', l)
print('room-made objects fewer at that moment (timing, not a loss):', made or 'none')
print('RESULT', 'PASS' if not lost else 'FAIL')
