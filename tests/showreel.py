"""Showreel renders: the game (desktop driver) and the Link page (headless Chromium, ROM font) side
by side as a handheld would show them (game on top, Link screen below), as stills and 5-second clips.
Contains game graphics: the output is for the user's own folder only.

usage: showreel.py OUTDIR [clip ...]      (no clip names = all)
Each clip: load a save state, play scripted buttons for N steps of 2 frames (~30 fps), dump RAM/VRAM every step,
feed the dumps to the page one per page tick, apply page actions (taps, drags, JS) at given steps, compose frames."""
import base64, json, os, subprocess, sys, shutil
sys.path.insert(0, '/home/claude/work')
from lzss import lzss
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = '/home/claude/shantae-dual'; WORK = '/home/claude/work'
DRIVE = ROOT + '/out/host/drive'; ROMF = WORK + '/shantae.gbc'
TMP = '/tmp/sr'
rom = open(ROMF, 'rb').read()
tiles, _ = lzss(rom, 0x3964A3, 0x1800)
LW, LH = 640, 480                      # Link screen (4:3 bottom screen, 320x240 logical)

def video(d):
    v = d[0x18000:0x1C000] + d[0x1C000:0x1C080] + d[0xFE00:0xFEA0] + bytes([d[0xFF40], d[0xFF42], d[0xFF43], d[0xFF4A], d[0xFF4B]])
    return base64.b64encode(v).decode()

def mock(d0):
    return """
var ROMALL = '%s', romBin = atob(ROMALL);
var D = '%s', V = %s, FONT = '%s';
var bin = atob(D), mem = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) mem[i] = bin.charCodeAt(i);
window.__set = function (d, v) { var b = atob(d); for (var i = 0; i < b.length; i++) mem[i] = b.charCodeAt(i); V = v;
  if (window.__eq != null) mem[0xCA84] = window.__eq; };      // an item equipped from the page stays equipped (the dumps don't know)
window.Native = { dual: function () { return true; }, running: function () { return true; }, version: function () { return '0.34'; },
  ff: function (m) { if (m === 0) window.__ff = false; else if (m === 1) window.__ff = true; else if (m === 2) window.__ff = !window.__ff; return !!window.__ff; },
  mem: function (spec) { var out = ''; spec.split(',').forEach(function (p) { var q = p.split(':'), wb = -1;
      if (/^w[0-7]$/.test(q[0])) { wb = +q[0][1]; q = q.slice(1); }
      var ad = parseInt(q[0], 16), n = q[1] ? +q[1] : 1;
      for (var k = 0; k < n; k++) { var a = (ad + k) & 0xFFFF, v = wb >= 0 ? mem[0x10000 + wb * 0x1000 + (a & 0xFFF)] : mem[a];
        out += ('0' + (v | 0).toString(16)).slice(-2); } }); return out; },
  video: function () { return V; },
  font: function () { return FONT; }, rom: function (off, len) { return off + len <= romBin.length ? btoa(romBin.substr(off, len)) : ''; },
  slots: function () { return JSON.stringify([{n:1,time:Date.now()-36e5},{n:2,time:0},{n:3,time:Date.now()-9e6},{n:4,time:0}]); },
  thumb: function (n) { return ''; }, saveSlot: function () { return true; }, loadSlot: function () { return true; },
  gbaMode: function () { return false; }, equip: function (i) { mem[0xCA84] = window.__eq = i; return true; }, overlay: function () { return false; },
  devUsed: function () { return false; }, input: function (s) { (window.__input = window.__input || []).push(s); },
  menu: function () {}, close: function () {} };
""" % (base64.b64encode(rom).decode(), base64.b64encode(d0[:0x18000]).decode(), json.dumps(video(d0)),
       base64.b64encode(tiles[0x1000:0x1800]).decode())

def slug(n): return ''.join(c if c.isalnum() else '_' for c in n)

def play(name, state, buttons, steps, pre='', step=2):
    """Run the driver: buttons(k) -> button letters for step k. Returns the list of (dump path, frame path)."""
    d = f'{TMP}/{slug(name)}'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    s = f'load {state}\n' + pre
    for k in range(steps):
        s += f'run {step} {buttons(k) or "N"}\ndump {d}/d{k:03d}.bin\nshot {d}/g{k:03d}.ppm\n'
    subprocess.run([DRIVE, ROMF, '-'], input=s, capture_output=True, text=True)
    return [(f'{d}/d{k:03d}.bin', f'{d}/g{k:03d}.ppm') for k in range(steps)]

TOUCH_STEPS = 8                        # a tap's mark shows for this many clip steps (~0.27 s), fading out

def touch_marks(l, marks):
    """Draws where the Link screen is touched, so a viewer sees the tap: marks = [(x, y, age, held)], age in steps since
    the touch (0 = this step). A tap: a dot and a ring that grows and fades; a finger held down (drags): a steady dot."""
    from PIL import ImageDraw
    ov = Image.new('RGBA', l.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for x, y, age, held in marks:
        a = 1.0 if held else max(0.0, 1 - age / TOUCH_STEPS)
        if a <= 0: continue
        r = 13 if held else 12 + 3 * age
        d.ellipse((x - r - 2, y - r - 2, x + r + 2, y + r + 2), outline=(20, 10, 30, int(170 * a)), width=2)
        d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255, int(235 * a)), width=3)
        if held or age < 3: d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(255, 255, 255, int(200 * a)), outline=(20, 10, 30, int(170 * a)))
    return Image.alpha_composite(l.convert('RGBA'), ov).convert('RGB')

def compose(game_ppm, link_png, out, marks=()):
    g = Image.open(game_ppm).convert('RGB').resize((480, 432), Image.NEAREST)
    l = Image.open(link_png).convert('RGB')
    if marks: l = touch_marks(l, marks)
    im = Image.new('RGB', (LW, LH * 2 + 16), (18, 16, 22))
    top = Image.new('RGB', (LW, LH), (8, 8, 10)); top.paste(g, ((LW - 480) // 2, (LH - 432) // 2))
    im.paste(top, (0, 0)); im.paste(l, (0, LH + 16))
    im.save(out)

class Page:
    def __init__(self, ctx, first_dump, ls=None):
        self.pg = ctx.new_page(); self.pg.set_viewport_size({'width': LW, 'height': LH})
        self.errs = []
        self.pg.on('pageerror', lambda e: self.errs.append(str(e)))
        d0 = open(first_dump, 'rb').read()
        self.pg.add_init_script(mock(d0))
        for k, v in (ls or {}).items():
            self.pg.add_init_script('try { localStorage.setItem(%s, %s); } catch (e) {}' % (json.dumps(k), json.dumps(json.dumps(v))))
        self.pg.goto(f'file://{ROOT}/app/assets/link/index.html'); self.pg.wait_for_timeout(1500)
        self.down = False
    def feed(self, dump):
        d = open(dump, 'rb').read()
        self.pg.evaluate('([d, v]) => __set(d, v)', [base64.b64encode(d[:0x18000]).decode(), video(d)])
    def act(self, a):
        kind = a[0]; m = self.pg.mouse
        if kind == 'tap': m.click(a[1], a[2])
        elif kind == 'down': m.move(a[1], a[2]); m.down(); self.down = True
        elif kind == 'move': m.move(a[1], a[2], steps=3)
        elif kind == 'up': m.up(); self.down = False
        elif kind == 'js': self.pg.evaluate(a[1])
    def close(self): self.pg.close()

def clip(ctx, out, name, state, buttons, steps=150, actions=None, ls=None, warm=24, pre='', stills=(), prewarm=False, video_out=True):
    frames = play(name, state, buttons, warm + steps, pre)
    actions = actions or {}
    if prewarm:                        # visit every room once so the map store has them (like a second visit)
        p0 = Page(ctx, frames[0][0], ls)
        for dmp, _ in frames[::3]: p0.feed(dmp); p0.pg.wait_for_timeout(120)
        p0.pg.wait_for_timeout(800); p0.close(); ls = None
    p = Page(ctx, frames[0][0], ls)
    fdir = f'{TMP}/{slug(name)}/f'; os.makedirs(fdir, exist_ok=True)
    taps, finger = [], None                # touch marks drawn on the clip (taps fade; a held finger follows drags)
    for k, (dmp, ppm) in enumerate(frames):
        p.feed(dmp)
        for a in actions.get(k - warm, []):
            p.act(a)
            if a[0] == 'tap': taps.append((a[1], a[2], k))
            elif a[0] in ('down', 'move'): finger = (a[1], a[2])
            elif a[0] == 'up' and finger: taps.append(finger + (k,)); finger = None
        p.pg.wait_for_timeout(108)
        if k >= warm:
            lp = f'{TMP}/{slug(name)}/l{k:03d}.png'; p.pg.screenshot(path=lp)
            marks = [(x, y, k - t, False) for x, y, t in taps if 0 <= k - t < TOUCH_STEPS]
            if finger: marks.append(finger + (0, True))
            compose(ppm, lp, f'{fdir}/{k - warm:03d}.png', marks)
    p.close()
    if p.errs: print(name, 'page errors', p.errs[:3])
    for k, label in stills:
        shutil.copy(f'{fdir}/{k:03d}.png', f'{out}/{label}.png')
    if video_out:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '29.86', '-i', f'{fdir}/%03d.png', '-c:v', 'libx264',
                        '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', f'{out}/{name}.mp4'], check=True)
    print('done', name)
