"""Renders the playtest 3D view (assets/view3d) in headless Chromium (SwiftShader WebGL) with a mock V3 bridge fed from
driver dumps (layout as in linktest.py). One screenshot per dump; the camera can be fixed or cycled.
usage: view3dtest.py out_prefix dump.bin [dump.bin ...] [--size 960x864] [--cam FLAT|TILT|...|CYCLE] [--every N]
       [--frames N]  (repeat the last dump N times, e.g. to watch a CYCLE play out)  [--stats]"""
import base64, sys, json, argparse, os, time
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('dumps', nargs='+'); ap.add_argument('--size', default='960x864')
ap.add_argument('--cam', default='FLAT'); ap.add_argument('--frames', type=int, default=0); ap.add_argument('--stats', action='store_true')
ap.add_argument('--wait', type=int, default=60); ap.add_argument('--rep', type=int, default=1, help='feed each dump this many times (the view turns on after 2 matching frames)')
a = ap.parse_args()
ROOT = '/home/claude/shantae-dual'
rom = open('/home/claude/work/shantae.gbc', 'rb').read()
SPEC = [(0xC9E9, 22), (0xFFDF, 1), (0xCB43, 4), (0xC39D, 1)]
def frame(d):
    hexv = ''.join(d[ad:ad + n].hex() for ad, n in SPEC)
    v = d[0x18000:0x1C000] + d[0x1C000:0x1C080] + d[0xFE00:0xFEA0] + bytes([d[0xFF40], d[0xFF42], d[0xFF43], d[0xFF4A], d[0xFF4B]])
    return hexv + '|' + base64.b64encode(v).decode()
mock = """
var ROM = atob('%s'), CUR = '', SEQ = 0, CAM = %s;
window.V3 = { frame: function (seen) { return CUR && SEQ !== seen ? SEQ + '|' + CUR : ''; },
  rom: function (off, len) { return off + len <= ROM.length ? btoa(ROM.substr(off, len)) : ''; },
  cam: function () { return CAM; }, setCam: function (n) { CAM = n; } };
window.__feed = function (f) { CUR = f; SEQ++; };
""" % (base64.b64encode(rom).decode(), json.dumps(a.cam))
W, H = map(int, a.size.split('x'))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': W, 'height': H}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.add_init_script(mock)
    pg.goto(f'file://{ROOT}/app/assets/view3d/index.html'); pg.wait_for_timeout(300)
    seq = [open(f, 'rb').read() for f in a.dumps] + [None] * a.frames
    last = None; n = 0; t0 = time.time()
    for i, d in enumerate(seq):
        if d is not None: last = d
        for r in range(a.rep): pg.evaluate('f => __feed(f)', frame(last)); pg.wait_for_timeout(a.wait)
        pg.screenshot(path=f'{a.out}_{n:04d}.png'); n += 1
        if a.stats: print(i, os.path.basename(a.dumps[i]) if i < len(a.dumps) else '', 'state', last[0xC39D], pg.evaluate('V3debug.state()'))
    print('shots', n, 'secs', round(time.time() - t0, 1), 'errors', errs)
    b.close()
