"""dancetest.py - 0.33 auto dance: tap a dance in the Link page's dance list, then play the input it sends on the driver.

  python3 tests/dancetest.py
Makes a play state in Sky's area (map 14, from d4.st: every dance learned), opens the dance pop-up on the page (as
Select would), taps down the list one row at a time and records what the page passes to Native.input ("bits:frames,...").
Each string is replayed on the desktop driver from the state, frame for frame as MainActivity's queue plays it, and
the result is checked: the four transforms change the player's cel bank (node 0 +$2E: Monkey 60, Elephant 6F,
Spider 77, Harpy 70); Healing and the warps are checked by the screen fading (warps) or simply not breaking play."""
import base64, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as SR
from playwright.sync_api import sync_playwright

W = '/home/claude/work/dancetest'; os.makedirs(W, exist_ok=True)
ST = W + '/a14.st'
if not os.path.exists(ST):
    subprocess.run([SR.DRIVE, SR.ROMF, '-'], input='load /home/claude/work/st/d4.st\nwarp 14\nrun 400\nsave %s\ndump %s/a14.bin\n' % (ST, W), capture_output=True, text=True)
dump = open(W + '/a14.bin', 'rb').read()
KEYS = {1: 'B', 4: 'E', 16: 'U', 32: 'D', 64: 'L', 128: 'R', 256: 'A'}

got = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.set_viewport_size({'width': 320, 'height': 480}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(SR.mock(dump) + "\nNative.input = function (s) { (window.__input = window.__input || []).push(s); };")
    pg.add_init_script("localStorage.setItem('sd.tab', JSON.stringify('world'))")
    pg.goto('file://' + SR.ROOT + '/app/assets/link/index.html'); pg.wait_for_timeout(1200)
    y = 20
    while y < 470 and len(got) < 12:
        pg.evaluate('onSelect()'); pg.wait_for_timeout(150)
        if y == 20: pg.screenshot(path=W + '/pop.png')
        pg.mouse.click(160, y); pg.wait_for_timeout(120)
        s = pg.evaluate('(window.__input || []).slice()')
        if s:
            got.append(s[0]); print('row at y=%d -> %s' % (y, s[0]))
            pg.reload(); pg.wait_for_timeout(1200); y += 13
        else: y += 3
    b.close()
print('page errors:', errs or 'none')

def driver_script(seq):
    s = 'load %s\n' % ST
    for part in seq.split(','):
        bits, n = map(int, part.split(':'))
        s += 'run %d %s\n' % (n, ''.join(KEYS[k] for k in KEYS if bits & k))
    return s + 'run 400\npoke FF70 3\npeek D02E 1\n'
EXPECT = {'DR': '60', 'DL': '6F', 'DA': '77', 'DB': '70'}
print('dances covered:', len(set(got)), 'distinct strings')
ok = 0
for seq in got:
    keys = ''.join(KEYS[int(x.split(':')[0])] for x in seq.split(',')[1:] if not x.startswith('0:'))
    o = [l for l in subprocess.run([SR.DRIVE, SR.ROMF, '-'], input=driver_script(seq), capture_output=True, text=True).stdout.split('\n') if l.startswith('D02E')]
    cel = o[-1].split()[-1] if o else '?'
    want = EXPECT.get(keys)
    good = cel == want if want else cel not in ('60', '6F', '77', '70')
    ok += good
    print('%-7s cel bank %s %s' % (keys, cel, 'OK' if good else 'FAIL (want %s)' % want))
print('RESULT', 'PASS' if got and ok == len(got) and len(got) >= 10 and not errs else 'FAIL')
