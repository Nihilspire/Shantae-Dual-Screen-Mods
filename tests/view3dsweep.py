"""view3dsweep.py OUTDIR [--ids 00,0B,...] [--cams FLAT,TILT,SIDE,HIGH,CLOSE] [--walk N]: the 3D view in every place the
dev-room warp can reach (driver: warp, wait, dump), one contact sheet per 8 places: the 2D game, then each camera.
Prints each place's collision codes (from the page) and whether the view switched on. Contains game art: keep the
sheets out of chat."""
import argparse, base64, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = '/home/claude/shantae-dual'; DRIVE = ROOT + '/out/host/drive'; ROMF = '/home/claude/work/shantae.gbc'
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--ids', default=''); ap.add_argument('--cams', default='FLAT,TILT,SIDE,HIGH,CLOSE')
ap.add_argument('--walk', type=int, default=0, help='walk right this many frames after arriving'); ap.add_argument('--wait', type=int, default=500)
ap.add_argument('--state', action='append', default=[], help='also a driver state: file[:frames to run]')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
W = a.out + '/d'; os.makedirs(W, exist_ok=True)
ids = a.ids.split(',') if a.ids else ([] if a.state else ['%02X' % i for i in range(0x44)])
cams = a.cams.split(',')
s = ''; places = []
for i in ids:
    s += 'load /home/claude/work/st/d4.st\nwarp %s\nrun %d\n' % (i, a.wait)
    if a.walk: s += 'run %d R\n' % a.walk
    s += 'dump %s/%s.bin\nshot %s/%s.ppm\n' % (W, i, W, i); places.append(i)
for st in a.state:
    f, _, n = st.partition(':'); nm = os.path.basename(f).replace('.st', '')
    s += 'load %s\nrun %s\ndump %s/%s.bin\nshot %s/%s.ppm\n' % (f, n or '30', W, nm, W, nm); places.append(nm)
subprocess.run([DRIVE, ROMF, '-'], input=s, capture_output=True, text=True)

rom = open(ROMF, 'rb').read()
SPEC = [(0xC9E9, 22), (0xFFDF, 1), (0xCB43, 4), (0xC39D, 1)]
def frame(d):
    hexv = ''.join(d[ad:ad + n].hex() for ad, n in SPEC)
    v = d[0x18000:0x1C000] + d[0x1C000:0x1C080] + d[0xFE00:0xFEA0] + bytes([d[0xFF40], d[0xFF42], d[0xFF43], d[0xFF4A], d[0xFF4B]])
    return hexv + '|' + base64.b64encode(v).decode()
mock = """
var ROM = atob('%s'), CUR = '', SEQ = 0, CAM = 'FLAT';
window.V3 = { frame: function (seen) { return CUR && SEQ !== seen ? SEQ + '|' + CUR : ''; },
  rom: function (off, len) { return off + len <= ROM.length ? btoa(ROM.substr(off, len)) : ''; },
  cam: function () { return CAM; }, setCam: function (n) { CAM = n; } };
window.__feed = function (f) { CUR = f; SEQ++; };
""" % base64.b64encode(rom).decode()
TW, TH = 240, 216
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': TW * 2, 'height': TH * 2}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.add_init_script(mock)
    pg.goto(f'file://{ROOT}/app/assets/view3d/index.html'); pg.wait_for_timeout(300)
    rows = []
    for nm in places:
        d = open(f'{W}/{nm}.bin', 'rb').read(); row = [Image.open(f'{W}/{nm}.ppm').convert('RGB').resize((TW, TH), Image.NEAREST)]; on = False
        for c in cams:
            pg.evaluate('n => V3debug.pick(n)', c); pg.evaluate('n => { CAM = n; }', c)
            for r in range(4): pg.evaluate('f => __feed(f)', frame(d)); pg.wait_for_timeout(70)
            pg.wait_for_timeout(750)
            pg.evaluate('f => __feed(f)', frame(d)); pg.wait_for_timeout(120)
            on = pg.evaluate('V3debug.state().on')
            f = f'{W}/_s.png'; pg.screenshot(path=f); row.append(Image.open(f).convert('RGB').resize((TW, TH), Image.BILINEAR))
        st = pg.evaluate('V3debug.state()')
        codes = pg.evaluate('V3debug.codes ? V3debug.codes() : null')
        print(nm, 'map %02X' % d[0xCBFD], 'state', d[0xC39D], 'on' if on else 'OFF', 'verts', st['verts'], 'overlay', st['overlay'], 'room', st['room'], 'cam', st['cam2d'], 'codes', codes, flush=True)
        rows.append((nm, on, row))
    b.close()
print('page errors', errs[:5])
per = 8
for k in range(0, len(rows), per):
    part = rows[k:k + per]
    sh = Image.new('RGB', (TW * (len(cams) + 1), TH * len(part)), (30, 30, 30))
    for j, (nm, on, row) in enumerate(part):
        for i, im in enumerate(row): sh.paste(im, (i * TW, j * TH))
        ImageDraw.Draw(sh).text((3, j * TH + 3), nm + ('' if on else ' OFF'), fill=(255, 255, 0))
    sh.save('%s/sheet_%02d.png' % (a.out, k // per))
    print('sheet', k // per, [r[0] for r in part])
