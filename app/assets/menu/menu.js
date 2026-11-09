/* menu.js - launcher and pause menu for Shantae Dual. Talks to MainActivity.Host (window.Host).
 * Drawn at Game Boy scale in the game's own font, inside the game's own text-box frames. */
(function () {
  'use strict';
  var G = GbGfx;
  var H0 = window.Host || {   // browser preview stub
    info: function () { return JSON.stringify({ version: 'dev', mode: 'launcher', rom: { present: false }, auto: false, settings: {}, slots: [], screens: {} }); },
    font: function () { return ''; }, binds: function () { return '[]'; }
  };
  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var W = 256, H = 240, info = {}, page = 'main', sel = 0, scroll = 0, rows = [], tick = 0, toastMsg = '', toastT = 0;
  var thumbs = {}, binds = [], waiting = -1, confirm = null;
  // 0.28: the menus made from the game's own screens (0.2-0.27, gbkit.js) are gone; this is the only look.
  // colours of the game's text box (CGB palette 7 after LCD colour correction) and Shantae's purple / gold
  var C = { white: '#f8f0e0', ink: '#f8e070', red: '#e0584a', dred: '#702830', purple: '#b070e8', dpurple: '#3a1858', night: '#180a28',
            gold: '#f8c048', grey: '#887898', lgrey: '#c8b8d8', green: '#78e098', yellow: '#f8e070', sel: '#5a2a78', teal: '#68d8f0' };
  var BOX = { ink: C.ink, red: C.red, fill: '#000' };

  // launcher music (music.js): only on the launcher, never over the game or the pause menu
  var Mu = window.Music || { play: function () {}, stop: function () {}, resume: function () {} };
  // MENU MUSIC: the game's own title theme (extracted, played by Android) or the 0.1 synth tune, launcher only.
  function music() {
    var s = info.settings || {}, on = info.mode === 'launcher' && s.music !== false && !info.extracting;
    var game = on && s.musicSrc !== 'synth' && H0.titleMusic && H0.titleMusic(true);
    if (!game && H0.titleMusic && !(on && s.musicSrc !== 'synth')) H0.titleMusic(false);
    if (on && !game) Mu.play(); else Mu.stop();
  }
  window.musicStop = function () { Mu.stop(); if (H0.titleMusic) H0.titleMusic(false); };
  window.musicStart = function () { refreshInfo(); music(); };

  function refreshInfo() {
    try { info = JSON.parse(H0.info()); } catch (e) { info = {}; }
    if (!G.hasFont()) { var f = G.b64(H0.font()); if (f.length >= 0x800) G.setFont(f); }
  }
  window.onAssets = function () { refreshInfo(); build(); draw(); music(); };
  window.onExtract = function (p) { info.extractPct = p; draw(); };
  window.refresh = function () { refreshInfo(); build(); draw(); music(); };
  window.show = function (mode) { refreshInfo(); page = 'main'; sel = 0; scroll = 0; confirm = null; thumbs = {}; build(); draw(); music(); };
  window.toast = function (m) { toastMsg = m; toastT = tick + 40; draw(); };
  window.onRebind = function () { waiting = -1; loadBinds(); build(); draw(); };

  function resize() {
    var r = innerWidth / Math.max(1, innerHeight);
    if (r >= 1) { H = 240; W = Math.max(256, Math.round(240 * r)); } else { W = 256; H = Math.round(256 / r); }
    cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false;
    draw();
  }
  addEventListener('resize', resize);

  // ------------------------------------------------------------------ pages
  function set(k, v) { H0.set(k, String(v)); info.settings[k] = v; }
  function cycle(k, list, dir) {
    var i = list.indexOf(String(info.settings[k] == null ? list[0] : info.settings[k])); i = (i + (dir || 1) + list.length) % list.length; set(k, list[i]);
  }
  function onoff(v) { return v ? 'ON' : 'OFF'; }
  function slotTime(t) {
    if (!t) return '- EMPTY -';
    var d = new Date(t), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function build() {
    var s = info.settings || {}, rom = info.rom || {};
    rows = [];
    var opt = function (label, value, fn) { rows.push({ label: label, value: value, fn: fn }); };
    var sub = function (label, p) { rows.push({ label: label, value: '>', fn: function () { go(p); } }); };
    var backRow = function () { rows.push({ label: 'BACK', fn: back }); };
    if (page === 'main') {
      var pause = info.mode === 'pause';
      if (pause) {
        rows.push({ label: 'RESUME', fn: function () { H0.resume(); } });
        rows.push({ label: 'SAVE STATE', fn: function () { go('save'); } });
        rows.push({ label: 'LOAD STATE', fn: function () { go('load'); } });
        if (!info.linkShown) rows.push({ label: 'LINK SCREEN', fn: function () { H0.showLink(true); } });
        rows.push({ label: 'SETTINGS', fn: function () { go('settings'); } });
        rows.push({ label: 'RESET', fn: function () { ask('RESET THE GAME?', function () { H0.reset(); }); } });
        rows.push({ label: 'QUIT TO TITLE', fn: function () { H0.quit(); } });
      } else {
        if (rom.present && info.auto) rows.push({ label: 'CONTINUE', fn: function () { H0.start(true); } });
        if (rom.present) rows.push({ label: info.auto ? 'NEW GAME' : 'START', fn: function () {
          if (info.auto) ask('START OVER? CONTINUE DATA STAYS', function () { H0.start(false); }); else H0.start(false);
        } });
        if (rom.present) rows.push({ label: 'LOAD STATE', fn: function () { go('load'); } });
        else rows.push({ label: 'SELECT ROM', fn: function () { H0.pickRom(); } });
        rows.push({ label: 'SETTINGS', fn: function () { go('settings'); } });
        rows.push({ label: 'EXIT', fn: function () { H0.exit(); } });
      }
    } else if (page === 'save' || page === 'load') {
      (info.slots || []).forEach(function (sl) {
        rows.push({ label: 'SLOT ' + sl.n, value: slotTime(sl.time), slot: sl.n, time: sl.time, fn: function () {
          if (page === 'save') {
            var doSave = function () { var ok = H0.save(sl.n); delete thumbs[sl.n]; refreshInfo(); build(); toast(ok ? 'SAVED TO SLOT ' + sl.n : 'SAVE FAILED'); };
            if (sl.time) ask('OVERWRITE SLOT ' + sl.n + '?', doSave); else doSave();
          } else if (sl.time) { if (!H0.load(sl.n)) toast('LOAD FAILED'); }
        } });
      });
      backRow();
    } else if (page === 'settings') {             // categories
      sub('DISPLAY', 'display');
      sub('SCREENS', 'screens');
      sub('CONTROLS', 'controls');
      sub('SOUND', 'sound');
      sub('GAMEPLAY', 'gameplay');
      if (info.recomp) sub('RECOMP', 'recomp');
      sub('SYSTEM', 'system');
      backRow();
    } else if (page === 'recomp') {               // the recomp's changes to the game, on as upstream has them
      [['input_lag', 'LESS INPUT LAG'], ['smooth_moves', 'SMOOTH MOVES'], ['air_speed', 'AIR SPEED B'], ['fast_crawl', 'FAST CRAWL'],
       ['smooth_forms', 'SMOOTH FORMS'], ['easy_dance', 'EASY DANCE'], ['quick_steps', 'QUICK STEPS'], ['safe_transform', 'SAFE TRANSFORM']].forEach(function (o) {
        var k = 'rc_' + o[0];
        opt(o[1], onoff(s[k] !== false), function () { set(k, !(s[k] !== false)); });
      });
      opt('WHIP MOVING', { 0: 'ORIGINAL', 1: 'SLIDE', 2: 'CANCEL' }[s.rc_whip] || 'SLIDE', function (d) { cycle('rc_whip', ['0', '1', '2'], d); });
      opt('TEXT', { 0: 'ORIGINAL', 10: 'INSTANT' }[s.rc_text_speed] || 'INSTANT', function (d) { cycle('rc_text_speed', ['0', '10'], d); });
      backRow();
    } else if (page === 'display') {
      opt('SHAPE', { square: '10:9', stretch: 'STRETCH' }[s.aspect] || '10:9', function (d) { cycle('aspect', ['square', 'stretch'], d); });
      opt('INTEGER SCALE', onoff(s.integer), function () { set('integer', !s.integer); });
      if (!info.recomp) {                               // gambatte's: the recomp draws its own way
        opt('COLORS', { lcd: 'GBC LCD', vivid: 'VIVID' }[s.color] || 'GBC LCD', function (d) { cycle('color', ['lcd', 'vivid'], d); });
        opt('ALL SPRITES', onoff(s.allSprites !== false), function () { set('allSprites', !(s.allSprites !== false)); });
      }
      if (!info.linux) opt('WIDE VIEW', onoff(s.wideView !== false), function () { set('wideView', !(s.wideView !== false)); });
      if (info.recomp) opt('VIEW SIZE', { 144: 'NORMAL', 180: 'LARGER', 216: 'LARGEST' }[s.viewRows] || 'NORMAL', function (d) { cycle('viewRows', ['144', '180', '216'], d); });
      if (!info.linux) opt('16:9 BORDERS', onoff(s.bezels), function () { set('bezels', !s.bezels); });
      opt('SHOW FPS', onoff(s.stats), function () { set('stats', !s.stats); });
      backRow();
    } else if (page === 'screens') {
      if (!info.linux) opt('LAYOUT', { second: 'SECOND SCREEN', single: 'SINGLE SCREEN' }[s.layout] || 'SECOND SCREEN', function (d) { cycle('layout', ['second', 'single'], d); });
      if (info.linux || s.layout !== 'single') {        // on one screen the rest don't apply
        if (!info.linux) opt('SPLIT', { auto: 'AUTO', off: 'OFF', lr: 'SIDE BY SIDE', tb: 'TOP + BOTTOM' }[s.split] || 'AUTO', function (d) { cycle('split', ['auto', 'off', 'lr', 'tb'], d); });
        if (!info.linux && (s.split === 'lr' || s.split === 'tb')) opt('HINGE GAP', (s.gap || 0) + 'DP', function (d) { cycle('gap', ['0', '16', '26', '34', '40'], d); });
        opt('SWAP SCREENS', onoff(s.swap), function () { set('swap', !s.swap); });
        if (!info.linux) opt('LINK SIDE PANEL', onoff(s.side), function () { set('side', !s.side); });
        if (!info.linux) opt('SECOND DISPLAY', onoff(s.useExternal), function () { set('useExternal', !s.useExternal); });
      }
      backRow();
    } else if (page === 'controls') {
      if (!info.linux) opt('TOUCH PAD', String(s.touch || 'auto').toUpperCase(), function (d) { cycle('touch', ['auto', 'on', 'off'], d); });
      if (!info.linux) opt('PAD OPACITY', (s.padOpacity || 70) + '%', function (d) {
        var v = (s.padOpacity || 70) + 10 * (d || 1); if (v > 100) v = 20; if (v < 20) v = 100; set('padOpacity', v); });
      rows.push({ label: 'CONTROLLER BUTTONS', value: '>', fn: function () { loadBinds(); go('buttons'); } });
      backRow();
    } else if (page === 'sound') {
      opt('GAME SOUND', onoff(s.audio), function () { set('audio', !s.audio); });
      var srcs = ['game', 'synth', 'off'], names = { game: 'TITLE THEME', synth: 'SEQUIN NIGHTS', off: 'OFF' };
      if (!info.assets) { srcs = ['synth', 'off']; }
      var cur = s.music === false ? 'off' : (s.musicSrc === 'synth' || !info.assets ? 'synth' : 'game');
      opt('MENU MUSIC', names[cur], function (d) {
        var i = (srcs.indexOf(cur) + (d || 1) + srcs.length) % srcs.length, v = srcs[i];
        set('music', v !== 'off'); if (v !== 'off') set('musicSrc', v);
        music();
      });
      backRow();
    } else if (page === 'gameplay') {
      opt('NO SLOWDOWN', onoff(s.overclock !== false), function () { set('overclock', !(s.overclock !== false)); });
      opt('GBA MODE', onoff(s.gbaMode !== false), function () {
        set('gbaMode', !(s.gbaMode !== false));
        if (info.mode === 'pause') toast('TAKES EFFECT AFTER RESET');
      });
      rows.push({ head: 'GBA: BRIGHTER + TINKERBAT', note: true });
      if (s.devUnlock) sub('PLAYTEST CODES', 'dev');
      backRow();
    } else if (page === 'system') {
      rows.push({ label: rom.present ? 'CHANGE ROM' : 'SELECT ROM', value: '>', fn: function () { H0.pickRom(); } });
      opt('SKIP LAUNCHER', onoff(s.skipLauncher), function () { set('skipLauncher', !s.skipLauncher); });
      if (info.assets || info.extracting) {
        rows.push({ label: 'RECORD TITLE MUSIC', value: 'GO', fn: function () {
          if (info.mode === 'pause') { toast('QUIT TO TITLE FIRST'); return; }
          ask('RECORD IT AGAIN?', function () { H0.extractAgain(); });
        } });
      }
      rows.push({ head: 'SHANTAE DUAL ' + (info.version || ''), note: true });
      backRow();
    } else if (page === 'dev') {
      rows.push({ head: 'CHEATS FOR TESTING', note: true });
      opt('INFINITE HEARTS', onoff(s.codeHearts), function () { set('codeHearts', !s.codeHearts); });
      opt('INFINITE GEMS', onoff(s.codeGems), function () { set('codeGems', !s.codeGems); });
      var act = function (label, what) { rows.push({ label: label, value: 'GO', fn: function () { toast(H0.dev(what)); } }); };
      act('10 OF EVERY ITEM', 'items');
      act('ALL DANCES + STONES', 'dances');
      act('REFILL HEARTS', 'refill');
      act('ADD A HEART', 'hearts');
      act('ADD 4 WARP SQUIDS', 'squids');
      act('9 LIVES', 'lives');
      sub('ROOM WARP', 'warp');
      rows.push({ head: '3D VIEW (LEVEL ROOMS)', note: true });
      opt('3D VIEW', onoff(s.view3d), function () { set('view3d', !s.view3d); });
      opt('3D CAMERA', CAM_NAMES[s.cam3d] || 'FLAT', function (d) { cycle('cam3d', Object.keys(CAM_NAMES), d); });
      backRow();
    } else if (page === 'warp') {                      // map ids the game starts at (SHANTAE-RAM.md, "Dev room warp")
      WARPS.forEach(function (w) {
        if (typeof w === 'string') { rows.push({ head: w, note: true }); return; }
        rows.push({ label: w[1], value: w[0], fn: function () {
          if (info.mode !== 'pause') { toast('START A GAME FIRST'); return; }
          var m = H0.dev('warp:' + w[0]); toast(m); if (m === 'WARPED') H0.resume();
        } });
      });
      backRow();
    } else if (page === 'buttons') {
      binds.forEach(function (b, i) {
        rows.push({ label: b.name, value: waiting === i ? 'PRESS A BUTTON' : (b.keys.length ? b.keys.join(' ') : '-'), fn: function () {
          waiting = i; H0.rebind(i); build();
        } });
      });
      rows.push({ label: 'RESET TO DEFAULT', fn: function () { H0.resetBinds(); loadBinds(); build(); toast('DEFAULTS RESTORED'); } });
      backRow();
    }
    var first = firstSelectable(); if (sel < first || sel >= rows.length || rows[sel].head) sel = first;
  }
  function loadBinds() { try { binds = JSON.parse(H0.binds()); } catch (e) { binds = []; } }
  function firstSelectable() { for (var i = 0; i < rows.length; i++) if (!rows[i].head) return i; return 0; }
  var stack = [];
  function go(p) { stack.push([page, sel]); page = p; sel = 0; scroll = 0; refreshInfo(); build(); }
  function back() {
    if (waiting >= 0) { waiting = -1; H0.cancelRebind(); build(); return; }
    if (confirm) { confirm = null; return; }
    if (!stack.length) { if (info.mode === 'pause') H0.resume(); return; }
    var s = stack.pop(); page = s[0]; sel = s[1]; refreshInfo(); build();
  }
  function ask(q, fn) { confirm = { q: q, fn: fn, sel: 1 }; }

  // ------------------------------------------------------------------ input
  // Konami code on the launcher's main screen (up up down down left right left right B A) shows or hides the playtest
  // codes. Hidden, they are also switched off.
  // Dev room warp destinations: map id (hex) -> where the game starts. Checked in the desktop driver: the playable ones
  // load the room and Shantae can walk; SCENES are story scenes the game starts the same way.
  var WARPS = ['TOWNS', ['04', 'SCUTTLE TOWN'], ['30', 'WATER TOWN'], ['34', 'OASIS TOWN'], ['31', 'ZOMBIE CARAVAN'], ['35', 'BANDIT TOWN'],
    'OVERWORLD', ['05', 'SCUTTLE DOCKS (OPENING)'], ['17', 'SCUTTLE TOWN GATES'], ['02', 'SCARECROW FIELD'], ['06', 'SPIDERWOOD FOREST'],
    ['16', 'DRIBBLE FOUNTAIN ENT.'], ['09', 'WATERFALL LAKE'], ['18', 'WATER TOWN GATES'], ['0D', 'RAIN STORM RIVER'],
    ['1F', 'SNAIL WASTELAND'], ['36', 'ZOMBIE SWAMP'], ['14', 'GHOST FOREST'], ['1D', 'ZOMBIE CARAVAN GATES'], ['15', 'ARCHER FOREST'],
    ['0E', 'MOUNT POINTY'], ['20', 'EAGLE WASTELAND'], ['2F', 'BANDIT TOWN GATES'], ['0B', 'MUD BOG'], ['1C', 'OASIS TOWN GATES'],
    ['1A', 'LADIES DESERT'], ['19', 'MENS DESERT'], ['1E', 'NAGA WASTELAND'], ['0F', 'GOBLIN FOREST'], ['1B', 'HIDDEN WATERFALL'],
    ['10', 'FOREST SIDE AREA'], ['08', 'GECKO MATCH'], ['40', 'SPIDERWOOD (ALT)'], ['41', 'MENS DESERT (ALT)'],
    ['42', 'ZOMBIE SWAMP (ALT)'], ['43', 'MOUNT POINTY (ALT)'],
    'LABYRINTHS', ['01', 'DRIBBLE FOUNTAIN'], ['07', 'GOLEM MINE'], ['0A', 'CACKLE MOUND'], ['3A', 'TWINKLE PALACE'],
    ['3E', "RISKY'S HIDEOUT"], ['39', 'SHIP INTERIOR'],
    'CAVES', ['24', 'CAVE 1'], ['25', 'CAVE 2'], ['26', 'CAVE 3'], ['27', 'CAVE 4'], ['28', 'CAVE 5'], ['29', 'CAVE 6'], ['2A', 'CAVE 7'],
    ['2B', 'CAVE 8'], ['2C', 'CAVE 9'], ['2D', 'CAVE 11'], ['2E', 'CAVE 12'],
    'SCENES', ['00', 'INTRO: LIGHTHOUSE'], ['03', "RISKY'S SHIP"], ['0C', 'SCUTTLE TOWN: MAYOR'], ['11', 'SCUTTLE TOWN ROOM'],
    ['22', 'ARENA'], ['23', 'DRIBBLE STONE ROOM'], ['37', 'GOLEM STONE ROOM'], ['3B', 'TWINKLE STONE ROOM'],
    ['3C', "RISKY'S ISLAND"], ['3D', "RISKY'S HIDEOUT ROOM"], ['33', "MIMIC'S STORY"], ['32', 'SOUND TEST'], ['38', 'ENDING'],
    ['3F', 'CREDITS']];
  var CAM_NAMES = { FLAT: 'FLAT', TILT: 'TILT', LOW: 'LOW', SIDE: 'SIDE', HIGH: 'HIGH ANGLE', CLOSE: 'CLOSE', CYCLE: 'CYCLE ALL' };
  var KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'back', 'ok'], kon = 0;
  function konami(k) {
    if (page !== 'main' || info.mode === 'pause' || confirm) { kon = 0; return false; }
    if (k === KONAMI[kon]) kon++; else kon = k === 'up' ? (kon === 2 ? 2 : 1) : 0;
    if (kon < KONAMI.length) return false;
    kon = 0;
    var on = !(info.settings || {}).devUnlock;
    set('devUnlock', on);
    if (!on) { set('codeHearts', false); set('codeGems', false); set('view3d', false); }
    toast(on ? 'PLAYTEST CODES UNLOCKED' : 'PLAYTEST CODES HIDDEN');
    return true;
  }
  window.pad = function (k) {
    Mu.resume();
    if (info.extracting) { refreshInfo(); draw(); return; }
    if (konami(k)) { refreshInfo(); build(); draw(); return; }      // the final A doesn't also pick a menu item
    if (confirm) {
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') confirm.sel ^= 1;
      else if (k === 'ok') { var c = confirm; confirm = null; if (c.sel === 0) c.fn(); }
      else if (k === 'back') confirm = null;
      draw(); return;
    }
    if (waiting >= 0) { if (k === 'back') back(); draw(); return; }
    if ((page === 'save' || page === 'load') && (k === 'up' || k === 'down' || k === 'left' || k === 'right')) {
      var n = rows.length - 1;                     // slots, then BACK
      if (sel >= n) { if (k === 'up') sel = n - 1; else if (k === 'down') sel = 0; }
      else if (k === 'left' || k === 'right') sel = (sel & ~1) | ((sel & 1) ^ 1);
      else if (k === 'down') sel = sel + 2 >= n ? n : sel + 2;
      else sel = sel - 2 < 0 ? n : sel - 2;
    } else if (k === 'up' || k === 'down') {
      var d = k === 'up' ? -1 : 1, i = sel;
      do { i = (i + d + rows.length) % rows.length; } while (rows[i].head && i !== sel);
      sel = i;
    } else if (k === 'ok') { var r = rows[sel]; if (r && r.fn) r.fn(1); }
    else if (k === 'left' || k === 'right') { var r2 = rows[sel]; if (r2 && r2.value && r2.value !== '>' && r2.value !== 'GO' && r2.fn && page !== 'main') r2.fn(k === 'left' ? -1 : 1); }
    else if (k === 'back') back();
    refreshInfo(); build(); draw();
  };

  var hit = [];
  cv.addEventListener('pointerdown', function (e) {
    Mu.resume();
    if (info.extracting) return;
    var x = e.clientX * W / innerWidth, y = e.clientY * H / innerHeight;
    for (var i = hit.length - 1; i >= 0; i--) {
      var b = hit[i];
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) { b.fn(x - b.x < b.w / 3 ? -1 : 1); refreshInfo(); build(); draw(); return; }
    }
  });
  var startY = null;
  cv.addEventListener('touchstart', function (e) { startY = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener('touchmove', function (e) {
    if (startY == null) return;
    var dy = (e.touches[0].clientY - startY) * H / innerHeight;
    if (Math.abs(dy) > 12) { scroll = Math.max(0, scroll - Math.sign(dy)); startY = e.touches[0].clientY; draw(); }
  }, { passive: true });

  // ------------------------------------------------------------------ drawing
  // Night over Sequin Land: twinkling sparkles, a crescent moon and a skyline of domes (drawn here, not from the game).
  var stars = [];
  for (var s = 0; s < 70; s++) stars.push([Math.random(), Math.random() * 0.7, Math.floor(Math.random() * 4), Math.floor(Math.random() * 48)]);
  var sky = null, skyW = 0, skyH = 0;
  function skyline() {
    if (sky && skyW === W && skyH === H) return sky;
    sky = document.createElement('canvas'); sky.width = W; sky.height = H; skyW = W; skyH = H;
    var x = sky.getContext('2d');
    for (var yy = 0; yy < H; yy++) {               // banded gradient, 8 steps, GB style
      var t = Math.floor(yy / H * 8) / 7;
      x.fillStyle = 'rgb(' + Math.round(24 + 40 * t) + ',' + Math.round(10 + 14 * t) + ',' + Math.round(40 + 50 * t) + ')';
      x.fillRect(0, yy, W, 1);
    }
    // moon
    var mx = W - 36, my = H > W ? 64 : 30;
    x.fillStyle = '#f8e8b0'; circle(x, mx, my, 12);
    x.fillStyle = 'rgb(28,12,46)'; circle(x, mx - 6, my - 3, 11);
    // skyline: domes, towers, a lighthouse at the right edge
    var base = H - 18, rnd = 7;
    function r() { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; }
    x.fillStyle = '#0c0418';
    for (var bx = -8; bx < W; ) {
      var bw = 14 + Math.floor(r() * 22), bh = 10 + Math.floor(r() * 26);
      x.fillRect(bx, base - bh, bw, bh + 18);
      if (r() < 0.55) {                                                            // dome, sometimes with a spire
        circle(x, bx + bw / 2, base - bh, bw / 2 - 1);
        if (r() < 0.5) x.fillRect(Math.round(bx + bw / 2) - 1, base - bh - bw / 2 - 6, 2, 8);
      }
      if (r() < 0.25) { var tx = bx + bw - 3; x.fillRect(tx, base - bh - 18, 5, bh + 18); x.fillRect(tx - 1, base - bh - 20, 7, 3); } // tower
      bx += bw - 2;
    }
    // windows
    for (var k = 0; k < W / 10; k++) { x.fillStyle = r() < 0.5 ? '#f8c048' : '#e07838'; x.fillRect(Math.floor(r() * W), base - 2 - Math.floor(r() * 18), 1, 2); }
    return sky;
  }
  function circle(x, cx, cy, rad) { for (var dy = -rad; dy <= rad; dy++) { var w = Math.round(Math.sqrt(rad * rad - dy * dy)); x.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w, 1); } }

  function cursor(x, y) {                          // a beating heart from the game's own HUD icons
    var beat = (tick >> 2) % 4 === 0;
    G.glyph(ctx, G.ICON.HEART, x, y, C.red, '#f8a0a8', 1);
    if (beat) G.glyph(ctx, G.ICON.HEART, x, y - 1, C.red, '#f8a0a8', 1);
  }

  function draw() {
    hit = [];
    if (info.extracting) { drawExtract(); return; }
    ctx.drawImage(skyline(), 0, 0);
    stars.forEach(function (st) {
      var ph = (tick + st[3]) % 48;
      if (ph < 36) {
        ctx.fillStyle = [C.gold, C.white, C.purple, '#f898c8'][st[2]];
        var sx = Math.floor(st[0] * W), sy = Math.floor(st[1] * H);
        ctx.fillRect(sx, sy, 1, 1);
        if (ph > 14 && ph < 22) { ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); }
      }
    });
    var cx = W / 2, y = 12;
    if (page === 'main' && info.mode !== 'pause') {
      G.textC(ctx, 'Shantae', cx + 2, y + 6, C.dred, 3);
      G.textC(ctx, 'Shantae', cx, y + 4, C.gold, 3);
      G.textC(ctx, 'DUAL', cx, y + 32, C.purple, 2);
      y += 54;
      var rom = info.rom || {};
      var romLine = !rom.present ? 'NO ROM SELECTED' : rom.ok ? 'SHANTAE (USA) - OK' : 'UNKNOWN ROM ' + (rom.crc || '').toUpperCase();
      G.textC(ctx, romLine, cx, y, !rom.present ? C.red : rom.ok ? C.green : C.yellow);
      y += 14;
    } else {
      var title = { main: 'PAUSE', save: 'SAVE STATE', load: 'LOAD STATE', settings: 'SETTINGS', display: 'DISPLAY', screens: 'SCREENS',
                    controls: 'CONTROLS', buttons: 'CONTROLLER', sound: 'SOUND', gameplay: 'GAMEPLAY', system: 'SYSTEM',
                    dev: 'PLAYTEST CODES', warp: 'ROOM WARP' }[page] || '';
      G.textC(ctx, title, cx + 1, y + 1, C.dred, 2);
      G.textC(ctx, title, cx, y, C.gold, 2);
      y += 24;
    }
    if (page === 'save' || page === 'load') { slotGrid(y); finish(); return; }
    var centered = page === 'main', rowH = centered ? 16 : 12;
    if (page === 'settings') rowH = 14;
    var foot = page === 'main' && info.mode !== 'pause' ? 26 : 8;
    var maxRows = Math.max(1, Math.floor((H - y - foot - 16) / rowH));
    var visible = Math.min(rows.length, maxRows);
    var listW = centered ? Math.min(W - 32, 15 * 8 + 32) : Math.min(W - 16, 232);
    // frame around the list, in whole tiles
    var fw = Math.ceil((listW + 20) / 8), fh = Math.ceil((visible * rowH + 14) / 8);
    var fx = Math.round(cx - fw * 4), fy = Math.round(y + Math.max(0, (H - foot - y - fh * 8) / 2));
    G.frame(ctx, fx, fy, fw, fh, BOX);
    y = fy + 8 + Math.floor((fh * 8 - 14 - visible * rowH) / 2);
    if (sel < scroll) scroll = sel;
    if (sel >= scroll + visible) scroll = sel - visible + 1;
    scroll = Math.max(0, Math.min(scroll, Math.max(0, rows.length - visible)));
    var x0 = Math.round(cx - listW / 2);
    for (var i = scroll; i < rows.length && i < scroll + visible; i++) {
      var r = rows[i], yy = y + (i - scroll) * rowH, on = i === sel;
      if (r.note) { G.textC(ctx, r.head, cx, yy + 2, C.grey); continue; }
      if (r.head) { G.text(ctx, r.head, x0, yy + 2, C.purple); continue; }
      if (centered) {
        if (on) { var bw = r.label.length * 8 + 36; ctx.fillStyle = C.sel; ctx.fillRect(Math.round(cx - bw / 2), yy - 2, bw, rowH - 3); }
        G.textC(ctx, r.label, cx, yy + 2, on ? C.white : C.ink);
        if (on) cursor(Math.round(cx - r.label.length * 4) - 14, yy + 2);
      } else {
        if (on) { ctx.fillStyle = C.sel; ctx.fillRect(x0 - 2, yy, listW + 4, rowH - 1); }
        G.text(ctx, r.label, x0 + 10, yy + 2, on ? C.white : C.ink);
        if (on) cursor(x0, yy + 2);
        if (r.value) {
          var v = r.value, maxc = Math.floor((listW - r.label.length * 8 - 26) / 8);
          if (v.length > maxc) v = v.substr(0, Math.max(1, maxc));
          G.textR(ctx, v, x0 + listW, yy + 2, waiting === i ? ((tick >> 3) % 2 ? C.gold : C.white) : C.teal);
        }
      }
      (function (idx, rr) { hit.push({ x: x0 - 4, y: yy, w: listW + 8, h: rowH, fn: function (d) { sel = idx; if (rr.fn) rr.fn(d); } }); })(i, r);
    }
    if (scroll > 0) G.textC(ctx, '^', cx, fy - 9, C.gold);
    if (scroll + visible < rows.length) G.glyph(ctx, 0x76, cx - 4, fy + fh * 8 + 1, C.gold);
    finish();
  }
  function finish() {
    var cx = W / 2;
    if (page === 'main' && info.mode !== 'pause') {
      var sc = info.screens || {};
      G.text(ctx, 'v' + (info.version || ''), 4, H - 10, C.lgrey);
      var how = { hinge: 'DUAL SCREEN', split: 'SPLIT', external: '2ND DISPLAY', side: 'SIDE PANEL', single: 'ONE SCREEN' }[sc.how] || '';
      G.textR(ctx, how + (sc.source ? ' (' + String(sc.source).toUpperCase() + ')' : ''), W - 4, H - 10, C.lgrey);
      if (sc.size) G.textR(ctx, String(sc.model || '').toUpperCase().substr(0, 14) + ' ' + sc.size, W - 4, H - 20, C.grey);
    }
    if (confirm) drawConfirm();
    if (toastT > tick) {
      var tw = Math.ceil((toastMsg.length * 8 + 20) / 8);
      var tx = Math.round(cx - tw * 4);
      G.frame(ctx, tx, H - 36, tw, 3, BOX);
      G.textC(ctx, toastMsg, cx, H - 28, C.ink);
    }
  }

  // SAVE / LOAD: 2x2 cards with the slot's screenshot (Game Boy 10:9), then BACK. Every card is one big tap target.
  function slotGrid(y) {
    var n = rows.length - 1, gap = 6, backH = 24;
    var gw = Math.min(W - 16, 336), cw = Math.floor((gw - gap) / 2);
    var ch = Math.floor((H - y - backH - 8 - gap) / 2);
    var th = Math.min(ch - 28, Math.round((cw - 16) * 0.9)), tw = Math.round(th * 10 / 9);
    ch = th + 28; cw = Math.max(cw, tw + 16);
    cw = Math.ceil(cw / 8) * 8; ch = Math.ceil(ch / 8) * 8;
    var x0 = Math.round((W - (cw * 2 + gap)) / 2);
    for (var i = 0; i < n; i++) {
      var r = rows[i], on = i === sel, x = x0 + (i % 2) * (cw + gap), yy = y + Math.floor(i / 2) * (ch + gap);
      G.frame(ctx, x, yy, cw / 8, ch / 8, on ? { ink: C.white, red: C.gold, fill: C.sel } : BOX);
      var tx = x + Math.round((cw - tw) / 2), ty = yy + 6;
      var im = r.time ? thumbs[r.slot] : null;
      if (r.time && im === undefined) {
        thumbs[r.slot] = null;
        var url = H0.thumb ? H0.thumb(r.slot) : '';
        if (url) (function (k) { var img = new Image(); img.onload = function () { thumbs[k] = img; draw(); }; img.src = url; })(r.slot);
      }
      if (im) ctx.drawImage(im, tx, ty, tw, th);
      else { ctx.fillStyle = '#100818'; ctx.fillRect(tx, ty, tw, th); G.textC(ctx, r.time ? '...' : 'EMPTY', x + cw / 2, ty + th / 2 - 4, C.grey); }
      G.text(ctx, String(r.slot), x + 8, yy + ch - 17, on ? C.gold : C.ink);
      if (r.time) G.textR(ctx, r.value, x + cw - 8, yy + ch - 17, on ? C.white : C.teal);
      (function (idx, rr) { hit.push({ x: x, y: yy, w: cw, h: ch, fn: function () { sel = idx; if (rr.fn) rr.fn(1); } }); })(i, r);
    }
    var by = y + 2 * (ch + gap), bw = 12, bx = Math.round(W / 2 - bw * 4), bon = sel === n;
    G.frame(ctx, bx, by, bw, 3, bon ? { ink: C.white, red: C.gold, fill: C.sel } : BOX);
    G.textC(ctx, 'BACK', W / 2, by + 8, bon ? C.white : C.ink);
    hit.push({ x: bx, y: by, w: bw * 8, h: backH, fn: function () { sel = n; back(); } });
  }

  function drawConfirm() {
    hit.push({ x: 0, y: 0, w: W, h: H, fn: function () {} });
    var wT = Math.ceil(Math.min(W - 16, Math.max(confirm.q.length * 8 + 24, 128)) / 8), w = wT * 8, h = 48;
    var x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    G.frame(ctx, x, y, wT, 6, BOX);
    var q = confirm.q; if (q.length * 8 > w - 16) q = q.substr(0, Math.floor((w - 16) / 8));
    G.textC(ctx, q, W / 2, y + 12, C.white);
    var yes = confirm.sel === 0;
    if (yes) cursor(x + w / 2 - 56, y + 28); else cursor(x + w / 2 + 8, y + 28);
    G.text(ctx, 'YES', x + w / 2 - 44, y + 28, yes ? C.gold : C.ink);
    G.text(ctx, 'NO', x + w / 2 + 20, y + 28, !yes ? C.gold : C.ink);
    hit.push({ x: x, y: y + 20, w: w / 2, h: 24, fn: function () { var c = confirm; confirm = null; c.fn(); } });
    hit.push({ x: x + w / 2, y: y + 20, w: w / 2, h: 24, fn: function () { confirm = null; } });
  }


  // ------------------------------------------------------------------ first start: reading the ROM
  function drawExtract() {
    ctx.drawImage(skyline(), 0, 0);
    var cx = W / 2, y = Math.round(H / 2 - 40), p = Math.max(0, Math.min(100, info.extractPct | 0));
    G.textC(ctx, 'Shantae', cx + 2, y - 30, C.dred, 3);
    G.textC(ctx, 'Shantae', cx, y - 32, C.gold, 3);
    var fw = 26, fx = Math.round(cx - fw * 4);
    G.frame(ctx, fx, y, fw, 9, BOX);
    G.textC(ctx, 'RECORDING THE TITLE', cx, y + 12, C.white);
    G.textC(ctx, 'THEME FROM YOUR ROM...', cx, y + 24, C.ink);
    for (var i = 0; i < 10; i++) {                       // ten HUD hearts fill up
      var full = p >= (i + 1) * 10, half = !full && p > i * 10;
      var hx = Math.round(cx - 40 + i * 8), hy = y + 42;
      G.glyph(ctx, full || (half && (tick >> 2) % 2) ? G.ICON.HEART : G.ICON.HEART0, hx, hy, C.red, '#f8a0a8');
    }
  }

  refreshInfo(); build(); resize(); music();
  setInterval(function () { tick++; if (tick % 4 === 0 || toastT >= tick) draw(); }, 50);
})();
