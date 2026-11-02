import sys, os
rom = open(os.environ.get('SHANTAE_ROM', '/home/claude/work/shantae.gbc'), 'rb').read()
R = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a']
RP = ['bc', 'de', 'hl', 'sp']; RP2 = ['bc', 'de', 'hl', 'af']; CC = ['nz', 'z', 'nc', 'c']
ALU = ['add a,', 'adc a,', 'sub ', 'sbc a,', 'and ', 'xor ', 'or ', 'cp ']
ROT = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'swap', 'srl']

def off(bank, a): return a if a < 0x4000 else bank * 0x4000 + a - 0x4000

def one(bank, a):
    p = off(bank, a); o = rom[p]; b1 = rom[p + 1]; b2 = rom[p + 2]; w = b1 | b2 << 8
    s8 = b1 - 256 if b1 > 127 else b1
    x, y, z = o >> 6, o >> 3 & 7, o & 7
    if o == 0xCB:
        x2, y2, z2 = b1 >> 6, b1 >> 3 & 7, b1 & 7
        return 2, (ROT[y2] + ' ' + R[z2]) if x2 == 0 else ['', 'bit', 'res', 'set'][x2] + ' %d,%s' % (y2, R[z2])
    T = {0x00: (1, 'nop'), 0x08: (3, 'ld ($%04X),sp' % w), 0x10: (2, 'stop'), 0x18: (2, 'jr $%04X' % (a + 2 + s8)),
         0x02: (1, 'ld (bc),a'), 0x12: (1, 'ld (de),a'), 0x22: (1, 'ld (hl+),a'), 0x32: (1, 'ld (hl-),a'),
         0x0A: (1, 'ld a,(bc)'), 0x1A: (1, 'ld a,(de)'), 0x2A: (1, 'ld a,(hl+)'), 0x3A: (1, 'ld a,(hl-)'),
         0x07: (1, 'rlca'), 0x0F: (1, 'rrca'), 0x17: (1, 'rla'), 0x1F: (1, 'rra'), 0x27: (1, 'daa'), 0x2F: (1, 'cpl'), 0x37: (1, 'scf'), 0x3F: (1, 'ccf'),
         0x76: (1, 'halt'), 0xC3: (3, 'jp $%04X' % w), 0xCD: (3, 'call $%04X' % w), 0xC9: (1, 'ret'), 0xD9: (1, 'reti'),
         0xE0: (2, 'ldh ($FF%02X),a' % b1), 0xF0: (2, 'ldh a,($FF%02X)' % b1), 0xE2: (1, 'ld ($FF00+c),a'), 0xF2: (1, 'ld a,($FF00+c)'),
         0xEA: (3, 'ld ($%04X),a' % w), 0xFA: (3, 'ld a,($%04X)' % w), 0xE8: (2, 'add sp,%d' % s8), 0xF8: (2, 'ld hl,sp%+d' % s8),
         0xE9: (1, 'jp (hl)'), 0xF9: (1, 'ld sp,hl'), 0xF3: (1, 'di'), 0xFB: (1, 'ei')}
    if o in T: return T[o]
    if x == 0:
        if z == 0: return 2, 'jr %s,$%04X' % (CC[y - 4], a + 2 + s8)
        if z == 1: return (3, 'ld %s,$%04X' % (RP[y >> 1], w)) if y % 2 == 0 else (1, 'add hl,' + RP[y >> 1])
        if z == 3: return 1, ('inc ' if y % 2 == 0 else 'dec ') + RP[y >> 1]
        if z == 4: return 1, 'inc ' + R[y]
        if z == 5: return 1, 'dec ' + R[y]
        if z == 6: return 2, 'ld %s,$%02X' % (R[y], b1)
    if x == 1: return 1, 'ld %s,%s' % (R[y], R[z])
    if x == 2: return 1, ALU[y] + R[z]
    if z == 0: return 1, 'ret ' + CC[y]
    if z == 1: return 1, 'pop ' + RP2[y >> 1]
    if z == 2: return 3, 'jp %s,$%04X' % (CC[y], w)
    if z == 4: return 3, 'call %s,$%04X' % (CC[y], w)
    if z == 5: return 1, 'push ' + RP2[y >> 1]
    if z == 6: return 2, ALU[y] + '$%02X' % b1
    if z == 7: return 1, 'rst $%02X' % (y * 8)
    return 1, 'db $%02X' % o

def dis(bank, a, n):
    out = []
    for _ in range(n):
        l, t = one(bank, a)
        out.append('%02X:%04X  %-9s %s' % (bank if a >= 0x4000 else 0, a, rom[off(bank, a):off(bank, a) + l].hex(), t))
        a += l
    return '\n'.join(out)

if __name__ == '__main__':
    print(dis(int(sys.argv[1], 16), int(sys.argv[2], 16), int(sys.argv[3]) if len(sys.argv) > 3 else 40))
