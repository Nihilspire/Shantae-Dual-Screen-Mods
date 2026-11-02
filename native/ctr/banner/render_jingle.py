"""render_jingle.py OUT.wav [seconds] - the 3DS banner sound: the opening of "Sequin Nights" (assets/menu/music.js, the
Android launcher's own original tune; no game music), rendered offline in headless Chromium through Music.render(),
faded out and written as 16-bit mono WAV for bannertool. A 3DS banner sound is at most ~3 seconds."""
import base64, struct, sys, os
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
out = sys.argv[1]; secs = float(sys.argv[2]) if len(sys.argv) > 2 else 2.9
music = open(os.path.join(ROOT, 'app/assets/menu/music.js')).read()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.set_content('<html><body></body></html>')
    pg.add_script_tag(content=music)
    b64 = pg.evaluate('''async (secs) => {
        const buf = await Music.render(secs);
        const d = buf.getChannelData(0), n = d.length, fade = Math.round(buf.sampleRate * 0.6);
        let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
        const g = peak > 0 ? 0.9 / peak : 1, pcm = new Int16Array(n);
        for (let i = 0; i < n; i++) {
            const f = i > n - fade ? (n - i) / fade : 1;                  // fade out over the last 0.6 s
            pcm[i] = Math.max(-32767, Math.min(32767, Math.round(d[i] * g * f * 32767)));
        }
        let s = ''; const u = new Uint8Array(pcm.buffer);
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return [btoa(s), buf.sampleRate];
    }''', secs)
    b.close()
data, rate = base64.b64decode(b64[0]), b64[1]
with open(out, 'wb') as f:
    f.write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16))
    f.write(b'data' + struct.pack('<I', len(data)) + data)
print(out, len(data) // 2 / rate, 's at', rate, 'Hz')
