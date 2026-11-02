import sys
from PIL import Image
rom=open('/home/claude/work/shantae.gbc','rb').read()
def sheet(off,n,cols=16,out='sheet.png',scale=3):
    rows=(n+cols-1)//cols; im=Image.new('RGB',(cols*9,rows*9),(255,0,255))
    pal=[(255,255,255),(170,170,170),(85,85,85),(0,0,0)]
    for t in range(n):
        for y in range(8):
            lo=rom[off+t*16+y*2]; hi=rom[off+t*16+y*2+1]
            for x in range(8):
                v=((lo>>(7-x))&1)|(((hi>>(7-x))&1)<<1)
                im.putpixel((t%cols*9+x,t//cols*9+y),pal[v])
    im.resize((im.width*scale,im.height*scale),0).save(out)
if __name__=='__main__': sheet(int(sys.argv[1],16),int(sys.argv[2]))
