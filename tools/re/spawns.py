import re
R=open(__import__('os').environ.get('SHANTAE_ROM','shantae.gbc'),'rb').read()
P=re.compile(re.escape(bytes([0x21,0x02,0x00,0x09,0x3e]))+b'(.)\x22\x3e(.)\x22\x3e(.)\x22',re.S)
X=re.compile(re.escape(bytes([0x21,0x34,0x00,0x09,0x3e]))+b'(.)\x22\x3e(.)\x22'+re.escape(bytes([0x21,0x37,0x00,0x09,0x3e]))+b'(.)\x22\x3e(.)\x22',re.S)
def spawns():
    out=[]
    for m in P.finditer(R):
        a=m.start(); h=m.group(1)[0]|m.group(2)[0]<<8; b=m.group(3)[0]
        nxt=P.search(R,a+5); lim=nxt.start() if nxt else a+200
        mx=X.search(R,a,min(lim,a+200))
        xy=(mx.group(1)[0]|mx.group(2)[0]<<8, mx.group(3)[0]|mx.group(4)[0]<<8) if mx else None
        # params +0x20 etc
        out.append(dict(at=a,bank=a//0x4000,h=h,hb=b,xy=xy,code=R[a:lim if lim-a<120 else a+120]))
    return out
if __name__=='__main__':
    S=spawns()
    from collections import Counter
    c=Counter((s['hb'],s['h']) for s in S)
    print(len(S))
    for (b,h),n in sorted(c.items()):
        if b==0x11: print('%02x:%04x'%(b,h),n)
