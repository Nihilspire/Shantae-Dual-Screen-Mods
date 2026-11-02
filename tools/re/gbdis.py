import sys; sys.path.insert(0,'/root/src/mgbdis')
from instruction_set import instructions, cb_instructions
rom=open(__import__('os').environ.get('SHANTAE_ROM','shantae.gbc'),'rb').read()
def phys(bank,addr): return addr if addr<0x4000 else bank*0x4000+(addr-0x4000)
def dis(bank,addr,n=40):
    out=[]
    for _ in range(n):
        p=phys(bank,addr); op=rom[p]
        if op==0xCB: s=cb_instructions[rom[p+1]]; ln=2
        else:
            s=instructions.get(op,'db %02x'%op); ln=1
            if 'd16' in s or 'a16' in s:
                v=rom[p+1]|rom[p+2]<<8; s=s.replace('d16','$%04x'%v).replace('a16','$%04x'%v); ln=3
            elif 'pc+r8' in s:
                r=rom[p+1]; r=r-256 if r>127 else r; s=s.replace('pc+r8','$%04x'%(addr+2+r)); ln=2
            elif 'd8' in s or 'a8' in s or 'r8' in s:
                v=rom[p+1]; s=s.replace('d8','$%02x'%v).replace('a8','$%02x'%v).replace('r8','$%02x'%v); ln=2
        out.append('%02x:%04x  %-10s %s'%(bank,addr,rom[p:p+ln].hex(),s)); addr+=ln
    return '\n'.join(out)
if __name__=='__main__':
    print(dis(int(sys.argv[1],16),int(sys.argv[2],16),int(sys.argv[3]) if len(sys.argv)>3 else 40))
