"""mock_ra.py - answers RetroArch network commands (UDP) from Shantae driver dumps, for testing Shantae Link.

The memory map is the Gambatte core's (libgambatte/libretro/libretro.cpp, RETRO_ENVIRONMENT_SET_MEMORY_MAPS) run through
RetroArch's own descriptor code (runloop.c mmap_preprocess_descriptors, command.c command_memory_get_descriptor), so a
read reaches exactly what it would reach in RetroArch: WRAM bank 1 fixed at D000, banks 2-3 and 6-7 only at 0x10000+,
OAM only FE00-FE1F, VRAM bank 0 only, no palette RAM.

  python3 tests/mock_ra.py DUMP_OR_DIR [--port 55355] [--step MS] [--log FILE] [--core gambatte|mgba]
A directory plays its *.bin dumps in name order, one every --step ms (default 100), looping.
As a module: ra_read(dump, address, n) -> bytes or None (the same lookup, for page tests).
"""
import glob, os, socket, sys, time

W0, V0, P0, S0 = 0x10000, 0x18000, 0x1C000, 0x1C080      # driver dump: CPU 64K | WRAM 8x4K | VRAM 2x8K | BG pal | OBJ pal | SRAM
SYSTEM_RAM, CONST = 1 << 2, 1 << 0                       # RETRO_MEMDESC_SYSTEM_RAM, RETRO_MEMDESC_CONST


def gambatte_descriptors(cgb=True, sram=0x2000):
    """(flags, buffer, offset, start, select, disconnect, len) in libretro.cpp's order. Buffers name dump regions."""
    d = [(SYSTEM_RAM, 'wram0', 0, 0xC000, 0, 0, 0x1000),
         (SYSTEM_RAM, 'wram1', 0, 0xD000, 0, 0, 0x1000),         # rambank1_ptr() = wramdata(0) + 0x1000: bank 1, fixed
         (SYSTEM_RAM, 'hram', 0, 0xFF80, 0, 0, 0x0080),
         (0, 'vram0', 0, 0x8000, 0, 0, 0x2000),                  # vram_ptr() = vramdata(): bank 0 only
         (0, 'oam', 0, 0xFE00, 0xFFFFFFE0, 0, 0x00A0),
         (CONST, 'rom0', 0, 0x0000, 0, 0, 0x4000),
         (CONST, 'rom1', 0, 0x4000, 0, 0, 0x4000),               # rombank1_ptr() = romdata(0) + 0x4000: bank 1, fixed
         (0, 'io', 0, 0xFF00, 0, 0, 0x0080)]                     # oamram_ptr() + 0x100
    if sram: d.append((0, 'sram', 0, 0xA000, (~0x1FFF) & 0xFFFFFFFFFFFFFFFF, 0, sram))
    if cgb: d.append((SYSTEM_RAM, 'wram2', 0, 0x10000, 0xFFFFA000, 0, 0x6000))
    return [dict(flags=f, buf=b, offset=o, start=s, select=sel, disconnect=dc, len=ln) for f, b, o, s, sel, dc, ln in d]


def mgba_descriptors(cgb=True, sram=0x2000):
    """mGBA (libretro/mgba src/platform/libretro/libretro.c _setupMaps, GB), in its order. HRAM is $7F bytes (IE at FFFF
    on its own); WRAM 2-7 at 0x10000 is 0x6000 long with no select, which RetroArch's preprocessing can't take: it gives
    up there (ignoring the failure), so that descriptor is matched as a plain range and every bank 2-7 is reachable."""
    d = [(CONST, 'rom0', 0, 0x0000, 0, 0, 0x4000),
         (CONST, 'rom1', 0x4000 - 0x4000, 0x4000, 0, 0, 0x4000),
         (0, 'vram0', 0, 0x8000, 0, 0, 0x2000),
         (SYSTEM_RAM, 'wram0', 0, 0xC000, 0, 0, 0x1000),
         (SYSTEM_RAM, 'wram1', 0, 0xD000, 0, 0, 0x1000),
         (0, 'oam', 0, 0xFE00, 0xFFFFFF60, 0, 0x00A0),
         (0, 'io', 0, 0xFF00, 0, 0, 0x0080),
         (SYSTEM_RAM, 'hram', 0, 0xFF80, 0xFFFFFF80, 0, 0x007F),
         (0, 'ie', 0, 0xFFFF, 0, 0, 0x0001)]
    if sram: d.append((0, 'sram', 0, 0xA000, 0, 0, sram))
    if cgb: d.append((SYSTEM_RAM, 'wram2', 0, 0x10000, 0, 0, 0x6000))
    return [dict(flags=f, buf=b, offset=o, start=s, select=sel, disconnect=dc, len=ln) for f, b, o, s, sel, dc, ln in d]


M64 = (1 << 64) - 1
def _bits_down(n):
    for s in (1, 2, 4, 8, 16, 32): n |= n >> s
    return n
def _inflate(addr, mask):
    while mask:
        tmp = ((mask - 1) & ~mask) & M64
        addr = (((addr & ~tmp) << 1) | (addr & tmp)) & M64
        mask &= mask - 1
    return addr
def _reduce(addr, mask):
    while mask:
        tmp = ((mask - 1) & ~mask) & M64
        addr = (addr & tmp) | ((addr >> 1) & ~tmp & M64)
        mask = (mask & (mask - 1)) >> 1
    return addr
def _highest_bit(n):
    n = _bits_down(n); return n ^ (n >> 1)


def preprocess(descs):
    """runloop.c mmap_preprocess_descriptors (64-bit size_t). Like RetroArch it stops at the first descriptor it can't
    take (a select-less length that isn't a power of two, a start outside its select) and the rest stay as the core gave
    them; RetroArch ignores the failure and uses the map anyway."""
    top = 1
    for d in descs: top |= d['select'] if d['select'] else d['start'] + d['len'] - 1
    top = _bits_down(top)
    for d in descs:
        if d['select'] == 0:
            if not d['len'] or d['len'] & (d['len'] - 1): return descs
            d['select'] = top & ~_inflate(_bits_down(d['len'] - 1), d['disconnect']) & M64
        if d['len'] == 0:
            d['len'] = _bits_down(_reduce(top & ~d['select'], d['disconnect'])) + 1
        if d['start'] & ~d['select'] & M64: return descs
        reach = _inflate(d['len'] - 1, d['disconnect'])
        while _highest_bit(top & ~d['select'] & ~d['disconnect'] & M64) > _highest_bit(reach):
            d['disconnect'] |= _highest_bit(top & ~d['select'] & ~d['disconnect'] & M64)
    return descs


def find(descs, address):
    """command.c command_memory_get_descriptor -> (desc, offset) or (None, 0). address is a 32-bit unsigned."""
    for d in descs:
        if d['select'] == 0:
            if d['start'] <= address < d['start'] + d['len']: return d, address - d['start']
        elif ((d['start'] ^ address) & d['select']) == 0:
            off = (address - d['start']) & 0xFFFFFFFF
            mask = d['disconnect'] & 0xFFFFFFFF
            while mask:
                tmp = (mask - 1) & ~mask & 0xFFFFFFFF
                off = (off & tmp) | ((off >> 1) & ~tmp & 0xFFFFFFFF)
                mask = (mask & (mask - 1)) >> 1
            if off < d['len']: return d, off
    return None, 0


CORES = {'gambatte': gambatte_descriptors, 'mgba': mgba_descriptors}
DESCS = preprocess(gambatte_descriptors())
def use(core):
    """Answer with this core's memory map from now on: 'gambatte' (default) or 'mgba'."""
    global DESCS
    DESCS = preprocess(CORES[core]())


def _buffer(dump, name):
    return {'wram0': dump[W0:W0 + 0x1000], 'wram1': dump[W0 + 0x1000:W0 + 0x2000], 'wram2': dump[W0 + 0x2000:W0 + 0x8000],
            'hram': dump[0xFF80:0x10000], 'ie': dump[0xFFFF:0x10000], 'io': dump[0xFF00:0xFF80], 'oam': dump[0xFE00:0xFEA0],
            'vram0': dump[V0:V0 + 0x2000], 'sram': dump[S0:S0 + 0x2000],
            'rom0': None, 'rom1': None}[name]


def ra_read(dump, address, n, old=True):
    """READ_CORE_MEMORY: bytes, or None with the reason RetroArch gives. old=True stops at the descriptor's end
    (RetroArch builds before late 2026); False carries on into the next descriptor like the current master."""
    out = bytearray()
    while len(out) < n:
        d, off = find(DESCS, address + len(out))
        if d is None:
            return (bytes(out), None) if out else (None, 'no descriptor for address')
        buf = _buffer(dump, d['buf'])
        if buf is None: return (None, 'no data for descriptor') if not out else (bytes(out), None)
        take = min(n - len(out), d['len'] - off)
        out += buf[d['offset'] + off:d['offset'] + off + take]
        if old: break
    return bytes(out[:n]), None


def ra_write(dump, address, data):
    d, off = find(DESCS, address)
    if d is None: return 'no descriptor for address'
    if d['flags'] & CONST: return 'descriptor data is readonly'
    base = {'wram0': W0, 'wram1': W0 + 0x1000, 'wram2': W0 + 0x2000, 'hram': 0xFF80, 'ie': 0xFFFF, 'io': 0xFF00, 'oam': 0xFE00,
            'vram0': V0, 'sram': S0}[d['buf']]
    for i, v in enumerate(data[:d['len'] - off]): dump[base + off + i] = v
    if d['buf'] == 'wram0':                                   # keep the CPU view in step for C000-CFFF
        for i, v in enumerate(data[:d['len'] - off]): dump[0xC000 + off + i] = v
    return None


def serve(src, port=55355, step=0.1, log=None, crc='e994b59b'):
    files = sorted(glob.glob(os.path.join(src, '*.bin'))) if os.path.isdir(src) else [src]
    dumps = [bytearray(open(f, 'rb').read()) for f in files]
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(('127.0.0.1', port)); s.settimeout(0.02)
    lg = open(log, 'a') if log else None
    t0 = time.time(); print('mock RetroArch on udp 127.0.0.1:%d, %d dump(s)' % (port, len(dumps)), flush=True)
    while True:
        try: data, peer = s.recvfrom(4096)
        except socket.timeout: continue
        cur = dumps[int((time.time() - t0) / step) % len(dumps)]
        for line in data.decode('ascii', 'replace').splitlines():
            w = line.split()
            if not w: continue
            if lg: lg.write(line + '\n'); lg.flush()
            c, r = w[0], None
            if c == 'VERSION': r = 'VERSION 1.21.0-mock'
            elif c == 'GET_STATUS': r = 'GET_STATUS PLAYING game_boy,Shantae (USA),crc32=%s' % crc
            elif c == 'READ_CORE_MEMORY' and len(w) >= 3:
                a, n = int(w[1], 16), int(w[2])
                b, err = ra_read(cur, a, n)
                r = 'READ_CORE_MEMORY %x ' % a + (' '.join('%02x' % x for x in b) if b is not None else '-1 ' + err)
            elif c == 'READ_CORE_RAM' and len(w) >= 3:
                r = 'READ_CORE_RAM %x -1 achievements are not enabled' % int(w[1], 16)
            elif c == 'WRITE_CORE_MEMORY' and len(w) >= 3:
                a = int(w[1], 16); err = ra_write(cur, a, [int(x, 16) for x in w[2:]])
                r = 'WRITE_CORE_MEMORY %x ' % a + ('-1 ' + err if err else str(len(w) - 2))
            if r: s.sendto((r + '\n').encode('ascii'), peer)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    use(opt('--core', 'gambatte'))
    serve(a[0], int(opt('--port', 55355)), int(opt('--step', 100)) / 1000.0, opt('--log', None))
