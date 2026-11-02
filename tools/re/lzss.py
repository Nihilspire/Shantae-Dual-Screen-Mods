def lzss(rom, off, outlen):
    ring=bytearray(b' '*4096); r=0xFEE; out=bytearray(); p=off
    while len(out)<outlen:
        flags=rom[p]; p+=1
        for _ in range(8):
            if len(out)>=outlen: break
            if flags&1:
                c=rom[p]; p+=1; out.append(c); ring[r]=c; r=(r+1)&0xFFF
            else:
                lo=rom[p]; hi=rom[p+1]; p+=2
                pos=lo|((hi&0xF0)<<4); n=(hi&0xF)+3
                for k in range(n):
                    c=ring[(pos+k)&0xFFF]; out.append(c); ring[r]=c; r=(r+1)&0xFFF
                    if len(out)>=outlen: break
            flags>>=1
    return bytes(out), p-off
