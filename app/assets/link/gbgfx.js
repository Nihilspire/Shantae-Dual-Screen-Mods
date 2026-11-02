/* gbgfx.js - draws Game Boy tiles, the game's font, HUD icons and text-box frames onto a canvas.
 * All graphics come from the player's ROM at runtime (Host.font() / Native.font()); the page ships none. */
(function (root) {
  var G = {};
  G.b64 = function (s) { var b = atob(s || ''), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  /** CGB BGR555 -> css */
  G.cgb = function (lo, hi) {
    var c = lo | hi << 8, r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
    return 'rgb(' + (r * 255 / 31 | 0) + ',' + (g * 255 / 31 | 0) + ',' + (b * 255 / 31 | 0) + ')';
  };
  /** GB 2bpp tile (row = low byte, high byte) -> 64 pixel values */
  G.decode = function (data, off) {
    var px = new Uint8Array(64);
    for (var y = 0; y < 8; y++) {
      var lo = data[off + y * 2], hi = data[off + y * 2 + 1];
      for (var x = 0; x < 8; x++) px[y * 8 + x] = ((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1);
    }
    return px;
  };
  /** colors: array of 4 css colors or null (transparent) */
  G.drawTile = function (ctx, px, x, y, colors, hflip, vflip) {
    for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) {
      var v = px[(vflip ? 7 - yy : yy) * 8 + (hflip ? 7 - xx : xx)];
      if (colors[v]) { ctx.fillStyle = colors[v]; ctx.fillRect(x + xx, y + yy, 1, 1); }
    }
  };

  // ---- font: 128 tiles, char c = tile c (0x20-0x7E text, 0x00-0x1F HUD icons). Text ink is colour 1, icons also use 2.
  var tiles = null, cache = {};
  G.setFont = function (data) { if (data && data.length >= 0x800) { tiles = []; for (var t = 0; t < 128; t++) tiles.push(G.decode(data, t * 16)); cache = {}; } };
  G.hasFont = function () { return !!tiles; };
  G.ICON = { GEM: 0x0B, STAR0: 0x0C, HEART: 0x0D, NOTE: 0x0E, X: 0x1B, STAR: 0x1C, HEART0: 0x1D, NOTE0: 0x1E };
  function tileCanvas(code, ink, shade, hf, vf) {
    var key = code + ink + (shade || '') + (hf ? 'h' : '') + (vf ? 'v' : '');
    if (cache[key]) return cache[key];
    if (!tiles || !tiles[code]) return null;
    var c = document.createElement('canvas'); c.width = 8; c.height = 8;
    G.drawTile(c.getContext('2d'), tiles[code], 0, 0, [null, ink, shade || null, null], hf, vf);
    return (cache[key] = c);
  }
  G.glyph = function (ctx, code, x, y, ink, shade, scale, hf, vf) {
    var c = tileCanvas(code, ink, shade, hf, vf); scale = scale || 1;
    if (c) ctx.drawImage(c, x, y, 8 * scale, 8 * scale);
  };
  /** Text at 8 px per character in the game's font. Falls back to a system font before a ROM is chosen. */
  G.text = function (ctx, s, x, y, color, scale) {
    scale = scale || 1; s = String(s);
    if (!tiles) {
      ctx.fillStyle = color; ctx.font = 'bold ' + (8 * scale) + 'px monospace'; ctx.textBaseline = 'top';
      for (var j = 0; j < s.length; j++) ctx.fillText(s[j], x + j * 8 * scale, y);
      return;
    }
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      if (ch > 0x20 && ch < 0x7F && '[\\]{|}'.indexOf(s[i]) < 0) G.glyph(ctx, ch, x + i * 8 * scale, y, color, null, scale);
    }
  };
  G.textC = function (ctx, s, cx, y, color, scale) { scale = scale || 1; G.text(ctx, s, Math.round(cx - String(s).length * 4 * scale), y, color, scale); };
  G.textR = function (ctx, s, rx, y, color, scale) { scale = scale || 1; G.text(ctx, s, rx - String(s).length * 8 * scale, y, color, scale); };

  /** The game's dialogue-box frame (tiles '{' '|' DEL '}' '[' '\' ']'), w x h in tiles, filled black.
   *  col: { ink: yellow highlights, red: the frame's red, fill } */
  G.frame = function (ctx, x, y, w, h, col) {
    ctx.fillStyle = col.fill || '#000'; ctx.fillRect(x + 2, y + 2, w * 8 - 4, h * 8 - 4);
    if (!tiles) { ctx.strokeStyle = col.red; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w * 8 - 4, h * 8 - 4); return; }
    var ink = col.ink, red = col.red;
    for (var i = 0; i < w; i++) for (var j = 0; j < h; j++) {
      var right = i === w - 1, left = i === 0, top = j === 0, bot = j === h - 1, t = -1;
      if (top) t = left || right ? 0x7B : 0x7C;
      else if (bot) t = left || right ? 0x5C : 0x5D;
      else if (left || right) t = j === 1 ? 0x7D : j === h - 2 ? 0x5B : 0x7F;
      if (t >= 0) G.glyph(ctx, t, x + i * 8, y + j * 8, ink, red, 1, right && (left || right), false);
    }
  };
  root.GbGfx = G;
})(this);
