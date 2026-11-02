"""ra_snapshot.py - every block Shantae Link's ra.js can ask for, read from a live RetroArch, as JSON for
linktest.py --ra --ra-blocks. Pauses the game while reading (PAUSE_TOGGLE before and after) so the blocks agree.

  python3 tests/ra_snapshot.py OUT.json [host] [port]       (from WSL: host = the Windows side, `ip route` default)
"""
import json, socket, sys, time
out = sys.argv[1]; A = (sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1', int(sys.argv[3]) if len(sys.argv) > 3 else 55355)
REGIONS = [(0x8000, 0xA000), (0xA000, 0xC000), (0xC000, 0xD000), (0xD000, 0xE000), (0xFE00, 0xFE20),
           (0xFF00, 0xFF80), (0xFF80, 0xFFFF), (0x10000, 0x12000), (0x14000, 0x16000)]   # = ra.js REGIONS
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(1.0)
def send(c): s.sendto((c + '\n').encode(), A)
blocks, want = {}, []
for r0, r1 in REGIONS:
    for p in range(r0 & ~0xFF, r1, 0x100):
        st = max(r0, p); want.append((st, min(r1, p + 0x100) - st))
send('PAUSE_TOGGLE'); time.sleep(0.3)
try:
    for st, n in want: send('READ_CORE_MEMORY %x %d' % (st, n))
    while len(blocks) < len(want):
        try: r = s.recvfrom(65536)[0].decode().split()
        except socket.timeout: break
        if len(r) > 2 and r[0] == 'READ_CORE_MEMORY' and r[2] != '-1': blocks['%x' % int(r[1], 16)] = ''.join(x.lower().zfill(2) for x in r[2:])
finally:
    send('PAUSE_TOGGLE')
json.dump(blocks, open(out, 'w'))
print('%d of %d blocks' % (len(blocks), len(want)))
