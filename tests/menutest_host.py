"""The mock Host for tests of the launcher and pause menu (menutest.py keeps its own copy), with the font from the ROM and a stand-in thumbnail."""
import base64, sys
sys.path.insert(0, '/home/claude/work')
from lzss import lzss
rom = open('/home/claude/work/shantae.gbc', 'rb').read()
tiles, _ = lzss(rom, 0x3964A3, 0x1800)
font = base64.b64encode(tiles[0x1000:0x1800]).decode()
thumb = 'data:image/png;base64,' + base64.b64encode(open('/home/claude/shantae-dual/tests/standin.png', 'rb').read()).decode()
def init(mode, extra=''):
    return """
var S=window.S={aspect:'square',bezels:true,integer:false,color:'lcd',touch:'auto',padOpacity:70,split:'auto',swap:false,side:false,useExternal:true,layout:'second',skipLauncher:false,audio:true,gbaMode:true,overclock:true%s};
window.Host={ info:function(){return JSON.stringify({version:'0.1',mode:'%s',rom:{present:true,ok:true,crc:'e994b59b'},auto:true,settings:S,
  screens:{how:'hinge'},linkShown:true,slots:[{n:1,time:Date.now()-3600e3},{n:2,time:0},{n:3,time:Date.now()},{n:4,time:0}]});},
  font:function(){return '%s';}, thumb:function(n){return n==2?'':'%s';}, set:function(k,v){S[k]=v==='true'?true:v==='false'?false:v;},
  binds:function(){return JSON.stringify([{name:'UP',keys:['DPAD UP']},{name:'B',keys:['A','Z']},{name:'A',keys:['B','X']},{name:'LINK PANEL',keys:['L1']}]);},
  rebind:function(){}, resume:function(){}, start:function(){}, save:function(){return true;}, load:function(){return true;}, quit:function(){}, reset:function(){}, showLink:function(){}, dev:function(w){return 'DONE';} };
""" % (extra, mode, font, thumb)
