"""view3dsamples.py OUTDIR: sample scenes of the 3D view at 960x864 (warp, wait, one still per camera) and short walking clips
(ffmpeg). Contains game art: for the Renders folder only."""
import base64, os, shutil, subprocess, sys
from playwright.sync_api import sync_playwright

ROOT = '/home/claude/shantae-dual'; DRIVE = ROOT + '/out/host/drive'; ROMF = '/home/claude/work/shantae.gbc'
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
W = '/home/claude/work/v3/samples'; shutil.rmtree(W, ignore_errors=True); os.makedirs(W)
SCENES = [('05', 'Dock with crates', ['TILT', 'SIDE']), ('15', 'Stone ramp in the forest', ['TILT', 'HIGH']), ('12', 'Lighthouse and pier', ['TILT', 'CLOSE']),
          ('14', 'Forest graveyard', ['SIDE']), ('24', 'Labyrinth cave', ['TILT', 'SIDE']), ('19', 'Desert with cactus', ['TILT']),
          ('0E', 'Snowy pines', ['SIDE']), ('30', 'Water Town gates', ['TILT'])]
CLIPS = [('05', 'R', 'SIDE', 'Walking the dock'), ('15', 'R', 'TILT', 'Climbing the ramp'), ('24', 'R', 'CLOSE', 'Cave, following camera')]
rom = open(ROMF, 'rb').read()
SPEC = [(0xC9E9, 22), (0xFFDF, 1), (0xCB43, 4), (0xC39D, 1)]
def frame(d):
    hexv = ''.join(d[ad:ad + n].hex() for ad, n in SPEC)
    v = d[0x18000:0x1C000] + d[0x1C000:0x1C080] + d[0xFE00:0xFEA0] + bytes([d[0xFF40], d[0xFF42], d[0xFF43], d[0xFF4A], d[0xFF4B]])
    return hexv + '|' + base64.b64encode(v).decode()
mock = """var ROM = atob('%s'), CUR = '', SEQ = 0, CAM = 'FLAT';
window.V3 = { frame: function (s) { return CUR && SEQ !== s ? SEQ + '|' + CUR : ''; }, rom: function (o, l) { return o + l <= ROM.length ? btoa(ROM.substr(o, l)) : ''; },
  cam: function () { return CAM; }, setCam: function (n) { CAM = n; } };
window.__feed = function (f) { CUR = f; SEQ++; };""" % base64.b64encode(rom).decode()
s = ''
for i, _, _ in SCENES: s += 'load /home/claude/work/st/d4.st\nwarp %s\nrun 500\ndump %s/s%s.bin\n' % (i, W, i)
for i, key, _, _ in CLIPS:
    s += 'load /home/claude/work/st/d4.st\nwarp %s\nrun 450\n' % i + ''.join('run 3 %s\ndump %s/c%s_%03d.bin\n' % (key, W, i, k) for k in range(100))
subprocess.run([DRIVE, ROMF, '-'], input=s, capture_output=True, text=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 960, 'height': 864}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.add_init_script(mock)
    pg.goto(f'file://{ROOT}/app/assets/view3d/index.html'); pg.wait_for_timeout(300)
    def cam(c): pg.evaluate('n => V3debug.pick(n)', c); pg.evaluate('n => { CAM = n; }', c)
    for i, name, cams in SCENES:
        d = open('%s/s%s.bin' % (W, i), 'rb').read()
        for c in cams:
            cam(c)
            for r in range(4): pg.evaluate('f => __feed(f)', frame(d)); pg.wait_for_timeout(80)
            pg.wait_for_timeout(1700)                           # the glide and its label
            pg.evaluate('f => __feed(f)', frame(d)); pg.wait_for_timeout(150)
            pg.screenshot(path='%s/%s - %s.png' % (OUT, name, 'HIGH ANGLE' if c == 'HIGH' else c))
        print('scene', i, name, pg.evaluate('V3debug.state().on'), flush=True)
    for i, key, c, name in CLIPS:
        cam(c); fd = '%s/f%s' % (W, i); os.makedirs(fd)
        d0 = open('%s/c%s_000.bin' % (W, i), 'rb').read()
        for r in range(4): pg.evaluate('f => __feed(f)', frame(d0)); pg.wait_for_timeout(80)
        pg.wait_for_timeout(1700)
        for k in range(100):
            d = open('%s/c%s_%03d.bin' % (W, i, k), 'rb').read()
            pg.evaluate('f => __feed(f)', frame(d)); pg.wait_for_timeout(45)
            pg.screenshot(path='%s/%03d.png' % (fd, k))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '20', '-i', fd + '/%03d.png', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
                        '-pix_fmt', 'yuv420p', '%s/%s.mp4' % (OUT, name)], check=True)
        print('clip', name, flush=True)
    b.close()
print('errors', errs[:4])
