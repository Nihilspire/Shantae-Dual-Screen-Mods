"""ra_state.py - a driver save state (out/host/drive `save`) as a state the stock Gambatte core in RetroArch loads.

The libretro buildbot's Gambatte writes two more fields than this repo's core (netsfc, netsv: 1 byte each), and
gambatte only loads a state of its own size. This copies every field of SRC into the layout of TEMPLATE, a state the
stock core saved (its RASTATE / RZIP wrapping is removed first), and writes OUT, which RetroArch loads as a slot file
("<states>/Gambatte/Shantae (USA).stateN", then LOAD_STATE_SLOT N).

  python3 tests/ra_state.py TEMPLATE.state SRC.st OUT
"""
import struct, sys, zlib


def unwrap(b):
    if b[:8] == b'#RZIPv\x01#':                                  # RetroArch's compressed state
        p, out = 20, b''
        while p < len(b):
            n = struct.unpack('<I', b[p:p + 4])[0]; out += zlib.decompress(b[p + 4:p + 4 + n]); p += 4 + n
        b = out
    if b[:7] == b'RASTATE':                                      # blocks: tag, size, data (8-byte aligned)
        p = 8
        while p + 8 <= len(b):
            tag, n = b[p:p + 4], struct.unpack('<I', b[p + 4:p + 8])[0]
            if tag == b'MEM ': return b[p + 8:p + 8 + n]
            p += 8 + ((n + 7) & ~7)
    return b


def fields(b):
    """gambatte statesaver: 2-byte header, empty snapshot (put24 0), then label\\0, 24-bit size, data."""
    p, out = 5, []
    while p < len(b):
        e = b.index(b'\0', p); lab = b[p:e]; p = e + 1
        n = b[p] << 16 | b[p + 1] << 8 | b[p + 2]; p += 3
        out.append((lab, b[p:p + n])); p += n
    return b[:5], out


if __name__ == '__main__':
    tmpl, src, out = sys.argv[1:4]
    head, want = fields(unwrap(open(tmpl, 'rb').read()))
    have = dict(fields(open(src, 'rb').read())[1])
    o = bytearray(head)
    for lab, d in want:
        v = (have.get(lab, d) + bytes(len(d)))[:len(d)]
        o += lab + b'\0' + bytes([len(d) >> 16 & 255, len(d) >> 8 & 255, len(d) & 255]) + v
    open(out, 'wb').write(o)
    missing = [l.decode() for l, _ in want if l not in have]
    print('wrote %s, %d bytes%s' % (out, len(o), ' (kept from the template: %s)' % ', '.join(missing) if missing else ''))
