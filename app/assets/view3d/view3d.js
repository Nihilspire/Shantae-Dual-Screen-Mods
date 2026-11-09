/* view3d.js - the playtest 3D view (PLAYTEST CODES > 3D VIEW), drawn over the game picture on the main screen.
 *
 * Every emulated frame the host hands over a few RAM variables and the video snapshot (VRAM, palettes, OAM, LCD
 * registers, displayed colours: the Native.video layout). The room's layout and per-tile collision come from the
 * player's ROM (SHANTAE-RAM.md, "Level data": metatile definition bytes 0-3 tiles, 4-7 CGB attributes, 8-11 the
 * collision codes of its four 8x8 tiles). From that:
 *   solid cells (02, pit floors 2C, under-ramp 3A/3C)   blocks, 48 deep
 *   slopes (04 06 36 38 at 45 degrees, 0C 0E 10 12 shallow, ceilings 08 0A)   the same blocks, cut to the slope
 *   one-way tops (2E)                   boxes 28 deep, filled down to what holds them up (crates); loose ones are a thin
 *                                       box in open air, and just scenery among leaves (a tree's branches)
 *   climbable (64, 6C)                  boxes 16 deep: trunks, pillars, recesses in a wall
 *   hazards (6E cactus, 70 icicles)     cut-out cards (colour 0 of the tile is see-through), the tile's backdrop on the wall
 *   everything else, invisible walls (62, solid cells drawn in a background tile, the columns at a big room's ends)
 *                                       a back wall; pixels in the sky colour are left to the clear colour
 *   sprites                             one plane just in front of the boxes, with any tile the game has drawn into
 *                                       the BG map itself that isn't in the level data (rocks, opened blocks)
 *   towns (no collision at all)         the wall and a floor in front of it
 *   status bar (window layer)           flat over the picture, where it is in the 2D game
 * Whenever the screen isn't a level room (menus, maps, the title, a fade) the page hides and the 2D game shows.
 *
 *   window.V3   frame(seenSeq) -> "seq|vars hex|video base64" or "" (no new frame), rom(off, len), cam(), setCam(name)
 */
(function () {
  'use strict';
  var N = window.V3;
  var cv = document.getElementById('c'), hudCv = document.getElementById('hud'), lab = document.getElementById('lab');
  var hud = hudCv.getContext('2d'), hudImg = hud.createImageData(160, 144), hud32 = new Uint32Array(hudImg.data.buffer);
  var gl = cv.getContext('webgl', { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' });

  var SOLID = 24, LEDGE = 14, PILLAR = 8, CARD_Z = 6, WALL = -24, SPRITE_Z = 15;   // half-depths and planes, in GB pixels
  var WIN_W = 1024, WIN_H = 512;                                 // the slice of the room kept as one mesh + texture
  var CELLS_H = WIN_H >> 3, CAPS_Y = WIN_H, SIDES_Y = CAPS_Y + CELLS_H, BACK_Y = SIDES_Y + CELLS_H, TEX_H = BACK_Y + CELLS_H;
  // Under the level picture the texture holds one row per cell row: CAPS the 8 pixels a top face is stretched from,
  // SIDES the cell's main colour for its side faces, BACK its colour 0 (behind a cut-out card).
  var K_OPEN = 0, K_SOLID = 1, K_BOX = 2, K_PILLAR = 3, K_CARD = 4;
  // Fill of a slope cell from the bottom at its left and right edge, in pixels (CEIL: from the top)
  var SLOPE = { 4: [0, 8], 6: [8, 0], 0x36: [0, 8], 0x38: [8, 0], 0xC: [0, 4], 0xE: [4, 8], 0x10: [8, 4], 0x12: [4, 0] }, CEIL = { 8: [0, 8], 0xA: [8, 0] };
  function kindOf(c) {
    if (!c || c === 0x62) return K_OPEN;
    if (c === 2 || c === 0x2C || c === 0x3A || c === 0x3C || SLOPE[c] || CEIL[c]) return K_SOLID;
    if (c === 0x2E) return K_BOX;
    if (c === 0x6E || c === 0x70) return K_CARD;
    if (c === 0x3E) return K_OPEN;                               // the underside of a tree's leaves
    return K_PILLAR;
  }
  // Camera presets: eye and look-at as offsets from the centre of the game's own camera (CLOSE: from Shantae).
  var CAMS = {
    FLAT:  { eye: [0, 0, 310], at: [0, 0, 0], fov: 32 },
    TILT:  { eye: [0, 170, 260], at: [0, -20, 0], fov: 34 },
    LOW:   { eye: [0, -55, 250], at: [0, 10, 0], fov: 36 },
    SIDE:  { eye: [215, 45, 215], at: [0, -5, 0], fov: 36 },
    HIGH:  { eye: [-240, 230, 200], at: [10, -25, 0], fov: 36 },
    CLOSE: { eye: [70, 26, 140], at: [0, 6, SPRITE_Z], fov: 38, near: true }
  };
  var ORDER = ['FLAT', 'TILT', 'LOW', 'SIDE', 'HIGH', 'CLOSE'];

  // ------------------------------------------------------------------ data from the host
  function b64(s, into) {
    var b = atob(s || ''), a = into && into.length === b.length ? into : new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  var banks = {};
  function bank(b) {
    if (!banks[b]) { var d = b64(N.rom(b * 0x4000, 0x4000)); banks[b] = d.length === 0x4000 ? d : new Uint8Array(0x4000); }
    return banks[b];
  }
  var seen = -1, V = null, snap = null, COL = new Uint32Array(64);
  /** Room $C9E9-$C9FF (rect, region table, camera), $FFDF (metatile bank base), Shantae $CB43/$CB45, state $C39D. */
  function poll() {
    var s = N.frame(seen);
    if (!s) return false;
    var a = s.split('|');
    if (a.length < 3) return false;
    seen = +a[0];
    var h = a[1], v = [];
    for (var i = 0; i + 1 < h.length; i += 2) v.push(parseInt(h.substr(i, 2), 16));
    if (v.length < 28) return false;
    var r = function (o) { return v[o] | v[o + 1] << 8; };
    V = { rx: r(0), ry: r(3), rw: r(11) + 159, rh: r(13) + 127, th: v[16], tb: v[17], camX: r(18), camY: r(20), df: v[22],
          px: r(23), py: r(25), state: v[27] };
    snap = b64(a[2], snap);
    colours();
    return true;
  }
  /** The 64 colours as the core displays them (BG 0-31, OBJ 32-63), ABGR for Uint32 pixel writes. */
  function colours() {
    var full = snap.length >= 0x4125 + 192;
    for (var i = 0; i < 64; i++) {
      var r, g, b;
      if (full) { var o = 0x4125 + i * 3; r = snap[o]; g = snap[o + 1]; b = snap[o + 2]; }
      else { var c = snap[0x4000 + i * 2] | snap[0x4001 + i * 2] << 8; r = (c & 31) * 255 / 31 | 0; g = ((c >> 5) & 31) * 255 / 31 | 0; b = ((c >> 10) & 31) * 255 / 31 | 0; }
      COL[i] = (0xFF000000 | b << 16 | g << 8 | r) >>> 0;
    }
  }

  // ------------------------------------------------------------------ tiles
  /** VRAM offset of BG tile t (as written in a map) with attribute at. */
  function bgTileOff(t, at) {
    var idx = snap[0x4120] & 0x10 ? t : (t < 128 ? 256 + t : t);
    return (at & 8 ? 0x2000 : 0) + idx * 16;
  }
  function lum(c) { return (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11; }
  var tcache = {};
  /** BG tile as 64 ABGR pixels + whether it is one flat colour. Cached until the next repaint. */
  function tile(t, at) {
    var k = t << 8 | at, c = tcache[k];
    if (c) return c;
    var off = bgTileOff(t, at), px = new Uint32Array(64), ix = new Uint8Array(64), pal = (at & 7) * 4;
    for (var y = 0; y < 8; y++) {
      var ry = at & 0x40 ? 7 - y : y, lo = snap[off + ry * 2], hi = snap[off + ry * 2 + 1];
      for (var x = 0; x < 8; x++) {
        var rx = at & 0x20 ? 7 - x : x;
        ix[y * 8 + x] = ((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1);
        px[y * 8 + x] = COL[pal + ix[y * 8 + x]];
      }
    }
    var plain = true, main = px[0], ar = 0, ag = 0, ab = 0, an = 0;
    for (var i = 1; i < 64 && plain; i++) if (px[i] !== px[0]) plain = false;
    for (i = 0; i < 64; i++) if (lum(px[i]) >= 48) { ar += px[i] & 255; ag += (px[i] >> 8) & 255; ab += (px[i] >> 16) & 255; an++; }
    if (an) main = (0xFF000000 | (ab / an) << 16 | (ag / an) << 8 | (ar / an)) >>> 0;
    return (tcache[k] = { px: px, ix: ix, plain: plain, main: main, back: COL[pal] });
  }

  // ------------------------------------------------------------------ level data
  /** [definition bank array, offset] of the metatile at world pixel (X, Y), or null (no screen there). */
  function def(X, Y) {
    var e = (V.th << 8) + (Y >> 8) * 64 + (X >> 8) * 2;
    if (X < 0 || Y < 0 || (X >> 8) >= 32 || e < 0x4000 || e >= 0x8000) return null;
    var tb = bank(V.tb), page = tb[e - 0x4000], sb = tb[e - 0x3FFF];
    if (!page || !sb || page < 0x40 || page > 0x7E) return null;
    var SB = bank(sb), a = (page << 8) + ((Y >> 4) & 15) * 32 + ((X >> 4) & 15) * 2 - 0x4000, w0 = SB[a], w1 = SB[a + 1];
    var da = (w1 << 8) | (w0 & 0xF0);
    if (da < 0x4000 || da > 0x7FF0) return null;
    return [bank(V.df + (w0 & 15)), da - 0x4000];
  }
  /** Is the picture this room? The BG map under the camera must match the level data (menus, maps and text screens don't). */
  function selfCheck(camX, camY) {
    var map = snap[0x4120] & 8 ? 0x1C00 : 0x1800, ok = 0, n = 0, kinds = {}, nk = 0;
    for (var Y = camY + 8; Y < camY + 120; Y += 24) for (var X = camX + 8; X < camX + 152; X += 24) {
      if (X < V.rx || Y < V.ry || X >= V.rx + V.rw || Y >= V.ry + V.rh) continue;
      var d = def(X, Y); if (!d) continue;
      n++;
      var t = d[0][d[1] + ((Y >> 3) & 1) * 2 + ((X >> 3) & 1)];
      if (snap[map + ((Y >> 3) & 31) * 32 + ((X >> 3) & 31)] === t) { ok++; if (!kinds[t]) { kinds[t] = 1; nk++; } }
    }
    return n >= 6 && ok >= n * 0.7 && nk >= 3;                 // (a blank screen matches blank level data: not enough)
  }

  var L = null;     // the level slice: layout from the ROM, painted with the tiles in VRAM now
  function roomKey() { return [V.tb, V.th, V.df, V.rx, V.ry, V.rw, V.rh, snap[0x4120] & 0x10].join(','); }
  function sliceAt(cx, cy) {
    var x0 = Math.max(V.rx, Math.min(V.rx + V.rw - WIN_W, cx - WIN_W / 2)), y0 = Math.max(V.ry, Math.min(V.ry + V.rh - WIN_H, cy - WIN_H / 2));
    return [Math.max(0, x0) & ~15, Math.max(0, y0) & ~15];
  }
  function build(x0, y0) {
    var MW = WIN_W >> 4, MH = WIN_H >> 4, CW = WIN_W >> 3, CH = WIN_H >> 3;
    var S = { key: roomKey(), x0: x0, y0: y0, defs: new Uint8Array(MW * MH * 8), has: new Uint8Array(MW * MH),
              code: new Uint8Array(CW * CH), plain: new Uint8Array(CW * CH), pcol: new Uint32Array(CW * CH),
              kind: new Uint8Array(CW * CH), pix: new Uint32Array(WIN_W * TEX_H), tiles: [], sig: -1, skySig: -1, sky: 0, painted: 0,
              hidden: new Uint8Array(CW * CH), seenDiff: new Uint8Array(CW * CH), floorY: -1 };
    var used = {};
    for (var my = 0; my < MH; my++) for (var mx = 0; mx < MW; mx++) {
      var X = x0 + mx * 16, Y = y0 + my * 16;
      if (X < V.rx || Y < V.ry || X >= V.rx + V.rw || Y >= V.ry + V.rh) continue;
      var d = def(X, Y); if (!d) continue;
      var k = my * MW + mx, D = d[0], o = d[1];
      S.has[k] = 1;
      for (var q = 0; q < 8; q++) S.defs[k * 8 + q] = D[o + q];
      for (q = 0; q < 4; q++) {
        S.code[(my * 2 + (q >> 1)) * CW + mx * 2 + (q & 1)] = D[o + 8 + q];
        var to = bgTileOff(D[o + q], D[o + 4 + q]);
        if (!used[to]) { used[to] = 1; S.tiles.push(to); }
      }
    }
    // Solid cells drawn in a tile the room mostly uses as open background are invisible walls: no block for them
    var open = {}, solid = {};
    for (var c = 0; c < S.code.length; c++) {
      var cy0 = (c / CW) | 0, cx0 = c % CW, m0 = (cy0 >> 1) * MW + (cx0 >> 1);
      if (!S.has[m0]) continue;
      var q0 = (cy0 & 1) * 2 + (cx0 & 1), key = S.defs[m0 * 8 + q0] << 8 | S.defs[m0 * 8 + 4 + q0], cd = S.code[c];
      if (!cd) open[key] = (open[key] || 0) + 1; else if (cd === 2) solid[key] = (solid[key] || 0) + 1;
    }
    for (c = 0; c < S.code.length; c++) {
      if (S.code[c] !== 2) continue;
      cy0 = (c / CW) | 0; cx0 = c % CW; m0 = (cy0 >> 1) * MW + (cx0 >> 1);
      if (!S.has[m0]) continue;
      q0 = (cy0 & 1) * 2 + (cx0 & 1); key = S.defs[m0 * 8 + q0] << 8 | S.defs[m0 * 8 + 4 + q0];
      if ((open[key] || 0) >= 6 && open[key] >= 2 * (solid[key] || 0)) S.hidden[c] = 1;
    }
    // A big room's first and last columns hold what stops her walking off: a wall with nothing beside it (ground goes on inwards)
    if (V.rw > 320) for (var j0 = 0; j0 < CH; j0++) for (var i0 = 0; i0 < CW; i0++) {
      var wx = x0 + i0 * 8, left = wx < V.rx + 16, right = wx >= V.rx + V.rw - 16, inw = i0 + (left ? 2 : -2);
      if ((left || right) && inw >= 0 && inw < CW && !S.code[j0 * CW + inw]) S.hidden[j0 * CW + i0] = 1;
    }
    return S;
  }
  /** Changes whenever a tile the slice uses or a BG colour changes (animated water, palette fades). */
  function signature() {
    var h = 2166136261, i, j;
    for (i = 0; i < L.tiles.length; i++) for (j = 0; j < 16; j++) h = Math.imul(h ^ snap[L.tiles[i] + j], 16777619);
    for (i = 0; i < 32; i++) h = Math.imul(h ^ COL[i], 16777619);
    return h >>> 0;
  }
  function skyCount(T) {
    if (T.skyN === undefined) { T.skyN = 0; for (var i = 0; i < 64; i++) if (T.px[i] === L.sky) T.skyN++; }
    return T.skyN;
  }
  /** Cell kinds, from the codes and which cells are drawn in the sky colour. */
  function classify() {
    var CW = WIN_W >> 3, CH = WIN_H >> 3, MW = WIN_W >> 4, G = L.kind, i, j, k, c;
    var skyCell = function (c) { return L.plain[c] && L.pcol[c] === L.sky; };
    var has = function (ii, jj) { return L.has[(jj >> 1) * MW + (ii >> 1)]; };
    var pal = function (ii, jj) { return L.defs[((jj >> 1) * MW + (ii >> 1)) * 8 + 4 + (jj & 1) * 2 + (ii & 1)] & 7; };
    var any = false;
    var airy = function (c) {                                   // a tile mostly in the sky colour, too thin to be a block
      var T = L.cells[c]; if (!T || L.code[c] !== 2) return false;
      return skyCount(T) >= 40;
    };
    for (c = 0; c < G.length; c++) {
      G[c] = L.hidden[c] || skyCell(c) || airy(c) ? K_OPEN : kindOf(L.code[c]);
      if (G[c] === K_SOLID || G[c] === K_BOX) any = true;
    }
    // one-way tops: a body down to what holds them up (crates), same palette all the way; else a loose card
    for (i = 0; i < CW; i++) for (j = 0; j < CH; j++) {
      c = j * CW + i;
      if (G[c] !== K_BOX || L.code[c] !== 0x2E) continue;
      var held = false, p0 = pal(i, j);
      for (k = j + 1; k < CH && k <= j + 8 && has(i, k); k++) {
        var d = k * CW + i, g = G[d];
        if (g === K_SOLID || (g === K_BOX)) { held = true; break; }
        if (g !== K_OPEN || skyCell(d) || pal(i, k) !== p0) break;
      }
      if (held) { for (var m = j + 1; m < k; m++) G[m * CW + i] = K_BOX; }
      else G[c] = j > 0 && j < CH - 1 && skyCell(c - CW) && skyCell(c + CW) ? K_PILLAR : K_OPEN;     // a plank in open air; among leaves: scenery
    }
    // leaves over a trunk are marked climbable too: only what's in the trunk's palette is the trunk
    for (i = 0; i < CW; i++) for (j = CH - 2; j >= 0; j--) {
      c = j * CW + i;
      if (L.code[c] === 0x64 && G[c] === K_PILLAR && (G[c + CW] === K_PILLAR || G[c + CW] === K_OPEN && L.code[c + CW] === 0x64) && has(i, j + 1) && pal(i, j) !== pal(i, j + 1)) G[c] = K_OPEN;
    }
    // towns have no collision: a floor in front of the wall, from the last row with scenery
    L.floorY = -1; L.floorC = 0;
    if (!any) for (j = CH - 1; j >= 0 && L.floorY < 0; j--) {
      var drawn = 0, col = -1, dark = 0;
      for (i = 0; i < CW; i++) { c = j * CW + i; if (has(i, j) && !L.plain[c]) { drawn++; col = i; } else if (has(i, j)) dark++; }
      if (drawn >= 16) { L.floorY = j + 1; L.floorC = (j * CW + col); }
    }
  }
  function paint() {
    tcache = {};
    var MW = WIN_W >> 4, CW = WIN_W >> 3, CH = WIN_H >> 3, u = L.pix, counts = {}, T, c, x, y;
    u.fill(0);                                                  // outside the room: transparent (nothing drawn)
    L.plain.fill(0);
    var cells = L.cells = new Array(CW * CH);
    for (var k = 0; k < L.has.length; k++) {
      if (!L.has[k]) continue;
      var mx = k % MW, my = (k / MW) | 0;
      for (var q = 0; q < 4; q++) {
        T = tile(L.defs[k * 8 + q], L.defs[k * 8 + 4 + q]);
        var cx = mx * 2 + (q & 1), cy = my * 2 + (q >> 1), dst = cy * 8 * WIN_W + cx * 8;
        for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) u[dst + y * WIN_W + x] = T.px[y * 8 + x];
        c = cy * CW + cx; cells[c] = T;
        if (T.plain) { L.plain[c] = 1; L.pcol[c] = T.px[0]; counts[T.px[0]] = (counts[T.px[0]] || 0) + 1; }
      }
    }
    // the sky: the most common one-colour cell
    var best = -1; L.sky = COL[0];
    for (var col in counts) if (counts[col] > best) { best = counts[col]; L.sky = +col; }
    classify();
    // the bands, from the picture before anything in it is cut out
    for (c = 0; c < cells.length; c++) {
      T = cells[c]; if (!T) continue;
      var row = (c / CW) | 0, cl = c % CW;
      for (x = 0; x < 8; x++) { u[(SIDES_Y + row) * WIN_W + cl * 8 + x] = T.main; u[(BACK_Y + row) * WIN_W + cl * 8 + x] = T.back; }
    }
    // A top face is one colour along its whole run of same-palette cells: the commonest colour in the top of those tiles
    // (a tile's top row stretched back makes zebra stripes, tile by tile)
    var pals = function (c) { var m = ((c / CW) | 0) >> 1, n = (c % CW) >> 1; return L.defs[(m * MW + n) * 8 + 4 + ((c / CW) & 1) * 2 + (c % CW & 1)] & 7; };
    for (var jr = 0; jr < CH; jr++) {
      var ir = 0, prevEnd = -1, prevC = 0;
      while (ir < CW) {
        var c0 = jr * CW + ir;
        if (!cells[c0] || L.kind[c0] === K_OPEN || L.kind[c0] === K_CARD) { ir++; continue; }
        var i1 = ir, p0 = pals(c0), hist = {};
        for (; i1 < CW; i1++) {
          var cc = jr * CW + i1; T = cells[cc];
          if (!T || L.kind[cc] === K_OPEN || L.kind[cc] === K_CARD || pals(cc) !== p0) break;
          var S0 = SLOPE[L.code[cc]];
          for (x = 0; x < 8; x++) {
            var top = S0 ? Math.min(7, (8 - (S0[0] + (S0[1] - S0[0]) * (x + 0.5) / 8)) | 0) : 0;
            for (y = top; y < Math.min(8, top + 4); y++) { var pv = T.px[y * 8 + x]; if (lum(pv) >= 48 && pv !== L.sky) hist[pv] = (hist[pv] || 0) + 1; }
          }
        }
        var capC = cells[c0].main, capN = -1;
        for (var hc in hist) if (hist[hc] > capN) { capN = hist[hc]; capC = +hc >>> 0; }
        if (i1 - ir <= 4 && prevEnd === ir) capC = prevC;       // a floor whose palette changes tile by tile: one colour
        for (var i2 = ir; i2 < i1; i2++) for (x = 0; x < 8; x++) u[(CAPS_Y + jr) * WIN_W + i2 * 8 + x] = capC;
        prevEnd = i1; prevC = capC;
        ir = i1;
      }
    }
    // a ramp climbs through several rows: one colour all along it, from its left end
    for (var ic = 1; ic < CW; ic++) for (var jc = 0; jc < CH; jc++) {
      if (!SLOPE[L.code[jc * CW + ic]]) continue;
      for (var dj = -1; dj <= 1; dj++) {
        var jn = jc + dj;
        if (jn < 0 || jn >= CH || !SLOPE[L.code[jn * CW + ic - 1]]) continue;
        var from = u[(CAPS_Y + jn) * WIN_W + (ic - 1) * 8];
        for (x = 0; x < 8; x++) u[(CAPS_Y + jc) * WIN_W + ic * 8 + x] = from;
        break;
      }
    }
    // cut-outs: colour 0 of a card; the sky colour everywhere (the clear colour shows through, the same to the eye)
    var clearA = 0x00FFFFFF;
    for (c = 0; c < cells.length; c++) {
      T = cells[c]; if (!T) continue;
      var g = L.kind[c], d0 = ((c / CW) | 0) * 8 * WIN_W + (c % CW) * 8;
      if (g !== K_CARD && !skyCount(T)) continue;
      for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
        var a = y * 8 + x;
        if (T.px[a] === L.sky || (g === K_CARD && !T.ix[a])) u[d0 + y * WIN_W + x] &= clearA;
      }
    }
    L.sig = signature();
    gl.bindTexture(gl.TEXTURE_2D, texLevel);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WIN_W, TEX_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(u.buffer));
    // the kinds decide the mesh: rebuild it when they change (tiles still loading, say)
    var h = 2166136261;
    for (var i = 0; i < L.kind.length; i++) h = Math.imul(h ^ (L.kind[i] + (L.plain[i] && L.pcol[i] === L.sky ? 8 : 0)), 16777619);
    if ((h >>> 0) !== L.skySig) { L.skySig = h >>> 0; var tm = performance.now(); mesh(); tMesh = performance.now() - tm; }
  }

  // ------------------------------------------------------------------ GL
  var VS = 'attribute vec3 p; attribute vec2 uv; attribute float sh; uniform mat4 M; varying vec2 v; varying float s;' +
           'void main(){ gl_Position = M * vec4(p, 1.0); v = uv; s = sh; }';
  var FS = 'precision mediump float; uniform sampler2D T; varying vec2 v; varying float s;' +
           'void main(){ vec4 c = texture2D(T, v); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * s, 1.0); }';
  var meshBuf = null, prog, loc = {}, bufLevel, nLevel = 0, bufSpr, texLevel, texSpr;
  function shader(t, src) {
    var o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  }
  function newTex() {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function initGL() {
    prog = gl.createProgram(); gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    ['p', 'uv', 'sh'].forEach(function (n) { loc[n] = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(loc[n]); });
    loc.M = gl.getUniformLocation(prog, 'M'); loc.T = gl.getUniformLocation(prog, 'T');
    bufLevel = gl.createBuffer(); bufSpr = gl.createBuffer(); texLevel = newTex(); texSpr = newTex();
    gl.enable(gl.DEPTH_TEST);
  }
  // world pixels -> GL units: x right, y up, z toward the viewer; origin at the slice's centre
  function ox() { return L.x0 + WIN_W / 2; }
  function oy() { return L.y0 + WIN_H / 2; }
  function mesh() {
    var CW = WIN_W >> 3, CH = WIN_H >> 3, G = L.kind, P = L.plain, i, j, n = 0;
    if (!meshBuf) meshBuf = new Float32Array(CW * CH * 6 * 36 + 36);  // at most front + 4 sides + wall per cell, + a floor
    var depth = function (k) { return k === K_SOLID ? SOLID : k === K_BOX ? LEDGE : k === K_PILLAR ? PILLAR : 0; };
    var X0 = ox(), Y0 = oy();
    /** Quad a b c d (ccw from bottom-left), each corner with its own uv. */
    function q4(a, ua, va, b, ub, vb, c, uc, vc, d, ud, vd, s) {
      var o = meshBuf;
      o[n] = a[0]; o[n + 1] = a[1]; o[n + 2] = a[2]; o[n + 3] = ua; o[n + 4] = va; o[n + 5] = s;
      o[n + 6] = b[0]; o[n + 7] = b[1]; o[n + 8] = b[2]; o[n + 9] = ub; o[n + 10] = vb; o[n + 11] = s;
      o[n + 12] = c[0]; o[n + 13] = c[1]; o[n + 14] = c[2]; o[n + 15] = uc; o[n + 16] = vc; o[n + 17] = s;
      o[n + 18] = a[0]; o[n + 19] = a[1]; o[n + 20] = a[2]; o[n + 21] = ua; o[n + 22] = va; o[n + 23] = s;
      o[n + 24] = c[0]; o[n + 25] = c[1]; o[n + 26] = c[2]; o[n + 27] = uc; o[n + 28] = vc; o[n + 29] = s;
      o[n + 30] = d[0]; o[n + 31] = d[1]; o[n + 32] = d[2]; o[n + 33] = ud; o[n + 34] = vd; o[n + 35] = s;
      n += 36;
    }
    function P3(x, y, z) { return [x - X0, Y0 - y, z]; }
    function texU(px) { return px / WIN_W; }
    function texV(py) { return py / TEX_H; }
    /** A flat-coloured or stretched face: all of it from row `band`, u across the cell. */
    function strip(a, b, c, d, i0, band, j0, s) {
      var v = texV(band + j0 + 0.5), u0 = texU(i0 * 8 + 0.5), u1 = texU(i0 * 8 + 7.5);
      q4(a, u0, v, b, u1, v, c, u1, v, d, u0, v, s);
    }
    /** Part of the cell's own tile: from x0..x1 (all of it), left edge top/bottom and right edge top/bottom in pixels. */
    function cellPoly(i0, j0, tl, bl, tr, br, z) {
      var X = L.x0 + i0 * 8, Y = L.y0 + j0 * 8, px = i0 * 8, py = j0 * 8;
      q4(P3(X, Y + bl, z), texU(px), texV(py + bl), P3(X + 8, Y + br, z), texU(px + 8), texV(py + br), P3(X + 8, Y + tr, z), texU(px + 8), texV(py + tr), P3(X, Y + tl, z), texU(px), texV(py + tl), 1.0);
    }
    var at = function (ii, jj) { return jj < 0 || jj >= CH || ii < 0 || ii >= CW ? 0 : depth(G[jj * CW + ii]); };
    for (j = 0; j < CH; j++) for (i = 0; i < CW; i++) {
      if (!L.has[(j >> 1) * (WIN_W >> 4) + (i >> 1)]) continue;
      var c = j * CW + i, X = L.x0 + i * 8, Y = L.y0 + j * 8, g = G[c], code = L.code[c];
      if (X >= V.rx + V.rw || X + 8 <= V.rx || Y >= V.ry + V.rh || Y + 8 <= V.ry) continue;
      if (g === K_OPEN) {                                       // scenery on the back wall; sky cells left to the clear colour
        if (!(P[c] && L.pcol[c] === L.sky)) cellPoly(i, j, 0, 8, 0, 8, WALL);
        continue;
      }
      if (g === K_CARD) {                                       // a cut-out in front of the tile's own backdrop
        strip(P3(X, Y + 8, WALL), P3(X + 8, Y + 8, WALL), P3(X + 8, Y, WALL), P3(X, Y, WALL), i, BACK_Y, j, 1.0);
        cellPoly(i, j, 0, 8, 0, 8, CARD_Z);
        continue;
      }
      var dz = depth(g), S = SLOPE[code], C = CEIL[code];
      if (S) {                                                  // a ramp: the front cut to the slope, the rest of the tile on the wall
        var tl = 8 - S[0], tr = 8 - S[1];
        cellPoly(i, j, tl, 8, tr, 8, dz);
        cellPoly(i, j, 0, tl, 0, tr, WALL);
        strip(P3(X, Y + tl, dz), P3(X + 8, Y + tr, dz), P3(X + 8, Y + tr, -dz), P3(X, Y + tl, -dz), i, CAPS_Y, j, 1.12);
        if (at(i, j + 1) < dz) strip(P3(X, Y + 8, -dz), P3(X + 8, Y + 8, -dz), P3(X + 8, Y + 8, dz), P3(X, Y + 8, dz), i, SIDES_Y, j, 0.55);
        if (S[0] && at(i - 1, j) < dz) strip(P3(X, Y + 8, -dz), P3(X, Y + 8, dz), P3(X, Y + tl, dz), P3(X, Y + tl, -dz), i, SIDES_Y, j, 0.72);
        if (S[1] && at(i + 1, j) < dz) strip(P3(X + 8, Y + 8, dz), P3(X + 8, Y + 8, -dz), P3(X + 8, Y + tr, -dz), P3(X + 8, Y + tr, dz), i, SIDES_Y, j, 0.8);
        continue;
      }
      if (C) {                                                  // a slanted ceiling: hangs from the top of the cell
        var bl = C[0], br = C[1];
        cellPoly(i, j, 0, bl, 0, br, dz);
        cellPoly(i, j, bl, 8, br, 8, WALL);
        strip(P3(X, Y + bl, -dz), P3(X + 8, Y + br, -dz), P3(X + 8, Y + br, dz), P3(X, Y + bl, dz), i, SIDES_Y, j, 0.55);
        if (at(i, j - 1) < dz) strip(P3(X, Y, dz), P3(X + 8, Y, dz), P3(X + 8, Y, -dz), P3(X, Y, -dz), i, CAPS_Y, j, 1.12);
        if (bl && at(i - 1, j) < dz) strip(P3(X, Y + bl, -dz), P3(X, Y + bl, dz), P3(X, Y, dz), P3(X, Y, -dz), i, SIDES_Y, j, 0.72);
        if (br && at(i + 1, j) < dz) strip(P3(X + 8, Y + br, dz), P3(X + 8, Y + br, -dz), P3(X + 8, Y, -dz), P3(X + 8, Y, dz), i, SIDES_Y, j, 0.8);
        continue;
      }
      cellPoly(i, j, 0, 8, 0, 8, dz);
      if (at(i, j - 1) < dz) strip(P3(X, Y, dz), P3(X + 8, Y, dz), P3(X + 8, Y, -dz), P3(X, Y, -dz), i, CAPS_Y, j, 1.12);
      if (at(i, j + 1) < dz) strip(P3(X, Y + 8, -dz), P3(X + 8, Y + 8, -dz), P3(X + 8, Y + 8, dz), P3(X, Y + 8, dz), i, SIDES_Y, j, 0.55);
      if (at(i - 1, j) < dz) strip(P3(X, Y + 8, -dz), P3(X, Y + 8, dz), P3(X, Y, dz), P3(X, Y, -dz), i, SIDES_Y, j, 0.72);
      if (at(i + 1, j) < dz) strip(P3(X + 8, Y + 8, dz), P3(X + 8, Y + 8, -dz), P3(X + 8, Y, -dz), P3(X + 8, Y, dz), i, SIDES_Y, j, 0.8);
    }
    if (L.floorY >= 0) {                                        // towns: the street, from the wall out past the sprites
      var fy = L.y0 + L.floorY * 8, fc = L.floorC, fv = texV(SIDES_Y + ((fc / CW) | 0) + 0.5), fu = texU((fc % CW) * 8 + 4);
      q4(P3(L.x0, fy, 70), fu, fv, P3(L.x0 + WIN_W, fy, 70), fu, fv, P3(L.x0 + WIN_W, fy, WALL), fu, fv, P3(L.x0, fy, WALL), fu, fv, 0.8);
    }
    nLevel = n / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLevel); gl.bufferData(gl.ARRAY_BUFFER, meshBuf.subarray(0, n), gl.STATIC_DRAW);
  }
  function attribs(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 24, 12);
    gl.vertexAttribPointer(loc.sh, 1, gl.FLOAT, false, 24, 20);
  }

  // ------------------------------------------------------------------ sprites and the status bar
  var spr32 = new Uint32Array(160 * 144), hudShown = false, overlayN = 0;
  /** Tiles the game has written into the BG map that aren't the level's (rocks and blocks drawn as BG, things opened or
   *  broken): drawn on the sprite plane where the 2D game has them. Only a difference that lasts: scrolling columns lag. */
  function bgOverlay(wy) {
    if (!L) return;
    var CW = WIN_W >> 3, MW = WIN_W >> 4, map = snap[0x4120] & 8 ? 0x1C00 : 0x1800, list = [], total = 0;
    var cx0 = (camXd + 7) >> 3, cx1 = (camXd + 160 - 8) >> 3, cy0 = (camYd + 7) >> 3, cy1 = (camYd + Math.min(wy, 144) - 8) >> 3;
    for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) {
      var i = cx - (L.x0 >> 3), j = cy - (L.y0 >> 3);
      if (i < 0 || j < 0 || i >= CW || j >= CELLS_H) continue;
      var k = (j >> 1) * MW + (i >> 1), c = j * CW + i;
      if (!L.has[k]) continue;
      total++;
      var q = (j & 1) * 2 + (i & 1), m = map + (cy & 31) * 32 + (cx & 31);
      if (snap[m] === L.defs[k * 8 + q]) { L.seenDiff[c] = 0; continue; }
      if (L.seenDiff[c] < 3) { L.seenDiff[c]++; continue; }
      list.push(cx, cy, snap[m], snap[0x2000 + m]);
    }
    overlayN = list.length / 4;
    if (!overlayN || overlayN > total * 0.25) { overlayN = 0; return; }   // a fade or text screen, not a few tiles
    for (var n = 0; n < list.length; n += 4) {
      var T = tile(list[n + 2], list[n + 3]), sx = list[n] * 8 - camXd, sy = list[n + 1] * 8 - camYd;
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
        var p = T.px[y * 8 + x], X = sx + x, Y = sy + y;
        if (X >= 0 && X < 160 && Y >= 0 && Y < 144 && p !== L.sky) spr32[Y * 160 + X] = p;
      }
    }
  }
  function sprites() {
    spr32.fill(0); hud32.fill(0);
    var lcdc = snap[0x4120], wy = snap[0x4123], wx = snap[0x4124] - 7, winOn = (lcdc & 0x20) && wy < 144 && wx < 160, x, y;
    bgOverlay(winOn ? wy : 144);
    if (winOn) {                                                // the window layer: the status bar (and text boxes)
      var map = lcdc & 0x40 ? 0x1C00 : 0x1800;
      for (y = wy; y < 144; y++) for (x = Math.max(0, wx); x < 160; x++) {
        var wxp = x - wx, wyp = y - wy, m = map + (wyp >> 3) * 32 + (wxp >> 3), t = snap[m], at = snap[0x2000 + m];
        var off = bgTileOff(t, at), ry = at & 0x40 ? 7 - (wyp & 7) : wyp & 7, rx = at & 0x20 ? 7 - (wxp & 7) : wxp & 7;
        var lo = snap[off + ry * 2], hi = snap[off + ry * 2 + 1];
        hud32[y * 160 + x] = COL[(at & 7) * 4 + (((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1))];
      }
    }
    // OAM, entry 0 on top. LCDC's sprite bit is read at the end of the frame, after the game has switched sprites off for
    // the status bar (it switches them on again at the top of the next frame), so it isn't checked here; sprites under
    // the status bar aren't shown, as in the game.
    {
      var tall = lcdc & 4, h = tall ? 16 : 8;
      for (var i = 39; i >= 0; i--) {
        var o = 0x4080 + i * 4, sy = snap[o] - 16, sx = snap[o + 1] - 8, tn = snap[o + 2], fl = snap[o + 3];
        if (sy <= -h || sy >= 144 || sx <= -8 || sx >= 160) continue;
        if (tall) tn &= 0xFE;
        var pal = 32 + (fl & 7) * 4;
        for (var yy = 0; yy < h; yy++) {
          y = sy + yy; if (y < 0 || y >= 144) continue;
          var ty = fl & 0x40 ? h - 1 - yy : yy, toff = (fl & 8 ? 0x2000 : 0) + (tn + (ty >> 3)) * 16 + (ty & 7) * 2, lo2 = snap[toff], hi2 = snap[toff + 1];
          for (var xx = 0; xx < 8; xx++) {
            x = sx + xx; if (x < 0 || x >= 160) continue;
            var tx = fl & 0x20 ? 7 - xx : xx, cq = ((lo2 >> (7 - tx)) & 1) | (((hi2 >> (7 - tx)) & 1) << 1);
            if (!cq) continue;
            if (!(winOn && y >= wy && x >= wx)) spr32[y * 160 + x] = COL[pal + cq];
          }
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, texSpr);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 160, 144, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(spr32.buffer));
    if (winOn || hudShown) { hud.putImageData(hudImg, 0, 0); hudShown = !!winOn; }
  }

  // ------------------------------------------------------------------ camera
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function look(e, c) {
    var z = norm(sub(e, c)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
    return o;
  }
  function lerp(a, b, t) { return a.map(function (x, i) { return x + (b[i] - x) * t; }); }

  var camName = 'FLAT', from = null, glideT0 = 0, glideMs = 600, cycling = false, nextCycle = 0, labelUntil = 0;
  var camXd = 0, camYd = 0;
  /** The preset as {eye, at, fov}, offsets from the game camera's centre (CLOSE follows Shantae). */
  function presetNow(name) {
    var P = CAMS[name] || CAMS.FLAT, base = [0, 0, 0];
    // $CB43/$CB45 sit 26 px left of and 28 px above the middle of her sprites (checked against OAM in several rooms)
    if (P.near && V && V.state === 2 && Math.abs(V.px + 26 - (camXd + 80)) < 120 && Math.abs(V.py + 28 - (camYd + 64)) < 110) base = [V.px + 26 - (camXd + 80), -((V.py + 28) - (camYd + 64)), 0];
    return { eye: [base[0] + P.eye[0], base[1] + P.eye[1], P.eye[2]], at: [base[0] + P.at[0], base[1] + P.at[1], P.at[2]], fov: P.fov };
  }
  function setCam(name, now, glide) {
    if (name === camName && !glide) return;
    from = current(now);
    camName = name; glideT0 = now; glideMs = glide || 600;
    lab.textContent = name === 'HIGH' ? 'HIGH ANGLE' : name; labelUntil = now + 1500;
  }
  function current(now) {
    var to = presetNow(camName);
    if (!from) return to;
    var t = Math.min(1, (now - glideT0) / glideMs); t = t * t * (3 - 2 * t);
    if (t >= 1) { from = null; return to; }
    return { eye: lerp(from.eye, to.eye, t), at: lerp(from.at, to.at, t), fov: from.fov + (to.fov - from.fov) * t };
  }
  function pickCam(name, now) {
    cycling = name === 'CYCLE';
    if (cycling) { nextCycle = now + 4000; lab.textContent = 'CYCLE'; labelUntil = now + 1500; if (!CAMS[camName]) camName = 'FLAT'; }
    else setCam(CAMS[name] ? name : 'FLAT', now);
  }

  // ------------------------------------------------------------------ frame loop
  var tBuild = 0, tMesh = 0, timing = null, on = false, good = 0, bad = 0, lastPaint = 0, frames = 0, camPref = '';
  function show(v) {
    if (v === on) return;
    on = v;
    cv.style.display = v ? 'block' : 'none';
    hudCv.style.display = v ? 'block' : 'none';
    if (!v) lab.style.display = 'none';
  }
  function layout() {
    var dpr = window.devicePixelRatio || 1, w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var s = Math.min(innerWidth / 160, innerHeight / 144);
    hudCv.style.width = 160 * s + 'px'; hudCv.style.height = 144 * s + 'px';
    hudCv.style.left = (innerWidth - 160 * s) / 2 + 'px'; hudCv.style.top = (innerHeight - 144 * s) / 2 + 'px';
  }
  function render(now) {
    layout();
    var w = cv.width, h = cv.height, asp = w / h, ref = 960 / 864;
    gl.viewport(0, 0, w, h);
    var sky = L ? L.sky : COL[0];
    gl.clearColor((sky & 255) / 255, ((sky >> 8) & 255) / 255, ((sky >> 16) & 255) / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!L) return;
    if (cycling && now >= nextCycle) { setCam(ORDER[(ORDER.indexOf(camName) + 1) % ORDER.length], now, 1400); nextCycle = now + 5400; }
    var C = current(now), T = [camXd + 80 - ox(), oy() - (camYd + 64), 0];
    // narrow screens: widen the vertical view so as much of the street fits across as on the reference shape
    var fov = C.fov * Math.PI / 180;
    if (asp < ref) fov = 2 * Math.atan(Math.tan(fov / 2) * ref / asp);
    var M = mul(persp(fov, asp, 8, 4000), look([T[0] + C.eye[0], T[1] + C.eye[1], C.eye[2]], [T[0] + C.at[0], T[1] + C.at[1], C.at[2]]));
    gl.uniformMatrix4fv(loc.M, false, new Float32Array(M));
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(loc.T, 0);
    gl.bindTexture(gl.TEXTURE_2D, texLevel); attribs(bufLevel); gl.drawArrays(gl.TRIANGLES, 0, nLevel);
    // the sprite layer: the whole 160x144 screen at the game camera
    var x0 = camXd - ox(), x1 = x0 + 160, y0 = oy() - camYd, y1 = y0 - 144, z = SPRITE_Z;
    var sv = new Float32Array([x0, y1, z, 0, 1, 1, x1, y1, z, 1, 1, 1, x1, y0, z, 1, 0, 1, x0, y1, z, 0, 1, 1, x1, y0, z, 1, 0, 1, x0, y0, z, 0, 0, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufSpr); gl.bufferData(gl.ARRAY_BUFFER, sv, gl.DYNAMIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texSpr); attribs(bufSpr); gl.drawArrays(gl.TRIANGLES, 0, 6);
    lab.style.display = now < labelUntil ? 'block' : 'none';
  }
  /** The game camera as displayed: SCX/SCY are the low bytes of the picture just drawn ($C9FB/$C9FD already hold the next). */
  function near(ram, low) { var d = ((ram - low) & 255); if (d >= 128) d -= 256; return ram - d; }
  function step(now) {
    requestAnimationFrame(step);
    if (frames++ % 30 === 0) { var p = N.cam ? N.cam() : 'FLAT'; if (p !== camPref) { camPref = p; pickCam(p || 'FLAT', now); } }
    var t0 = performance.now();
    if (!poll()) { if (on) render(now); return; }
    var t1 = performance.now();
    camXd = near(V.camX, snap[0x4122]); camYd = near(V.camY, snap[0x4121]);
    // play (2) and town streets (5) only: on the title and in menus the room variables are left over from the last room
    var ok = (V.state === 2 || V.state === 5) && V.tb && V.rw > 0 && V.rh > 0 && (snap[0x4120] & 0x80) && snap[0x4123] >= 64 && selfCheck(camXd, camYd);
    if (ok) { bad = 0; if (++good >= 2) show(true); } else { good = 0; if (++bad >= 4) show(false); }
    if (!on) return;
    var w = sliceAt(camXd + 80, camYd + 64);
    var built = 0;
    if (!L || L.key !== roomKey() || Math.abs(w[0] - L.x0) >= 256 || Math.abs(w[1] - L.y0) >= 128) {
      var tb0 = performance.now(); L = build(w[0], w[1]); tBuild = performance.now() - tb0; paint(); lastPaint = frames; built = 2;
    } else if (frames - lastPaint >= 2 && signature() !== L.sig) { paint(); lastPaint = frames; built = 1; }
    var t2 = performance.now();
    sprites();
    var t3 = performance.now();
    render(now);
    timing = { poll: t1 - t0, level: t2 - t1, built: built, sprites: t3 - t2, draw: performance.now() - t3, build: tBuild, mesh: tMesh };
  }
  // tap the picture: next camera
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var now = performance.now(), i = cycling ? -1 : ORDER.indexOf(camName), next = i + 1 >= ORDER.length ? 'CYCLE' : ORDER[i + 1];
    camPref = next; pickCam(next, now);
    if (N.setCam) N.setCam(next);
  });

  if (!gl || !N) return;
  initGL();
  window.V3debug = { cams: CAMS, order: ORDER, pick: function (n) { pickCam(n, performance.now()); }, state: function () {
    return { on: on, cam: camName, slice: L && [L.x0, L.y0], verts: nLevel, cam2d: [camXd, camYd], overlay: overlayN, room: V && [V.rx, V.ry, V.rw, V.rh], timing: timing }; },
    codes: function () { var c = {}; if (L) for (var i = 0; i < L.code.length; i++) { var k = L.code[i].toString(16); c[k] = (c[k] || 0) + 1; } return c; },
    slice: function () { if (!L) return null; var s = '', b = new Uint8Array(L.pix.buffer); for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
      return { x0: L.x0, y0: L.y0, code: Array.from(L.code), kind: Array.from(L.kind), pix: btoa(s) }; } };
  requestAnimationFrame(step);
})();
