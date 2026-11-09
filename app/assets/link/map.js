/* map.js - whole-room maps drawn from the game's own level data (see SHANTAE-RAM.md, "Level data").
 *
 * The level layout is read from the player's ROM; the tile graphics and colours from live VRAM (Native.video()),
 * so nothing from the game ships here. Every room is a rectangle inside a "region": a grid of 256x256 screens
 * (table of [page, bank] pairs, 32 per row). A screen is 16x16 metatile words; a word points at a 2x2 tile definition
 * (4 tile numbers + 4 CGB attributes) in bank $DF + (lo & 15), address (hi << 8) | (lo & $F0).
 *
 *   ShantaeMap.update(N, playing)   poll RAM, re-render when the room or the colours change
 *   ShantaeMap.draw(ctx, p, G, C)   draw into pane p {x, y, w, h}
 */
(function (root) {
  'use strict';
  var M = {}, G = null;
  var banks = {}, rooms = null, cur = null, img = null, overview = null, ovKey = '';
  var vars = null, status = 'WAITING FOR THE GAME', blink = 0, scan = null, partKey = '';

  function b64(s) { var b = atob(s || ''), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  /** One ROM bank, cached (Native.rom answers base64). */
  function bank(N, b) {
    if (banks[b]) return banks[b];
    var d = b64(N.rom(b * 0x4000, 0x4000));
    return (banks[b] = d.length === 0x4000 ? d : new Uint8Array(0x4000));
  }
  function rb(N, b, a) { return a < 0x4000 ? bank(N, 0)[a] : bank(N, b)[a - 0x4000]; }

  // ------------------------------------------------------------------ collectibles placed in the room (SHANTAE-RAM.md, "Object placement")
  // Object grid: bank $C39B, entry for screen (r, c) at ((C39A + r/2) << 8) | (r & 1) << 7 | c * 4 = far pointer to
  // [count][17-byte entries]: x right, x left, y bottom, y top (16-bit), RAM byte "spawned", script (lo hi bank), 4 params.
  // Collectibles' scripts are entries of the type table at 0A:4000 + 4k; param 0 indexes the type's flag table in bank $11
  // ((byte offset from $CB1B, mask) pairs), which is how the game marks it as collected.
  var KINDS = { 38: 'squid', 99: 'tal', 100: 'tal', 101: 'tal', 102: 'tal', 104: 'fly', 105: 'heart' };
  var FLAGS = { tal: 0x6EEF, heart: 0x6EFF, fly: 0x6F4F, squid: 0x6F0F };
  var PARAM = { squid: 3 };
  var DOOR_TYPES = { 111: 1, 119: 1, 124: 1, 131: 1, 141: 1, 151: 1 };   // cave ladders and cave mouths: param 0 = cave, 1 = side
  var TOWN_DOOR = 157;                                                    // a door on a town street: param 0 = door number
  var GENIE = 39;                                                         // a labyrinth's Guardian Genie: param 0 = labyrinth 1-4
  function roomObjects(N, V, rect) {
    var out = [], seen = {};
    if (!V.ob) return out;
    for (var r = rect.y >> 8; r <= Math.min(31, (rect.y + rect.h - 1) >> 8); r++)
      for (var c = rect.x >> 8; c <= Math.min(31, (rect.x + rect.w - 1) >> 8); c++) {
        var a = ((V.oh + (r >> 1)) << 8) | ((r & 1) << 7) | (c * 4);
        if (a >= 0x8000) continue;
        var p = rb(N, V.ob, a) | rb(N, V.ob, a + 1) << 8, bk = rb(N, V.ob, a + 2);
        if (!bk || p < 0x4000 || p >= 0x8000) continue;
        var n = rb(N, bk, p);
        for (var i = 0; i < n && i < 40; i++) {
          var e = p + 1 + 17 * i, g = function (o) { return rb(N, bk, e + o) | rb(N, bk, e + o + 1) << 8; };
          var sb = rb(N, bk, e + 12), sa = g(10);
          if (sb !== 0x0A || sa < 0x4000 || (sa & 3)) continue;
          var tk = (sa - 0x4000) >> 2, kind = KINDS[tk];
          if (tk === GENIE) {
            if (!seen.genie) { seen.genie = 1; out.push({ kind: 'genie', x: (g(2) + g(0)) >> 1, y: (g(6) + g(4)) >> 1 }); }
            continue;
          }
          if (tk === TOWN_DOOR) {
            var dn = rb(N, bk, e + 13), dx = (g(2) + g(0)) >> 1;
            if (dn && dx >= rect.x && dx < rect.x + rect.w && !seen['d' + dn]) { seen['d' + dn] = 1; out.push({ kind: 'tdoor', n: dn, x: dx, y: (g(6) + g(4)) >> 1 }); }
            continue;
          }
          if (!kind && DOOR_TYPES[tk]) {                     // cave ladders (in the caves) and cave mouths (outside): param 0 = cave
            var cn = rb(N, bk, e + 13), cs = rb(N, bk, e + 14);
            if (cn && (cs === 1 || cs === 2)) out.push({ kind: 'door', cave: cn, side: cs, inCave: tk === 111, x: (g(2) + g(0)) >> 1, y: (g(6) + g(4)) >> 1 });
            continue;
          }
          if (!kind) continue;
          var x = g(2), y = g(6), key = kind + x + ',' + y;
          if (seen[key]) continue; seen[key] = 1;
          var idx = rb(N, bk, e + 13 + (PARAM[kind] || 0)), t = FLAGS[kind] + idx * 2;
          out.push({ kind: kind, n: idx, x: (x + g(0)) >> 1, y: (y + g(4)) >> 1, off: rb(N, 0x11, t), mask: rb(N, 0x11, t + 1) });
        }
      }
    return out;
  }
  var flags = null;
  function collected(o) { return flags && (flags[o.off] & o.mask); }

  // ------------------------------------------------------------------ towns (world.js has the towns; names come from the ROM)
  var labelCache = {};
  /** A town's door names: its label table is n 3-byte far pointers to strings ended by $80 (SHANTAE-RAM.md, "Towns"). */
  function townLabels(N, t) {
    if (labelCache[t.id]) return labelCache[t.id];
    var out = {}, tb = t.labels[0], ta = t.labels[1];
    for (var i = 0; i < 8; i++) {
      var a = rb(N, tb, ta + 3 * i) | rb(N, tb, ta + 3 * i + 1) << 8, b = rb(N, tb, ta + 3 * i + 2), str = '';
      if (a < 0x4000 || a >= 0x8000 || !b) break;
      for (var k = 0; k < 24; k++) { var ch = rb(N, b, a + k); if (ch < 32 || ch > 126) break; str += String.fromCharCode(ch); }
      out[i + 1] = str.toUpperCase();
    }
    return (labelCache[t.id] = out);
  }
  /** Door numbers of a town in order: its buildings plus the gates. */
  function townDoors(t) {
    var ns = Object.keys(t.doors).map(Number).concat([t.gate]);
    return ns.sort(function (a, b) { return a - b; });
  }

  /** Every room header in the ROM: the room code calls 03:7920 (far call $0540) followed by 17 bytes.
   *  Scans banks b0..b1-1 (the first start scans a few banks per poll so the map isn't held up). */
  function scanRooms(N, b0, b1, out) {
    out = out || [];
    for (var b = b0; b < b1; b++) {
      var d = b64(N.rom(b * 0x4000, 0x4000));            // not kept: 4 MB
      if (d.length !== 0x4000) break;
      for (var i = 0; i + 23 < d.length; i++) {
        if (d[i] !== 0xCD || d[i + 1] !== 0x40 || d[i + 2] !== 0x05 || d[i + 3] !== 0x20 || d[i + 4] !== 0x79 || d[i + 5] !== 0x03) continue;
        var h = d.subarray(i + 6, i + 23);
        if (!h[9] && !h[10]) continue;
        out.push({ x: h[0] | h[1] << 8, y: h[2] | h[3] << 8, w: (h[4] | h[5] << 8) + 160, h: (h[6] | h[7] << 8) + 128,
                   th: h[9], tb: h[10], df: h[13] });
      }
    }
    return out;
  }

  /** Map variables: room rectangle $C9E9-$C9F7, region table $C9F9/$C9FA, camera $C9FB/$C9FD, Shantae $CB43/$CB45. */
  function readVars(N) {
    var hex = N.mem('C9E9:22,FFDF:1,CB43:4,C39D:1,CBFD:1,C39A:2');
    if (!hex || hex.length < 2 * 31) return null;
    var v = []; for (var i = 0; i < hex.length; i += 2) v.push(parseInt(hex.substr(i, 2), 16));
    var r = function (o) { return v[o] | v[o + 1] << 8; };       // offsets from $C9E9
    return { x: r(0), y: v[3] | v[4] << 8, w: r(11) + 160, h: r(13) + 128, th: v[16], tb: v[17], camX: r(18), camY: r(20),
             df: v[22], px: v[23] | v[24] << 8, py: v[25] | v[26] << 8, state: v[27], map: v[28], oh: v[29], ob: v[30] };
  }

  // ------------------------------------------------------------------ tiles from a VRAM snapshot
  function Tiles(snap) {
    this.v = snap; this.lcdc = snap[0x4120]; this.cache = {};
    var full = snap.length >= 0x4125 + 96;
    this.pal = [];
    for (var p = 0; p < 8; p++) {
      var cols = [];
      for (var i = 0; i < 4; i++) {
        if (full) { var o = 0x4125 + (p * 4 + i) * 3; cols.push([snap[o], snap[o + 1], snap[o + 2]]); }
        else { var c = snap[0x4000 + p * 8 + i * 2] | snap[0x4000 + p * 8 + i * 2 + 1] << 8;
               cols.push([(c & 31) * 255 / 31 | 0, ((c >> 5) & 31) * 255 / 31 | 0, ((c >> 10) & 31) * 255 / 31 | 0]); }
      }
      this.pal.push(cols);
    }
  }
  /** RGB of tile t (BG number as in the map) with attribute at -> Uint8Array(192). */
  Tiles.prototype.get = function (t, at) {
    var k = t << 8 | at, c = this.cache[k];
    if (c) return c;
    var idx = this.lcdc & 0x10 ? t : (t < 128 ? 256 + t : t), off = (at & 8 ? 0x2000 : 0) + idx * 16, v = this.v, pal = this.pal[at & 7];
    c = new Uint8Array(192);
    for (var y = 0; y < 8; y++) {
      var ry = at & 0x40 ? 7 - y : y, lo = v[off + ry * 2], hi = v[off + ry * 2 + 1];
      for (var x = 0; x < 8; x++) {
        var rx = at & 0x20 ? 7 - x : x, q = ((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1), col = pal[q], o = (y * 8 + x) * 3;
        c[o] = col[0]; c[o + 1] = col[1]; c[o + 2] = col[2];
      }
    }
    return (this.cache[k] = c);
  };

  /** Tile t as 64 RGBA pixels (Uint32, little-endian ABGR) for fast row copies. */
  Tiles.prototype.get32 = function (t, at) {
    var k = 'w' + (t << 8 | at), c = this.cache[k];
    if (c) return c;
    var rgb = this.get(t, at); c = new Uint32Array(64);
    for (var i = 0; i < 64; i++) c[i] = (0xFF000000 | rgb[i * 3 + 2] << 16 | rgb[i * 3 + 1] << 8 | rgb[i * 3]) >>> 0;
    return (this.cache[k] = c);
  };

  /** The 4 tile numbers + 4 attributes of the metatile at world pixel (X, Y) of a region, or null (no screen there). */
  function cellDef(N, R, X, Y) {
    var e = (R.th << 8) + (Y >> 8) * 64 + (X >> 8) * 2;
    if (X < 0 || Y < 0 || (X >> 8) >= 32 || e >= 0x8000) return null;
    var page = rb(N, R.tb, e), bk = rb(N, R.tb, e + 1);
    if (!page || !bk || page < 0x40 || page > 0x7E) return null;
    var a = (page << 8) + ((Y >> 4) & 15) * 32 + ((X >> 4) & 15) * 2, w0 = rb(N, bk, a), w1 = rb(N, bk, a + 1);
    var da = (w1 << 8) | (w0 & 0xF0), db = R.df + (w0 & 15);
    if (da < 0x4000 || da > 0x7FF8) return null;
    var D = bank(N, db), o = da - 0x4000;
    return D.subarray(o, o + 8);
  }

  /** Are the room's tiles the ones in VRAM? Compare the BG map under the camera with the level data. The camera is the
   *  snapshot's own (SCX/SCY are the low bytes of the picture in it): RAM is newer than the snapshot while walking. */
  function selfCheck(N, R, V, snap) {
    var near = function (ram, low) { var d = (ram - low) & 255; if (d >= 128) d -= 256; return ram - d; };
    var cx = near(V.camX, snap[0x4122]), cy = near(V.camY, snap[0x4121]), ok = 0, n = 0;
    for (var Y = cy + 8; Y < cy + 120; Y += 24) for (var X = cx + 8; X < cx + 152; X += 24) {
      var d = cellDef(N, R, X, Y); if (!d) continue;
      var ty = (Y >> 3) & ~1, tx = (X >> 3) & ~1;
      n++; if (snap[0x1800 + (ty & 31) * 32 + (tx & 31)] === d[0]) ok++;
    }
    return n >= 6 && ok >= n * 0.7;
  }

  // ------------------------------------------------------------------ pictures without colours (0.12)
  // A room is drawn once into one byte per pixel (BG palette * 4 + colour, 255 = no screen there) and coloured from that
  // whenever the palette changes: fades, day and night and GBA colours cost a quick recolour, not a redraw. The bytes are
  // kept per room (in memory and, gzipped, in IndexedDB), so a room you've been in shows at once, even after a restart.
  /** Tile t (BG number as in the map) with attribute at -> 64 bytes of palette * 4 + colour. */
  Tiles.prototype.idx = function (t, at) {
    var k = 'i' + (t << 8 | at), c = this.cache[k];
    if (c) return c;
    var n = this.lcdc & 0x10 ? t : (t < 128 ? 256 + t : t), off = (at & 8 ? 0x2000 : 0) + n * 16, v = this.v, pb = (at & 7) * 4;
    (this.used || (this.used = {}))[off] = 1;
    c = new Uint8Array(64);
    for (var y = 0; y < 8; y++) {
      var ry = at & 0x40 ? 7 - y : y, lo = v[off + ry * 2], hi = v[off + ry * 2 + 1];
      for (var x = 0; x < 8; x++) { var rx = at & 0x20 ? 7 - x : x; c[y * 8 + x] = pb + (((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1)); }
    }
    return (this.cache[k] = c);
  };
  /** The 32 BG colours of a snapshot as ABGR (Uint32 pixel order), as the core displays them. */
  function lutOf(snap) {
    if (M._fixedLut) return M._fixedLut;                          // tests: placeholder colours for shareable previews
    var L = new Uint32Array(32), full = snap.length >= 0x4125 + 96;
    for (var i = 0; i < 32; i++) {
      var r, g, b;
      if (full) { var o = 0x4125 + i * 3; r = snap[o]; g = snap[o + 1]; b = snap[o + 2]; }
      else { var c = snap[0x4000 + i * 2] | snap[0x4001 + i * 2] << 8; r = (c & 31) * 255 / 31 | 0; g = ((c >> 5) & 31) * 255 / 31 | 0; b = ((c >> 10) & 31) * 255 / 31 | 0; }
      L[i] = (0xFF000000 | b << 16 | g << 8 | r) >>> 0;
    }
    return L;
  }
  function lutSig(L) { return L ? Array.prototype.join.call(L, ',') : ''; }

  /** Render a rectangle of a region at scale 1 (or 1/2, 1/4 for very big rooms) into palette bytes. Each metatile is
   *  built once as a cs x cs block and copied in row by row. */
  function render(N, R, T, rect) {
    var px = rect.w * rect.h, sh = px > 16e6 ? 2 : px > 4e6 ? 1 : 0, s = 1 << sh, cs = 16 >> sh;
    var W = Math.ceil(rect.w / s), H = Math.ceil(rect.h / s);
    var u = new Uint8Array(W * H), mts = {};
    u.fill(255);
    var x0 = rect.x & ~15, y0 = rect.y & ~15, tb = bank(N, R.tb), th = R.th << 8;
    for (var Y = y0; Y < rect.y + rect.h; Y += 16) {
      var oy = Math.floor((Y - rect.y) / s), ra = Math.max(0, -oy), rb2 = Math.min(cs, H - oy);
      for (var X = x0; X < rect.x + rect.w; X += 16) {
        // cellDef inline: screen table entry -> screen page -> metatile word -> definition (bank, address)
        var e = th + (Y >> 8) * 64 + (X >> 8) * 2;
        if (X < 0 || Y < 0 || (X >> 8) >= 32 || e >= 0x8000) continue;
        var page = tb[e - 0x4000], sb = tb[e - 0x3FFF];
        if (!page || !sb || page < 0x40 || page > 0x7E) continue;
        var SB = bank(N, sb), a = (page << 8) + ((Y >> 4) & 15) * 32 + ((X >> 4) & 15) * 2 - 0x4000, w0 = SB[a], w1 = SB[a + 1];
        var da = (w1 << 8) | (w0 & 0xF0), db = R.df + (w0 & 15);
        if (da < 0x4000 || da > 0x7FF8) continue;
        var mk = db << 16 | da, m = mts[mk];
        if (!m) {                                           // the 2x2 tiles of this metatile, at this scale
          var D = bank(N, db), o = da - 0x4000;
          m = new Uint8Array(cs * cs);
          for (var q = 0; q < 4; q++) {
            var t = T.idx(D[o + q], D[o + 4 + q]), qx = (q & 1) * 8, qy = (q >> 1) * 8;
            for (var yy = 0; yy < 8; yy += s) for (var xx = 0; xx < 8; xx += s) m[((qy + yy) >> sh) * cs + ((qx + xx) >> sh)] = t[yy * 8 + xx];
          }
          mts[mk] = m;
        }
        var ox = Math.floor((X - rect.x) / s), xa = Math.max(0, -ox), xb = Math.min(cs, W - ox);
        for (var r = ra; r < rb2; r++) {
          var dst = (oy + r) * W + ox, src = r * cs;
          for (var c = xa; c < xb; c++) u[dst + c] = m[src + c];
        }
      }
    }
    var tl = Object.keys(T.used || {}).map(Number);
    return { idx: u, W: W, H: H, s: s, rect: rect, tl: tl, th: tileHashes(T.v, tl) };
  }
  // ------------------------------------------------------------------ is VRAM really this room's? (0.13)
  // The BG-map check only compares tile numbers. While a room loads (respawn, a cutscene, a fade) the numbers can match
  // while the tile graphics are blank or another scene's: 0.12 drew and stored such pictures (a flat colour, garbage).
  // Now every picture keeps a hash of each 8x8 tile it used; it is drawn only when those tiles aren't blank and are the
  // same in two snapshots running, and redrawn when most of them change.
  function tileHash(v, off) { var h = 2166136261; for (var i = 0; i < 16; i++) h = Math.imul(h ^ v[off + i], 16777619); return h >>> 0; }
  function tileHashes(v, tl) { var a = new Uint32Array(tl.length); for (var i = 0; i < tl.length; i++) a[i] = tileHash(v, tl[i]); return a; }
  /** Share of a picture's tiles that look the same in this snapshot (1 when it has no record: nothing to compare). */
  function tilesMatch(e, v) {
    if (!e.tl || !e.tl.length) return 0;
    var ok = 0; for (var i = 0; i < e.tl.length; i++) if (tileHash(v, e.tl[i]) === e.th[i]) ok++;
    return ok / e.tl.length;
  }
  /** Most of the tiles one flat colour: the graphics aren't loaded yet. */
  function mostlyBlank(v, tl) {
    if (!tl.length) return true;
    var blank = 0;
    for (var i = 0; i < tl.length; i++) {
      var o = tl[i], a = v[o], b = v[o + 1], same = (a === 0 || a === 255) && (b === 0 || b === 255);
      for (var k = 2; k < 16 && same; k += 2) same = v[o + k] === a && v[o + k + 1] === b;
      if (same) blank++;
    }
    return blank > tl.length * 0.6;
  }
  /** Colour a picture's bytes into its canvas (made on first use). */
  function colourize(im, L) {
    if (!im.cv) {
      im.cv = document.createElement('canvas'); im.cv.width = im.W; im.cv.height = im.H;
      im.id = im.cv.getContext('2d').createImageData(im.W, im.H);
    }
    var u = new Uint32Array(im.id.data.buffer), d = im.idx, n = d.length;
    for (var i = 0; i < n; i++) { var q = d[i]; u[i] = q === 255 ? 0xFF000000 : L[q]; }
    im.cv.getContext('2d').putImageData(im.id, 0, 0);
    im.lsig = lutSig(L);
  }
  function hashBytes(a) { var h = 2166136261; for (var i = 0; i < a.length; i += 7) h = Math.imul(h ^ a[i], 16777619); return (h ^ a.length) >>> 0; }

  // ------------------------------------------------------------------ the picture store: memory (LRU) + IndexedDB
  var mem = {}, memOrder = [], memBytes = 0, MEM_MAX = 40e6, db = null, dbName = '', stored = {}, loading = {};
  function memPut(k, e) {
    if (mem[k]) { memBytes -= mem[k].idx.length; memOrder.splice(memOrder.indexOf(k), 1); }
    mem[k] = e; memOrder.push(k); memBytes += e.idx.length;
    while (memBytes > MEM_MAX && memOrder.length > 2) { var o = memOrder.shift(); memBytes -= mem[o].idx.length; delete mem[o]; }
  }
  function memGet(k) { var e = mem[k]; if (e) { memOrder.splice(memOrder.indexOf(k), 1); memOrder.push(k); } return e || null; }
  // Where IndexedDB isn't available (some WebViews on file:// pages) the pictures go to localStorage instead: gzipped
  // they are small (a 30 x 3-screen room is ~40 KB), and a full store fails quietly.
  var LS = null;
  function useLocalStorage(name) {
    LS = 'sd.map2.' + name.slice(-4) + '.';
    try { for (var j = localStorage.length - 1; j >= 0; j--) { var ok0 = localStorage.key(j); if (ok0 && ok0.indexOf('sd.map.') === 0) localStorage.removeItem(ok0); } } catch (e) {}
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(LS) === 0) stored[k.slice(LS.length)] = 1; } } catch (e) {}
  }
  function openDb(name) {
    if (dbName === name) return;
    dbName = name; db = null; stored = {}; LS = null;
    if (!root.indexedDB || !GZ) { useLocalStorage(name); return; }
    try {
      var rq = indexedDB.open(name, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('maps'); };
      rq.onsuccess = function () {
        db = rq.result;
        try { var k = db.transaction('maps').objectStore('maps').getAllKeys(); k.onsuccess = function () { (k.result || []).forEach(function (x) { stored[x] = 1; }); }; } catch (e) {}
      };
      rq.onerror = function () { useLocalStorage(name); };
    } catch (e) { useLocalStorage(name); }
  }
  function toB64(buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }
  var GZ = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined';
  function dbPut(k, e) {
    if (LS) {
      if (!GZ) return;
      new Response(new Blob([e.idx]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(function (buf) {
        try { localStorage.setItem(LS + k, JSON.stringify({ W: e.W, H: e.H, s: e.s, rect: e.rect, lut: e.lut ? Array.from(e.lut) : null, tl: e.tl, th: Array.from(e.th || []), d: toB64(buf) })); stored[k] = 1; } catch (x) {}
      }, function () {});
      return;
    }
    if (!db) return;
    var put = function (data) {
      try { db.transaction('maps', 'readwrite').objectStore('maps').put({ W: e.W, H: e.H, s: e.s, rect: e.rect, lut: e.lut ? Array.from(e.lut) : null, tl: e.tl, th: Array.from(e.th || []), gz: GZ, data: data }, k); stored[k] = 1; } catch (x) {}
    };
    if (GZ) new Response(new Blob([e.idx]).stream().pipeThrough(new CompressionStream('gzip'))).blob().then(put, function () {});
    else put(e.idx);
  }
  function dbGet(k, cb) {
    if (!(db || LS) || !stored[k] || loading[k]) return false;
    loading[k] = 1;
    var done = function (e) { delete loading[k]; cb(e); };
    if (LS) {
      try {
        var v0 = JSON.parse(localStorage.getItem(LS + k) || 'null');
        if (!v0) { delete stored[k]; done(null); return true; }
        new Response(new Blob([b64(v0.d)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(function (buf) {
          done({ W: v0.W, H: v0.H, s: v0.s, rect: v0.rect, lut: v0.lut ? new Uint32Array(v0.lut) : null, tl: v0.tl || [], th: new Uint32Array(v0.th || []), idx: new Uint8Array(buf) });
        }, function () { done(null); });
      } catch (x) { done(null); }
      return true;
    }
    try {
      var rq = db.transaction('maps').objectStore('maps').get(k);
      rq.onsuccess = function () {
        var v = rq.result; if (!v) return done(null);
        var fin = function (buf) { done({ W: v.W, H: v.H, s: v.s, rect: v.rect, lut: v.lut ? new Uint32Array(v.lut) : null, tl: v.tl || [], th: new Uint32Array(v.th || []), idx: new Uint8Array(buf) }); };
        if (v.gz) new Response(v.data.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(fin, function () { done(null); });
        else fin(v.data.buffer || v.data);
      };
      rq.onerror = function () { done(null); };
    } catch (x) { done(null); }
    return true;
  }
  function picKey(R, r) { return [R.tb, R.th, R.df, r.x, r.y, r.w, r.h].join(','); }

  /** The part of a room the level data actually fills (whole-region rooms are 8192 square). */
  function clampRoom(N, V, r) {
    var R = { tb: V.tb, th: V.th, df: V.df };
    if (r.w < 8000 && r.h < 8000) return r;              // real rooms (the overworld is 30 x 3 screens) stay whole
    var minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (var sy = r.y >> 8; sy < Math.min(32, (r.y + r.h + 255) >> 8); sy++)
      for (var sx = r.x >> 8; sx < Math.min(32, (r.x + r.w + 255) >> 8); sx++)
        if (cellDef(N, R, sx * 256 + 8, sy * 256 + 8)) { minX = Math.min(minX, sx); minY = Math.min(minY, sy); maxX = Math.max(maxX, sx); maxY = Math.max(maxY, sy); }
    if (maxX < 0) return { x: r.x, y: r.y, w: Math.min(r.w, 8192), h: Math.min(r.h, 8192) };   // (camera limits read mid-load can be anything)
    // big open regions: keep a window of at most 8 x 8 screens around Shantae
    var cx = V.px >> 8, cy = V.py >> 8;
    minX = Math.max(minX, cx - 4); maxX = Math.min(maxX, cx + 4); minY = Math.max(minY, cy - 4); maxY = Math.min(maxY, cy + 4);
    return { x: minX * 256, y: minY * 256, w: (maxX - minX + 1) * 256, h: (maxY - minY + 1) * 256 };
  }

  var lutNow = null, lutNowSig = '', lutSince = 0, curPk = '', romKey = '', queue = [], queueRegion = '', lastPrefetch = 0, lastVid = '', pending = null, badN = 0, dbg = '', lastCheck = 0;
  /** The smallest listed room that holds r and is bigger than it (the overworld's areas are parts of one big room). */
  function hostOf(list, r) {
    var host = null;
    list.forEach(function (q) {
      if (r.x >= q.x && r.y >= q.y && r.x + r.w <= q.x + q.w && r.y + r.h <= q.y + q.h && (q.w > r.w + 16 || q.h > r.h + 16) &&
          (!host || q.w * q.h < host.w * host.h)) host = q;
    });
    return host;
  }
  /** Shown picture from a stored one, with what's in the room: objects, the labyrinth exit, the town. */
  function show(N, e, pk, ctx) {
    var V = ctx.V, rm = ctx.rm, rect = e.rect;
    img = { idx: e.idx, W: e.W, H: e.H, s: e.s, rect: rect, key: ctx.key, pk: pk, lut: e.lut, entry: e, cv: null };
    img.mark = ctx.host ? { x: V.x, y: V.y, w: V.w, h: V.h } : null;
    img.objs = roomObjects(N, V, rect);
    if (rm && rm.lab && rm.lab.exit) {                                  // where the labyrinth's way out is
      var ex = rm.lab.exit;
      if (ex[0] >= rect.x && ex[0] < rect.x + rect.w && ex[1] >= rect.y && ex[1] < rect.y + rect.h) img.objs.push({ kind: 'exit', x: ex[0], y: ex[1] - 12 });
    }
    img.town = rm && rm.town ? { t: rm.town, names: townLabels(N, rm.town), doors: townDoors(rm.town), street: ctx.street } : null;
    colourize(img, ctx.lut);
    status = '';
  }
  /** Colours for a picture: the game's own once usable, else the ones it was last seen in (null: none yet, wait). */
  function colours(e, usable) { return usable ? lutNow : e.lut || null; }

  /** Where Shantae and the camera are, from the RAM values. */
  function placeVars(N, V, W, rm, street) {
    if (street) {                                                  // a town street: the camera wraps every 640 px and
      V.w = W.STREET_W;                                            // Shantae always stands in the middle of the screen
      V.camX %= W.STREET_W; V.px = (V.camX + 80) % W.STREET_W; V.py = V.y + 112;
      var dh = N.mem('CBD6:1'); V.door = dh ? parseInt(dh, 16) : 0;  // the door she stands at (0 = none)
    } else { V.px += 26; V.py += 49; }                             // $CB43/$CB45 -> the middle of her sprites, her feet
                                                                   // (checked against OAM in several rooms)
    if (rm && rm.town) V.townDoor = street ? V.door : rm.door;
  }
  /** Between full updates (Shantae Link while moving): just the marker and camera, no VRAM. True when they moved. A room
   *  change or a state that isn't play is left to M.update. */
  M.track = function (N) {
    if (!vars) return false;
    var V = readVars(N);
    if (!V || !V.tb) return false;
    var W = root.ShantaeWorld, rm = W ? W.room(V.tb, V.th, V.x, V.y) : null, street = rm && rm.kind === 'town';
    if (V.state !== 2 && !(street && V.state === 5)) return false;
    placeVars(N, V, W, rm, street);
    if (V.tb !== vars.tb || V.th !== vars.th || V.df !== vars.df || V.x !== vars.x || V.y !== vars.y || V.w !== vars.w || V.h !== vars.h) return false;
    if (V.camX === vars.camX && V.camY === vars.camY && V.px === vars.px && V.py === vars.py && V.door === vars.door) return false;
    vars = V;
    return true;
  };

  M.update = function (N, playing) {
    blink++;
    if (!N || !N.mem || !N.rom || !N.video) { status = 'NO MAP DATA'; return; }
    var V = playing ? readVars(N) : null;
    if (!V || !V.tb) return;
    var W = root.ShantaeWorld, rm = W ? W.room(V.tb, V.th, V.x, V.y) : null, street = rm && rm.kind === 'town';
    if (V.state !== 2 && !(street && V.state === 5)) return;      // menus, dialogue, transitions: keep the last map
    placeVars(N, V, W, rm, street);
    vars = V;
    var fh = N.mem('CB1B:48'); if (fh && fh.length >= 96) { flags = []; for (var q = 0; q < 96; q += 2) flags.push(parseInt(fh.substr(q, 2), 16)); }
    var key = [V.tb, V.th, V.df, V.x, V.y, V.w, V.h].join(','), now = Date.now();
    var snap = b64(N.video());
    if (snap.length < 0x4125) return;
    // the game's colours now, and whether to use them: settled (a fade changes them every few frames), not all dark
    // and not one flat colour (the white flash of a respawn). Otherwise a room keeps the colours it was last seen in.
    var vid = N.video(), snap = b64(vid);
    if (snap.length < 0x4125) return;
    var L = lutOf(snap), ls = lutSig(L);
    if (ls !== lutNowSig) {                     // a fade changes most colours; palette animation (water) only a few
      var nd = 0; if (lutNow) for (var j = 0; j < 32; j++) if (lutNow[j] !== L[j]) nd++;
      if (!lutNow || nd > 6) lutSince = now;
      lutNowSig = ls; lutNow = L;
    }
    var lo = 1e9, hi = 0;
    for (var i = 0; i < 32; i++) { var br = (L[i] & 255) + ((L[i] >> 8) & 255) + ((L[i] >> 16) & 255); lo = Math.min(lo, br); hi = Math.max(hi, br); }
    var usable = hi > 150 && hi - lo > 90 && now - lutSince >= 450;
    dbg = [hi, hi - lo, now - lutSince, usable ? 'U' : '-'].join('/');
    var R = { tb: V.tb, th: V.th, df: V.df };
    cur = R;
    if (!rooms) {
      var hdr = b64(N.rom(0x134, 0x1C)), ck = 'sd.rooms.' + (hdr.length ? (hdr[0x1A] << 8 | hdr[0x1B]).toString(16) : 'x');
      romKey = ck;
      try { rooms = JSON.parse(localStorage.getItem(ck) || 'null'); } catch (e) { rooms = null; }
      if (!rooms) {                                      // first start: read the ROM 16 banks per poll, map meanwhile
        scan = scan || { b: 1, out: [], ck: ck };
        scanRooms(N, scan.b, Math.min(256, scan.b + 16), scan.out); scan.b += 16;
        if (scan.b >= 256) { rooms = scan.out; scan = null; ovKey = '';   // done: redraw with the room list
                             try { localStorage.setItem(ck, JSON.stringify(rooms)); } catch (e) {} }
      }
    }
    if (romKey && !dbName) { try { if (root.indexedDB) indexedDB.deleteDatabase('shantae-maps-' + romKey.slice(9)); } catch (e) {} }   // 0.12's store
    if (romKey) openDb('shantae-maps2-' + romKey.slice(9));
    var list = (rooms || []).filter(function (r) { return r.tb === V.tb && r.th === V.th && r.w < 8000 && r.h < 8000; });
    var seen = {}; list = list.filter(function (r) { var k = r.x + ',' + r.y + ',' + r.w + ',' + r.h; if (seen[k]) return false; seen[k] = 1; return true; });
    if (W && W.alone && W.alone(V.tb, V.th)) list = [];          // story-scene regions: just this room (0.23)
    // The camera limits can be one part of a bigger room (the overworld's areas): then show the whole room, part marked.
    var host = hostOf(list, { x: V.x, y: V.y, w: V.w, h: V.h });
    var rect = clampRoom(N, V, host || { x: V.x, y: V.y, w: V.w, h: V.h }), pk = picKey(R, rect);
    var ctx = { V: V, rm: rm, street: street, host: host, key: key };
    curPk = pk;
    // 1. a room drawn before shows at once (memory, else IndexedDB: arrives a moment later)
    if (!img || img.pk !== pk) {
      var e = memGet(pk);
      badN = 0;
      if (e && (ctx.lut = colours(e, usable))) show(N, e, pk, ctx);
      else if (!e) dbGet(pk, function (e2) {
        if (!e2) return;
        memPut(pk, e2);
        if (curPk === pk && (!img || img.pk !== pk) && (ctx.lut = colours(e2, usable))) show(N, e2, pk, ctx);
      });
    }
    // 2. keep the colours with the game's
    if (img && img.pk === pk) {
      img.mark = host ? { x: V.x, y: V.y, w: V.w, h: V.h } : null;
      var want = colours(img.entry, usable);
      if (want && lutSig(want) !== img.lsig && (img.idx.length < 2e6 || usable)) colourize(img, want);
      if (usable && img.ok && lutSig(img.entry.lut) !== ls) { img.entry.lut = img.lut = L; dbPut(pk, img.entry); }   // remembered for next time
      if (overview && overview.img && want && lutSig(want) !== overview.img.lsig) colourize(overview.img, want);
    }
    // 3. the live tiles. A picture is drawn only from settled colours and loaded graphics, kept when the same tiles show in
    //    the next snapshot, and redrawn when most of its tiles no longer match VRAM (it was drawn from the wrong graphics)
    if (!selfCheck(N, R, V, snap)) { if (!img || img.pk !== pk) status = 'READING THE MAP...'; return; }
    var have = img && img.pk === pk && !img.part;
    if (have && usable && now - lastCheck >= 300) {                 // (time, not a new snapshot: a still screen sends the same one)
      lastCheck = now;
      if (tilesMatch(img.entry, snap) >= 0.8) { img.ok = true; badN = 0; } else badN++;
    }
    if (!have || !img.entry.tl || !img.entry.tl.length || badN >= 2) {
      if (!usable) { if (!img || img.pk !== pk) status = 'READING THE MAP...'; return; }
      if (pending && pending.pk === pk) {
        if (now - pending.t < 150) return;
        var pe = pending.e; pending = null;
        if (tilesMatch(pe, snap) < 0.9) return;                        // still loading: draw again next poll
        pe.lut = L; memPut(pk, pe); dbPut(pk, pe); badN = 0;
        ctx.lut = L; show(N, pe, pk, ctx); img.ok = true;
        return;
      }
      var T0 = new Tiles(snap);
      if (!have && !(img && img.pk === pk) && rect.w * rect.h > 1.5e6) {   // big new room: the screens around the camera first
        var px0 = Math.max(rect.x, (V.camX - 512) & ~15), py0 = Math.max(rect.y, (V.camY - 384) & ~15);
        var part = render(N, R, T0, { x: px0, y: py0, w: Math.min(rect.x + rect.w, V.camX + 672) - px0, h: Math.min(rect.y + rect.h, V.camY + 512) - py0 });
        if (mostlyBlank(snap, part.tl)) return;
        part.lut = null; ctx.lut = L; show(N, part, pk, ctx); img.part = true;
        return;
      }
      var fresh = render(N, R, new Tiles(snap), rect);
      if (!mostlyBlank(snap, fresh.tl)) pending = { pk: pk, e: fresh, t: now };
      return;                                                         // one drawing per poll
    }
    if (!img.ok || !usable) return;
    // 4. spare polls: the region's overview and its other rooms, while its tiles are in VRAM
    var T = new Tiles(snap);
    var region = [V.tb, V.th].join(',');
    if (ovKey !== region) {
      ovKey = region;
      overview = !host && list.length >= 3 && !(rm && rm.town) ? { rooms: list, img: null, show: true } : null;
      queue = []; queueRegion = region;
      var pks = {};
      pks[pk] = 1;
      list.forEach(function (r) {
        var h = hostOf(list, r), rr = h || r, k2 = picKey(R, rr);
        if (!pks[k2]) { pks[k2] = 1; queue.push(rr); }
      });
    }
    if (overview && overview.show && !overview.img) {
      var bx = 1e9, by = 1e9, ex = 0, ey = 0;
      overview.rooms.forEach(function (r) { bx = Math.min(bx, r.x); by = Math.min(by, r.y); ex = Math.max(ex, r.x + r.w); ey = Math.max(ey, r.y + r.h); });
      var area = { x: bx & ~255, y: by & ~255, w: ((ex + 255) & ~255) - (bx & ~255), h: ((ey + 255) & ~255) - (by & ~255) }, ok = 'ov:' + picKey(R, area);
      var oe = memGet(ok);
      if (!oe && !dbGet(ok, function (e3) { if (e3) memPut(ok, e3); }) && !loading[ok] && !stored[ok]) {
        oe = render(N, R, T, area); oe.lut = L; memPut(ok, oe); dbPut(ok, oe);
      }
      if (oe) { overview.img = { idx: oe.idx, W: oe.W, H: oe.H, s: oe.s, rect: oe.rect, cv: null }; colourize(overview.img, colours(img.entry, usable) || L); }
      return;
    }
    if (queueRegion === region && queue.length && now - lastPrefetch > 300) {
      var r = queue.shift(), k3 = picKey(R, r);
      if (!memGet(k3) && !stored[k3]) { var pre = render(N, R, T, r); pre.lut = L; memPut(k3, pre); dbPut(k3, pre); lastPrefetch = now; }
    }
  };
  /** The place's name for the panel title (room, town building, or a size when unnamed). */
  M.title = function () {
    if (!vars) return '';
    var room = root.ShantaeWorld ? ShantaeWorld.room(vars.tb, vars.th, vars.x, vars.y) : null;
    if (room && room.kind === 'building' && img && img.town) return room.name + ': ' + (img.town.names[room.door] || 'DOOR ' + room.door);
    return room ? room.name : '';
  };
  // ------------------------------------------------------------------ drawing
  /** The part of the room to show in a bw x bh box. Levels (0.13): x1 fills the pane and follows the game camera (never
   *  closer than one game screen), x2 twice as close, ALL at the x1 scale but staying where you drag it. Any view can
   *  be dragged; x1 and x2 drift back to the camera a few seconds after you let go. Never folded into rows. */
  var viewX = null, viewY = null, zoom = 1, panX = 0, panY = 0, panAt = 0, allC = null, allKey = '', lastS = 1;
  try { var zs = localStorage.getItem('sd.mapZoom'); zoom = zs === null ? 1 : +zs; if ([0, 1, 2].indexOf(zoom) < 0) zoom = 1; } catch (e) {}
  /** Tap on the map: x1 -> x2 -> ALL -> x1 (closer views show collectibles as the game's own icons). */
  M.zoom = function () { zoom = zoom === 1 ? 2 : zoom === 2 ? 0 : 1; viewX = null; panX = panY = 0; allC = null; try { localStorage.setItem('sd.mapZoom', zoom); } catch (e) {} };
  M.zoomLevel = function () { return zoom; };
  M._view = function () { return [viewX, viewY, zoom, allC, panX, panY, lastS]; };   // tests
  /** Drag on the map by (dx, dy) page pixels. */
  M.pan = function (dx, dy) {
    var w = dx / lastS, h = dy / lastS;
    if (zoom === 0 && allC) { allC[0] -= w; allC[1] -= h; } else { panX -= w; panY -= h; panAt = Date.now(); }
    viewX = null;
  };
  function viewport(rect, bw, bh, whole) {
    var zW = bw / rect.w, zH = bh / rect.h, zFit = Math.min(zW, zH), z = zFit;
    if (!whole) {
      var zFill = Math.max(zFit, Math.min(Math.max(zW, zH), bw / 160, bh / 128));   // at least one game screen in view
      z = zoom === 2 ? Math.min(zFill * 2, Math.max(zFill, bw / 100)) : zFill;
    }
    lastS = z;
    var vw = Math.min(rect.w, bw / z), vh = Math.min(rect.h, bh / z);
    var cx = vars ? vars.camX + 80 : rect.x + rect.w / 2, cy = vars ? vars.camY + 64 : rect.y + rect.h / 2, held = false;
    var rk = [rect.x, rect.y, rect.w, rect.h].join(',');
    if (zoom === 0) {                                               // ALL: stays where it was dragged (starts at the camera)
      if (!allC || allKey !== rk) { allC = [cx, cy]; allKey = rk; }
      allC[0] = Math.max(rect.x + vw / 2, Math.min(rect.x + rect.w - vw / 2, allC[0]));
      allC[1] = Math.max(rect.y + vh / 2, Math.min(rect.y + rect.h - vh / 2, allC[1]));
      cx = allC[0]; cy = allC[1]; held = true;
    } else if (panX || panY) {
      if (Date.now() - panAt > 4000) { panX *= 0.6; panY *= 0.6; if (Math.abs(panX) + Math.abs(panY) < 4) panX = panY = 0; }
      else held = true;
      cx += panX; cy += panY;
    }
    var x0 = Math.max(rect.x, Math.min(rect.x + rect.w - vw, cx - vw / 2)), y0 = Math.max(rect.y, Math.min(rect.y + rect.h - vh, cy - vh / 2));
    if (zoom !== 0 && held && vars) { panX = x0 + vw / 2 - (vars.camX + 80); panY = y0 + vh / 2 - (vars.camY + 64); }   // no drag past the room's edge
    // glide toward the target instead of jumping a whole step every poll (not while it's being dragged)
    if (!held && viewX !== null && Math.abs(viewX - x0) < vw && Math.abs(viewY - y0) < vh) { x0 = viewX + (x0 - viewX) * 0.5; y0 = viewY + (y0 - viewY) * 0.5; }
    viewX = x0; viewY = y0;
    return { k: 1, s: z, x0: x0, y0: y0, vw: vw, vh: vh, seg: vw };
  }
  function blit(ctx, im, L, bx, by) {
    var s = im.s, r = im.rect;
    ctx.drawImage(im.cv, (L.x0 - r.x) / s, (L.y0 - r.y) / s, L.vw / s, L.vh / s, bx, by, Math.round(L.vw * L.s), Math.round(L.vh * L.s));
  }
  /** World point -> screen point under viewport L. */
  function place(L, rect, bx, by, X, Y) { return [bx + (X - L.x0) * L.s, by + (Y - L.y0) * L.s]; }

  /** Draws the map into pane p; icon(key) -> 16 px canvas or null (squid, firefly, tal0-3, heart).
   *  Returns the map's box {x, y, w, h} so the page can make it tappable. */
  M.draw = function (ctx, p, gfx, C, icon) {
    G = gfx;
    if (!img) {
      G.textC(ctx, status || 'WAITING FOR THE GAME', p.x + p.w / 2, p.y + p.h / 2 - 4, C.grey);
      return { box: null, side: sideButtons(ctx, p, p.y, C, null) };
    }
    var smooth = ctx.imageSmoothingEnabled;
    var topH = p.h;                                                       // 0.12: the map has the whole pane; text is on cards
    var street = false;                                                   // (0.12's whole-street view is gone: every level scrolls)
    var scroll = true;                                                    // room for the position bar under a scrolling view
    var L = viewport(img.rect, p.w, topH - (scroll ? 5 : 0), street);   // town streets wrap: whole in the ALL view
    var big = L.s >= 0.9;                                                 // close enough: collectibles as the game's own icons
    var mw = Math.round(L.vw * L.s), mh = Math.round(L.vh * L.s);
    var bx = Math.round(p.x + (p.w - mw) / 2), by = p.y;
    ctx.imageSmoothingEnabled = L.s < 1;
    blit(ctx, img, L, bx, by);
    ctx.imageSmoothingEnabled = smooth;
    if (L.vw < img.rect.w - 1 || L.vh < img.rect.h - 1) {              // where this strip is in the whole room
      var tw = mw, fx = (L.x0 - img.rect.x) / img.rect.w, fw = L.vw / img.rect.w;
      ctx.fillStyle = '#2a1838'; ctx.fillRect(bx, by + mh + 2, tw, 2);
      ctx.fillStyle = C.gold; ctx.fillRect(bx + Math.round(fx * tw), by + mh + 2, Math.max(2, Math.round(fw * tw)), 2);
      if (L.vh < img.rect.h - 1) { var fy = (L.y0 - img.rect.y) / img.rect.h; ctx.fillStyle = '#2a1838'; ctx.fillRect(bx + mw + 2, by, 2, mh);
        ctx.fillStyle = C.gold; ctx.fillRect(bx + mw + 2, by + Math.round(fy * mh), 2, Math.max(2, Math.round(L.vh / img.rect.h * mh))); }
      mh += 5;
    }
    var mapBox = { x: bx, y: by, w: mw, h: Math.round(L.vh * L.s) };
    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, mw, Math.round(L.vh * L.s)); ctx.clip();   // markers stay inside the map
    if (img.mark) {                                                     // this area's part of the bigger room
      var m = img.mark, a0 = place(L, img.rect, bx, by, m.x, m.y), a1 = place(L, img.rect, bx, by, m.x + m.w - 1, m.y + m.h - 1);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1;
      if (Math.abs(a1[1] - a0[1] - m.h * L.s) < 2) ctx.strokeRect(Math.round(a0[0]) + 0.5, Math.round(a0[1]) + 0.5, Math.round(a1[0] - a0[0]), Math.round(a1[1] - a0[1]));
      else { ctx.fillStyle = 'rgba(248,192,72,0.25)'; ctx.fillRect(Math.round(a0[0]), Math.round(a0[1]), Math.round(m.w * L.s), Math.round(m.h * L.s)); }
    }
    var left = { heart: 0, fly: 0, tal: 0, squid: 0 };
    var TD = img.town && vars && vars.townDoor;
    (img.objs || []).forEach(function (o) {
      if (o.kind === 'genie' || o.kind === 'exit') {                    // labyrinth landmarks: G = Guardian Genie, EXIT = way out
        var lq = place(L, img.rect, bx, by, o.x, o.y), lt = o.kind === 'genie' ? 'G' : 'EXIT', ly = Math.round(lq[1]) - 4;
        var lx = Math.max(bx + 2, Math.min(bx + mw - lt.length * 8 - 2, Math.round(lq[0]) - lt.length * 4));   // keep the tag in view
        ctx.fillStyle = '#000'; ctx.fillRect(lx - 2, ly - 2, lt.length * 8 + 4, 12);
        G.text(ctx, lt, lx, ly, o.kind === 'genie' ? C.gold : C.teal);
        return;
      }
      if (o.kind === 'tdoor') {                                         // numbered badge over each door of the street
        var tq = place(L, img.rect, bx, by, o.x, o.y), lb = String(o.n), tx = Math.round(tq[0]) - lb.length * 4, tyy = Math.round(tq[1]) - 24;
        var on = TD === o.n, gate = img.town && o.n === img.town.t.gate;
        ctx.fillStyle = on ? C.gold : '#000'; ctx.fillRect(tx - 2, tyy - 2, lb.length * 8 + 4, 12);
        G.text(ctx, lb, tx, tyy, on ? '#000' : gate ? C.teal : C.white);
        return;
      }
      if (o.kind === 'door') {
        var dq = place(L, img.rect, bx, by, o.x, o.y), dx = Math.round(dq[0]) - 4, dy = Math.round(dq[1]) - 8;
        var lab = o.inCave ? String(o.side) : String(o.cave);
        ctx.fillStyle = '#000'; ctx.fillRect(dx - 1, dy - 1, lab.length * 8 + 2, 10);
        G.text(ctx, lab, dx, dy, C.teal);
        return;
      }
      var got = collected(o), q = place(L, img.rect, bx, by, o.x, o.y), x = Math.round(q[0]) - 4, y = Math.round(q[1]) - 4;
      if (!got) left[o.kind]++;
      var ic = big && icon ? icon(o.kind === 'fly' ? 'firefly' : o.kind === 'tal' ? 'tal' + Math.max(0, o.n - 1) : o.kind) : null;
      if (ic || (big && o.kind === 'heart')) {                          // zoomed in: 16 px, the inventory's own icon
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 5, y - 5, 18, 18);
        ctx.globalAlpha = got ? 0.35 : o.kind === 'fly' && !night ? 0.5 : 1;
        if (ic) ctx.drawImage(ic, x - 4, y - 4, 16, 16);
        else G.glyph(ctx, got ? G.ICON.HEART0 : G.ICON.HEART, x - 4, y - 4, got ? C.grey : C.heart, got ? '#000' : '#fff', 2);
        ctx.globalAlpha = 1;
        if (!got && (blink >> 3) % 2) { ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(x - 5.5, y - 5.5, 19, 19); }
        return;
      }
      if (o.kind === 'heart') G.glyph(ctx, got ? G.ICON.HEART0 : G.ICON.HEART, x, y, got ? C.grey : C.heart, got ? '#000' : '#fff');
      else if (o.kind === 'fly') { if (!night && !got) ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; ctx.fillRect(x + 1, y + 1, 6, 6); ctx.fillStyle = got ? C.grey : '#f8f080'; ctx.fillRect(x + 2, y + 2, 4, 4); if (!got && night && (blink >> 3) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 3, y + 3, 2, 2); } ctx.globalAlpha = 1; }
      else if (o.kind === 'squid') { ctx.fillStyle = '#000'; ctx.fillRect(x + 1, y, 6, 8); ctx.fillStyle = got ? C.grey : C.teal; ctx.fillRect(x + 2, y + 1, 4, 4); ctx.fillRect(x + 2, y + 5, 1, 2); ctx.fillRect(x + 5, y + 5, 1, 2); }
      else G.glyph(ctx, got ? G.ICON.STAR0 : G.ICON.STAR, x, y, got ? C.grey : C.gold, '#000');
    });
    img.left = left;
    if (vars) {
      var cam = place(L, img.rect, bx, by, vars.camX, vars.camY);         // what the game screen shows
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      var cw = Math.max(3, Math.round(160 * L.s)), chh = Math.max(3, Math.round(128 * L.s));
      if (street) {                                                     // the street wraps: the box can run off the right end
        var right = bx + Math.round(img.rect.w * L.s), cx0 = Math.round(cam[0]);
        ctx.save(); ctx.beginPath(); ctx.rect(bx, by, right - bx, Math.round(img.rect.h * L.s)); ctx.clip();
        var cy0 = by, sh = Math.round(img.rect.h * L.s) - 1;              // the street is one screen high: box its full height
        ctx.strokeRect(cx0 + 0.5, cy0 + 0.5, cw, sh);
        if (cx0 + cw > right) ctx.strokeRect(cx0 - (right - bx) + 0.5, cy0 + 0.5, cw, sh);
        ctx.restore();
      } else ctx.strokeRect(Math.round(cam[0]) + 0.5, Math.round(cam[1]) + 0.5, cw, chh);
      var sp = place(L, img.rect, bx, by, vars.px, vars.py - 12), r = Math.max(2, Math.round(3 * Math.min(1, L.s * 4)));
      if ((blink >> 2) % 2 === 0) { ctx.fillStyle = '#000'; ctx.fillRect(Math.round(sp[0]) - r - 1, Math.round(sp[1]) - r - 1, 2 * r + 2, 2 * r + 2); }
      ctx.fillStyle = (blink >> 2) % 2 ? C.heart : '#fff'; ctx.fillRect(Math.round(sp[0]) - r, Math.round(sp[1]) - r, 2 * r, 2 * r);
    }
    ctx.restore();
    {                                                                   // zoom tag in the map's corner
      var zt = zoom ? 'x' + zoom : 'ALL'; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx + mw - zt.length * 8 - 4, by, zt.length * 8 + 4, 11);
      G.text(ctx, zt, bx + mw - zt.length * 8 - 2, by + 2, C.gold);
    }
    var room = vars && root.ShantaeWorld ? ShantaeWorld.room(vars.tb, vars.th, vars.x, vars.y) : null;
    if (img.pk !== curPk) {                                              // a new room on its first visit: being read
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, mw, mapBox.h);
      G.textC(ctx, status || 'READING THE MAP...', bx + mw / 2, by + Math.round(mapBox.h / 2) - 4, C.lgrey);
    }
    var side = sideButtons(ctx, p, by, C, room);
    var cardBox = card ? drawCard(ctx, p, by, mapBox, C, room, icon) : null;
    return { box: mapBox, side: side, card: cardBox };
  };

  // ------------------------------------------------------------------ side buttons and pop-up cards (0.12)
  // Like Xenogears Link: small buttons down the map's left edge, each with an icon and a count; tapping one opens a card
  // over the map with the details (where the room leads, the town's doors, what's here to collect, all rooms of a
  // labyrinth); tapping the card or the button again closes it. The map keeps the whole pane.
  var card = '';
  M.card = function (k) { card = card === k ? '' : k; };
  var night = false, nightLeft = 0;                                    // set by the page each tick (0.20 night notes)
  M.setNight = function (n, left) { night = !!n; nightLeft = left; };
  M.cardOpen = function () { return card; };
  function counts() {
    var c = { heart: [0, 0], fly: [0, 0], squid: [0, 0], tal: [0, 0] };
    (img && img.pk === curPk ? img.objs || [] : []).forEach(function (o) { if (c[o.kind]) { c[o.kind][1]++; if (collected(o)) c[o.kind][0]++; } });
    return c;
  }
  function wayList(room) {
    var out = room && root.ShantaeWorld ? ShantaeWorld.links(room).map(function (l) { return [l[0], l[1]]; }) : [];
    (img && img.pk === curPk ? img.objs || [] : []).forEach(function (o) { if (o.kind === 'genie') out.push(['G', 'GUARDIAN GENIE']); });
    return out;
  }
  function sideButtons(ctx, p, y0, C, room) {
    var bs = [], cnt = counts(), left = 0, total = 0;
    ['heart', 'fly', 'squid', 'tal'].forEach(function (k) { total += cnt[k][1]; left += cnt[k][1] - cnt[k][0]; });
    var ways = wayList(room).length;
    if (ways) bs.push(['ways', String(ways)]);
    if (img && img.town && img.pk === curPk) bs.push(['doors', String(img.town.doors.length)]);
    if (total) bs.push(['items', left ? String(left) : 'OK']);
    if (overview && overview.show && overview.img && img && img.pk === curPk) bs.push(['rooms', String(overview.rooms.length)]);
    // 0.24: the night card opens from the dusk/dawn timer in the panel title (link.js), not a side button
    bs.push(['signs', '']);
    var out = [], y = y0 + 2, x = p.x + 1, w = 34;                     // 0.13: bigger, easier to see and tap
    bs.forEach(function (b) {
      var h = b[1] ? 32 : 22, on = card === b[0];
      ctx.fillStyle = on ? 'rgba(90,42,120,0.95)' : 'rgba(12,4,24,0.9)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = on ? C.gold : '#9a7ab8'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      sideIcon(ctx, b[0], x + 9, y + 3, C, on);
      if (b[1]) G.textC(ctx, b[1], x + w / 2, y + 22, b[1] === 'OK' ? C.green : b[0] === 'night' ? C.purple : C.white);
      out.push({ x: x, y: y, w: w, h: h, key: b[0] });
      y += h + 3;
    });
    return out;
  }
  /** 8x8 icons drawn here (no game art): ways = arrow, doors = door, items = heart, rooms = grid, signs = signpost. */
  function sideIcon(ctx, k, x, y, C, on) {                          // drawn at 2x (16 px)
    var f = function (c, a, b, w, h) { ctx.fillStyle = c; ctx.fillRect(x + a * 2, y + b * 2, w * 2, h * 2); };
    if (k === 'ways') { f(C.teal, 0, 3, 5, 2); f(C.teal, 4, 1, 1, 6); f(C.teal, 5, 2, 1, 4); f(C.teal, 6, 3, 1, 2); }
    else if (k === 'doors') { f(C.gold, 1, 0, 6, 8); f('#3a1858', 2, 1, 4, 7); f(C.gold, 4, 4, 1, 1); }
    else if (k === 'items') G.glyph(ctx, G.ICON.HEART, x, y, C.heart, '#fff', 2);
    else if (k === 'rooms') { f(C.lgrey, 0, 0, 3, 3); f(C.lgrey, 4, 0, 4, 3); f(C.gold, 0, 4, 4, 4); f(C.lgrey, 5, 4, 3, 4); }
    else if (k === 'signs') { f('#a07040', 3, 3, 2, 5); f(on ? C.gold : C.ink, 0, 0, 8, 4); f('#3a1858', 1, 1, 6, 1); }
    else if (k === 'night') {                                       // crescent moon
      var col = night ? '#f8f0c0' : C.lgrey;
      ['..####..', '.###....', '###.....', '###.....', '###.....', '###.....', '.###....', '..####..'].forEach(function (r, j) {
        for (var i = 0; i < 8; i++) if (r[i] === '#') f(col, i, j, 1, 1); });
    }
  }
  var NAMES = { heart: 'HEART HOLDER', fly: 'FIREFLY', squid: 'BABY SQUID', tal: 'TALISMAN' };
  /** The open card over the map, sized to its rows (cut at the map's bottom). Returns its box for the close tap. */
  function drawCard(ctx, p, y0, box, C, room, icon) {
    var x = p.x + 38, w = Math.min(p.w - 40, 216), rows = [], title = '', pic = null;
    var maxc = Math.floor((w - 12) / 8);
    var cut = function (t, n) { return t.length > n ? t.substr(0, n - 1) + '.' : t; };
    if (card === 'ways') {
      title = 'THIS PLACE LEADS TO';
      wayList(room).forEach(function (l) {
        var tag = l[0];
        rows.push({ segs: [[tag, C.teal], [' ' + cut(l[1], maxc - tag.length - 1), C.white]] });
      });
      if (!rows.length) rows.push({ segs: [['NOTHING KNOWN', C.grey]] });
    } else if (card === 'doors' && img.town) {
      var T = img.town, curD = vars ? vars.townDoor : 0;
      title = T.street ? 'DOORS ON THIS STREET' : 'DOORS IN TOWN';
      T.doors.forEach(function (d) {
        var on = d === curD, gate = d === T.t.gate, nm = T.names[d] || ('DOOR ' + d);
        rows.push({ segs: [[(d < 10 ? ' ' : '') + d, on ? C.gold : gate ? C.teal : C.lgrey], [' ' + cut(nm, maxc - 3), on ? C.gold : gate ? C.teal : C.white]], hi: on });
      });
      if (T.t.gate) rows.push({ segs: [['TEAL = THE WAY OUT', C.teal]] });
    } else if (card === 'items') {
      title = 'TO COLLECT HERE';
      var cnt = counts();
      ['heart', 'fly', 'squid', 'tal'].forEach(function (k) {
        var c = cnt[k]; if (!c[1]) return;
        var all = c[0] === c[1], txt = all ? 'ALL GOT' : (c[1] - c[0]) + ' LEFT';
        rows.push({ segs: [[cut(NAMES[k] + (c[1] > 1 ? ' x' + c[1] : ''), maxc - 9), all ? C.grey : C.white], [txt, all ? C.green : C.gold, 'R']] });
        if (k === 'fly' && !all) {                                    // 0.25: fireflies only come out at night
          var mm2 = Math.max(0, Math.round(nightLeft / 59.7275)), t2 = Math.floor(mm2 / 60) + ':' + (mm2 % 60 < 10 ? '0' : '') + (mm2 % 60);
          rows.push(night ? { segs: [[' NIGHT ONLY: OUT NOW', C.gold]] }
                          : { segs: [[' NIGHT ONLY: IN ', C.purple], [t2, C.lgrey]] });
        }
      });
      if (!rows.length) { card = ''; return null; }
      rows.push({ segs: [['BLINKING ON THE MAP', C.grey]] });
    } else if (card === 'night') {
      var fl = counts().fly, flLeft = fl[1] - fl[0], mm = Math.max(0, Math.round(nightLeft / 59.7275));
      var when = Math.floor(mm / 60) + ':' + (mm % 60 < 10 ? '0' : '') + (mm % 60);
      title = night ? 'IT IS NIGHT' : 'IT IS DAY';
      rows.push({ segs: [[night ? 'DAWN IN ' : 'NIGHT IN ', C.lgrey], [when, night ? C.gold : C.purple]] });
      rows.push({ segs: [[night ? 'ENEMIES HAVE DOUBLE HEALTH' : 'AT NIGHT ENEMIES HAVE', night ? C.red : C.white]] });
      if (!night) rows.push({ segs: [['DOUBLE HEALTH', C.white]] });
      if (fl[1]) rows.push({ segs: [[flLeft ? (night ? 'FIREFLIES OUT HERE: ' : 'FIREFLIES HERE AT NIGHT: ') + flLeft : 'ALL FIREFLIES HERE GOT', flLeft ? C.ink : C.green]] });
      else rows.push({ segs: [['NO FIREFLIES IN THIS AREA', C.grey]] });
      rows.push({ segs: [['THE ZOMBIE CARAVAN ONLY', C.lgrey]] });
      rows.push({ segs: [['APPEARS AT NIGHT', C.lgrey]] });
      if (!night && flLeft) rows.push({ segs: [['FIREFLIES DIM ON THE MAP', C.grey]] });
    } else if (card === 'rooms' && overview && overview.img) {
      title = 'ALL ROOMS HERE';
      pic = overview;
    } else { card = ''; return null; }
    var rh = 10, ph = 0;
    if (pic) { var O = pic.img, sc = Math.min((w - 8) / O.rect.w, (box.h - 22) / O.rect.h); ph = Math.max(10, Math.round(O.rect.h * sc)); }
    var h = Math.min(box.h - 4, 16 + rows.length * rh + (pic ? ph + 4 : 0) + 4), y = y0 + 2;
    ctx.fillStyle = 'rgba(12,4,24,0.94)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = C.dpurple || '#3a1858'; ctx.fillRect(x + 1, y + 1, w - 2, 12);
    G.text(ctx, cut(title, maxc), x + 6, y + 3, C.gold);
    var ry = y + 17;
    rows.forEach(function (r) {
      if (ry + 8 > y + h - 2) return;
      if (r.hi) { ctx.fillStyle = 'rgba(248,192,72,0.18)'; ctx.fillRect(x + 2, ry - 1, w - 4, 10); }
      var cx = x + 6;
      r.segs.forEach(function (seg) {
        if (seg[2] === 'R') { G.text(ctx, seg[0], x + w - 6 - seg[0].length * 8, ry, seg[1]); return; }
        if (seg[0]) G.text(ctx, seg[0], cx, ry, seg[1]); cx += seg[0].length * 8;
      });
      ry += rh;
    });
    if (pic) {                                                          // the region's rooms, the one she's in lit
      var Ov = pic.img, s2 = Math.min((w - 8) / Ov.rect.w, ph / Ov.rect.h), ow = Math.round(Ov.rect.w * s2), oh = Math.round(Ov.rect.h * s2);
      var ox = Math.round(x + (w - ow) / 2), oy = ry, sm = ctx.imageSmoothingEnabled;
      ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, ow, oh);
      ctx.imageSmoothingEnabled = true;
      // only the rooms themselves (0.14): the space between them stays black; other rooms dimmed, hers at full brightness
      var rbox = function (r, on) {
        var rx = ox + (r.x - Ov.rect.x) * s2, ryy = oy + (r.y - Ov.rect.y) * s2;
        ctx.globalAlpha = on ? 1 : 0.55;
        ctx.drawImage(Ov.cv, (r.x - Ov.rect.x) / Ov.s, (r.y - Ov.rect.y) / Ov.s, r.w / Ov.s, r.h / Ov.s, rx, ryy, r.w * s2, r.h * s2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = on ? C.gold : 'rgba(200,184,216,0.5)';
        ctx.strokeRect(Math.round(rx) + 0.5, Math.round(ryy) + 0.5, Math.max(2, Math.round(r.w * s2) - 1), Math.max(2, Math.round(r.h * s2) - 1));
      };
      pic.rooms.forEach(function (r) { rbox(r, false); });
      if (vars) rbox({ x: vars.x, y: vars.y, w: vars.w, h: vars.h }, true);
      ctx.imageSmoothingEnabled = sm;
      if (vars) { var dx = ox + (vars.px - Ov.rect.x) * s2, dy = oy + (vars.py - 12 - Ov.rect.y) * s2; ctx.fillStyle = (blink >> 2) % 2 ? C.heart : '#fff'; ctx.fillRect(Math.round(dx) - 1, Math.round(dy) - 1, 3, 3); }
    }
    return { x: x, y: y, w: w, h: h };
  }
  M.reset = function () { banks = {}; rooms = null; scan = null; img = null; overview = null; ovKey = ''; vars = null; curPk = ''; partKey = '';
                          mem = {}; memOrder = []; memBytes = 0; queue = []; pending = null; badN = 0; lastVid = ''; };
  M._Tiles = Tiles;
  M._info = function () { return { pk: img ? img.pk : '', cur: curPk, part: partKey, full: !!(img && img.ok && img.pk === curPk), lut: img ? (img.lsig || '').split(',').slice(0, 2).join(',') : '', status: status, pend: pending ? pending.pk.slice(-12) : '', bad: badN, dbg: dbg, mem: memOrder.length, stored: Object.keys(stored).length, queue: queue.length }; };   // tests
  M._bench = function (N, cold) {                                // tests: time a re-render of the current room
    if (!img || !cur) return null; if (cold) banks = {}; var t0 = performance.now(), T = new Tiles(b64(N.video())); render(N, cur, T, img.rect); return performance.now() - t0;
  };                                       // tests swap in placeholder tiles for shareable previews
  root.ShantaeMap = M;
})(this);
