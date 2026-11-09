"""10-second GIFs of what's new since Showreel 0.34: the game on the desktop driver and the Link page in headless Chromium.
usage: showreel_gifs.py OUTDIR [name ...]        Contains game graphics: for the Renders folder only, never for chat.

run, town, rocks, compare: straight from the driver.
layout, dance: put together here as the handheld would show them. The game and the Link page are real frames; the switch of screens,
the slide and the arrow are drawn from the same numbers as DualLayout, MainActivity.setPanel and PanelArrow, as those are Android views."""
import base64, json, os, re, shutil, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from showreel import ROOT, DRIVE, ROMF, mock, video, touch_marks, TOUCH_STEPS
import menutest_host as MH
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

W = '/home/claude/work/ws/gif'; os.makedirs(W, exist_ok=True)
SIDE_W = 274                     # as on a 16:9 1080p screen: 7 screen pixels per game pixel
BASE = 'view %d\nload /home/claude/work/st/d4.st\noc 1\n'
def drive(s): return subprocess.run([DRIVE, ROMF, '-'], input=s, capture_output=True, text=True).stdout
def cams(o): return [int(b + a, 16) for a, b in re.findall(r'C9FB: (\w\w) (\w\w)', o)]

def plan_run(room, frames, run='RB', chunk=12):
    """Buttons that keep her going right: run, and jump when the camera stalls. Hearts kept full. A list of (button string, frames)."""
    st = W + '/plan.st'
    drive(BASE % SIDE_W + 'warp %s\nrun 450\nsave %s\n' % (room, st))
    keys = []; last = None; stuck = 0
    for i in range(frames // chunk + 1):
        k = run + 'A' if stuck % 3 else run      # jumping means letting go of the button first: off, on, on
        c = cams(drive('view %d\nload %s\npoke CA80 12\nrun %d %s\nsave %s\npeek C9FB 2\n' % (SIDE_W, st, chunk, k, st)))
        c = c[-1] if c else 0
        stuck = 3 if last is not None and c - last < chunk // 2 and not stuck else max(0, stuck - 1)
        last = c; keys.append((k, chunk))
    print('camera went to', last, 'jumps', sum(1 for k, n in keys if 'A' in k), flush=True)
    return keys

def per_step(plan, frames, step=2):
    out = []
    for k, n in plan: out += [k] * (n // step)
    return out[:frames // step]

def shots(name, head, keys, view=SIDE_W, dumps=False, step=2):
    d = '%s/%s' % (W, name); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    s = BASE % view + head
    for i, k in enumerate(keys):
        s += 'poke CA80 12\nrun %d %s\nshot %s/%04d.ppm\n' % (step, k or 'N', d, i)
        if dumps: s += 'dump %s/%04d.bin\n' % (d, i)
    drive(s)
    return d

def gif(pattern, out, scale=1, fps=30):
    f = 'scale=iw*%d:ih*%d:flags=neighbor,' % (scale, scale) if scale != 1 else ''
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', pattern, '-vf',
                    f + 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none', out], check=True)
    print('done', os.path.basename(out), round(os.path.getsize(out) / 1e6, 1), 'MB', flush=True)

def clean(d): shutil.rmtree(d, ignore_errors=True)

# ---- straight from the driver
def clip_run(out):
    keys = per_step(plan_run('20', 600), 600)
    d = shots('run', 'warp 20\nrun 450\n', keys); gif(d + '/%04d.ppm', out + '/01 Running through a level.gif', 3); clean(d)

def clip_town(out):
    n = 650 // 2                 # 640 pixels of street, one a frame: all the way round and back to the start
    d = shots('town', 'warp 04\nrun 450\nrun 10 R\n', ['R'] * n); gif(d + '/%04d.ppm', out + '/02 Town all the way round.gif', 3); clean(d)

def clip_rocks(out):
    keys = per_step(plan_run('1F', 600), 600)
    d = shots('rocks', 'warp 1F\nrun 450\n', keys); gif(d + '/%04d.ppm', out + '/05 Rocks and blocks beside the picture.gif', 3); clean(d)

def clip_compare(out):
    keys = per_step(plan_run('14', 600), 600)
    a = shots('cmpa', 'warp 14\nrun 450\n', keys)
    b = shots('cmpb', 'warp 14\nrun 450\n', keys, view=160)
    d = W + '/cmp'; clean(d); os.makedirs(d)
    for i in range(len(keys)):
        A = Image.open('%s/%04d.ppm' % (a, i)).convert('RGB'); B = Image.open('%s/%04d.ppm' % (b, i)).convert('RGB')
        im = Image.new('RGB', (SIDE_W * 2, 144 * 4 + 28), (18, 16, 22)); dr = ImageDraw.Draw(im)
        dr.text((4, 1), 'WIDE VIEW ON', fill=(248, 208, 104))
        im.paste(A.resize((A.width * 2, 288), Image.NEAREST), ((SIDE_W * 2 - A.width * 2) // 2, 14))
        dr.text((4, 303), 'WIDE VIEW OFF', fill=(248, 208, 104))
        im.paste(B.resize((B.width * 2, 288), Image.NEAREST), ((SIDE_W * 2 - B.width * 2) // 2, 316))
        im.save('%s/%04d.png' % (d, i))
    gif(d + '/%04d.png', out + '/04 WIDE VIEW on and off.gif'); clean(a); clean(b); clean(d)

# ---- the handheld: top 960x540 (half of 1920x1080), bottom 640x480
SW, SH = 960, 540
PW = 720                         # PanelGeom.width(1920, 1080) / 2
AW, AH = round(1080 * 26 / 320) // 2, round(1080 * 44 / 320) // 2
def ease(x): return 1 - (1 - x) ** 2     # android DecelerateInterpolator
def arrow(open_t):
    """PanelArrow.onDraw, at half size."""
    a = Image.new('RGBA', (AW, AH), (0, 0, 0, 0)); d = ImageDraw.Draw(a)
    u = max(1, round(AW / 13))
    alpha = int(255 * (0.55 + 0.30 * open_t)); ink = (0, 0, 0, alpha); gold = (248, 208, 104, alpha)
    d.rectangle((u, 0, AW, AH), fill=ink); d.rectangle((0, u, u, AH - u), fill=ink)
    cx, cy = AW / 2, AH / 2
    for i in range(-4, 5):
        n = 5 - abs(i); y = cy + (i - 0.5) * u
        x0 = cx - 2.5 * u if open_t > 0.5 else cx + 2.5 * u - n * u
        d.rectangle((x0, y, x0 + n * u - 1, y + u - 1), fill=gold)
    return a

def game_screen(ppm):
    g = Image.open(ppm).convert('RGB')
    s = Image.new('RGB', (SW, SH), (0, 0, 0))
    im = g.resize((g.width * 7, g.height * 7), Image.NEAREST).reduce(2)
    s.paste(im, ((SW - im.width) // 2, (SH - im.height) // 2))
    return s

def single_screen(ppm, t, panel):
    """The one screen: the game, Link's panel t of the way in, the arrow on its edge."""
    s = game_screen(ppm).convert('RGBA')
    px = SW - round(PW * t)
    if t > 0 and panel is not None: s.paste(panel, (px, 0))
    ar = arrow(t)
    s.alpha_composite(ar, (px - AW, (SH - AH) // 2))
    return s.convert('RGB')

class Link:
    def __init__(self, ctx, dump, w, h, panel, tab='world'):
        self.pg = ctx.new_page(); self.pg.set_viewport_size({'width': w, 'height': h})
        self.errs = []; self.pg.on('pageerror', lambda e: self.errs.append(str(e)))
        self.pg.add_init_script(mock(open(dump, 'rb').read()) + "\nNative.version=function(){return '0.44';};Native.panelOn=function(){return %s;};Native.panel=function(o){};" % ('true' if panel else 'false'))
        self.pg.add_init_script("try{localStorage.setItem('sd.tab',%s);localStorage.setItem('sd.worldView',%s);}catch(e){}" % (json.dumps(json.dumps(tab)), json.dumps(json.dumps('map'))))
        self.pg.goto('file://' + ROOT + '/app/assets/link/index.html'); self.pg.wait_for_timeout(1400)
    def feed(self, dump, wait=70):
        d = open(dump, 'rb').read()
        self.pg.evaluate('([d, v]) => __set(d, v)', [base64.b64encode(d[:0x18000]).decode(), video(d)])
        self.pg.wait_for_timeout(wait)
    def shot(self, half=False):
        p = W + '/page.png'; self.pg.screenshot(path=p); im = Image.open(p).convert('RGB')
        return im.reduce(2) if half else im.copy()

def menu_pages(b):
    """Settings > SCREENS in the pause menu, before and after choosing SINGLE SCREEN."""
    pg = b.new_page(viewport={'width': SW, 'height': SH})
    pg.add_init_script(MH.init('pause'))
    pg.goto('file://' + ROOT + '/app/assets/menu/index.html'); pg.wait_for_timeout(600)
    for k in ['down'] * 3 + ['ok', 'down', 'ok']: pg.evaluate("pad('%s')" % k)
    pg.wait_for_timeout(250); pg.screenshot(path=W + '/m1.png')
    pg.evaluate("pad('ok')"); pg.wait_for_timeout(250); pg.screenshot(path=W + '/m2.png')
    pg.close()
    return Image.open(W + '/m1.png').convert('RGB'), Image.open(W + '/m2.png').convert('RGB')

def stack(top, bottom):
    im = Image.new('RGB', (SW, SH + 16 + 480), (18, 16, 22))
    im.paste(top, (0, 0))
    im.paste(bottom if bottom is not None else Image.new('RGB', (640, 480), (0, 0, 0)), ((SW - 640) // 2, SH + 16))
    return im

def marks_on(im, taps, f):
    m = [(x, y, f - t, False) for x, y, t in taps if 0 <= f - t < TOUCH_STEPS]
    return touch_marks(im, m) if m else im

def clip_layout(out, b):
    """Dual to single screen, and the arrow, about 11 s at 30 frames a second."""
    F_MENU, F_SET, F_GAME, F_OPEN, F_SHUT, F_END = 75, 105, 140, 200, 270, 330
    paused = F_GAME - F_MENU
    keys = per_step(plan_run('15', (F_END - paused) * 2 + 24), (F_END - paused) * 2)
    g = shots('layout', 'warp 15\nrun 450\n', keys, dumps=True)
    ctx = b.new_context()
    bottom = Link(ctx, g + '/0000.bin', 640, 480, False)
    panel = Link(ctx, g + '/0000.bin', 1440, 1080, True)
    m1, m2 = menu_pages(b)
    # rows on the menu page, tapped
    row, back = (SW // 2, 236), (SW // 2 - 200, 314)
    arrow_at = (SW - AW // 2, SH // 2)
    taps = [(row[0], row[1], F_SET - 1), (back[0], back[1], F_GAME - 8), (arrow_at[0], arrow_at[1], F_OPEN), (SW - PW - AW // 2, arrow_at[1], F_SHUT)]
    d = W + '/lay'; clean(d); os.makedirs(d)
    gi = 0; last_bottom = None
    for f in range(F_END):
        paused_now = F_MENU <= f < F_GAME
        if not paused_now: gi += 1
        k = '%s/%04d' % (g, min(gi - 1 if gi else 0, len(keys) - 1))
        if f < F_MENU:
            bottom.feed(k + '.bin'); last_bottom = bottom.shot()
            im = stack(game_screen(k + '.ppm'), last_bottom)
        elif f < F_SET: im = stack(m1, last_bottom)
        elif f < F_GAME: im = stack(m2, None)
        else:
            if F_OPEN - 14 <= f < F_SHUT + 12:
                panel.feed(k + '.bin'); pim = panel.shot(half=True)
            else: pim = None
            t = 0.0
            if F_OPEN <= f < F_SHUT: t = ease(min(1.0, (f - F_OPEN) / 8))
            elif F_SHUT <= f < F_SHUT + 8: t = 1 - ease((f - F_SHUT) / 8)
            im = stack(single_screen(k + '.ppm', t, pim), None)
        im = marks_on(im, taps, f)
        im.save('%s/%04d.png' % (d, f))
    if bottom.errs or panel.errs: print('page errors', bottom.errs[:2], panel.errs[:2])
    ctx.close()
    gif(d + '/%04d.png', out + '/03 Dual screen to single screen.gif'); clean(g); clean(d)

def clip_dance(out, b):
    """Single screen: the arrow, the dance list, a tapped dance: the panel slides away and she does it."""
    st = W + '/a14.st'
    drive('load /home/claude/work/st/d4.st\noc 1\nwarp 14\nrun 400\nsave %s\ndump %s/a14.bin\n' % (st, W))
    ctx = b.new_context()
    # where's Monkey's row in the panel's list?
    p = Link(ctx, W + '/a14.bin', 1440, 1080, True)
    p.pg.evaluate("Native.input=function(s){window.__input=s;}")
    row = None
    for y in range(120, 900, 22):
        p.pg.evaluate('window.__input=null;onSelect()'); p.pg.wait_for_timeout(120)
        p.pg.mouse.click(720, y); p.pg.wait_for_timeout(80)
        s = p.pg.evaluate('window.__input')
        if s and '32:3' in s and s.endswith('128:3') and s.count(':') == 5: row = y; break
    p.pg.close()
    print('Monkey at y', row)
    F_OPEN, F_NOTE, F_TAP, F_END = 30, 62, 92, 330
    SEL = F_TAP
    at = {SEL: 'E'}
    for i, key in enumerate('DR'): at[SEL + 10 + 32 * i] = at[SEL + 11 + 32 * i] = key
    end = SEL + 11 + 32
    keys = [at.get(f, 'RB' if f >= end + 26 else 'N') for f in range(F_END)]
    g = shots('dance', 'load %s\n' % st, keys, dumps=True)
    panel = Link(ctx, g + '/0000.bin', 1440, 1080, True)
    panel.pg.evaluate("Native.input=function(s){};")
    arrow_at = (SW - AW // 2, SH // 2)
    note = (646, 16)             # the note button by the gear, in the half-size picture; the page takes (x * 2)
    tapRow = (SW - PW + 360, row // 2)
    taps = [(arrow_at[0], arrow_at[1], F_OPEN), (SW - PW + note[0], note[1], F_NOTE), (tapRow[0], tapRow[1], F_TAP)]
    d = W + '/dan'; clean(d); os.makedirs(d)
    for f in range(F_END):
        k = '%s/%04d' % (g, f)
        pim = None
        if f < F_TAP + 12:
            panel.feed(k + '.bin')
            if f == F_NOTE: panel.pg.mouse.click(note[0] * 2, note[1] * 2); panel.pg.wait_for_timeout(120)
            if f == F_TAP: panel.pg.mouse.click(720, row); panel.pg.wait_for_timeout(60)
            pim = panel.shot(half=True)
        t = 0.0
        if F_OPEN <= f < F_TAP: t = ease(min(1.0, (f - F_OPEN) / 8))
        elif F_TAP <= f < F_TAP + 8: t = 1 - ease((f - F_TAP) / 8)
        im = single_screen(k + '.ppm', t, pim)
        im = marks_on(im, taps, f)
        im.save('%s/%04d.png' % (d, f))
    if panel.errs: print('page errors', panel.errs[:2])
    ctx.close()
    gif(d + '/%04d.png', out + '/06 Auto dance from the panel.gif'); clean(g); clean(d)

if __name__ == '__main__':
    out = sys.argv[1]; only = sys.argv[2:]; os.makedirs(out, exist_ok=True)
    def want(n): return not only or n in only
    if want('run'): clip_run(out)
    if want('town'): clip_town(out)
    if want('rocks'): clip_rocks(out)
    if want('compare'): clip_compare(out)
    if want('layout') or want('dance'):
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            if want('layout'): clip_layout(out, b)
            if want('dance'): clip_dance(out, b)
            b.close()
