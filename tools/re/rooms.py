import re, json
R=open(__import__('os').environ.get('SHANTAE_ROM','shantae.gbc'),'rb').read()
pat=bytes([0xcd,0x40,0x05,0x20,0x79,0x03])
def headers():
    out=[]
    for m in re.finditer(re.escape(pat),R):
        a=m.start(); h=R[a+6:a+6+17]
        if not any(h): continue
        x0=h[0]|h[1]<<8; y0=h[2]|h[3]<<8; w=(h[4]|h[5]<<8)+160; hh=(h[6]|h[7]<<8)+128
        out.append(dict(at='%02x:%04x'%(a//0x4000,0x4000+a%0x4000), tb=h[10], th=h[9], dfb=h[13], x0=x0,y0=y0,w=w,h=hh, raw=h.hex()))
    return out
if __name__=='__main__':
    H=headers(); reg={}
    for h in H: reg.setdefault((h['tb'],h['th'],h['dfb']),[]).append(h)
    for k,v in sorted(reg.items()):
        xs=min(h['x0'] for h in v); ys=min(h['y0'] for h in v); xe=max(h['x0']+h['w'] for h in v); ye=max(h['y0']+h['h'] for h in v)
        print('region %02x:%02x00 df%02x rooms %d  bbox x %d..%d y %d..%d (screens %.1f x %.1f)'%(k[0],k[1],k[2],len(v),xs,xe,ys,ye,(xe-xs)/256,(ye-ys)/256))
        for h in v: print('   ',h['at'],'x0 %5d y0 %5d w %5d h %5d'%(h['x0'],h['y0'],h['w'],h['h']))
