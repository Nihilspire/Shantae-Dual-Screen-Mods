/* link.js - Shantae Link: the companion screen of Shantae Dual. Reads the game's RAM through window.Native
 * (MainActivity.LinkBridge) and draws in the game's own font and text-box frames from the player's ROM.
 * Item, stone and talisman icons are built from the player's ROM (the inventory screen's tilesets and palettes),
 * so nothing from the game ships with the app. */
(function () {
  'use strict';
  var G = GbGfx, S = Shantae;
  var N = window.Native || null;
  var DUAL = !!(N && N.dual);
  var RA = !!(N && N.ra);                    // Shantae Link: the game runs in RetroArch (linkapp/ra.js builds Native)
  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var W = 256, H = 240, layout = {}, tabs = [], tab = 'status', buttons = [];
  var st = null, tickN = 0, signs = null;
  var store = window.localStorage || { getItem: function () { return null; }, setItem: function () {} };
  function load(k, d) { try { var v = JSON.parse(store.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { store.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var C = { white: '#f8f0e0', ink: '#f8e070', red: '#e0584a', dred: '#702830', purple: '#b070e8', dpurple: '#3a1858',
            gold: '#f8c048', grey: '#887898', lgrey: '#c8b8d8', green: '#78e098', teal: '#68d8f0', sel: '#5a2a78',
            heart: '#f85878', heart0: '#5a3048', gem: '#78e0f8', sky: '#58a8f8', night: '#4838a8', sun: '#f8d048', moon: '#f8f0c0' };
  var BOX = S.FONT_FRAME;
  window.onAssets = function () { draw(); };

  // ------------------------------------------------------------------ ROM data (font, signposts)
  function loadRom() {
    if (!N) return;
    if (!G.hasFont()) { var f = G.b64(N.font ? N.font() : ''); if (f.length >= 0x800) G.setFont(f); }
    if (!signs && N.rom) {
      var t = G.b64(N.rom(0xA5F00, 0x600)), s = '';
      for (var i = 0; i < t.length; i++) s += t[i] >= 32 && t[i] < 127 ? String.fromCharCode(t[i]) : '|';
      var re = /Welcome to (?:the )?([A-Za-z\- ]+?)\.\s+West:\s*([A-Za-z\- ]+?),\s*East:\s*([A-Za-z\- ]+?)\|/g, m, list = [];
      while ((m = re.exec(s))) list.push({ name: tidy(m[1]), west: tidy(m[2]), east: tidy(m[3]) });
      if (list.length) signs = order(list);
    }
  }
  function tidy(s) { return s.replace(/- /g, '-').replace(/\s+/g, ' ').trim().toUpperCase(); }
  /** Follow East links into one chain (the overworld is a ring); signs that don't link go at the end. */
  function order(list) {
    var by = {}; list.forEach(function (s) { by[s.name] = s; });
    var start = list[0], out = [], seen = {};
    // walk back west as far as the signs go, so the chain starts at an end of the ring
    for (var k = 0; k < list.length && by[start.west] && !seen[start.west]; k++) { seen[start.name] = 1; start = by[start.west]; }
    seen = {};
    for (var s = start; s && !seen[s.name]; s = by[s.east]) { seen[s.name] = 1; out.push(s); }
    list.forEach(function (s) { if (!seen[s.name]) out.push(s); });
    return out;
  }

  // ------------------------------------------------------------------ icons, built from the ROM (0.31)
  // The inventory screen's tilesets are LZSS in the ROM (7A:6515 for VRAM bank 0, 7A:7113 for bank 1, $1800 each) and
  // its BG palettes sit there as loaded (7A:7C30, 64 bytes). Each icon is 2x2 tiles of that screen's BG map: tile,
  // CGB attribute, in map order (tiles are $8800-addressed). So every icon is there from the first boot, owned or not;
  // 0.17-0.30 copied them from VRAM the first time the in-game inventory was open.
  var ICON_MAP = {
    item0: '800C810CB00CB10C', item1: '0002010230023102', item2: '0A0F1E071A0F5C07', item3: 'FE07FF07D80CD90C',
    item4: '0402050214021502', item5: 'A40CA50CB40CB50C', item6: '2202230232023302', item7: 'A00FA10FA20FA22F',
    item8: '820C830CB20CB30C', item9: '3F07AF074F07BF07', item10: 'A60CA70CB60CB70C', item11: '020F030F120F130F',
    stone0: 'A400A500B400B500', stone1: '2603270336033703', stone2: 'A80EA90EB80EB90E', stone3: 'A200A300B200B300',
    tal0: '2806290638062E06', tal1: 'A600A700B600B700', tal2: '0803082318031823', tal3: '8600870096009700',
    squid: '8000802090009020', firefly: 'C606C626D606D626' };
  var icons = null;
  try { store.removeItem('sd.icons2'); store.removeItem('sd.icons'); } catch (e) {}
  function lzss(s, n) {              // Okumura LZSS: 4 KB ring of spaces from $FEE, flags LSB first, 1 = literal
    var ring = new Uint8Array(4096), r = 0xFEE, out = new Uint8Array(n), o = 0, p = 0, c, j;
    for (j = 0; j < 4096; j++) ring[j] = 32;
    while (o < n && p < s.length) {
      for (var f = s[p++], b = 0; b < 8 && o < n; b++, f >>= 1) {
        if (f & 1) { c = s[p++]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xFFF; continue; }
        var lo = s[p++], hi = s[p++], pos = lo | (hi & 0xF0) << 4, k = (hi & 15) + 3;
        for (j = 0; j < k && o < n; j++) { c = ring[(pos + j) & 0xFFF]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xFFF; }
      }
    }
    return out;
  }
  function iconCanvas(bank, pal, e) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 16;
    var x = c.getContext('2d');
    for (var k = 0; k < 4; k++) {
      var t = parseInt(e.substr(k * 4, 2), 16), at = parseInt(e.substr(k * 4 + 2, 2), 16), p = at & 7, cols = [];
      var px = G.decode(bank[at >> 3 & 1], (t < 128 ? 256 + t : t) * 16);
      for (var q = 0; q < 4; q++) cols.push(G.cgb(pal[p * 8 + q * 2], pal[p * 8 + q * 2 + 1]));
      G.drawTile(x, px, (k & 1) * 8, (k >> 1) * 8, cols, !!(at & 0x20), !!(at & 0x40));
    }
    // the inventory panel colour behind some icons: clear it when it fills the corners
    var d = x.getImageData(0, 0, 16, 16), px2 = d.data, key = function (i) { return px2[i * 4] + ',' + px2[i * 4 + 1] + ',' + px2[i * 4 + 2] + ',' + px2[i * 4 + 3]; };
    var corners = [0, 15, 240, 255].map(key), bg = corners[0];
    var lum = px2[0] * 0.3 + px2[1] * 0.59 + px2[2] * 0.11;
    if (px2[3] && lum > 96 && corners.filter(function (k) { return k === bg; }).length >= 3) {
      for (var i = 0; i < 256; i++) if (key(i) === bg) px2[i * 4 + 3] = 0;
      x.putImageData(d, 0, 0);
    }
    return c;
  }
  function buildIcons() {
    if (icons || !N || !N.rom) return;
    var s0 = G.b64(N.rom(0x1EA515, 0xC00)), s1 = G.b64(N.rom(0x1EB113, 0xAE0)), pal = G.b64(N.rom(0x1EBC30, 64));
    if (s0.length < 0xC00 || s1.length < 0xAE0 || pal.length < 64) return;     // no ROM yet (Shantae Link: PICK ROM)
    var bank = [lzss(s0, 0x1800), lzss(s1, 0x1800)];
    icons = {};
    for (var k in ICON_MAP) icons[k] = iconCanvas(bank, pal, ICON_MAP[k]);
    try { figure = buildFigure(bank, pal); } catch (e) { figure = null; }
  }
  function iconImage(key) { return icons && icons[key] || null; }

  // ------------------------------------------------------------------ Shantae as the inventory draws her (0.32)
  // 0.16-0.27 cut her from the extracted inventory screen; now all from the ROM. The inventory's BG map is 20x18
  // (tile, attribute) words at 7A:7C72 (after "14 12", right behind its palettes); the left panel, columns 1-9 and
  // rows 1-17, is her backdrop. Her sprites are object cels in bank 7B (the menu's nodes 0-6): body, two of face and
  // hair, and one per Fighter's Gear piece; OBJ palettes at 7B:427A. A cel's sprites sit at screen (dx, dy - 24).
  // Drawn as the game stacks them (lower OAM first = on top): body, gear (boot, cuff, sash, tiara), then face and hair.
  var FIG = { body: 0x42BA, boot: 0x47DF, cuff: 0x4768, sash: 0x46CB, tiara: 0x462E, face: [0x44F9, 0x48EE] };
  var figure = null;
  function buildFigure(bank, bgp) {
    var map = G.b64(N.rom(0x1EBC70, 2 + 720)), opal = G.b64(N.rom(0x1EC27A, 64)), B = G.b64(N.rom(0x7B * 0x4000, 0x4000));
    if (map[0] !== 20 || map[1] !== 18 || opal.length < 64 || B.length < 0x4000) return null;
    function canvas() { var c = document.createElement('canvas'); c.width = 72; c.height = 136; return c; }
    function cols(pal, p, see0) { var a = []; for (var q = 0; q < 4; q++) a.push(q || see0 ? G.cgb(pal[p * 8 + q * 2], pal[p * 8 + q * 2 + 1]) : null); return a; }
    var body = canvas(), bx = body.getContext('2d');
    for (var r = 1; r < 18; r++) for (var c = 1; c < 10; c++) {
      var o = 2 + 2 * (r * 20 + c), t = map[o], at = map[o + 1];
      G.drawTile(bx, G.decode(bank[at >> 3 & 1], (t < 128 ? 256 + t : t) * 16), (c - 1) * 8, (r - 1) * 8, cols(bgp, at & 7, true), !!(at & 0x20), !!(at & 0x40));
    }
    bx.fillStyle = '#000'; bx.fillRect(0, 112, 16, 24); bx.fillRect(0, 127, 72, 9);   // the menu's B button corner and the bar under her feet
    function w16(a) { return B[a - 0x4000] | B[a - 0x3FFF] << 8; }
    function cel(cp, x) {
      var lp = w16(cp), tb = w16(cp + 8), n = B[lp + 0x20 - 0x4000];
      for (var k = 0; k < n; k++) {
        var e = lp + 0x23 + 3 * k - 0x4000, dy = B[e], dx = B[e + 1], at = B[e + 2], cl = cols(opal, at & 7, false);
        for (var h = 0; h < 2; h++)
          G.drawTile(x, G.decode(B, tb + 1 + (2 * k + h) * 16 - 0x4000), dx - 8, dy - 32 + ((at & 0x40) ? 1 - h : h) * 8, cl, !!(at & 0x20), !!(at & 0x40));
      }
    }
    cel(FIG.body, bx);
    var f = { body: body, top: canvas() };
    ['boot', 'cuff', 'sash', 'tiara'].forEach(function (g) { f[g] = canvas(); cel(FIG[g], f[g].getContext('2d')); });
    FIG.face.forEach(function (cp) { cel(cp, f.top.getContext('2d')); });
    return f;
  }
  window.ShantaeIcons = { get: iconImage, keys: function () { return Object.keys(ICON_MAP); } };   // tests/icontest.py

  // ------------------------------------------------------------------ layout
  function resize() {
    var r = innerWidth / Math.max(1, innerHeight);
    if (DUAL && N.panelOn && N.panelOn()) {                  // SINGLE SCREEN's panel: whole screen pixels per page pixel, so the font stays even
      var d = window.devicePixelRatio || 1, pw = Math.round(innerWidth * d), ph = Math.round(innerHeight * d);
      var n = Math.max(1, Math.min(Math.floor(ph / 240), Math.floor(pw / 256)));
      W = Math.floor(pw / n); H = Math.floor(ph / n);
      cv.style.width = (W * n / d) + 'px'; cv.style.height = (H * n / d) + 'px';
    } else {
      cv.style.width = cv.style.height = '';
      if (r >= 1.3) { H = 240; W = Math.round(240 * r); } else { W = 256; H = Math.round(256 / r); }
    }
    cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false;
    var tabH = 16;
    layout.tabY = H - tabH;
    if (W >= 400) {                        // landscape: status always on the left, tabs on the right
      layout.side = { x: 4, y: 4, w: 168, h: H - 8 };
      layout.pane = { x: 176, y: 4, w: W - 180, h: H - tabH - 8 };
      layout.tabX = 176;
      tabs = ['world', 'list'];                          // OPTIONS: the gear (0.14); DANCES: pops up on Select (0.15)
    } else {
      layout.side = null;
      layout.pane = { x: 4, y: 4, w: W - 8, h: H - tabH - 8 };
      layout.tabX = 0;
      tabs = ['status', 'world', 'list'];
    }
    if (tab === 'dances') tab = 'world';
    if (tabs.indexOf(tab) < 0 && tab !== 'options') tab = tabs[0];
    draw();
  }
  addEventListener('resize', resize);
  window.onLayout = resize;

  // ------------------------------------------------------------------ polling
  // Freeze report (Shantae Link 0.9, as Xenogears Link): the app keeps the stage the page was last in if it stops for 4 s
  function stage(s) { if (N && N.beat) N.beat(s); }
  var hangMsg = N && N.lastHang ? N.lastHang() : '';
  function tick() {
    tickN++;
    stage('rom'); loadRom();
    stage('read');
    var hex = N && N.running && N.running() ? N.mem(S.SPEC) : '';
    st = hex && hex.length >= 2 * S.SPEC_LEN ? S.parse(hex) : null;
    trackStats(); readBoss(); readCredits();
    stage('monsters');
    if (st && window.ShantaeMonsters && N && N.rom) ShantaeMonsters.update(N, st);
    if (st && window.ShantaeMap && ShantaeMap.setNight) ShantaeMap.setNight(st.night, ((st.night ? 0x10000 : 0x8000) - st.time) / 4);
    stage('icons'); buildIcons();
    stage('map');
    if (window.ShantaeMap && (tab === 'world' && worldView === 'map' || tickN % 5 === 0)) ShantaeMap.update(N, !!st);   // every tick on the map; kept warm otherwise
    stage('draw'); draw();
    stage('idle');
  }
  window.onSession = window.onRom = function () { signs = null; if (window.ShantaeMap) ShantaeMap.reset(); loadRom(); draw(); };
  window.onDev = function () { draw(); };

  // ------------------------------------------------------------------ drawing helpers
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function mmss(frames) { var s = Math.max(0, Math.round(frames / 59.7275)); return Math.floor(s / 60) + ':' + pad(s % 60, 2); }
  /** A framed panel with a title; extra = [text, colour] drawn after the title (the map's dusk/dawn timer). */
  function panel(x, y, w, h, title, extra) {
    // extra = [text, colour, icon(ctx, x, y) or null, tap fn or null]: drawn after the title (the map's dusk/dawn timer:
    // 0.24 a sun/moon icon before it, and a tap on it opens the night card)
    var tw = Math.floor(w / 8), th = Math.floor(h / 8), ex = extra && extra[0] ? extra[0] : '', ic = extra && extra[2], gap = ic ? 24 : 16;
    var tx = x + 12 + (title ? title.length * 8 : 0), ty = y;
    G.frame(ctx, x, y, tw, th, BOX);
    if (title) { ctx.fillStyle = '#000'; ctx.fillRect(x + 10, y, title.length * 8 + (ex ? ex.length * 8 + gap : 0) + 4, 8); G.text(ctx, title, x + 12, y, C.gold); }
    if (ex) {
      if (ic) ic(ctx, tx + 8, ty);
      G.text(ctx, ex, tx + gap, ty, extra[1]);
      if (extra[3]) tap(tx + 4, ty - 4, gap - 4 + ex.length * 8 + 4, 16, extra[3]);
    }
    return { x: x + 10, y: y + 10, w: tw * 8 - 20, h: th * 8 - 20 };
  }
  /** 8x8 sun (day) / crescent moon (night) for the panel title's timer, drawn here. */
  var SUN = ['...#....', '.#.#.#..', '..###...', '#######.', '..###...', '.#.#.#..', '...#....', '........'];
  var MOON = ['..####..', '.###....', '###.....', '###.....', '###.....', '.###....', '..####..', '........'];
  function dayIcon(night, col) {
    return function (c, x, y) {
      var rows = night ? MOON : SUN; c.fillStyle = col;
      rows.forEach(function (r, j) { for (var i = 0; i < 8; i++) if (r[i] === '#') c.fillRect(x + i, y + j, 1, 1); });
    };
  }
  // ------------------------------------------------------------------ DANCES pop-up (0.15)
  // Select in play starts a dance, and the host calls onSelect(): the dance list pops up over the pane and closes once
  // Shantae moves (the dance ended, she transformed or warped), after 20 s, or on a tap. The note button by the gear
  // opens it by hand (closed by a tap). The DANCES tab is gone.
  var dancePop = null;
  window.onSelect = function () { if (!st || st.state !== 2) return; stats.dances++; statsDirty = true; dancePop = { t: Date.now(), x: st.x, y: st.y, map: st.map }; draw(); };
  function danceTick() {
    if (!dancePop || dancePop.manual) return;
    var age = Date.now() - dancePop.t;
    if (!st || age > 20000 || st.map !== dancePop.map ||
        (age > 600 && (Math.abs(st.x - dancePop.x) > 3 || Math.abs(st.y - dancePop.y) > 3))) dancePop = null;
  }
  function drawDancePop() {
    var P = layout.pane, w = Math.min(P.w, 240), h = Math.min(P.h, 12 * 11 + 70), x = P.x + Math.round((P.w - w) / 2), y = P.y + 14;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(P.x, P.y, P.w, P.h);
    var p = panel(x, y, w, h, 'DANCES');
    tap(P.x, P.y, P.w, P.h, function () { dancePop = null; });   // before the rows, so a row's tap wins (last one hit)
    drawDances(p);
  }
  // 0.33, Shantae Dual only: tap a learned dance and the app dances it. Select starts the beat; input k is taken when
  // pressed at frame 18 + 64k after it (a window of about 24 frames; SHANTAE-RAM.md "Dance timing"). N.input plays
  // the presses on the game's own frames, so fast-forward keeps the beat. Shantae Link can't press buttons.
  var DANCE_BITS = { U: 16, D: 32, L: 64, R: 128, A: 256, B: 1 }, autoDance = null;
  function canAutoDance() { return DUAL && N.input && st && st.state === 2; }
  function danceFor(i) {
    var keys = S.DANCES[i][1], seq = ['4:2'];
    for (var k = 0; k < keys.length; k++) seq.push('0:' + (k ? 61 : 18), DANCE_BITS[keys[k]] + ':3');
    N.input(seq.join(','));
    autoDance = { i: i, until: Date.now() + (20 + 64 * keys.length) * 17 };
    stats.dances++; statsDirty = true;                    // the host's onSelect only sees the player's own Select
    dancePop = null;
    if (N.panelOn && N.panelOn() && N.panel) N.panel(false);   // SINGLE SCREEN: out of the way, to watch the dance
  }
  var NOTE = ['....####', '....#..#', '....#..#', '....#..#', '..###.##', '.####.##', '.####...', '..##....'];
  function noteButton(x, y) {
    var on = !!dancePop, bw = 16, bh = 12;
    ctx.fillStyle = on ? C.sel : '#1a0c24'; ctx.fillRect(x, y, bw, bh);
    if (on) { ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1); }
    ctx.fillStyle = on ? C.gold : C.lgrey;
    var gy = y + Math.floor((bh - 8) / 2);
    NOTE.forEach(function (row, j) { for (var i = 0; i < 8; i++) if (row[i] === '#') ctx.fillRect(x + 4 + i, gy + j, 1, 1); });
    tap(x - 2, y - 2, bw + 4, bh + 6, function () { dancePop = dancePop ? null : { t: Date.now(), manual: true }; });
  }
  /** OPTIONS as a gear at the panel's top right (0.14); tap again to go back to the tab you were on. */
  var GEAR = ['....##....', '.#.####.#.', '.########.', '..##..##..', '###....###', '###....###', '..##..##..', '.########.', '.#.####.#.', '....##....'];
  var lastTab = 'world';
  function gearButton(x, y) {
    var on = tab === 'options', bw = 16, bh = 12;
    ctx.fillStyle = on ? C.sel : '#1a0c24'; ctx.fillRect(x, y, bw, bh);
    if (on) { ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1); }
    ctx.fillStyle = on ? C.gold : C.lgrey;
    var gy = y + Math.floor((bh - 10) / 2);
    GEAR.forEach(function (row, j) { for (var i = 0; i < 10; i++) if (row[i] === '#') ctx.fillRect(x + 3 + i, gy + j, 1, 1); });
    tap(x - 4, y - 2, bw + 8, bh + 6, function () {
      if (tab === 'options') tab = tabs.indexOf(lastTab) >= 0 ? lastTab : tabs[0];
      else { lastTab = tab; tab = 'options'; }
      save('sd.tab', tab);
    });
  }
  function heartsRow(x, y, cur, max, perRow) {
    var n = Math.ceil(max / 4);
    for (var i = 0; i < n; i++) {
      var hx = x + (i % perRow) * 9, hy = y + Math.floor(i / perRow) * 9, fill = Math.max(0, Math.min(4, cur - i * 4));
      G.glyph(ctx, G.ICON.HEART0, hx, hy, C.heart0, C.heart0);
      if (fill > 0) {                                   // quarter hearts: clip the full heart from the left
        ctx.save(); ctx.beginPath(); ctx.rect(hx, hy, fill * 2, 8); ctx.clip();
        G.glyph(ctx, G.ICON.HEART, hx, hy, C.heart, '#f8a8b8'); ctx.restore();
      }
    }
    return Math.ceil(n / perRow) * 9;
  }
  function dot(x, y, on, col) { ctx.fillStyle = on ? col : '#2a1838'; ctx.fillRect(x, y, 6, 6); if (on) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, y + 1, 1, 1); } }
  function sunMoon(x, y, night, frac) {                // 12x12 day/night dial drawn here (no game art)
    ctx.fillStyle = night ? '#1a1048' : '#285898'; ctx.fillRect(x, y, 14, 14);
    ctx.fillStyle = night ? C.moon : C.sun;
    for (var dy = -4; dy <= 4; dy++) { var w = Math.round(Math.sqrt(16 - dy * dy)); ctx.fillRect(x + 7 - w, y + 7 + dy, w * 2, 1); }
    if (night) { ctx.fillStyle = '#1a1048'; for (dy = -4; dy <= 3; dy++) { w = Math.round(Math.sqrt(12 - dy * dy)); ctx.fillRect(x + 9 - w, y + 6 + dy, w * 2, 1); } }
    ctx.fillStyle = '#000'; ctx.fillRect(x, y + 15, 14, 2);
    ctx.fillStyle = night ? C.purple : C.gold; ctx.fillRect(x, y + 15, Math.round(14 * frac), 2);
  }
  function arrow(x, y, k, col) {                       // dance inputs, 8x8, drawn here
    ctx.fillStyle = col;
    var P = { U: [[3, 1, 2, 1], [2, 2, 4, 1], [1, 3, 6, 1], [3, 4, 2, 3]], D: [[3, 1, 2, 3], [1, 4, 6, 1], [2, 5, 4, 1], [3, 6, 2, 1]],
              L: [[1, 3, 1, 2], [2, 2, 1, 4], [3, 1, 1, 6], [4, 3, 3, 2]], R: [[6, 3, 1, 2], [5, 2, 1, 4], [4, 1, 1, 6], [1, 3, 3, 2]] }[k];
    if (P) { P.forEach(function (r) { ctx.fillRect(x + r[0], y + r[1], r[2], r[3]); }); return; }
    G.text(ctx, k, x, y, col);
  }
  function tap(x, y, w, h, fn, drag) { buttons.push({ x: x, y: y, w: w, h: h, fn: fn, drag: drag }); }

  // ------------------------------------------------------------------ SHANTAE (status + items in one; tap an item to equip)
  var itemMsg = '', itemMsgT = 0;
  function drawStatus(p) {
    var x = p.x, y = p.y, w = p.w;
    if (!st) return;
    if (figure && w >= 140 && p.h >= 168) return drawStatusFigure(p, figure);
    // hearts, and gems on the right
    var gx = x + w - 34;
    G.glyph(ctx, G.ICON.GEM, gx, y, C.gem, '#3878a8'); G.text(ctx, pad(Math.min(999, st.gems), 3), gx + 10, y, C.white);
    y += 2 + heartsRow(x, y, st.hearts, st.maxHearts, Math.max(5, Math.floor((w - 40) / 9)));
    // day / night: dial + time to the change
    var t = st.time, night = st.night, left = ((night ? 0x10000 : 0x8000) - t) / 4;
    sunMoon(x, y + 1, night, (t & 0x7FFF) / 0x8000);
    G.text(ctx, (night ? 'DAWN IN ' : 'DUSK IN ') + mmss(left), x + 18, y + 5, night ? C.purple : C.gold);
    y += 22;
    // the 12 items: icon + count, tap to equip; the equipped one is lit and named below
    var cols = w >= 200 ? 6 : 4, cw = Math.floor(w / cols), side = cw >= 34, ch = side ? 20 : 28;
    for (var i = 0; i < 12; i++) {
      var ix = x + (i % cols) * cw, iy = y + Math.floor(i / cols) * ch, n = st.items[i], on = i === st.equipped;
      if (on) { ctx.fillStyle = C.sel; ctx.fillRect(ix, iy, cw - 2, ch - 2); }
      var im = iconImage('item' + i);
      if (im) { ctx.globalAlpha = n ? 1 : 0.25; ctx.drawImage(im, ix + 1, iy + 1); ctx.globalAlpha = 1; }
      else { ctx.fillStyle = n ? C.dpurple : '#1a0c24'; ctx.fillRect(ix + 1, iy + 1, 16, 16); G.textC(ctx, String(i + 1), ix + 9, iy + 5, n ? C.ink : C.grey); }
      if (n) G.text(ctx, String(Math.min(99, n)), side ? ix + 19 : ix + 1, side ? iy + 5 : iy + 18, on ? C.gold : C.white);
      (function (idx, cnt) { tap(ix, iy, cw - 2, ch - 2, function () {
        if (!cnt) { itemMsg = 'NONE LEFT'; itemMsgT = tickN + 20; return; }
        if (N && N.equip && N.equip(idx)) { itemMsg = ''; itemMsgT = 0; }
      }); })(i, n);
    }
    y += Math.ceil(12 / cols) * ch + 1;
    var e = st.equipped < 12 && st.items[st.equipped] > 0 ? st.equipped : -1, maxc = Math.floor(w / 8);
    if (itemMsgT > tickN) G.text(ctx, itemMsg, x, y, C.red);
    else if (e >= 0) { G.text(ctx, S.ITEMS[e], x, y, C.gold); var note = S.ITEM_NOTE[e].toUpperCase();
      if (S.ITEMS[e].length + 3 + note.length <= maxc) G.text(ctx, '- ' + note, x + (S.ITEMS[e].length + 1) * 8, y, C.lgrey); }
    else G.text(ctx, 'TAP AN ITEM TO EQUIP', x, y, C.grey);
    y += 13;
    // stones and talismans in one row, then Fighter's Gear (lit once bought)
    for (i = 0; i < 4; i++) iconOrDot('stone' + i, st.stones[i], x + i * 17, y, C.teal);
    for (i = 0; i < 4; i++) iconOrDot('tal' + i, st.talismans[i], x + 72 + i * 17, y, C.ink);
    y += 19;
    var gx2 = x, gap = Math.max(4, Math.floor((w - 136) / 3));         // BOOT SASH CUFF TIARA = 136 px of text
    S.GEAR.forEach(function (g) { G.text(ctx, g[0], gx2, y, st.gear[S.GEAR.indexOf(g)] ? C.white : '#4a3858'); gx2 += g[0].length * 8 + gap; });
    y += 13;
    // only what matters right now: squids to hand in
    if (st.squids > 0 && y + 8 <= p.y + p.h) G.text(ctx, (w >= 180 ? 'SQUIDS TO HAND IN ' : 'SQUIDS HELD ') + Math.min(99, st.squids), x, y, C.teal);
  }
  /** A framed 18 px slot with the game's icon: full colour when owned, a faint silhouette when not (0.17: the tab
   *  read as empty early in the game, when nothing is owned yet). */
  function slotIcon(key, have, x, y, col) {
    ctx.fillStyle = have ? C.dpurple : '#140a1e'; ctx.fillRect(x, y, 18, 18);
    ctx.strokeStyle = have ? C.lgrey : '#3a2a4e'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 17, 17);
    var im = iconImage(key);
    if (im) { ctx.globalAlpha = have ? 1 : 0.3; ctx.drawImage(im, x + 1, y + 1); ctx.globalAlpha = 1; }
    else if (have) { ctx.fillStyle = col; ctx.fillRect(x + 4, y + 4, 10, 10); }
  }

  /** SHANTAE with the figure: hearts and gems, then Shantae (gear on her) beside items, stones, talismans and the rest. */
  function drawStatusFigure(p, F) {
    var x = p.x, y = p.y, w = p.w, i;
    var gx = x + w - 34;
    G.glyph(ctx, G.ICON.GEM, gx, y, C.gem, '#3878a8'); G.text(ctx, pad(Math.min(999, st.gems), 3), gx + 10, y, C.white);
    y += 2 + heartsRow(x, y, st.hearts, st.maxHearts, Math.max(5, Math.floor((w - 40) / 9)));
    var t = st.time, night = st.night, left = ((night ? 0x10000 : 0x8000) - t) / 4;
    sunMoon(x, y + 1, night, (t & 0x7FFF) / 0x8000);
    G.text(ctx, (night ? 'DAWN IN ' : 'DUSK IN ') + mmss(left), x + 18, y + 5, night ? C.purple : C.gold);
    y += 22;
    // Shantae, framed, gear she has on her and the rest faint
    var fy = y;
    ctx.fillStyle = C.dred; ctx.fillRect(x - 1, fy - 1, 74, 138);
    ctx.drawImage(F.body, x, fy);
    ['boot', 'cuff', 'sash', 'tiara'].forEach(function (g) { ctx.globalAlpha = st.gear[['boot', 'sash', 'cuff', 'tiara'].indexOf(g)] ? 1 : 0.22; ctx.drawImage(F[g], x, fy); });
    ctx.globalAlpha = 1;
    ctx.drawImage(F.top, x, fy);
    var got = st.gear.filter(Boolean).length;
    // right of her: the 12 items (tap to equip), stones and talismans, squids, fireflies and gear, the equipped item
    var rx = x + 80, rw = w - 80, cols = rw >= 6 * 34 ? 6 : 4, cw = Math.floor(rw / cols), side = cw >= 34, ch = side ? 20 : 28, ry = fy;
    for (i = 0; i < 12; i++) {
      var ix = rx + (i % cols) * cw, iy = ry + Math.floor(i / cols) * ch, n = st.items[i], on = i === st.equipped && n > 0;
      if (on) { ctx.fillStyle = C.sel; ctx.fillRect(ix, iy, cw - 2, ch - 2); ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(ix + 0.5, iy + 0.5, cw - 3, ch - 3); }
      slotIcon('item' + i, n > 0, ix, iy, C.ink);
      if (n) G.text(ctx, String(Math.min(99, n)), side ? ix + 19 : ix + 1, side ? iy + 5 : iy + 18, on ? C.gold : C.white);
      (function (idx, cnt) { tap(ix, iy, cw - 2, ch - 2, function () {
        if (!cnt) { itemMsg = 'NONE LEFT'; itemMsgT = tickN + 20; return; }
        if (N && N.equip && N.equip(idx)) { itemMsg = ''; itemMsgT = 0; }
      }); })(i, n);
    }
    ry += Math.ceil(12 / cols) * ch + 4;
    var oneRow = rw >= 8 * 19 + 8;
    for (i = 0; i < 4; i++) slotIcon('stone' + i, st.stones[i], rx + i * 19, ry, C.teal);
    for (i = 0; i < 4; i++) slotIcon('tal' + i, st.talismans[i], oneRow ? rx + 82 + i * 19 : rx + i * 19, oneRow ? ry : ry + 20, C.ink);
    ry += oneRow ? 22 : 42;
    var sq = iconImage('squid'), ff = iconImage('firefly'), third = Math.floor(rw / 3), wide = rw >= 180;
    if (sq) ctx.drawImage(sq, rx, ry); G.text(ctx, String(Math.min(99, st.squids)), rx + 18, ry + 5, C.teal);
    if (ff) ctx.drawImage(ff, rx + (wide ? third : Math.floor(rw / 2)), ry); G.text(ctx, String(Math.min(99, st.fireflies)), rx + (wide ? third : Math.floor(rw / 2)) + 18, ry + 5, C.ink);
    var gearAt = wide ? [rx + 2 * third, ry + 5] : [rx, ry + 24];
    G.text(ctx, 'GEAR ' + got + '/4', gearAt[0], gearAt[1], got === 4 ? C.gold : C.lgrey);
    ry = gearAt[1] + 14;
    // the equipped item and what it does: beside her if there's room, else below
    var e = st.equipped < 12 && st.items[st.equipped] > 0 ? st.equipped : -1;
    var tx = rx, ty = ry, maxc = Math.floor(rw / 8);
    if (ty + 18 > fy + 136) { tx = x; ty = Math.max(fy + 142, ry); maxc = Math.floor(w / 8); }
    if (ty + 8 <= p.y + p.h) {
      if (itemMsgT > tickN) G.text(ctx, itemMsg, tx, ty, C.red);
      else if (e >= 0) {
        G.text(ctx, S.ITEMS[e].substr(0, maxc), tx, ty, C.gold);
        if (ty + 18 <= p.y + p.h) G.text(ctx, S.ITEM_NOTE[e].toUpperCase().substr(0, maxc), tx, ty + 10, C.lgrey);
      } else G.text(ctx, 'TAP AN ITEM TO EQUIP'.substr(0, maxc), tx, ty, C.grey);
    }
    // below her, room permitting: what each gear piece she has lets her do
    y = Math.max(fy + 142, ty + 24);
    var mc = Math.floor(w / 8);
    S.GEAR.forEach(function (g, k) {
      if (!st.gear[k] || y + 8 > p.y + p.h) return;
      G.text(ctx, (g[0] + ' ' + g[1].toUpperCase()).substr(0, mc), x, y, C.lgrey); y += 10;
    });
  }
  function iconOrDot(key, have, x, y, col) {
    var im = iconImage(key);
    if (im) { ctx.globalAlpha = have ? 1 : 0.25; ctx.drawImage(im, x, y); ctx.globalAlpha = 1; }
    else { ctx.fillStyle = have ? col : '#2a1838'; ctx.fillRect(x + 3, y + 3, 10, 10); if (have) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 4, y + 4, 2, 2); } }
  }

  // ------------------------------------------------------------------ DANCES
  function drawDances(p) {
    if (!st) return;
    var y = p.y, gba = !(N && N.gbaMode) || N.gbaMode(), auto = canAutoDance(), busy = autoDance && Date.now() < autoDance.until;
    var head = busy ? 'DANCING...' : auto ? 'TAP TO AUTOMATICALLY PERFORM:' : 'SELECT, THEN ON THE BEAT:';
    if (head.length * 8 > p.w && auto && !busy) { G.text(ctx, 'TAP TO AUTOMATICALLY', p.x, y, C.lgrey); y += 10; head = 'PERFORM:'; }
    G.text(ctx, head, p.x, y, busy ? C.gold : C.lgrey); y += 12;
    S.DANCES.forEach(function (d, i) {
      if (i === 10 && !gba && !st.dances[10]) return;
      var have = st.dances[i], on = busy && autoDance.i === i;
      if (on) { ctx.fillStyle = C.sel; ctx.fillRect(p.x - 2, y - 2, p.w + 4, 11); }
      G.text(ctx, have ? d[0] : '?????', p.x, y, on ? C.gold : have ? C.ink : C.grey);
      var ax = p.x + Math.max(88, p.w - d[1].length * 9 - 2);
      for (var k = 0; k < d[1].length; k++) arrow(ax + k * 9, y, d[1][k], have ? C.white : '#4a3858');
      if (auto && have && !busy) (function (idx) { tap(p.x - 2, y - 2, p.w + 4, 11, function () { danceFor(idx); }); })(i);
      y += 11;
    });
    var n = st.dances.filter(Boolean).length;
    G.text(ctx, n + ' OF ' + (gba || st.dances[10] ? 11 : 10) + ' LEARNED', p.x, y + 4, C.gold);   // Tinkerbat shown once learned
  }

  // ------------------------------------------------------------------ WORLD (signposts from the ROM)
  var worldScroll = 0, worldView = load('sd.worldView', 'map');
  function drawWorld(p) {
    if (window.ShantaeMap) {                     // the room from the game's level data, or the signposts
      if (worldView === 'map') {                 // 0.12: the map fills the pane; details are on cards from its side buttons
        var r = ShantaeMap.draw(ctx, p, G, C, function (k) { return k === 'heart' ? null : iconImage(k); });
        if (r.box) tap(r.box.x, r.box.y, r.box.w, r.box.h, function () { ShantaeMap.zoom(); },   // tap the map: x1 / x2 / ALL;
                       function (dx, dy) { ShantaeMap.pan(dx, dy); });                          // drag it to scroll
        r.side.forEach(function (b) {
          tap(b.x, b.y, b.w, b.h, b.key === 'signs' ? function () { worldView = 'signs'; save('sd.worldView', worldView); }
                                                    : function () { ShantaeMap.card(b.key); });
        });
        if (r.card) tap(r.card.x, r.card.y, r.card.w, r.card.h, function () { ShantaeMap.card(ShantaeMap.cardOpen()); });   // tap the card: close
        return;
      }
      var bw = Math.min(p.w, 96);
      button('MAP', p.x + p.w - bw, p.y + p.h - 12, bw, function () { worldView = 'map'; save('sd.worldView', worldView); });
      p = { x: p.x, y: p.y, w: p.w, h: p.h - 16 };
    }
    var y = p.y;
    if (!signs) { G.text(ctx, 'NO SIGNPOSTS', p.x, y, C.grey); return; }
    G.text(ctx, 'SEQUIN LAND SIGNPOSTS', p.x, y, C.gold); y += 12;
    // 0.25: a list you drag up and down (worldScroll in pixels), clipped to the pane, with a position bar
    var rowH = 20, top = y, viewH = p.y + p.h - y, total = signs.length * rowH, maxS = Math.max(0, total - viewH);
    worldScroll = Math.max(0, Math.min(worldScroll, maxS));
    ctx.save(); ctx.beginPath(); ctx.rect(p.x, top, p.w, viewH); ctx.clip();
    var lw = maxS ? p.w - 6 : p.w;
    for (var i = Math.floor(worldScroll / rowH); i < signs.length; i++) {
      var s = signs[i], yy = top + i * rowH - worldScroll;
      if (yy > top + viewH) break;
      ctx.fillStyle = C.dpurple; ctx.fillRect(p.x, yy, lw, rowH - 3);
      G.text(ctx, s.name, p.x + 4, yy + 1, C.ink);
      var wx = s.west, ex = s.east, half = Math.floor((lw - 8) / 16) - 2;
      arrow(p.x + 4, yy + 9, 'L', C.grey); G.text(ctx, wx.substr(0, half), p.x + 13, yy + 9, C.lgrey);
      var ew = Math.min(ex.length, half);
      G.text(ctx, ex.substr(0, ew), p.x + lw - ew * 8 - 13, yy + 9, C.lgrey); arrow(p.x + lw - 12, yy + 9, 'R', C.grey);
    }
    ctx.restore();
    if (maxS) {
      var bh = Math.max(12, Math.round(viewH * viewH / total)), by = top + Math.round((viewH - bh) * worldScroll / maxS);
      ctx.fillStyle = '#2a1838'; ctx.fillRect(p.x + p.w - 3, top, 3, viewH);
      ctx.fillStyle = C.gold; ctx.fillRect(p.x + p.w - 3, by, 3, bh);
      tap(p.x, top, p.w, viewH, function () {}, function (dx, dy) { worldScroll = Math.max(0, Math.min(maxS, worldScroll - dy)); });
    }
  }

  // ------------------------------------------------------------------ PROGRESS (0.20: was 100%): ITEMS / MONSTERS / STORY / STATS
  var progView = load('sd.progView', 'items');
  try { localStorage.removeItem('sd.mon1'); } catch (e) {}              // the 0.20-0.26 list (other entries, cut pictures)
  function drawProgress(p) {
    if (!st) return;
    var views = [['items', 'ITEMS'], ['monsters', Math.floor(p.w / 4) >= 68 ? 'MONSTERS' : 'MOBS'], ['story', 'STORY'], ['stats', 'STATS']], bw = Math.floor(p.w / views.length);
    views.forEach(function (v, i) {
      var on = progView === v[0], x = p.x + i * bw;
      ctx.fillStyle = on ? C.sel : C.dpurple; ctx.fillRect(x, p.y, bw - 2, 12);
      if (on) { ctx.fillStyle = C.gold; ctx.fillRect(x, p.y + 11, bw - 2, 1); }
      G.textC(ctx, v[1], x + bw / 2 - 1, p.y + 2, on ? C.white : C.lgrey);
      tap(x, p.y, bw - 2, 12, function () { progView = v[0]; save('sd.progView', progView); });
    });
    var q = { x: p.x, y: p.y + 16, w: p.w, h: p.h - 16 };
    if (progView === 'story') drawStory(q); else if (progView === 'stats') drawStats(q); else if (progView === 'monsters') drawMonsters(q); else drawList(q);
  }

  // Monster list (0.20, back in 0.30): every enemy, lit up with its picture (decoded from the ROM) the first time it's
  // on screen (monsters.js). Unmet ones show where to look.
  var monScroll = 0, monPick = -1;
  function drawMonsters(p) {
    var MS = window.ShantaeMonsters, L = MS ? MS.LIST : [];
    if (!L.length) { G.text(ctx, 'NO MONSTER LIST', p.x, p.y, C.grey); return; }
    var seen = MS.count();
    G.text(ctx, 'MET ' + seen + ' OF ' + L.length, p.x, p.y, C.gold);
    ctx.fillStyle = '#2a1838'; ctx.fillRect(p.x, p.y + 10, p.w, 3); ctx.fillStyle = C.gold; ctx.fillRect(p.x, p.y + 10, Math.round(p.w * seen / L.length), 3);
    var cell = 40, cols = Math.max(1, Math.floor(p.w / cell)), cw = Math.floor(p.w / cols);
    var top = p.y + 18, infoH = 22, rows = Math.max(1, Math.floor((p.h - 18 - infoH) / cell)), pages = Math.ceil(L.length / (cols * rows));
    monScroll = Math.max(0, Math.min(monScroll, pages - 1));
    var start = monScroll * cols * rows;
    for (var k = 0; k < cols * rows && start + k < L.length; k++) {
      var x = p.x + (k % cols) * cw, y = top + Math.floor(k / cols) * cell, on = MS.seen(start + k);
      ctx.fillStyle = monPick === start + k ? C.sel : on ? C.dpurple : '#140a1e'; ctx.fillRect(x + 1, y + 1, cw - 2, cell - 2);
      ctx.strokeStyle = monPick === start + k ? C.gold : on ? '#9a7ab8' : '#3a2a4e'; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, cw - 3, cell - 3);
      var im = on ? MS.image(start + k, N) : null;
      if (im) {
        var sc = Math.min(1, (cw - 6) / im.width, (cell - 6) / im.height);
        ctx.drawImage(im, Math.round(x + (cw - im.width * sc) / 2), Math.round(y + (cell - im.height * sc) / 2), Math.round(im.width * sc), Math.round(im.height * sc));
      } else G.textC(ctx, on ? '!' : '?', x + cw / 2, y + cell / 2 - 4, on ? C.ink : '#4a3a5e');
      (function (idx) { tap(x, y, cw, cell, function () { monPick = monPick === idx ? -1 : idx; }); })(start + k);
    }
    var iy = p.y + p.h - infoH + 2, maxc = Math.floor(p.w / 8);
    if (monPick >= 0 && L[monPick]) {
      var m = L[monPick], met = MS.seen(monPick);
      G.text(ctx, (met ? m[1] : '???').substr(0, maxc), p.x, iy, met ? C.white : C.grey);
      G.text(ctx, m[2].substr(0, maxc), p.x, iy + 10, C.lgrey);
    } else G.text(ctx, 'TAP ONE FOR ITS NAME', p.x, iy + 4, C.grey);
    if (pages > 1) {
      G.textR(ctx, (monScroll + 1) + '/' + pages + ' >', p.x + p.w, iy + 10, C.gold);
      tap(p.x + p.w - 64, iy, 64, infoH, function () { monScroll = (monScroll + 1) % pages; monPick = -1; });
    }
  }

  // Stats, counted on this device while the game runs (play-state frames from the game's own frame counter $C377;
  // a jump in that counter = a state or save was loaded, and that tick's changes aren't counted).
  var STATS0 = { t: 0, gemsIn: 0, gemsOut: 0, items: 0, hearts: 0, deaths: 0, dances: 0, nights: 0, since: 0 };
  var stats = load('sd.stats', null) || {}, statsDirty = false, prevSt = null, statArm = 0;
  Object.keys(STATS0).forEach(function (k) { if (typeof stats[k] !== 'number') stats[k] = STATS0[k]; });
  if (!stats.since) { stats.since = Date.now(); statsDirty = true; }
  function trackStats() {
    var cur = st && st.inGame ? st : null, pv = prevSt;
    prevSt = cur ? { frames: cur.frames, gems: cur.gems, items: cur.items.slice(), hearts: cur.hearts, night: cur.night, map: cur.map } : null;
    if (!cur || !pv) return;
    var df = (cur.frames - pv.frames) & 0xFFFF;
    if (df === 0) return;                                              // paused
    if (df > 600) return;                                              // a load: skip this tick's differences
    stats.t += df;
    var dg = cur.gems - pv.gems;
    if (dg > 0) stats.gemsIn += dg; else stats.gemsOut -= dg;
    for (var i = 0; i < 12; i++) if (cur.items[i] < pv.items[i]) stats.items += pv.items[i] - cur.items[i];
    if (cur.hearts < pv.hearts) stats.hearts += pv.hearts - cur.hearts;
    if (pv.hearts > 0 && cur.hearts === 0) stats.deaths++;
    if (!pv.night && cur.night) stats.nights++;
    statsDirty = true;
    if (statsDirty && tickN % 30 === 0) { save('sd.stats', stats); statsDirty = false; }
  }
  function hms(frames) { var s = Math.floor(frames / 59.7275); return Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60, 2) + ':' + pad(s % 60, 2); }
  function drawStats(p) {
    var rows = [['PLAY TIME', hms(stats.t)], ['GEMS EARNED', String(stats.gemsIn)], ['GEMS SPENT', String(stats.gemsOut)],
                ['ITEMS USED', String(stats.items)], ['HEARTS LOST', (stats.hearts / 4).toFixed(stats.hearts % 4 ? 2 : 0)],
                ['TIMES DOWN', String(stats.deaths)], ['DANCES', String(stats.dances)], ['NIGHTS', String(stats.nights)]];
    var y = p.y, rh = p.h >= rows.length * 13 + 30 ? 13 : 11;
    rows.forEach(function (r, i) {
      if (y + 10 > p.y + p.h - 14) return;
      ctx.fillStyle = i % 2 ? '#1a0c24' : C.dpurple; ctx.fillRect(p.x, y, p.w, rh - 2);
      G.text(ctx, r[0], p.x + 3, y + (rh - 10) / 2 + 1, C.lgrey);
      G.textR(ctx, r[1], p.x + p.w - 3, y + (rh - 10) / 2 + 1, C.white);
      y += rh;
    });
    var d = new Date(stats.since), since = 'SINCE ' + pad(d.getMonth() + 1, 2) + '/' + pad(d.getDate(), 2) + '/' + String(d.getFullYear()).slice(2);
    var by = p.y + p.h - 12, rw = Math.min(64, Math.floor(p.w / 3));
    G.text(ctx, since, p.x, by + 2, C.grey);
    var armed = statArm > tickN;
    button(armed ? 'SURE?' : 'RESET', p.x + p.w - rw, by, rw, function () {
      if (statArm <= tickN) { statArm = tickN + 40; return; }
      stats = JSON.parse(JSON.stringify(STATS0)); stats.since = Date.now(); save('sd.stats', stats); statArm = 0;
    });
  }

  // Story hint, hidden until tapped: the next step from the stones and transformation dances she has.
  var storyOpen = false;
  var STORY = [
    ['THE STEAM ENGINE', 'Risky stole Scuttle Town\'s steam engine. Head east through Scarecrow Field and Spiderwood Forest to Water Town, then into the Dribble Fountain labyrinth.'],
    ['DRIBBLE FOUNTAIN', 'You have the Monkey dance: climb walls with it in Dribble Fountain, find the boss and win the Dribble Stone.'],
    ['THE GOLEM STONE', 'Next stone: head for Oasis Town in the desert, then find the Golem Mine.'],
    ['GOLEM MINE', 'You have the Elephant dance: smash through blocks in the Golem Mine and beat its boss for the Golem Stone.'],
    ['THE ZOMBIE CARAVAN', 'Find the Zombie Caravan. It only appears at night. Rottytops can take you to the Cackle Mound labyrinth.'],
    ['CACKLE MOUND', 'You have the Spider dance: climb webs and walls in Cackle Mound and beat its boss for the Simmer Stone.'],
    ['THE TWINKLE STONE', 'Last stone: the Twinkle Palace near the top of Mount Pointy. Bandit Town is on the way.'],
    ['TWINKLE PALACE', 'You have the Harpy dance: fly through Twinkle Palace and beat its boss for the Twinkle Stone.'],
    ['RISKY BOOTS', 'All four stones are yours. Take the fight to Risky Boots and her Tinkertank.']];
  function storyStep() {
    var sd = st.stones, dn = st.dances;
    for (var k = 0; k < 4; k++) if (!sd[k]) return k * 2 + (dn[k] ? 1 : 0);
    return 8;
  }
  function drawStory(p) {
    var step = storyStep(), y = p.y, i;
    G.text(ctx, 'STONES', p.x, y + 4, C.lgrey);
    for (i = 0; i < 4; i++) slotIcon('stone' + i, st.stones[i], p.x + 56 + i * 20, y, C.teal);
    y += 22;
    G.text(ctx, 'STEP ' + (step + 1) + ' OF ' + STORY.length, p.x, y, C.gold);
    ctx.fillStyle = '#2a1838'; ctx.fillRect(p.x, y + 10, p.w, 3); ctx.fillStyle = C.gold; ctx.fillRect(p.x, y + 10, Math.round(p.w * step / (STORY.length - 1)), 3);
    y += 20;
    var bottom = p.y + p.h;
    if (!storyOpen) {
      ctx.fillStyle = C.dpurple; ctx.fillRect(p.x, y, p.w, 28);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.strokeRect(p.x + 0.5, y + 0.5, p.w - 1, 27);
      G.textC(ctx, 'TAP TO SHOW A HINT', p.x + p.w / 2, y + 6, C.white);
      G.textC(ctx, '(SPOILS THE NEXT STEP)', p.x + p.w / 2, y + 16, C.grey);
      tap(p.x, y, p.w, 28, function () { storyOpen = true; });
      return;
    }
    var h = STORY[step];
    G.text(ctx, h[0], p.x, y, C.ink); y += 12;
    var maxc = Math.floor(p.w / 8), line = '';
    h[1].toUpperCase().split(' ').forEach(function (w) {
      if ((line + ' ' + w).trim().length > maxc) { if (y + 8 <= bottom - 10) G.text(ctx, line, p.x, y, C.lgrey); y += 10; line = w; }
      else line = (line + ' ' + w).trim();
    });
    if (line && y + 8 <= bottom - 10) G.text(ctx, line, p.x, y, C.lgrey);
    G.text(ctx, 'TAP TO HIDE', p.x, bottom - 8, C.grey);
    tap(p.x, p.y + 42, p.w, p.h - 42, function () { storyOpen = false; });
  }

  // Boss health bars (0.20). HP lives in the boss's object node (WRAM bank 3, nodes every $7E from $D000): Risky's ship
  // fight (map $03): the Tinker ship node at $D276 (script bank $1A), HP at +$64 ($D2DA); Risky's node at $D0FC (bank
  // $1A), HP at +$63 ($D15F). The bar shows only while that node runs the boss's script.
  var boss = [], bossMax = {};
  var BOSSES = [{ id: 'ship', name: 'TINKER SHIP', map: 3, node: 0xD276, hp: 0x64, bank: 0x1A, lo: 0x5300, hi: 0x5600, full: 10 },
                { id: 'risky', name: 'RISKY BOOTS', map: 3, node: 0xD0FC, hp: 0x63, bank: 0x1A, lo: 0x4D00, hi: 0x5000, hidden: 64 }];
  function readBoss() {
    boss = [];
    if (!st || st.state !== 2 || !N || !N.mem) return;
    BOSSES.forEach(function (b) {
      if (st.map !== b.map) { delete bossMax[b.id]; return; }
      var h = N.mem('w3:' + (b.node + 2).toString(16) + ':3,w3:' + (b.node + b.hp).toString(16) + ':1');
      if (!h || h.length < 8) return;
      var pc = parseInt(h.substr(2, 2) + h.substr(0, 2), 16), bank = parseInt(h.substr(4, 2), 16), hp = parseInt(h.substr(6, 2), 16);
      if (bank !== b.bank || pc < b.lo || pc >= b.hi) return;
      bossMax[b.id] = Math.max(bossMax[b.id] || b.full || 0, hp);
      if (b.hidden && hp === b.hidden && bossMax[b.id] === hp) return;   // Risky waits at full HP until her turn
      if (hp > 0) boss.push({ name: b.name, hp: hp, max: bossMax[b.id] });
    });
  }
  function drawBoss() {
    if (!boss.length) return;
    var P = layout.pane, w = Math.min(P.w - 48, 200), x = P.x + P.w - w - 12, y = P.y + P.h - 12 - boss.length * 22;
    boss.forEach(function (b, i) {
      var yy = y + i * 22;
      ctx.fillStyle = 'rgba(12,4,24,0.92)'; ctx.fillRect(x, yy, w, 20);
      ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, 19);
      G.text(ctx, b.name, x + 4, yy + 3, C.white); G.textR(ctx, b.hp + '/' + b.max, x + w - 4, yy + 3, C.lgrey);
      ctx.fillStyle = '#3a1020'; ctx.fillRect(x + 4, yy + 13, w - 8, 4);
      ctx.fillStyle = b.hp * 4 <= b.max ? C.red : C.heart; ctx.fillRect(x + 4, yy + 13, Math.round((w - 8) * b.hp / Math.max(1, b.max)), 4);
    });
  }

  // ------------------------------------------------------------------ 100% checklist
  var listOpen = load('sd.listOpen', 'heart'), hintStart = 0;
  /** The 100% checklist rows [key, name, have, of] and the overall percentage (PROGRESS tab and the ending card). */
  function completion(st) {
    var holders = Math.max(0, Math.min(7, Math.round((st.maxHearts - 12) / 4)));
    var warps = [5, 6, 7, 8, 9].filter(function (k) { return st.dances[k]; }).length;
    var tals = st.talismans.filter(Boolean).length, gear = st.gear.filter(Boolean).length;
    var dances = st.dances.slice(0, 10).filter(Boolean).length + (st.dances[10] ? 1 : 0);
    var squidFlags = st.squidGot ? st.squidGot.filter(Boolean).length : 0;
    var squidsFound = Math.min(20, Math.max(squidFlags, warps * 4 + st.squids));   // the pick-up flags; old estimate as a floor
    var rows = [['heart', 'HEART HOLDERS', holders, 7], ['firefly', 'FIREFLIES', Math.min(12, st.fireflies), 12],
                ['squid', 'WARP SQUIDS', squidsFound, 20], ['talisman', 'TALISMANS', tals, 4], ['gear', 'FIGHTER GEAR', gear, 4],
                ['dance', 'DANCES', dances, 11]];
    var done = 0, total = 0; rows.forEach(function (r) { done += r[2]; total += r[3]; });
    return { rows: rows, done: done, total: total, percent: Math.floor(done * 100 / total) };
  }
  function drawList(p) {
    if (!st) return;
    var cp = completion(st), rows = cp.rows, done = cp.done, total = cp.total;
    var y = p.y, openRow = null;
    G.text(ctx, 'COMPLETION ' + Math.floor(done * 100 / total) + '%', p.x, y, C.gold);
    ctx.fillStyle = '#2a1838'; ctx.fillRect(p.x, y + 10, p.w, 4); ctx.fillStyle = C.gold; ctx.fillRect(p.x, y + 10, Math.round(p.w * done / total), 4);
    y += 20;
    rows.forEach(function (r) {
      var open = listOpen === r[0], full = r[2] >= r[3];
      ctx.fillStyle = open ? C.sel : C.dpurple; ctx.fillRect(p.x, y, p.w, 11);
      G.text(ctx, (open ? '-' : '+') + r[1], p.x + 2, y + 2, full ? C.green : C.ink);
      G.textR(ctx, r[2] + '/' + r[3], p.x + p.w - 2, y + 2, full ? C.green : C.white);
      (function (k) { tap(p.x, y, p.w, 11, function () { listOpen = listOpen === k ? '' : k; hintStart = 0; save('sd.listOpen', listOpen); }); })(r[0]);
      y += 13;
      if (open) openRow = r;
    });
    y += 4;
    if (openRow) y = hints(openRow[0], p, y, openRow[2] >= openRow[3]);
    else G.text(ctx, 'TAP A ROW FOR HINTS', p.x, y, C.grey);
    if (openRow && openRow[0] === 'squid' && y < p.y + p.h - 10) G.text(ctx, p.w >= 250 ? 'SQUIDS ARE MARKED ON THE MAP' : 'MARKED ON THE MAP', p.x, y, C.grey);
  }
  function hints(kind, p, y, full) {
    var list = S.HINTS[kind] || [], maxc = Math.floor((p.w - 10) / 8), bottom = p.y + p.h - 8;
    if (kind === 'gear') list = S.GEAR.map(function (g, i) { return (st.gear[i] ? '* ' : '  ') + g[0] + ': ' + g[1]; }).concat(['Water Town shop: 300/400/500/900']);
    if (kind === 'dance') list = ['Each labyrinth\'s Guardian Genie', '4 squids to a town\'s mother: warp', '12 fireflies: Healing dance',
                                  'GBA mode: Tinkerbat (Bandit Town)'];
    if (kind === 'talisman') list = list.map(function (h, i) { return (st.talismans[i] ? '* ' : '  ') + h; });
    if (kind === 'squid' && st.squidGot) list = list.map(function (h, i) {          // 5 per labyrinth, in squid-number order
      var got = st.squidGot.slice(i * 5, i * 5 + 5).filter(Boolean).length;
      return (got === 5 ? '* ' : '  ') + h.replace(/: 5$/, ': ' + got + '/5');
    });
    // word-wrap every hint, then show as many whole hints as fit from hintStart; tap the hints to page
    var wrapped = list.map(function (h) {
      var lines = [], line = '';
      h.toUpperCase().split(' ').forEach(function (w) {
        if ((line + ' ' + w).trim().length > maxc) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
      });
      if (line) lines.push(line);
      return lines;
    });
    if (hintStart >= wrapped.length) hintStart = 0;
    var y0 = y, i = hintStart, shown = 0;
    for (; i < wrapped.length && y + wrapped[i].length * 9 <= bottom; i++, shown++) {
      wrapped[i].forEach(function (ln, k) { G.text(ctx, ln, p.x + 6, y + k * 9, C.lgrey); });
      y += wrapped[i].length * 9 + 2;
    }
    if (shown < wrapped.length) {
      G.textR(ctx, (hintStart + 1) + '-' + (hintStart + shown) + '/' + wrapped.length + ' >', p.x + p.w, bottom, C.gold);
      tap(p.x, y0, p.w, bottom - y0 + 8, function () { hintStart = i >= wrapped.length ? 0 : i; });
    }
    return y + 2;
  }

  // ------------------------------------------------------------------ OPTIONS (save slots, pause)
  var slotArm = null, optMsg = '', optMsgT = 0, thumbCache = {};
  function drawOptions(p) {
    var x = p.x, y = p.y, slots = [];
    if ((DUAL || RA) && N.slots) { try { slots = JSON.parse(N.slots()); } catch (e) {} }
    G.text(ctx, RA ? 'RETROARCH STATE SLOTS' : 'SAVE STATES', x, y, C.gold); y += 12;
    var cw = Math.floor((p.w - 6) / 2), th = RA ? 6 : Math.min(54, Math.floor((p.h - 90) / 2) - 12), tw = RA ? 0 : Math.round(th * 10 / 9);
    slots.forEach(function (sl, i) {
      var cx = x + (i % 2) * (cw + 6), cy = y + Math.floor(i / 2) * (th + 26);
      ctx.fillStyle = C.dpurple; ctx.fillRect(cx, cy, cw, th + 22);
      var im = sl.time && !RA ? slotThumb(sl) : null;   // RetroArch keeps its own thumbnails out of reach
      if (im) ctx.drawImage(im, cx + 3, cy + 3, tw, th);
      else if (tw) { ctx.fillStyle = '#100818'; ctx.fillRect(cx + 3, cy + 3, tw, th); }
      G.text(ctx, String(sl.n), cx + tw + 7, cy + 4, C.ink);
      var armed = slotArm && slotArm.n === sl.n;
      button(armed && slotArm.what === 'save' ? 'SURE?' : 'SAVE', cx + 3, cy + th + 7, Math.floor(cw / 2) - 4, function () {
        if (!(slotArm && slotArm.n === sl.n && slotArm.what === 'save') && sl.time) { slotArm = { n: sl.n, what: 'save' }; return; }
        slotArm = null; var ok = N.saveSlot(sl.n); delete thumbCache[sl.n]; optMsg = ok ? 'SAVED ' + sl.n : 'FAILED'; optMsgT = tickN + 30;
      });
      // RA: RetroArch's own slots can't be listed, so LOAD is always offered
      if (sl.time || RA) button(armed && slotArm.what === 'load' ? 'SURE?' : 'LOAD', cx + Math.floor(cw / 2) + 1, cy + th + 7, Math.floor(cw / 2) - 4, function () {
        if (!(slotArm && slotArm.n === sl.n && slotArm.what === 'load')) { slotArm = { n: sl.n, what: 'load' }; return; }
        slotArm = null; var ok = N.loadSlot(sl.n); optMsg = ok ? 'LOADED ' + sl.n : 'FAILED'; optMsgT = tickN + 30;
      });
    });
    y += 2 * (th + 26) + 4;
    if (DUAL || RA) { button(RA ? 'RETROARCH MENU' : 'PAUSE GAME', x, y, p.w, function () { N.menu(); }); y += 16; }
    if (DUAL && N.overlay && N.overlay()) { button('BACK TO GAME', x, y, p.w, function () { N.close(); }); y += 16; }
    if (RA) {
      button('PICK ROM', x, y, p.w, function () { N.pickRom(); }); y += 16;
    }
    y += 2;
    G.text(ctx, 'SHANTAE LINK ' + (DUAL || RA ? N.version() : ''), x, y, C.grey);
    if (optMsgT > tickN) G.text(ctx, optMsg, x, y + 10, C.gold);
  }
  function slotThumb(sl) {
    var c = thumbCache[sl.n];
    if (c && c.time === sl.time) return c.img;
    thumbCache[sl.n] = { time: sl.time, img: null };
    var url = DUAL && N.thumb ? N.thumb(sl.n) : '';
    if (url) { var im = new Image(); im.onload = function () { thumbCache[sl.n].img = im; }; im.src = url; }
    return null;
  }
  function button(label, x, y, w, fn) {
    ctx.fillStyle = C.sel; ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = C.red; ctx.fillRect(x, y + 11, w, 1);
    G.textC(ctx, label, x + w / 2, y + 2, C.white);
    tap(x, y, w, 12, fn);
  }


  // ------------------------------------------------------------------ ending card (credits)
  // While the credits roll (and on THE END after them) the game runs its credits code in bank $1C at $7040 and up:
  // node 0 / 1 script PC there (SHANTAE-RAM.md, "Defeat and ending"). Nothing else uses that part of the bank; the
  // other bank-$1C scenes run below $7000. The card shows the real date and time, play time and collection, and a
  // signature field you draw your name in with a finger. SAVE keeps the run (signature as a small PNG) in
  // localStorage (sd.hall), as Metroid Dual's mission report does.
  var credits = false, report = null, hall = load('sd.hall', []), sigBox = null, drawing = null;
  function readCredits() {
    var was = credits;
    credits = false;
    if (st && !st.inGame && N && N.mem) {
      var h = N.mem('w3:d002:3,w3:d080:3');
      if (h && h.length >= 12) for (var i = 0; i < 2; i++) {
        var lo = parseInt(h.substr(i * 6, 2), 16), hi = parseInt(h.substr(i * 6 + 2, 2), 16), bank = parseInt(h.substr(i * 6 + 4, 2), 16);
        if (bank === 0x1C && (hi << 8 | lo) >= 0x7040) credits = true;
      }
    }
    if (credits && !was && !report) {
      var now = new Date(), cp = completion(st);
      report = { date: now.getFullYear() + '-' + pad(now.getMonth() + 1, 2) + '-' + pad(now.getDate(), 2),
                 clock: pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2), t: now.getTime(),
                 frames: stats.t, percent: cp.percent, rows: cp.rows, gems: st.gems, deaths: stats.deaths,
                 monsters: window.ShantaeMonsters ? ShantaeMonsters.count() : 0,
                 monstersOf: window.ShantaeMonsters ? ShantaeMonsters.LIST.length : 0,
                 dev: !!(N && N.devUsed && N.devUsed()), saved: false, sig: null, sw: 0, sh: 0 };
      if (statsDirty) { save('sd.stats', stats); statsDirty = false; }
    }
    if (!credits && was) { report = null; drawing = null; }
  }
  function endingCard() {
    var r = report; if (!r) return;
    var P = panel(4, 4, W - 8, H - 8, 'QUEST COMPLETE'), cx = P.x + P.w / 2, y = P.y;
    G.textC(ctx, r.date + '  ' + r.clock, cx, y, C.white); y += 13;
    var full = function (k) { var row = r.rows.filter(function (q) { return q[0] === k; })[0]; return row ? [row[2] + '/' + row[3], row[2] >= row[3] ? C.green : C.white] : ['-', C.white]; };
    var rows = [['PLAY TIME', hms(r.frames), C.white], ['COMPLETION', r.percent + '%', r.percent >= 100 ? C.green : C.gold],
                ['HEART HOLDERS'].concat(full('heart')), ['FIREFLIES'].concat(full('firefly')),
                ['WARP SQUIDS'].concat(full('squid')), ['TALISMANS'].concat(full('talisman')),
                ['FIGHTER GEAR'].concat(full('gear')), ['DANCES'].concat(full('dance')),
                ['MONSTERS MET', r.monsters + '/' + r.monstersOf, r.monsters >= r.monstersOf && r.monstersOf ? C.green : C.white],
                ['TIMES DOWN', String(r.deaths), C.white]];
    var cols = P.w >= 270 ? 2 : 1, gap = 10, colW = Math.floor((P.w - gap * (cols - 1)) / cols), per = Math.ceil(rows.length / cols), rh = 10;
    rows.forEach(function (row, i) {
      var c = Math.floor(i / per), rr = i % per, x0 = P.x + c * (colW + gap), x1 = x0 + colW;
      var lab = row[0].length * 8 + 8 + row[1].length * 8 > colW ? row[0].replace('HEART HOLDERS', 'HEARTS').replace('FIGHTER GEAR', 'GEAR').replace('MONSTERS MET', 'MONSTERS') : row[0];
      G.text(ctx, lab, x0, y + rr * rh, C.lgrey); G.textR(ctx, row[1], x1, y + rr * rh, row[2]);
    });
    y += per * rh + 2;
    if (r.dev) { G.textC(ctx, 'DEV CODES USED', cx, y, C.red); y += 10; }
    y += 2;
    // signature field
    G.text(ctx, r.saved ? 'SIGNED' : 'SIGN YOUR NAME', P.x, y, r.saved ? C.green : C.ink);
    y += 10;
    var bx = P.x, bw = P.w, by = y, bh = Math.max(28, P.y + P.h - y - 16);         // same size once saved, so the drawing stays
    if (!r.sig || r.sw !== bw || r.sh !== bh) { r.sig = new Uint8Array(bw * bh); r.sw = bw; r.sh = bh; }
    sigBox = r.saved ? null : { x: bx, y: by, w: bw, h: bh };
    ctx.fillStyle = '#100820'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = C.dpurple; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by + bh - 1, bw, 1); ctx.fillRect(bx, by, 1, bh); ctx.fillRect(bx + bw - 1, by, 1, bh);
    ctx.fillStyle = '#3a2050'; ctx.fillRect(bx + 8, by + bh - 9, bw - 16, 1);          // signing line
    ctx.fillStyle = C.white;
    for (var k = 0; k < r.sig.length; k++) if (r.sig[k]) ctx.fillRect(bx + (k % bw), by + Math.floor(k / bw), 1, 1);
    if (!r.saved) {
      var ty = by + bh + 3;
      button('CLEAR', P.x + P.w - 108, ty, 48, function () { r.sig.fill(0); });
      button('SAVE', P.x + P.w - 52, ty, 52, function () {
        if (!r.sig.some(function (v) { return v; })) return;
        var oc = document.createElement('canvas'); oc.width = bw; oc.height = bh;
        var ox = oc.getContext('2d'); ox.fillStyle = '#fff';
        for (var q = 0; q < r.sig.length; q++) if (r.sig[q]) ox.fillRect(q % bw, Math.floor(q / bw), 1, 1);
        hall.push({ sig: oc.toDataURL('image/png'), date: r.date, clock: r.clock, t: r.t, frames: r.frames, percent: r.percent,
                    monsters: r.monsters, deaths: r.deaths, dev: r.dev });
        hall = hall.slice(-20); save('sd.hall', hall); r.saved = true; sigBox = null;
      });
    }
  }
  function sigPlot(x0, y0, x1, y1) {           // Bresenham line in logical pixels, 1 px pen
    var r = report, b = sigBox; if (!r || !b) return;
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 2000; n++) {
      var px = x0 - b.x, py = y0 - b.y;
      if (px >= 1 && py >= 1 && px < b.w - 1 && py < b.h - 1) r.sig[py * b.w + px] = 1;
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ------------------------------------------------------------------ frame
  var TAB_NAMES = { status: ['SHANTAE', 'HERO'], dances: ['DANCES', 'DANCE'], world: ['MAP', 'MAP'],
                    list: ['PROGRESS', 'PROG'], options: ['OPTIONS', 'OPT'] };
  /** 0.26: the FF button at the bottom right (as Xenogears Dual): toggles the emulator's fast-forward. */
  var FF = ['#...#...', '##..##..', '###.###.', '########', '###.###.', '##..##..', '#...#...'];
  function ffButton(x, y, w, h) {
    var on = !!(N && N.ff && N.ff(-1));
    ctx.fillStyle = on ? C.sel : '#1a0c24'; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillStyle = on ? C.gold : C.dred; ctx.fillRect(x + 1, y, w - 2, 1);
    ctx.fillStyle = on ? C.gold : C.lgrey;
    var gx = x + Math.floor((w - 8) / 2), gy = y + Math.floor((h - 7) / 2);
    FF.forEach(function (r, j) { for (var i = 0; i < 8; i++) if (r[i] === '#') ctx.fillRect(gx + i, gy + j, 1, 1); });
    tap(x, y, w, h, function () { N.ff(2); });
  }
  function drawTabs() {
    var hasFF = (DUAL || RA) && N && N.ff, ffW = hasFF ? 28 : 0;
    var x0 = layout.tabX, y = layout.tabY, w = Math.floor((W - x0 - ffW) / tabs.length);
    if (hasFF) ffButton(W - ffW, y, ffW, H - y);
    tabs.forEach(function (t, i) {
      var sel = t === tab, x = x0 + i * w, nm = TAB_NAMES[t][0].length * 8 <= w - 4 ? TAB_NAMES[t][0] : TAB_NAMES[t][1];
      ctx.fillStyle = sel ? C.sel : '#1a0c24'; ctx.fillRect(x + 1, y, w - 2, H - y);
      ctx.fillStyle = sel ? C.gold : C.dred; ctx.fillRect(x + 1, y, w - 2, 1);
      G.textC(ctx, nm, x + w / 2, y + 5, sel ? C.white : C.lgrey);
      tap(x, y, w, H - y, function () { tab = t; save('sd.tab', t); });
    });
  }
  function idle(msg, sub) {
    ctx.fillStyle = '#0c0418'; ctx.fillRect(0, 0, W, H);
    var cy = Math.round(H / 2) - 30;
    G.textC(ctx, 'Shantae', W / 2 + 1, cy + 1, C.dred, 2); G.textC(ctx, 'Shantae', W / 2, cy, C.gold, 2);
    G.textC(ctx, 'LINK', W / 2, cy + 20, C.purple);
    G.textC(ctx, msg, W / 2, cy + 44, C.ink);
    if (sub) G.textC(ctx, sub, W / 2, cy + 56, C.grey);
    for (var i = 0; i < 24; i++) { var sx = (i * 97 + tickN) % W, sy = (i * 53) % H; if ((tickN + i * 7) % 24 < 16) { ctx.fillStyle = [C.gold, C.purple, C.white][i % 3]; ctx.fillRect(sx, sy, 1, 1); } }
  }
  // Shantae Link (RetroArch): what stops the link, and how to set RetroArch up (as Xenogears Link's start screen)
  var RA_WHY = { norom: ['PICK YOUR SHANTAE ROM', 'FOR THE MAP, FONT AND SIGNPOSTS'], badrom: ['THAT ROM IS NOT SHANTAE (USA)', 'PICK THE USA ROM'],
                 noreply: ['NO REPLY FROM RETROARCH', ''], nogame: ['RETROARCH: NO GAME RUNNING', 'LOAD SHANTAE (USA)'],
                 wrong: ['RETROARCH RUNS ANOTHER GAME', 'LOAD SHANTAE (USA)'], nomap: ['THIS CORE HAS NO MEMORY MAP', 'USE GAMBATTE OR MGBA'],
                 '': ['WAITING FOR THE GAME', 'START OR CONTINUE A GAME'] };
  function raIdle() {
    var s = N.raStatus(), why = RA_WHY[s.problem] || RA_WHY[''], y = 10;
    ctx.fillStyle = '#0c0418'; ctx.fillRect(0, 0, W, H);
    G.textC(ctx, 'Shantae', W / 2 + 1, y + 1, C.dred, 2); G.textC(ctx, 'Shantae', W / 2, y, C.gold, 2);
    G.textC(ctx, 'LINK FOR RETROARCH', W / 2, y + 20, C.purple); y += 40;
    G.textC(ctx, why[0], W / 2, y, s.problem && s.problem !== 'norom' ? C.red : C.ink); y += 11;
    if (window.raRomMsg && /rom/.test(s.problem)) { G.textC(ctx, window.raRomMsg.substr(0, Math.floor(W / 8)), W / 2, y, C.red); y += 11; }
    else if (why[1]) { G.textC(ctx, why[1], W / 2, y, C.grey); y += 11; }
    y += 6;
    var x = Math.max(4, Math.floor((W - 30 * 8) / 2));
    [['USE RETROARCH NIGHTLY', C.teal], ['1 SETTINGS > NETWORK >', C.white], ['  NETWORK COMMANDS: ON', C.white],
     ['2 COMMAND PORT 55355', C.white], ['3 CORE: GAMBATTE OR MGBA', C.white], ['4 LOAD SHANTAE (USA)', C.white]]
      .forEach(function (l) { G.text(ctx, l[0], x, y, l[1]); y += 11; });
    var bw = Math.min(120, Math.floor((W - 12) / 2)), by = H - 30;   // 0.6: RetroArch is always this device's port 55355
    button(s.rom ? 'NEW ROM' : 'PICK ROM', W / 2 - bw / 2, by, bw, function () { N.pickRom(); });
    if (s.version) G.textC(ctx, ('RETROARCH ' + s.version).substr(0, Math.floor(W / 8)), W / 2, H - 12, C.grey);
  }
  function draw() {
    drawPage();
    if (!hangMsg) return;
    ctx.fillStyle = C.dred; ctx.fillRect(0, 0, W, 24);
    G.textC(ctx, 'THE APP FROZE LAST TIME: TAP', W / 2, 3, C.white);
    G.textC(ctx, hangMsg.toUpperCase().substr(0, Math.floor(W / 8)), W / 2, 13, C.gold);
    tap(0, 0, W, 24, function () { hangMsg = ''; });
  }
  function drawPage() {
    buttons = [];
    if (!st) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (RA) { raIdle(); return; }
      idle(DUAL ? 'WAITING FOR THE GAME' : 'SHANTAE DUAL ONLY', DUAL ? 'START OR CONTINUE A GAME' : '');
      if (DUAL && N.overlay && N.overlay()) { button('BACK TO GAME', W / 2 - 50, H - 30, 100, function () { N.close(); }); }
      return;
    }
    ctx.fillStyle = '#0c0418'; ctx.fillRect(0, 0, W, H);
    if (credits) { endingCard(); return; }
    sigBox = null;
    if (layout.side) { var sp = panel(layout.side.x, layout.side.y, layout.side.w, layout.side.h, 'SHANTAE'); drawStatus(sp); }
    var title = { status: 'SHANTAE', items: 'ITEMS', dances: 'DANCES', world: worldView === 'map' ? 'MAP' : 'SIGNPOSTS', list: 'PROGRESS', options: 'OPTIONS' }[tab];
    var extra = null;
    if (tab === 'world' && worldView === 'map' && window.ShantaeMap) {     // the map's panel is named after the place,
      var left = ((st.night ? 0x10000 : 0x8000) - st.time) / 4;            // then the time to dusk / dawn (0.14)
      var tcol = st.night ? C.purple : C.gold;
      extra = [(st.night ? 'DAWN IN ' : 'DUSK IN ') + mmss(left), tcol,
               dayIcon(st.night, st.night ? C.moon : C.sun), function () { ShantaeMap.card('night'); }];   // 0.24: tap the timer: night card
      var nm = ShantaeMap.title(), mx = Math.floor((layout.pane.w - 64) / 8) - extra[0].length - 3;
      if (nm) title = nm.length > mx ? nm.substr(0, Math.max(4, mx - 1)) + '.' : nm;
    }
    var p = panel(layout.pane.x, layout.pane.y, layout.pane.w, layout.pane.h, title, extra);
    gearButton(layout.pane.x + Math.floor(layout.pane.w / 8) * 8 - 20, layout.pane.y - 2);
    noteButton(layout.pane.x + Math.floor(layout.pane.w / 8) * 8 - 40, layout.pane.y - 2);
    if (tab === 'status') drawStatus(p);
    else if (tab === 'dances') drawDances(p);
    else if (tab === 'world') drawWorld(p);
    else if (tab === 'list') drawProgress(p);
    else if (tab === 'options') drawOptions(p);
    drawBoss();
    drawTabs();
    danceTick();
    if (dancePop) drawDancePop();
  }

  function logical(e) { var r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) * W / r.width), Math.floor((e.clientY - r.top) * H / r.height)]; }
  // A tap acts on pointer down, except on areas that can also be dragged (the map): those act on release if the
  // finger didn't move, and pass the movement on while it does.
  var drag = null;
  cv.addEventListener('pointerdown', function (e) {
    var q = logical(e), sb = sigBox;
    if (report && sb && q[0] >= sb.x && q[0] < sb.x + sb.w && q[1] >= sb.y && q[1] < sb.y + sb.h) {
      drawing = { id: e.pointerId, x: q[0], y: q[1] }; sigPlot(q[0], q[1], q[0], q[1]);
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      draw(); return;
    }
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (q[0] >= b.x && q[0] < b.x + b.w && q[1] >= b.y && q[1] < b.y + b.h) {
        if (b.drag) { drag = { b: b, x0: q[0], y0: q[1], x: q[0], y: q[1], moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} return; }
        b.fn(); draw(); return;
      }
    }
    slotArm = null;
  });
  cv.addEventListener('pointermove', function (e) {
    if (drawing && e.pointerId === drawing.id) {
      var p = logical(e); sigPlot(drawing.x, drawing.y, p[0], p[1]); drawing.x = p[0]; drawing.y = p[1]; draw(); return;
    }
    if (!drag) return;
    var q = logical(e);
    if (!drag.moved && Math.abs(q[0] - drag.x0) + Math.abs(q[1] - drag.y0) > 5) drag.moved = true;
    if (drag.moved) { drag.b.drag(q[0] - drag.x, q[1] - drag.y); drag.x = q[0]; drag.y = q[1]; draw(); }
  });
  var endDrag = function () { if (!drag) return; var d = drag; drag = null; if (!d.moved) d.b.fn(); draw(); };
  cv.addEventListener('pointerup', function () { drawing = null; endDrag(); });
  cv.addEventListener('pointercancel', function () { drag = null; drawing = null; });

  tab = load('sd.tab', 'status'); if (tab === 'items') tab = 'status';   // 0.9: items live on the SHANTAE tab
  if (tab === 'dances') tab = 'world';                                  // 0.15: dances pop up on Select
  loadRom(); resize();
  setInterval(tick, 100);
  // Shantae Link 0.10: between ticks, while she moves on the map, just the marker and camera (as Xenogears Link's light polls)
  if (RA) setInterval(function () {
    var on = tab === 'world' && worldView === 'map';
    N.mapOn(on);
    if (on && st && N.moving() && window.ShantaeMap && ShantaeMap.track(N)) { stage('draw'); draw(); stage('idle'); }
  }, 50);
})();
