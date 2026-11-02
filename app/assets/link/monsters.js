/* monsters.js - the PROGRESS tab's monster list (0.20; back in 0.30 with pictures from the ROM).
 *
 * Every object in Shantae runs a script; its program counter (node +2..+4, nodes in WRAM bank 3 every $7E bytes from
 * $D000) lies inside the code of the object type it was spawned as. The type table at 0A:4000 (4 bytes per type:
 * $40, script lo, hi, bank) gives each type's first address, so "the type whose script starts last at or before this
 * PC, in the same bank" names any live object, children included. LIST below holds the enemy types, with the user's
 * names (tools/re/beast_rom.py, SHANTAE-RAM.md "Sprite cels in the ROM").
 *
 * An entry lights up the first time that enemy is on screen. Its picture is one sprite cel decoded from the player's
 * ROM (N.rom): cel = 4 layout words + tile block word; layout +$20 sprite count, +$23.. (dy, dx, attr) per 8x16
 * sprite; tile block = count, then 32 bytes per sprite. The colours are the area's OBJ palettes, copied from the
 * game's palette copy at $C400 when the enemy is met (a night copy is replaced by a day one later). No game art
 * ships with the app. */
(function (root) {
  'use strict';
  var M = {};
  // [types, name, where, cel (bank:address)]
  var LIST = [
    [[108], 'CLUMP', 'SCARECROW FIELD', '64:4311'], [[107], 'SCARECROW', 'SCARECROW FIELD', '62:6C38'],
    [[113], 'SPIDER', 'SPIDERWOOD AND GOBLIN FOREST', '6E:6E9D'], [[114], 'GOBLIN', 'SPIDERWOOD AND GOBLIN FOREST', '79:6539'],
    [[126], 'SNAKE', 'WATERFALL LAKE', '8B:493B'], [[125], 'FROG', 'WATERFALL LAKE', '88:755C'],
    [[127], 'WATER SERPENT', 'WATERFALL LAKE', '8B:4E8B'], [[150], 'AARDVARK BEE', 'LAKES, BOG, FORESTS, DESERT', 'AF:765C'],
    [[116], 'SENTIENT TOMATO', 'RAIN STORM RIVER', '9B:426F'], [[130], 'REAPER', 'RAIN STORM RIVER', 'DB:7225'],
    [[132], 'GIANT SNAIL', 'SNAIL WASTELAND', 'C9:4780'], [[135], 'PRAYING MANTIS', 'SNAIL WASTELAND', 'DB:507C'],
    [[136], 'ZOMBIE', 'ZOMBIE SWAMP', 'C7:724A'], [[117, 118], 'BLOB', 'GHOST FOREST', 'B0:49AD'],
    [[121], 'KAPPA', 'GHOST FOREST', 'C8:55BC'], [[122], 'GHOST', 'GHOST FOREST', 'C8:69F8'],
    [[115], 'ARCHER', 'ARCHER FOREST', '8B:77C3'], [[123], 'TOTEM', 'ARCHER FOREST', 'DD:692A'],
    [[152], 'WEREWOLF', 'MOUNT POINTY', 'A8:6FBD'], [[153], 'ICE TURTLE', 'MOUNT POINTY', 'DC:715B'],
    [[133], 'GRYPHON', 'EAGLE WASTELAND', 'DA:6927'], [[147], 'HANGING SHADOW', 'MUD BOG', '9B:55D0'],
    [[148], 'SHADOW JUMPER', 'MUD BOG', 'A5:7BA6'], [[149], 'DARK SLIME', 'MUD BOG', 'A8:4F26'],
    [[144], 'SCARAB', 'THE DESERTS', 'D9:60C6'], [[139], 'SCORPION F', 'LADIES DESERT', 'A9:5550'],
    [[145], 'SANDWORM', 'LADIES DESERT', 'D9:72E6'], [[134], 'NAGA', 'NAGA WASTELAND', 'DC:4F5B'],
    [[48], 'GOLEM', 'GOLEM MINE', '81:41F3'], [[52], 'CONSTRUCT', 'GOLEM MINE', '81:7D43'],
    [[55], 'MINE SLUG', 'GOLEM MINE', '80:44D9'], [[73], 'SHADE', 'CACKLE MOUND', '95:66CC'],
    [[74], 'SHADOW IMP', 'CACKLE MOUND', '96:4BB2'], [[75], 'SKELETON', 'CACKLE MOUND', '98:5B00'],
    [[189], 'DOLL', 'CAVES', 'C9:6238'], [[190], 'GATE', 'CAVES', 'C9:6519'],
    [[109], 'IMP', 'FIELDS, FORESTS AND CAVES', '63:75D5'], [[140], 'SCORPION M', 'MENS DESERT', 'AA:629F'],
    [[142], 'CROW', 'MENS DESERT', 'D8:6829'], [[192], 'GARY', 'TWINKLE PALACE', 'D0:7589'],
    [[204], 'BOB', 'TWINKLE PALACE', 'DC:7BD9'], [[211, 212], 'FLYING TINKERBAT', "RISKY'S ISLAND", 'E0:48D6'],
    [[208], 'STEAM TINKERBAT', "RISKY'S ISLAND", 'E0:4219'], [[209], 'TINKER STACK', "RISKY'S ISLAND", 'E0:50D2'],
    [[172, 215], 'TINKERBAT', "SCUTTLE DOCKS, RISKY'S ISLAND", '7D:4DC8'], [[31, 220], 'RISKY BOOTS', "RISKY'S ISLAND", '5F:6BFB']];
  var byType = {}, typeTable = null, store = null, KEY = 'sd.mon2';
  function load() { if (store) return store; try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { store = {}; } return store; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  M.set = function (list) {
    M.LIST = list; byType = {};
    list.forEach(function (e, i) { e[0].forEach(function (t) { byType[t] = i; }); });
  };
  function bytes(b64) { var s = b64 ? atob(b64) : '', b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

  function readTypes(N) {
    if (typeTable || !N || !N.rom) return typeTable;
    var s = bytes(N.rom(0x0A * 0x4000, 1024)), per = {};
    if (s.length < 1024) return null;
    for (var k = 0; k < 256; k++) {
      if (s[k * 4] !== 0x40) break;
      (per[s[k * 4 + 3]] = per[s[k * 4 + 3]] || []).push([s[k * 4 + 1] | s[k * 4 + 2] << 8, k]);
    }
    Object.keys(per).forEach(function (b) { per[b].sort(function (a, c) { return a[0] - c[0]; }); });
    return (typeTable = per);
  }
  function typeOf(bank, pc) {
    var L = typeTable && typeTable[bank], t = -1;
    if (!L) return -1;
    for (var i = 0; i < L.length && L[i][0] <= pc; i++) t = L[i][1];
    return t;
  }

  var SPEC = (function () {
    var a = ['C9FB:4', 'C400:64'];                                      // lengths are decimal
    for (var i = 0; i < 32; i++) {
      var o = 0xD000 + i * 0x7E;
      if (o + 0x7E > 0xE000) break;
      a.push('w3:' + o.toString(16) + ':5', 'w3:' + (o + 0x34).toString(16) + ':5');
    }
    return a.join(',');
  })();
  var tickN = 0;
  /** Called by the page each tick while in play. Returns true when something new lit up. */
  M.update = function (N, st) {
    if (!st || st.state !== 2 || ++tickN % 3 || !readTypes(N)) return false;
    var hex = N.mem(SPEC);
    if (!hex || hex.length < 2 * 0x44) return false;
    var b = []; for (var i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
    var cx = b[0] | b[1] << 8, cy = b[2] | b[3] << 8, pal = hex.substr(8, 128), o = 0x44, S = load(), changed = false;
    if (!/[1-9a-f]/i.test(pal.substr(64, 32))) return false;              // palettes not set up yet
    for (o += 10; o + 10 <= b.length; o += 10) {                          // node 0 is Shantae
      if (b[o] !== 0 || !(b[o + 2] | b[o + 3])) continue;
      var ei = byType[typeOf(b[o + 4], b[o + 2] | b[o + 3] << 8)];
      if (ei == null) continue;
      var sx = (b[o + 5] | b[o + 6] << 8) - cx, sy = (b[o + 8] | b[o + 9] << 8) - cy;
      if (sx < -16 || sx >= 160 || sy < -16 || sy >= 136) continue;
      var rec = S[ei];
      if (!rec) { S[ei] = { seen: Date.now(), pal: pal, night: !!st.night }; changed = true; }
      else if (rec.night && !st.night) { rec.pal = pal; rec.night = false; delete pics[ei]; changed = true; }
    }
    if (changed) save();
    return changed;
  };

  // ---- pictures: one cel from the ROM ----------------------------------------------------------------------------
  var pics = {}, Nref = null;
  function romAt(bank, a, n) { return bytes(Nref.rom(a < 0x4000 ? a : bank * 0x4000 + a - 0x4000, n)); }
  function decode(cel, palHex) {
    var bank = parseInt(cel.substr(0, 2), 16), cp = parseInt(cel.substr(3), 16);
    var hdr = romAt(bank, cp, 10); if (hdr.length < 10) return null;
    var lp = hdr[0] | hdr[1] << 8, tb = hdr[8] | hdr[9] << 8;
    var lay = romAt(bank, lp, 0x23 + 3 * 40), n = lay[0x20];
    if (!n || n > 40) return null;
    var cnt = romAt(bank, tb, 1)[0], tiles = romAt(bank, tb + 1, cnt * 32), nt = cnt * 2;
    var pal = [], k;
    for (k = 0; k < 32; k++) {
      var v = parseInt(palHex.substr(k * 4, 2), 16) | parseInt(palHex.substr(k * 4 + 2, 2), 16) << 8;
      pal.push([(v & 31) * 255 / 31 | 0, (v >> 5 & 31) * 255 / 31 | 0, (v >> 10 & 31) * 255 / 31 | 0]);
    }
    var ents = [], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (k = 0; k < n; k++) {
      var dy = lay[0x23 + 3 * k], dx = lay[0x24 + 3 * k], at = lay[0x25 + 3 * k];
      dy = dy > 127 ? dy - 256 : dy; dx = dx > 127 ? dx - 256 : dx;
      ents.push([dy, dx, at]); x0 = Math.min(x0, dx); y0 = Math.min(y0, dy); x1 = Math.max(x1, dx + 8); y1 = Math.max(y1, dy + 16);
    }
    var W = x1 - x0, H = y1 - y0;
    if (W <= 0 || H <= 0 || W > 256 || H > 256) return null;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var cx = c.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
    ents.forEach(function (e, k2) {
      for (var half = 0; half < 2; half++) {
        var ti = 2 * k2 + half; if (ti >= nt) continue;
        for (var r = 0; r < 8; r++) {
          var lo = tiles[ti * 16 + r * 2], hi = tiles[ti * 16 + r * 2 + 1];
          for (var x = 0; x < 8; x++) {
            var v2 = (lo >> (7 - x) & 1) | (hi >> (7 - x) & 1) << 1; if (!v2) continue;
            var xx = e[2] & 0x20 ? 7 - x : x, yy = r + half * 8; if (e[2] & 0x40) yy = 15 - yy;
            var q = ((e[0] - y0 + yy) * W + e[1] - x0 + xx) * 4, col = pal[(e[2] & 7) * 4 + v2];
            d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = 255;
          }
        }
      }
    });
    cx.putImageData(img, 0, 0);
    return c;
  }
  M.image = function (i, N) {                                          // i = list index; null until met
    var r = load()[i];
    if (!r || !r.pal || !M.LIST[i]) return null;
    if (pics[i] === undefined) {
      Nref = N; if (!Nref || !Nref.rom) return null;
      try { pics[i] = decode(M.LIST[i][3], r.pal); } catch (e) { pics[i] = null; }
    }
    return pics[i];
  };
  M.seen = function (i) { return !!load()[i]; };
  M.count = function () { var S = load(), n = 0; M.LIST.forEach(function (e, i) { if (S[i]) n++; }); return n; };
  M.reset = function () { store = {}; save(); pics = {}; };
  M.set(LIST);
  root.ShantaeMonsters = M;
})(this);
