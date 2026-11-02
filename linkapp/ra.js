/* ra.js - Shantae Link (RetroArch): builds the window.Native that the Link page uses in Shantae Dual, on top of
 * window.RA (linkapp MainActivity.Bridge, RetroArch network commands). The build puts it before every other script of
 * the page. In Shantae Dual there is no window.RA and it does nothing.
 *
 * What READ_CORE_MEMORY reaches with the Gambatte core (its memory map run through RetroArch's descriptor code; see
 * tests/mock_ra.py), and what ra.js reads, which also fits mGBA's map (0.4):
 *   8000-9FFF VRAM bank 0 | A000-BFFF cart RAM | C000-CFFF WRAM 0 | D000-DFFF WRAM 1 (always bank 1, not SVBK's)
 *   FE00-FE1F OAM (first 8 sprites) | FF00-FF7F I/O | FF80-FFFE HRAM | 10000-11FFF WRAM 2-3 | 14000-15FFF WRAM 6-7
 * (mGBA also reaches WRAM 4-5 and its OAM descriptor differs; nothing here needs either.)
 * Out of reach: WRAM 4-5, VRAM bank 1, palette RAM, OAM past FE1F. What stands in (SHANTAE-RAM.md, "RetroArch"):
 *   palettes             the game's own copies, OBJ at $C400 and BG at $C440 (the colours it fades to and from)
 *   VRAM bank 1 tiles    rebuilt from the player's ROM: the room's tileset loads (call $0803 + 8 bytes: source, bank,
 *                        destination, VRAM bank, length; LZSS) are paired in the ROM, and the bank-0 one that matches
 *                        live VRAM picks the bank-1 one
 *   BG map attributes    the game's WRAM 1 copy of the BG map ($D000 tiles, $D400 attributes) when it matches VRAM
 *   GBA mode             HRAM $FFFE: 3 on a GBA, 1 on a GBC
 *   Select (dance list)  HRAM $FF8B, the buttons held (Select = 4), polled ~10 times a second
 */
(function () {
  'use strict';
  var R = window.RA;
  if (!R) return;
  var CRC = 'e994b59b';

  // ------------------------------------------------------------------ RetroArch addresses
  var REGIONS = [[0x8000, 0xA000], [0xA000, 0xC000], [0xC000, 0xD000], [0xD000, 0xE000], [0xFE00, 0xFE20],
                 [0xFF00, 0xFF80], [0xFF80, 0xFFFF], [0x10000, 0x12000], [0x14000, 0x16000]];
  // HRAM is read as FF80-FFFE: mGBA's HRAM descriptor is 127 bytes (IE at FFFF is its own), and RetroArch 1.22 stops a
  // read at the end of a descriptor, so a 128-byte read came back short there and the map (which reads $FFDF) never drew.
  function region(a) { for (var i = 0; i < REGIONS.length; i++) if (a >= REGIONS[i][0] && a < REGIONS[i][1]) return REGIONS[i]; return null; }
  /** WRAM bank n, offset 0-FFF -> RetroArch address, -1 for banks 4 and 5. */
  function wram(bank, off) {
    bank &= 7; off &= 0xFFF;
    if (bank === 0) return 0xC000 + off;
    if (bank === 1) return 0xD000 + off;
    return bank <= 3 ? 0x10000 + (bank - 2) * 0x1000 + off : bank >= 6 ? 0x14000 + (bank - 6) * 0x1000 + off : -1;
  }
  var svbk = 3;                                          // the game keeps bank 3 at D000 in play (refreshed below)
  function cpu(a) {
    a &= 0xFFFF;
    if (a >= 0xE000 && a < 0xFE00) a -= 0x2000;          // echo RAM
    if (a >= 0xD000 && a < 0xE000) return wram(svbk || 1, a);
    if ((a >= 0x8000 && a < 0xD000) || a >= 0xFF00 || (a >= 0xFE00 && a < 0xFE20)) return a;
    return -1;
  }
  /** The block (256-byte page clipped to its region) an address is read in: [start, length]. */
  function blockOf(a) {
    var r = region(a); if (!r) return null;
    var p = a & ~0xFF, s = Math.max(r[0], p), e = Math.min(r[1], p + 0x100);
    return [s, e - s];
  }
  function hexToBytes(h) { var n = h.length >> 1, o = new Uint8Array(n); for (var i = 0; i < n; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  /** Reads RetroArch addresses (any order); null when any of them isn't cached yet or can't be read. */
  function readAddrs(list) {
    var want = {}, order = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] < 0) return null;
      var b = blockOf(list[i]); if (!b) return null;
      if (!(b[0] in want)) { want[b[0]] = b[1]; order.push(b[0]); }
    }
    var got = R.read(order.map(function (s) { return s.toString(16) + ':' + want[s]; }).join(',')).split(','), data = {};
    for (i = 0; i < order.length; i++) { if (!got[i] || got[i].length < want[order[i]] * 2) return null; data[order[i]] = hexToBytes(got[i]); }
    var out = new Uint8Array(list.length);
    for (i = 0; i < list.length; i++) { var bs = blockOf(list[i])[0]; out[i] = data[bs][list[i] - bs]; }
    return out;
  }
  function range(a, n) { var l = new Array(n); for (var i = 0; i < n; i++) l[i] = a + i; return l; }
  function readRange(a, n) { return readAddrs(range(a, n)); }
  var HX = '0123456789abcdef';
  function toHex(b) { var s = ''; for (var i = 0; i < b.length; i++) s += HX[b[i] >> 4] + HX[b[i] & 15]; return s; }
  function b64enc(u) { var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function b64dec(s) { var b = atob(s || ''), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }

  /** Native.mem's spec ("addr:len", "wN:addr:len", "vN:addr:len") as RetroArch addresses, the same bytes Shantae Dual reads. */
  function mem(spec) {
    var list = [], v1 = [];
    spec.split(',').forEach(function (it) {
      var kind = '', bank = 0;
      if (/^[wv][0-7]:/.test(it)) { kind = it[0]; bank = +it[1]; it = it.substr(3); }
      var p = it.split(':'), a = parseInt(p[0], 16), n = p.length > 1 ? parseInt(p[1], 10) : 1;
      for (var i = 0; i < n; i++) {
        var ad = (a + i) & 0xFFFF;
        if (kind === 'w') list.push(wram(bank, ad));
        else if (kind === 'v') { if (bank) { v1.push([list.length, (ad - 0x8000) & 0x1FFF]); list.push(0xC000); } else list.push(0x8000 + ((ad - 0x8000) & 0x1FFF)); }
        else list.push(cpu(ad));
      }
    });
    var b = readAddrs(list);
    if (!b) return '';
    if (v1.length) {                                     // VRAM bank 1: the tiles rebuilt from the ROM ($8000-$97FF only)
      if (!lastBank1) return '';
      for (var k = 0; k < v1.length; k++) b[v1[k][0]] = v1[k][1] < 0x1800 ? lastBank1[v1[k][1]] : 0;
    }
    return toHex(b);
  }

  // ------------------------------------------------------------------ the player's ROM: font, tileset loads
  var romOk = null, fontB64 = null;
  function romBytes(off, len) { return b64dec(R.rom(off, len)); }
  function lzss(src, len) {                    // Okumura LZSS as the game uses it (bank 1 $41BD): ring of spaces, r = 0xFEE
    var ring = new Uint8Array(4096), out = new Uint8Array(len), r = 0xFEE, o = 0, p = 0, c, i;
    ring.fill(32);
    while (o < len && p < src.length) {
      var flags = src[p++];
      for (var k = 0; k < 8 && o < len; k++, flags >>= 1) {
        if (flags & 1) { c = src[p++]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xFFF; }
        else {
          var lo = src[p], hi = src[p + 1], pos = lo | ((hi & 0xF0) << 4), n = (hi & 15) + 3; p += 2;
          for (i = 0; i < n && o < len; i++) { c = ring[(pos + i) & 0xFFF]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xFFF; }
        }
      }
    }
    return out;
  }
  var fontSet = null;
  /** The font/HUD tileset ($1800 bytes, LZSS at ROM 0x3964A3): loaded to VRAM bank 1 at start, so it is also what bank 1
   *  holds past the end of a room's bank-1 load (99.8% of those tiles in the test states). */
  function fontTiles() {
    if (!fontSet) { var src = romBytes(0x3964A3, 0x1800); if (src.length < 0x800) return null; fontSet = lzss(src, 0x1800); }
    return fontSet;
  }
  function font() {
    if (fontB64 === null) { var t = fontTiles(); if (!t) return ''; fontB64 = b64enc(t.subarray(0x1000, 0x1800)); }
    return fontB64;
  }
  // Tileset loads: `cd 03 08` (call $0803) + src lo, src hi, bank, dest lo, dest hi, VRAM bank, length lo, hi. Each room
  // loads its bank-0 tileset and right after it its bank-1 one; 114 of the 115 bank-0 loads have that partner.
  var TS = { at: 0, found: [], loads: null, dec: {}, sig: '', img: null, cur: null };
  function scanLoads() {
    if (TS.loads) return true;
    var key = 'sl.loads.' + (rom && rom.crc);                // found once per ROM, then kept (derived numbers only)
    if (TS.at === 0) { try { var c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.length) { TS.found = c; TS.at = 256; } } catch (e) {} }
    for (var k = 0; k < 64 && TS.at < 256; k++, TS.at++) {   // 1 MB per call: the whole ROM in 4 (kept afterwards)
      var b = romBytes(TS.at * 0x4000, 0x4000 + 11);
      if (b.length < 0x4000) { TS.at = 256; break; }
      for (var i = 0; i < 0x4000; i++) {
        if (b[i] !== 0xCD || b[i + 1] !== 0x03 || b[i + 2] !== 0x08) continue;
        var src = b[i + 3] | b[i + 4] << 8, bank = b[i + 5], dest = b[i + 6] | b[i + 7] << 8, vbk = b[i + 8], len = b[i + 9] | b[i + 10] << 8;
        if (src >= 0x4000 && src < 0x8000 && dest >= 0x8000 && dest < 0x9800 && vbk < 2 && len > 0 && len <= 0x1800)
          TS.found.push({ at: TS.at * 0x4000 + i, src: src, bank: bank, dest: dest, vbk: vbk, len: len });
      }
    }
    if (TS.at < 256) return false;
    try { localStorage.setItem(key, JSON.stringify(TS.found.map(function (l) { return { at: l.at, src: l.src, bank: l.bank, dest: l.dest, vbk: l.vbk, len: l.len }; }))); } catch (e) {}
    TS.loads = TS.found;
    TS.loads.forEach(function (l, n) {
      if (l.vbk) return;
      for (var m = n + 1; m < Math.min(TS.loads.length, n + 4); m++)
        if (TS.loads[m].vbk === 1 && TS.loads[m].at - l.at < 48) { l.pair = TS.loads[m]; break; }
    });
    return true;
  }
  function unpack(l) {
    var key = l.bank + ':' + l.src + ':' + l.len;
    if (!TS.dec[key]) TS.dec[key] = lzss(romBytes(l.bank * 0x4000 + l.src - 0x4000, Math.min(0x2800, 0x8000 - l.src)), l.len);
    return TS.dec[key];
  }
  function flat(a, o) { for (var i = 1; i < 16; i++) if (a[o + i] !== a[o]) return false; return true; }
  /** How many non-blank tiles of load l's output match live VRAM bank 0. */
  function score(l, v0) {
    var d = unpack(l), base = l.dest - 0x8000, n = 0, k = 0;
    for (var t = 0; t * 16 + 16 <= d.length && base + t * 16 + 16 <= 0x1800; t++) {
      if (flat(d, t * 16)) continue;
      n++;
      var ok = true, o = base + t * 16;
      for (var j = 0; j < 16; j++) if (d[t * 16 + j] !== v0[o + j]) { ok = false; break; }
      if (ok) k++;
    }
    return [k, n];
  }
  var lastBank1 = null;
  /** VRAM bank 1 tile data ($8000-$97FF) for the room whose bank-0 tiles are v0, from the ROM; null when unknown. */
  function bank1(v0) {
    if (!romOk || !scanLoads()) return null;
    var sig = ''; for (var i = 0; i < 0x1800; i += 97) sig += v0[i].toString(36);
    if (sig === TS.sig) return TS.img;
    TS.sig = sig;
    var best = null, s;
    if (TS.cur) { s = score(TS.cur, v0); if (s[1] >= 20 && s[0] >= 0.8 * s[1]) best = { l: TS.cur, k: s[0], n: s[1] }; }
    if (!best) TS.loads.forEach(function (l) {
      if (l.vbk || !l.pair) return;
      var s2 = score(l, v0);
      if (s2[1] >= 20 && (!best || s2[0] / s2[1] > best.k / best.n)) best = { l: l, k: s2[0], n: s2[1] };
    });
    if (!best || best.k < 0.5 * best.n) { TS.cur = null; return (TS.img = lastBank1 = null); }
    if (best.l !== TS.cur || !TS.img) {
      var p = best.l.pair, d = unpack(p), img = new Uint8Array(0x1800), o = p.dest - 0x8000, ft = fontTiles();
      if (ft) img.set(ft);                                   // what the room's load doesn't cover
      img.set(d.subarray(0, Math.min(d.length, 0x1800 - o)), o);
      TS.cur = best.l; TS.img = img;
    }
    return (lastBank1 = TS.img);
  }

  // ------------------------------------------------------------------ video snapshot (Shantae Dual's Native.video layout)
  // VRAM bank 0 | bank 1 | BG palettes 64 | OBJ palettes 64 | OAM 160 | LCDC SCY SCX WY WX  (0x4125 bytes, base64)
  var vid = '', vidAt = 0, holdAt = 0, vidFull = false;   // vidFull: bank-1 tiles and BG attributes both stood in
  function video() {
    var now = Date.now();
    if (vid && now - vidAt < 90) return vid;
    var v0 = readRange(0x8000, 0x2000), pal = readRange(0xC400, 0x80), io = readRange(0xFF00, 0x80);
    if (!v0 || !pal || !io) return vid;
    var out = new Uint8Array(0x4125), lcdc = io[0x40];
    out.set(v0, 0);
    var t1 = bank1(v0);
    if (t1) { out.set(t1, 0x2000); holdAt = 0; }
    else {                                   // the map keeps what it draws: give the ROM scan / tileset match a moment
      if (!holdAt) holdAt = now;             // (a room drawn now would keep holes where its bank-1 tiles go)
      if (now - holdAt < 2500) return '';
    }
    // tiles $000-$04F of both banks are the sprite stream: HDMA'd every frame from WRAM $C4C0 (1280 bytes), the banks
    // taking turns. The buffer matches live bank 1 for 80% of those tiles (a frame out of step for the rest)
    var spr = readRange(0xC4C0, 0x500); if (spr) out.set(spr, 0x2000);
    var m = (lcdc & 8) ? 0x1C00 : 0x1800, bg = readRange(0xD000, 0x800);   // the game's WRAM 1 copy of the BG map
    if (bg) {
      var same = 0; for (var i = 0; i < 0x400; i++) if (bg[i] === v0[m + i]) same++;
      if (same > 0x380) out.set(bg.subarray(0x400, 0x800), 0x2000 + m);
      vidFull = !!t1 && same > 0x380;
    } else vidFull = false;
    out.set(pal.subarray(0x40, 0x80), 0x4000);            // BG palettes ($C440)
    out.set(pal.subarray(0, 0x40), 0x4040);               // OBJ palettes ($C400)
    var oam = readRange(0xFE00, 0x20); if (oam) out.set(oam, 0x4080);
    out[0x4120] = lcdc; out[0x4121] = io[0x42]; out[0x4122] = io[0x43]; out[0x4123] = io[0x4A]; out[0x4124] = io[0x4B];
    svbk = io[0x70] & 7;
    vid = b64enc(out); vidAt = now;
    return vid;
  }

  // ------------------------------------------------------------------ RetroArch state
  var stat = null, statAt = 0, rom = null;
  function status() {
    var now = Date.now();
    if (stat && now - statAt < 250) return stat;
    try { stat = JSON.parse(R.status()); } catch (e) { stat = { linked: false }; }
    try { rom = R.romInfo() ? JSON.parse(R.romInfo()) : null; } catch (e) { rom = null; }
    romOk = !!(rom && rom.ok);
    statAt = now;
    return stat;
  }
  /** What stops the link, or '' when the game can be read: norom, badrom, noreply, nogame, wrong, nomap. */
  function problem() {
    var s = status();
    if (!rom) return 'norom';
    if (!rom.ok) return 'badrom';
    if (!s.linked) return 'noreply';
    if (s.state !== 'PLAYING' && s.state !== 'PAUSED') return 'nogame';
    if (s.crc && s.crc !== CRC) return 'wrong';
    if (/no memory map/.test(s.memErr || '') && !readRange(0xC000, 1)) return 'nomap';   // a core without SET_MEMORY_MAPS
    return '';
  }

  // ------------------------------------------------------------------ Select -> dance list; GBA mode
  var sel = 0, gba = null;
  setInterval(function () {
    if (problem()) return;
    var h = readAddrs([0xFF8B, 0xFFFE, 0xC39D]);
    if (!h) return;
    if (h[1] === 3) gba = true; else if (h[1] === 1) gba = false;
    var s = h[0] & 4;
    if (s && !sel && h[2] === 2 && window.onSelect) window.onSelect();
    sel = s;
  }, 100);

  // ------------------------------------------------------------------ save state slots (RetroArch's own)
  var saved = {}; try { saved = JSON.parse(localStorage.getItem('sl.ra.saved') || '{}'); } catch (e) {}
  var ffOn = false;

  window.Native = {
    ra: true,
    version: function () { return R.version(); },
    running: function () { return !problem(); },
    raStatus: function () { var s = status(); return { problem: problem(), state: s.state || '', game: s.game || '', version: s.version || '',
                                                       host: s.host || '', port: s.port || 0, rom: rom, age: s.age }; },
    mem: function (spec) { return problem() ? '' : mem(spec); },
    video: function () { return problem() ? '' : video(); },
    /** true when the last video() had VRAM bank 1 rebuilt and the BG attributes from the game's copy: the inventory
     *  icons are only copied from such a snapshot (its tilesets are $0803 loads too: 7A:6515 / 7A:7113) */
    videoComplete: function () { return vidFull; },
    pal: function () { return ''; },
    font: font,
    rom: function (off, len) { return R.rom(off, len); },
    asset: function () { return ''; },
    gbaMode: function () { return gba !== false; },
    devUsed: function () { return false; },
    overlay: function () { return false; },
    close: function () {},
    input: function () {},
    menu: function () { R.send('MENU_TOGGLE'); },
    /** -1 reads, 0 off, 1 on, 2 toggles. RetroArch only has a toggle, so this follows what the Link screen asked for. */
    ff: function (mode) {
      var want = mode === 2 ? !ffOn : mode === 1 ? true : mode === 0 ? false : ffOn;
      if (want !== ffOn) { R.send('FAST_FORWARD'); ffOn = want; }
      return ffOn;
    },
    slots: function () { return JSON.stringify([1, 2, 3, 4].map(function (n) { return { n: n, time: saved[n] || 0 }; })); },
    // RetroArch 1.22.2 (Nov 2025 nightly) has LOAD_STATE_SLOT but no SAVE_STATE_SLOT, and no way to read the current
    // slot. So: step the slot down until it stops at -1, up to n, then SAVE_STATE, 50 ms apart (presses arriving in the
    // same frame count once). Checked live: 12 x MINUS, 3 x PLUS, SAVE_STATE wrote slot 2. Leaves RetroArch on slot n.
    saveSlot: function (n) {
      var c = []; for (var i = 0; i < 20; i++) c.push('STATE_SLOT_MINUS');
      for (i = 0; i <= n; i++) c.push('STATE_SLOT_PLUS');
      c.push('SAVE_STATE');
      R.sendPaced(c.join('|'), 50);
      saved[n] = Date.now(); try { localStorage.setItem('sl.ra.saved', JSON.stringify(saved)); } catch (e) {} return true; },
    loadSlot: function (n) { R.send('LOAD_STATE_SLOT ' + n); return true; },
    thumb: function () { return ''; },
    /** Equips item i the way the game's inventory does ($CA84), only in play with one in the bag. */
    equip: function (i) {
      var h = readAddrs([0xC39D, 0xCA70 + i]);
      if (!h || (h[0] !== 2 && h[0] !== 5) || !h[1] || i < 0 || i > 11) return false;
      R.write('ca84', HX[i >> 4] + HX[i & 15]);
      return true;
    },
    pickRom: function () { R.pickRom(); }  };
  window.onRomPicked = function (msg) {
    fontB64 = null; fontSet = null; TS = { at: 0, found: [], loads: null, dec: {}, sig: '', img: null, cur: null }; lastBank1 = null; statAt = 0;
    window.raRomMsg = msg || '';
    if (window.onRom) window.onRom();
  };
})();
