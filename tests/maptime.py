"""How long the Link MAP takes to show a new room the way the app feeds it: RAM fresh every 100 ms tick, the video
snapshot only every VIDEO_EVERY frames (MainActivity's sampleTheme). Feeds a run of drive dumps taken every 6 frames
(one per tick) and prints, per tick, what the map shows. usage: maptime.py dumpdir [--video-every 20] [--size 700x500]"""
import base64, sys, json, argparse, glob, os, time
sys.path.insert(0, '/home/claude/work')
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('dir'); ap.add_argument('--video-every', type=int, default=20); ap.add_argument('--size', default='700x500')
ap.add_argument('--shots'); ap.add_argument('--ls', action='append', default=[]); ap.add_argument('--reload-at', type=int, default=-1); ap.add_argument('--no-idb', action='store_true', help='hide IndexedDB (the localStorage fallback)'); ap.add_argument('--passes', type=int, default=1, help='play the run again after a page reload (IndexedDB kept)')
a = ap.parse_args()
ROOT = '/home/claude/shantae-dual'
rom = open('/home/claude/work/shantae.gbc', 'rb').read()
def video(d):
    v = d[0x18000:0x1C000] + d[0x1C000:0x1C080] + d[0xFE00:0xFEA0] + bytes([d[0xFF40], d[0xFF42], d[0xFF43], d[0xFF4A], d[0xFF4B]])
    return base64.b64encode(v).decode()
fs = sorted(glob.glob(os.path.join(a.dir, 'd*.bin'))); D = [open(f, 'rb').read() for f in fs]
mock = """
var ROMALL = atob('%s'), mem = new Uint8Array(65536), V = '';
window.__set = function (d, v) { var b = atob(d); for (var i = 0; i < b.length; i++) mem[i] = b.charCodeAt(i); if (v) V = v; };
window.Native = { dual: function () { return true; }, running: function () { return true; }, version: function () { return '0.1'; },
  mem: function (spec) { var out = ''; spec.split(',').forEach(function (p) { var q = p.split(':'), ad = parseInt(q[0], 16), n = q[1] ? +q[1] : 1;
      for (var k = 0; k < n; k++) out += ('0' + mem[(ad + k) & 0xFFFF].toString(16)).slice(-2); }); return out; },
  video: function () { return V; }, font: function () { return ''; },
  rom: function (off, len) { return off + len <= ROMALL.length ? btoa(ROMALL.substr(off, len)) : ''; },
  slots: function () { return '[]'; }, thumb: function () { return ''; }, gbaMode: function () { return true; }, overlay: function () { return false; },
  asset: function () { return ''; }, menu: function () {}, close: function () {} };
""" % base64.b64encode(rom).decode()
W, H = map(int, a.size.split('x'))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': W, 'height': H}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(mock)
    if a.no_idb: pg.add_init_script("Object.defineProperty(window, 'indexedDB', { value: undefined })")
    pg.add_init_script("try { localStorage.setItem('sd.tab', JSON.stringify('world')); localStorage.setItem('sd.worldView', JSON.stringify('map')); } catch (e) {}")
    for kv in a.ls:
        k, v = kv.split('=', 1); pg.add_init_script('try { localStorage.setItem(%s, %s); } catch (e) {}' % (json.dumps(k), json.dumps(v)))
    pg.goto(f'file://{ROOT}/app/assets/link/index.html')
    # warm up: the one-time ROM room scan happens on the first start (stored after); let it finish on the first dump
    pg.evaluate('([d, v]) => __set(d, v)', [base64.b64encode(D[0][:0x10000]).decode(), video(D[0])]); pg.wait_for_timeout(5000)
    last = None; t0 = time.time()
    for i, d in [(i, d) for ps in range(a.passes) for i, d in enumerate(D)]:
        if i == 0 and last is not None: print('--- reload ---'); pg.reload(); pg.wait_for_timeout(300); last = None
        if i == a.reload_at: pg.reload(); pg.wait_for_timeout(300)
        fr = i * 6; vi = (fr // a.video_every) * a.video_every // 6      # the latest snapshot the app would have
        v = video(D[vi]) if vi != last else None; last = vi
        pg.evaluate('([d, v]) => __set(d, v)', [base64.b64encode(d[:0x10000]).decode(), v]); pg.wait_for_timeout(100)
        info = pg.evaluate('ShantaeMap._info()')
        room = d[0xC9E9] | d[0xC9EA] << 8
        ok = info['pk'] == info['cur']
        print(f"{i:3d} t={i*0.1:4.1f}s room x={room:5d} st={d[0xC39D]} pal={d[0x1C000:0x1C004].hex()} | {'SHOWN' if ok else '-----'} full={'Y' if info['full'] else '-'} lut={info['lut'][:24]:24s} mem={info['mem']} db={info['stored']} q={info['queue']} {info['status']} p={info.get('pend')} b={info.get('bad')} {info.get('dbg')}")
        if a.shots: pg.screenshot(path=f'{a.shots}_{i:03d}.png')
    print('errors', errs); b.close()
