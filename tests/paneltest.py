"""paneltest.py [OUTDIR] - LAYOUT: SINGLE SCREEN, as far as it can run off the device.
  1. PanelGeom on a desktop JVM: the panel's width and arrow on common screens.
  2. The Link page in the panel's size (headless Chromium, a mock Native): whole screen pixels per page pixel, tabs answer taps at the
     right place, a dance tapped in the pop-up slides the panel away. Without panelOn the page sizes itself as before.
  3. The menu's LAYOUT row, and the rows it hides.
The slide, the arrow and touches passing to the game are Android views: only the device can check those.
OUTDIR: saves what the page looks like (uses the ROM's font and map: not for chat)."""
import os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import showreel as SR
import menutest_host as MH
from playwright.sync_api import sync_playwright
ROOT = SR.ROOT; OUT = sys.argv[1] if len(sys.argv) > 1 else ''
fails = []
# 1. sizes
src = """package com.jack.shantaedual;
public class G { public static void main(String[] a) { int[][] s = {{1920,1080},{1280,720},{2400,1080},{1920,1200},{1600,1200},{1080,1920}};
 for (int[] x : s) System.out.println(x[0]+" "+x[1]+" "+PanelGeom.width(x[0],x[1])+" "+PanelGeom.arrowW(x[0],x[1])+" "+PanelGeom.arrowH(x[0],x[1])); } }"""
with tempfile.TemporaryDirectory() as d:
    os.makedirs(d + '/com/jack/shantaedual'); open(d + '/com/jack/shantaedual/G.java', 'w').write(src)
    subprocess.run(['javac', '-d', d, ROOT + '/app/src/com/jack/shantaedual/PanelGeom.java', d + '/com/jack/shantaedual/G.java'], check=True)
    o = subprocess.run(['java', '-cp', d, 'com.jack.shantaedual.G'], capture_output=True, text=True).stdout
for l in o.strip().split('\n'):
    W, H, p, aw, ah = map(int, l.split()); print('screen %dx%d: panel %d wide (%.0f%%), arrow %dx%d' % (W, H, p, 100.0 * p / W, aw, ah))
    if p >= W or p < W / 2 or aw >= W - p: fails.append('size %s' % l)
    if W > H and W * 9 == H * 16 and p * 3 != H * 4: fails.append('16:9 not 4:3 %s' % l)
# 2. the page
ST = '/home/claude/work/dancetest/a14.st'; DUMP = '/home/claude/work/dancetest/a14.bin'
if not os.path.exists(DUMP):
    os.makedirs('/home/claude/work/dancetest', exist_ok=True)
    subprocess.run([SR.DRIVE, SR.ROMF, '-'], input='load /home/claude/work/st/d4.st\nwarp 14\nrun 400\nsave %s\ndump %s\n' % (ST, DUMP), capture_output=True, text=True)
dump = open(DUMP, 'rb').read()
PANEL = "\nNative.panelOn=function(){return %s;};window.__panel=[];Native.panel=function(o){window.__panel.push(o);};Native.input=function(s){(window.__input=window.__input||[]).push(s);};"
def size(pg): return pg.evaluate("(function(){var c=document.getElementById('c'),r=c.getBoundingClientRect();return [c.width,c.height,r.width,r.height]})()")
with sync_playwright() as p:
    b = p.chromium.launch()
    for (vw, vh, dpr, want) in ((1440, 1080, 1, (360, 270, 4)), (480, 360, 3, (360, 270, 4)), (960, 720, 1, (320, 240, 3)), (1440, 1200, 1, (288, 240, 5)), (945, 1920, 1, (315, 640, 3))):
        ctx = b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=dpr); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(SR.mock(dump) + PANEL % 'true')
        pg.add_init_script("localStorage.setItem('sd.tab', JSON.stringify('world'))")
        pg.goto('file://' + ROOT + '/app/assets/link/index.html'); pg.wait_for_timeout(900)
        s = size(pg); n = s[2] * dpr / s[0]
        ok = s[0] == want[0] and s[1] == want[1] and abs(n - want[2]) < 1e-6
        print('panel %dx%d at %dx: page %dx%d, %.3f screen px per page px, page errors %s' % (vw, vh, dpr, s[0], s[1], n, errs or 'none'))
        if not ok or errs: fails.append('page %s %s %s' % ((vw, vh, dpr), s, errs))
        if OUT: pg.screenshot(path='%s/panel %dx%d.png' % (OUT, vw, vh))
        if (vw, vh) == (1440, 1080):
            # a tap goes to what's under it: tabs by the same place in page pixels
            h = s[1]; u = s[2] / s[0]
            before = pg.screenshot()
            pg.mouse.click(10 * u, (h - 8) * u); pg.wait_for_timeout(200); first = pg.screenshot()
            pg.mouse.click(120 * u, (h - 8) * u); pg.wait_for_timeout(200); second = pg.screenshot()
            print('tabs answer taps:', first != before or second != before, first != second)
            if first == second: fails.append('tabs')
            # auto dance: a row in the pop-up sends input, and the panel goes away
            y = 20; got = None
            while y < s[3] and not got:
                pg.evaluate('onSelect()'); pg.wait_for_timeout(120)
                pg.mouse.click(s[2] / 2, y); pg.wait_for_timeout(100)
                got = pg.evaluate('window.__input && window.__input[0]'); y += 8
            shut = pg.evaluate('window.__panel')
            print('dance tapped:', got, 'panel told:', shut)
            if not got or shut != [False]: fails.append('dance %s %s' % (got, shut))
        ctx.close()
    # without panelOn: as it always was
    pg = b.new_page(viewport={'width': 640, 'height': 480}); pg.add_init_script(SR.mock(dump) + PANEL % 'false')
    pg.goto('file://' + ROOT + '/app/assets/link/index.html'); pg.wait_for_timeout(700); s = size(pg)
    print('not in the panel, 640x480:', s)
    if s != [320, 240, 640, 480]: fails.append('plain %s' % s)
    # 3. the menu
    pg = b.new_page(viewport={'width': 900, 'height': 600}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(MH.init('pause'))
    pg.goto('file://' + ROOT + '/app/assets/menu/index.html'); pg.wait_for_timeout(600)
    for k in ['down'] * 3 + ['ok', 'down', 'ok']: pg.evaluate("pad('%s')" % k)
    pg.wait_for_timeout(200)
    if OUT: pg.screenshot(path=OUT + '/menu screens second.png')
    pg.evaluate("pad('ok')"); pg.wait_for_timeout(200)
    one = pg.evaluate('S.layout')
    if OUT: pg.screenshot(path=OUT + '/menu screens single.png')
    # with one screen chosen: LAYOUT, then BACK straight after
    pg.evaluate("pad('down')"); pg.evaluate("pad('ok')"); pg.wait_for_timeout(200)
    pg.evaluate("pad('ok')"); pg.evaluate("pad('ok')"); pg.wait_for_timeout(200)     # back on SCREENS: in, and change it again
    two = pg.evaluate('S.layout')
    print('LAYOUT row sets', one, 'then, back in and again,', two, 'page errors', errs or 'none')
    if one != 'single' or two != 'second' or errs: fails.append('menu %s %s %s' % (one, two, errs))
    b.close()
print('RESULT', 'PASS' if not fails else 'FAIL ' + '; '.join(fails))
