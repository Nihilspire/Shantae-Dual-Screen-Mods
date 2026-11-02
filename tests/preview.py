"""Previews for sharing: the launcher and pause menu drawn with a system font instead of the ROM's, so no game art
appears (save-slot thumbnails are tests/standin.png). Layout and behaviour are the real menu.js."""
import base64, json
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT = '/home/claude/shantae-dual'
thumb = 'data:image/png;base64,' + base64.b64encode(open('/home/claude/shantae-dual/tests/standin.png', 'rb').read()).decode()
init = """
var S={aspect:'square',bezels:true,integer:false,color:'lcd',blend:'off',touch:'auto',padOpacity:70,split:'auto',swap:false,side:false,useExternal:true,skipLauncher:false,audio:true,gbaMode:true,overclock:true,music:true,musicSrc:'game'};
window.Host={ info:function(){return JSON.stringify({version:'0.28',mode:'MODE',rom:{present:true,ok:true},auto:true,settings:S,extracting:EX,extractPct:63,assets:!EX,
  screens:{how:'hinge'},linkShown:false,slots:[{n:1,time:Date.now()-3600e3},{n:2,time:0},{n:3,time:Date.now()},{n:4,time:0}]});},
  font:function(){return '';}, titleMusic:function(){return true;}, extractAgain:function(){},
  thumb:function(n){return n==2?'':'THUMB';}, set:function(k,v){S[k]=v==='true'?true:v==='false'?false:v;},
  binds:function(){return '[]';}, resume:function(){}, start:function(){}, save:function(){return true;}, load:function(){return true;}, quit:function(){}, reset:function(){}, showLink:function(){}, dev:function(){return '';} };
"""
shots = []
with sync_playwright() as p:
    b = p.chromium.launch()
    def page(mode, w, h, keys=(), ex=False):
        pg = b.new_page(viewport={'width': w, 'height': h}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(init.replace('MODE', mode).replace('EX', 'true' if ex else 'false').replace('THUMB', thumb))
        pg.goto(f'file://{ROOT}/app/assets/menu/index.html'); pg.wait_for_timeout(500)
        for k in keys: pg.evaluate(f"pad('{k}')")
        pg.wait_for_timeout(300)
        path = f'/tmp/pv_{len(shots)}.png'; pg.screenshot(path=path); shots.append(path)
        if errs: print(errs)
    page('launcher', 960, 540, ['down'])
    page('pause', 960, 540)
    page('pause', 960, 540, ['down', 'down', 'ok'])
    page('launcher', 960, 540, [], ex=True)
    b.close()
ims = [Image.open(s).resize((640, 360)) for s in shots]
o = Image.new('RGB', (1288, 728), (40, 40, 40))
for i, im in enumerate(ims): o.paste(im, ((i % 2) * 648, (i // 2) * 368))
o.save('/home/claude/test/preview_menus.png'); print('ok')
