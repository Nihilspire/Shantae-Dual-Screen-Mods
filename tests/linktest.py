"""Renders the Link page in headless Chromium with a mock Native fed from driver RAM dumps
(dump layout: CPU $0000-$FFFF | WRAM banks | VRAM 0x4000 | BG pal 64 | OBJ pal 64 | SRAM).
usage: linktest.py dump.bin out_prefix [W H] [--icons inventory_dump.bin] [--tab name]"""
import base64, sys, json, argparse, os
sys.path.insert(0, '/home/claude/work')
from lzss import lzss
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('dump'); ap.add_argument('out'); ap.add_argument('--size', default='900x600')
ap.add_argument('--icons'); ap.add_argument('--tabs', default='items,dances,world,list,options,status'); ap.add_argument('--gba', default='true'); ap.add_argument('--standin', action='store_true'); ap.add_argument('--ls', action='append', default=[]); ap.add_argument('--time', action='store_true'); ap.add_argument('--card', help='open this map card (ways/doors/items/rooms) before the shot'); ap.add_argument('--drag', action='append', default=[], help='x0,y0,x1,y1,... (page px): a finger stroke before the taps'); ap.add_argument('--tap', action='append', default=[], help='x,y (page px): tap after the shot and print $CA84'); ap.add_argument('--anim', help='dir of drive dumps dNNN.bin: one Link screenshot per dump (out_NNN.png)')
ap.add_argument('--ra', action='store_true', help='Shantae Link: linkapp/ra.js over a fake window.RA that answers only what '
                'RetroArch reaches with the Gambatte core (tests/mock_ra.py lookup)')
ap.add_argument('--eval', action='append', default=[], help='JS expression to print after the shots (debugging)')
ap.add_argument('--ra-core', default='gambatte', help='with --ra: the core whose memory map RetroArch exposes (gambatte, mgba)')
ap.add_argument('--ra-blocks', help='with --ra: answer from this JSON {hex addr: hex bytes} taken from a live RetroArch '
                '(tests/ra_snapshot.py) instead of the dump')
ap.add_argument('--ra-state', default='', help='with --ra: norom, badrom, noreply, nogame or wrong (the setup screen)')
ap.add_argument('--wait', type=int, default=1500, help='ms to wait after loading each tab (--ra first start scans the ROM: ~4000)')
a = ap.parse_args()
ROOT = '/home/claude/shantae-dual'
rom = open('/home/claude/work/shantae.gbc', 'rb').read()
tiles, _ = lzss(rom, 0x3964A3, 0x1800)
def video(d):
    v = d[0x18000:0x1C000] + d[0x1C000:0x1C080] + d[0xFE00:0xFEA0] + bytes([d[0xFF40], d[0xFF42], d[0xFF43], d[0xFF4A], d[0xFF4B]])
    return base64.b64encode(v).decode()
dump = open(a.dump, 'rb').read()
inv = open(a.icons, 'rb').read() if a.icons else None
W, H = map(int, a.size.split('x'))
mock = """
var ROMALL = '%s';
var romBin = atob(ROMALL);
var D = '%s', V = %s, INV = %s, FONT = '%s', ROMSIGN = '%s', THUMB = '%s';
var bin = atob(D), mem = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) mem[i] = bin.charCodeAt(i);
var invShown = !!INV, polls = 0;
window.__set = function (d, v) { var b = atob(d); for (var i = 0; i < b.length; i++) mem[i] = b.charCodeAt(i); V = v; };   // --anim
window.Native = { dual: function () { return true; }, running: function () { return true; }, version: function () { return '0.1'; },
  mem: function (spec) { var out = ''; spec.split(',').forEach(function (p) { var q = p.split(':'), wb = -1;
      if (/^w[0-7]$/.test(q[0])) { wb = +q[0][1]; q = q.slice(1); }
      var ad = parseInt(q[0], 16), n = q[1] ? +q[1] : 1;
      for (var k = 0; k < n; k++) { var a = (ad + k) & 0xFFFF, v = wb >= 0 && mem.length >= 0x18000 ? mem[0x10000 + wb * 0x1000 + (a & 0xFFF)] : mem[a];
        out += ('0' + (v | 0).toString(16)).slice(-2); } }); return out; },
  video: function () { polls++; return invShown && polls < 6 ? INV : V; },
  font: function () { return FONT; }, rom: function (off, len) { return off + len <= romBin.length ? btoa(romBin.substr(off, len)) : ''; },
  slots: function () { return JSON.stringify([{n:1,time:Date.now()},{n:2,time:0},{n:3,time:Date.now()-5e6},{n:4,time:0}]); },
  thumb: function (n) { return THUMB; }, saveSlot: function () { return true; }, loadSlot: function () { return true; },
  gbaMode: function () { return %s; }, equip: function (i) { mem[0xCA84] = i; return true; }, overlay: function () { return false; },
  ff: function (m) { if (m === 0) window.__ff = false; else if (m === 1) window.__ff = true; else if (m === 2) window.__ff = !window.__ff; return !!window.__ff; },
  input: function (s) { (window.__input = window.__input || []).push(s); },
  menu: function () {}, close: function () {} };
""" % (base64.b64encode(rom).decode(), base64.b64encode(dump[:0x18000]).decode(), json.dumps(video(dump)), json.dumps(video(inv)) if inv else 'null',
       base64.b64encode(tiles[0x1000:0x1800]).decode(), base64.b64encode(rom[0xA5F00:0xA6500]).decode(),
       'data:image/png;base64,' + base64.b64encode(open('/home/claude/shantae-dual/tests/standin.png', 'rb').read()).decode(), a.gba)
if a.ra:
    sys.path.insert(0, ROOT + '/tests')
    import mock_ra
    mock_ra.use(a.ra_core)
    # every block ra.js may ask for: its REGIONS split into 256-byte pages (both HRAM spellings, so an old ra.js shows up)
    RA_REGIONS = [(0x8000, 0xA000), (0xA000, 0xC000), (0xC000, 0xD000), (0xD000, 0xE000), (0xFE00, 0xFE20),
                  (0xFF00, 0xFF80), (0xFF80, 0x10000), (0xFF80, 0xFFFF), (0x10000, 0x12000), (0x14000, 0x16000), (0x12000, 0x14000)]
    def ra_blocks(d):
        """Every block ra.js can ask for, as RetroArch would answer it (the last region is out of reach: none)."""
        out = {}
        for r0, r1 in RA_REGIONS:
            for pgs in range(r0 & ~0xFF, r1, 0x100):
                s = max(r0, pgs); n = min(r1, pgs + 0x100) - s
                b_, err = mock_ra.ra_read(d, s, n)
                if b_ is not None and len(b_) == n: out['%d:%d' % (s, n)] = b_.hex()   # a short reply counts as missing
        return out
    st_ = a.ra_state
    status = dict(linked=st_ != 'noreply', state='CONTENTLESS' if st_ == 'nogame' else 'PLAYING', system='game_boy',
                  game='Tetris' if st_ == 'wrong' else 'Shantae (USA)', crc='46df91ad' if st_ == 'wrong' else 'e994b59b',
                  version='1.21.0', memErr='', host='127.0.0.1', port=55355, age=5)
    rominfo = '' if st_ == 'norom' else json.dumps(dict(name='Shantae (USA).gbc', crc='e994b59b' if st_ != 'badrom' else '12345678', ok=st_ != 'badrom'))
    mock = """
var ROMALL = '%s', romBin = atob(ROMALL), BLK = %s;
window.__setRA = function (b) { BLK = b; };
window.__sent = [];
window.RA = { version: function () { return '0.1'; },
  read: function (csv) { return csv.split(',').map(function (it) { var q = it.split(':'), b = BLK[parseInt(q[0], 16) + ':' + q[1]];
      return b && b.length === +q[1] * 2 ? b : ''; }).join(','); },
  status: function () { return %s; },
  send: function (c) { __sent.push(c); }, sendPaced: function (c, g) { __sent.push('PACED ' + g + 'ms ' + c); },
  write: function (ah, h) { __sent.push('WRITE ' + ah + ' ' + h); var a = parseInt(ah, 16);
      Object.keys(BLK).forEach(function (k) { var q = k.split(':'), s = +q[0], b = BLK[k];         // every block holding a
        if (a >= s && a < s + +q[1]) BLK[k] = b.substr(0, (a - s) * 2) + h + b.substr((a - s) * 2 + h.length); }); },
  rom: function (off, len) { return off < romBin.length ? btoa(romBin.substr(off, len)) : ''; },
  romInfo: function () { return %s; }, pickRom: function () { __sent.push('PICKROM'); }, editHost: function () { __sent.push('EDITHOST'); } };
""" % (base64.b64encode(rom).decode(),
       json.dumps({'%d:%d' % (int(k, 16), len(v) // 2): v for k, v in json.load(open(a.ra_blocks)).items()} if a.ra_blocks else ra_blocks(dump)), json.dumps(json.dumps(status)), json.dumps(rominfo)) + open(ROOT + '/linkapp/ra.js').read()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': W, 'height': H}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.add_init_script(mock)
    for kv in a.ls:   # --ls key=json: preset a localStorage value (e.g. sd.listOpen='"squid"')
        k, v = kv.split('=', 1); pg.add_init_script('try { localStorage.setItem(%s, %s); } catch (e) {}' % (json.dumps(k), json.dumps(v)))
    if a.standin:   # shareable preview: no ROM font, placeholder map tiles (flat colour per palette, light/dark by tile)
        pg.add_init_script('''Native.font = function () { return ''; };
          addEventListener('DOMContentLoaded', function () {
            var T = ShantaeMap._Tiles, hues = [[120,170,230],[110,190,110],[200,170,110],[170,130,200],[220,120,120],[90,160,170],[200,200,200],[230,200,90]];
            T.prototype.get = function (t, at) { var c = new Uint8Array(192), h = hues[at & 7], k = (t * 37 & 63) / 255 + 0.75;
              for (var i = 0; i < 64; i++) { var e = (i & 9) ? 1 : 0.9; c[i*3] = h[0]*k*e; c[i*3+1] = h[1]*k*e; c[i*3+2] = h[2]*k*e; } return c; };
            var idx0 = T.prototype.idx;
            T.prototype.idx = function (t, at) { idx0.call(this, t, at); var c = new Uint8Array(64), k = (t * 37 >> 3) & 3;   // 0.12 maps: palette bytes
              for (var i = 0; i < 64; i++) c[i] = (at & 7) * 4 + ((i & 9) ? k : Math.max(0, k - 1)); return c; };
            var L = new Uint32Array(32); for (var q = 0; q < 32; q++) { var h2 = hues[q >> 2], f = 0.7 + (q & 3) * 0.12;
              L[q] = (0xFF000000 | Math.min(255, h2[2] * f) << 16 | Math.min(255, h2[1] * f) << 8 | Math.min(255, h2[0] * f)) >>> 0; }
            ShantaeMap._fixedLut = L;
          });''')
    if a.time:      # time ShantaeMap.update calls (ms) from page start
        pg.add_init_script('''window.__t = []; addEventListener('DOMContentLoaded', function () {
            var u = ShantaeMap.update; ShantaeMap.update = function (N, p) { var t0 = performance.now(); u(N, p);
              window.__t.push([Math.round(t0), Math.round(performance.now() - t0)]); }; });''')
    pg.goto(f'file://{ROOT}/app/assets/link/index.html'); pg.wait_for_timeout(1200)
    if a.anim:      # play a recorded run: feed each dump, let the page tick, screenshot
        import glob, os
        pg.evaluate("localStorage.setItem('sd.tab', JSON.stringify('%s'))" % a.tabs.split(',')[0]); pg.reload(); pg.wait_for_timeout(900)
        if a.card: pg.evaluate("window.__card = '%s'; setInterval(function () { if (window.ShantaeMap && !ShantaeMap.cardOpen()) ShantaeMap.card(__card); }, 50)" % a.card)
        for f in sorted(glob.glob(os.path.join(a.anim, 'd*.bin'))):
            d = open(f, 'rb').read()
            if a.ra: pg.evaluate('(b) => __setRA(b)', ra_blocks(d))
            else: pg.evaluate('([d, v]) => __set(d, v)', [base64.b64encode(d[:0x18000]).decode(), video(d)])
            pg.wait_for_timeout(110)
            pg.screenshot(path=f"{a.out}_{os.path.basename(f)[1:-4]}.png")
        for js in a.eval: print('eval', js, '->', pg.evaluate(js))
        print('errors', errs); b.close(); sys.exit(0)
    for t in a.tabs.split(','):
        pg.evaluate(f"localStorage.setItem('sd.tab', JSON.stringify('{t}'))"); pg.reload(); pg.wait_for_timeout(a.wait)   # 0.13 map: waits for settled colours
        if a.card: pg.evaluate(f"ShantaeMap.card('{a.card}')"); pg.wait_for_timeout(250)
        pg.screenshot(path=f'{a.out}_{t}.png')
        for st_ in a.drag:
            v = list(map(int, st_.split(','))); pg.mouse.move(v[0], v[1]); pg.mouse.down()
            for k in range(2, len(v), 2): pg.mouse.move(v[k], v[k + 1], steps=6)
            pg.mouse.up(); pg.wait_for_timeout(150)
        for xy in a.tap:
            x, y = map(int, xy.split(',')); pg.mouse.click(x, y); pg.wait_for_timeout(300)
            print('tap', xy, 'equipped $CA84 =', pg.evaluate("Native.mem('CA84:1')"))
        if a.tap or a.drag: pg.screenshot(path=f'{a.out}_{t}_tapped.png'); print('sd.hall', (pg.evaluate("localStorage.getItem('sd.hall')") or '')[:160])
        if a.time:
            for rep in range(2):
                pg.reload(); pg.wait_for_timeout(2500)
                print(t, 'reload', rep, 'update calls [start ms, took ms]:', [x for x in pg.evaluate('window.__t') if x[1] > 2][:12])
            print('re-render ms (warm):', [round(pg.evaluate('ShantaeMap._bench(Native)') or -1, 1) for _ in range(6)])
            print('re-render ms (cold banks):', [round(pg.evaluate('ShantaeMap._bench(Native, true)') or -1, 1) for _ in range(4)])
            print('banks fetched:', pg.evaluate('(function(){var n=0,o=Native.rom;Native.rom=function(a,b){n++;return o(a,b)};ShantaeMap._bench(Native,true);Native.rom=o;return n})()'))
    if a.ra: print('sent to RetroArch', pg.evaluate('window.__sent'))
    for js in a.eval: print('eval', js, '->', pg.evaluate(js))
    print('errors', errs)
    b.close()
