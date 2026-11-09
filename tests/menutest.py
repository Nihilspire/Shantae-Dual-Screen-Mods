"""Renders the launcher / pause menu in headless Chromium with a mock Host. Font tiles come from the ROM
(LZSS-decompressed like RomGfx); slot thumbnails are a stand-in image, not game art."""
import base64, sys
sys.path.insert(0, '/home/claude/work')
from lzss import lzss
from playwright.sync_api import sync_playwright
ROOT = '/home/claude/shantae-dual'
rom = open('/home/claude/work/shantae.gbc', 'rb').read()
tiles, _ = lzss(rom, 0x3964A3, 0x1800)
font = base64.b64encode(tiles[0x1000:0x1800]).decode()
thumb = 'data:image/png;base64,' + base64.b64encode(open('/home/claude/shantae-dual/tests/standin.png', 'rb').read()).decode()
def init(mode, extra=''):
    return """
var S={aspect:'square',bezels:true,integer:false,color:'lcd',touch:'auto',padOpacity:70,split:'auto',swap:false,side:false,useExternal:true,skipLauncher:false,audio:true,gbaMode:true,overclock:true%s};
window.Host={ info:function(){return JSON.stringify({version:'0.1',mode:'%s',rom:{present:true,ok:true,crc:'e994b59b'},auto:true,settings:S,
  screens:{how:'hinge'},linkShown:true,slots:[{n:1,time:Date.now()-3600e3},{n:2,time:0},{n:3,time:Date.now()},{n:4,time:0}]});},
  font:function(){return '%s';}, thumb:function(n){return n==2?'':'%s';}, set:function(k,v){S[k]=v==='true'?true:v==='false'?false:v;},
  binds:function(){return JSON.stringify([{name:'UP',keys:['DPAD UP']},{name:'B',keys:['A','Z']},{name:'A',keys:['B','X']},{name:'TURBO B',keys:['X']}]);},
  rebind:function(){}, resume:function(){}, start:function(){}, save:function(){return true;}, load:function(){return true;}, quit:function(){}, reset:function(){}, showLink:function(){}, dev:function(w){return 'DONE';} };
""" % (extra, mode, font, thumb)
shots = sys.argv[1:] or ['all']
with sync_playwright() as p:
    b = p.chromium.launch()
    for mode, w, h, name in (('launcher', 900, 600, 'launcher'), ('pause', 600, 900, 'pause')):
        pg = b.new_page(viewport={'width': w, 'height': h}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(init(mode))
        pg.goto(f'file://{ROOT}/app/assets/menu/index.html'); pg.wait_for_timeout(700)
        pg.screenshot(path=f'/home/claude/test/menu_{name}.png')
        if mode == 'pause':
            pg.evaluate("pad('down')"); pg.evaluate("pad('down')"); pg.evaluate("pad('ok')"); pg.wait_for_timeout(500)
            pg.screenshot(path='/home/claude/test/menu_load.png')
            pg.evaluate("pad('back')")
            pg.evaluate("pad('down')")
            pg.evaluate("pad('ok')"); pg.wait_for_timeout(300)
            pg.screenshot(path='/home/claude/test/menu_settings.png')
            for k in ['down'] * 4 + ['ok']: pg.evaluate(f"pad('{k}')")
            pg.wait_for_timeout(300); pg.screenshot(path='/home/claude/test/menu_gameplay.png')
            pg.evaluate("pad('down')"); pg.evaluate("pad('ok')"); pg.wait_for_timeout(200)
            pg.screenshot(path='/home/claude/test/menu_confirm.png')
        else:
            for k in ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'back', 'ok']: pg.evaluate(f"pad('{k}')")
            pg.wait_for_timeout(200); pg.screenshot(path='/home/claude/test/menu_konami.png')
        print(name, errs)
    b.close()
