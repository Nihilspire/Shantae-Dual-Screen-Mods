/* music.js - launcher music: "Sequin Nights", an original low-key piece in the spirit of Shantae's Arabian-nights
 * setting (D hijaz: D Eb F# G A Bb C). The melody and harmony are new; no notes are taken from the game's soundtrack.
 * A small WebAudio band: a soft drone, an oud-like plucked ostinato, darbuka (maqsum rhythm), a breathy ney lead and
 * a few chimes, through a gentle low-pass and a room reverb. Silent where WebAudio is missing. */
(function (root) {
  'use strict';
  var AC = root.AudioContext || root.webkitAudioContext;
  var M = { playing: false };
  if (!AC) { M.play = M.stop = M.resume = function () {}; root.Music = M; return; }

  var ctx = null, master = null, noiseBuf = null, timer = null, step = 0, nextT = 0;
  var BPM = 88, STEP = 60 / BPM / 4, LOOK = 0.2;          // 16th-note grid
  var hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = ctx.sampleRate, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBuf = b);
  }
  function env(g, t, len, vol, att, rel) {
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, Math.max(t + att, t + len - rel)); g.gain.linearRampToValueAtTime(0, t + len);
  }

  // ---- instruments
  function drone(midis, t, len, vol) {            // soft detuned saws, dark filter, slow swell
    var f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.2;
    env(g, t, len, vol, 1.2, 1.0); f.connect(g); g.connect(master);
    midis.forEach(function (m) { [-7, 6].forEach(function (dt) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = dt;
      o.connect(f); o.start(t); o.stop(t + len + 0.05);
    }); });
  }
  function oud(m, t, vol) {                        // plucked: bright attack with a tiny pitch fall, quick decay
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'triangle';
    o.frequency.setValueAtTime(hz(m) * 1.012, t); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.03);
    o2.frequency.value = hz(m);
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    g2.gain.value = 0.6;
    g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.6);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(master);
    o.start(t); o2.start(t); o.stop(t + 0.62); o2.stop(t + 0.62);
  }
  function doum(t, vol) {                          // darbuka low stroke: sine thump
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
  }
  function tek(t, vol, bright) {                   // darbuka rim: band-passed noise click
    var n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noise(); f.type = 'bandpass'; f.frequency.value = bright ? 3800 : 2400; f.Q.value = 1.4;
    g.gain.value = 0; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + (bright ? 0.05 : 0.08));
    n.connect(f); f.connect(g); g.connect(master); n.start(t, Math.random() * 0.5); n.stop(t + 0.1);
  }
  function ney(m, t, len, vol) {                   // breathy flute: sine + filtered breath, delayed vibrato
    var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz(m);
    lfo.frequency.value = 5.4; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(hz(m) * 0.008, t + Math.min(len, 0.5));
    lfo.connect(lg); lg.connect(o.frequency); env(g, t, len, vol, 0.09, 0.22);
    o.connect(g); g.connect(master);
    var n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noise(); nf.type = 'bandpass'; nf.frequency.value = hz(m) * 2; nf.Q.value = 6;
    env(ng, t, len, vol * 0.5, 0.05, 0.2);
    n.connect(nf); nf.connect(ng); ng.connect(master);
    o.start(t); lfo.start(t); n.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05); n.stop(t + len + 0.05);
  }
  function chime(m, t, vol) {                      // small bell: two inharmonic sines, long decay
    [1, 2.76].forEach(function (r, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(m) * r;
      g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol / (i + 1), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.8);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.85);
    });
  }

  // ---- the score: 16 bars. A (0-7): drone, oud and drums; the ney enters at bar 4. B (8-15): the full theme.
  var OUD = {      // eighth-note ostinato over each harmony
    D: [50, 57, 51, 57, 54, 57, 55, 54], Cm: [48, 55, 51, 55, 48, 55, 51, 53], Gm: [43, 50, 46, 50, 55, 50, 46, 50],
    A: [45, 52, 49, 52, 57, 52, 49, 52], Bb: [46, 53, 50, 53, 58, 53, 50, 53] };
  var DRONE = { D: [38, 45], Cm: [36, 43], Gm: [43, 50], A: [45, 52], Bb: [46, 53] };
  var PROG = ['D', 'D', 'Cm', 'D', 'D', 'D', 'Cm', 'D', 'Gm', 'D', 'Cm', 'D', 'Gm', 'Cm', 'A', 'D'];
  var MEL = [   // ney: [bar, step, midi, steps]
    [4, 0, 69, 6], [4, 6, 70, 2], [4, 8, 69, 4], [4, 12, 67, 4],
    [5, 0, 66, 6], [5, 6, 67, 2], [5, 8, 66, 4], [5, 12, 63, 4],
    [6, 0, 62, 8], [6, 8, 66, 4], [6, 12, 69, 4],
    [7, 0, 70, 4], [7, 4, 69, 4], [7, 8, 67, 4], [7, 12, 66, 4],
    [8, 0, 74, 8], [8, 8, 72, 4], [8, 12, 70, 4],
    [9, 0, 69, 12], [9, 12, 67, 4],
    [10, 0, 70, 4], [10, 4, 69, 4], [10, 8, 67, 4], [10, 12, 66, 4],
    [11, 0, 67, 8], [11, 8, 69, 8],
    [12, 0, 74, 6], [12, 6, 75, 2], [12, 8, 74, 4], [12, 12, 72, 4],
    [13, 0, 70, 6], [13, 6, 72, 2], [13, 8, 70, 4], [13, 12, 69, 4],
    [14, 0, 67, 4], [14, 4, 66, 4], [14, 8, 63, 4], [14, 12, 66, 4],
    [15, 0, 62, 14]];
  var TOTAL = 16 * 16;

  function schedule(s, t) {
    var bar = Math.floor(s / 16) % 16, st = s % 16, ch = PROG[bar], inB = bar >= 8;
    if (st === 0 && (bar % 2 === 0 || PROG[bar] !== PROG[bar - 1])) drone(DRONE[ch], t, STEP * (PROG[bar + 1] === ch ? 32.2 : 16.2), 0.022);
    if (st % 2 === 0) oud(OUD[ch][st >> 1] + 12, t, (st === 0 ? 0.075 : 0.05) * (inB ? 1 : 0.9));
    // maqsum: DOUM tek . tek DOUM . tek . (eighths), soft ghost notes in between
    if (st === 0 || st === 8) doum(t, 0.16);
    if (st === 2 || st === 6 || st === 12) tek(t, 0.05, false);
    if (st % 2 === 1 && bar > 1) tek(t, 0.012, true);
    MEL.forEach(function (n) { if (n[0] === bar && n[1] === st) ney(n[2], t, n[3] * STEP * 0.96, inB ? 0.05 : 0.042); });
    if (st === 0 && (bar === 0 || bar === 8)) { chime(86, t, 0.025); chime(81, t + STEP * 3, 0.018); }
    if (st === 12 && bar === 15) chime(86, t, 0.02);
  }
  function pump() {
    while (nextT < ctx.currentTime + LOOK) { schedule(step, nextT); step = (step + 1) % TOTAL; nextT += STEP; }
  }
  // master -> gentle low-pass -> dry + room reverb
  function bus(c) {
    var input = c.createGain(), lp = c.createBiquadFilter(), dry = c.createGain(), rv = c.createConvolver(), wet = c.createGain();
    var len = Math.round(c.sampleRate * 2.0), ir = c.createBuffer(2, len, c.sampleRate);
    for (var k = 0; k < 2; k++) { var d = ir.getChannelData(k); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    rv.buffer = ir; lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.4;
    dry.gain.value = 0.85; wet.gain.value = 0.28;
    input.connect(lp); lp.connect(dry); dry.connect(c.destination); lp.connect(rv); rv.connect(wet); wet.connect(c.destination);
    return input;
  }

  M.play = function () {
    if (M.playing) return;
    try {
      if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.connect(bus(ctx)); }
      if (ctx.state === 'suspended') ctx.resume();
      M.playing = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);
      step = 0; nextT = ctx.currentTime + 0.08;
      pump(); timer = setInterval(pump, 40);
    } catch (e) { M.playing = false; }
  };
  M.stop = function () {
    if (!M.playing) return;
    M.playing = false;
    clearInterval(timer); timer = null;
    try {
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.4);
      setTimeout(function () { if (!M.playing && ctx) ctx.suspend(); }, 600);
    } catch (e) {}
  };
  M.resume = function () { if (M.playing && ctx && ctx.state === 'suspended') ctx.resume(); };
  /** Renders the song without playing it (tests / preview): resolves to an AudioBuffer. */
  M.render = function (seconds) {
    var Off = root.OfflineAudioContext; if (!Off) return Promise.reject('no OfflineAudioContext');
    var keep = [ctx, master, noiseBuf];
    ctx = new Off(1, Math.round(44100 * seconds), 44100); master = ctx.createGain(); master.gain.value = 1; master.connect(bus(ctx));
    noiseBuf = null;
    for (var s = 0, t = 0.05; t < seconds; s++, t += STEP) schedule(s % TOTAL, t);
    var p = ctx.startRendering();
    ctx = keep[0]; master = keep[1]; noiseBuf = keep[2];
    return p;
  };
  root.Music = M;
})(this);
