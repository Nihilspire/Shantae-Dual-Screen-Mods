"""ratest.py - the Link app's RetroArch transport (linkapp RetroArch.java) on the desktop JVM against tests/mock_ra.py.

  python3 tests/ratest.py DUMP
Starts the mock on a free port with DUMP, runs tests/ra/RaCheck.java with the blocks ra.js asks for (every region it
reads, plus two RetroArch can't reach), and checks each block against the mock's own lookup and the status line.
"""
import os, socket, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_ra as M

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dump = sys.argv[1]
core = sys.argv[sys.argv.index('--core') + 1] if '--core' in sys.argv else 'gambatte'   # whose memory map the mock answers with
M.use(core)
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
log = '/tmp/ratest_%d.log' % port
mock = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tests/mock_ra.py'), dump, '--port', str(port), '--log', log, '--core', core],
                        stdout=subprocess.DEVNULL)
try:
    cls = os.path.join(ROOT, 'out/ratest')
    os.makedirs(cls, exist_ok=True)
    subprocess.check_call(['javac', '-nowarn', '-d', cls, os.path.join(ROOT, 'linkapp/src/com/jack/shantaelink/RetroArch.java'),
                           os.path.join(ROOT, 'tests/ra/RaCheck.java')])
    blocks = [(0x8000, 256), (0x9F00, 256), (0xA000, 256), (0xC300, 256), (0xC400, 256), (0xCB00, 256), (0xD400, 256),
              (0xFE00, 32), (0xFF00, 128), (0xFF80, 127), (0x10000, 256), (0x11000, 256), (0x14000, 256), (0x15F00, 256),
              (0x12000, 256), (0xFE20, 32)]     # last two: out of reach with Gambatte (empty); mGBA reaches 0x12000
    time.sleep(0.3)
    out = subprocess.check_output(['java', '-cp', cls, 'RaCheck', str(port), ','.join('%x:%d' % b for b in blocks)], text=True)
    lines = out.strip().splitlines()
    d = open(dump, 'rb').read()
    bad = 0
    for (a, n), line in zip(blocks, lines):
        want, err = M.ra_read(d, a, n)
        got = line.split(' ', 1)[1]
        ok = (got == '-') if want is None else (got == want.hex())
        bad += not ok
        print('%6X %4d  %s' % (a, n, 'ok' if ok else 'MISMATCH (%s)' % (err or 'data')), '(unreachable, empty as expected)' if want is None and ok else '')
    st = lines[len(blocks)]
    print('status', st)
    sent = open(log).read().splitlines()
    for c in ('GET_STATUS', 'VERSION', 'FAST_FORWARD', 'WRITE_CORE_MEMORY ca84 05'):
        print('sent %-28s %s' % (c, 'yes' if c in sent else 'NO')); bad += c not in sent
    bad += '"linked":true' not in st or '"crc":"e994b59b"' not in st or '"state":"PLAYING"' not in st
    print('RESULT', 'PASS' if not bad else 'FAIL %d' % bad)
    sys.exit(1 if bad else 0)
finally:
    mock.terminate()
