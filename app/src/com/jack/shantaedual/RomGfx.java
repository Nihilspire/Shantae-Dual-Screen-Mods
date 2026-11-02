package com.jack.shantaedual;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;

import java.io.File;
import java.io.FileInputStream;

/** Graphics read from the player's own ROM at runtime (nothing from the game ships in the APK). */
final class RomGfx {
    byte[] rom;
    byte[] tiles;                                       // decompressed tileset that holds the font
    private final Bitmap[] glyphs = new Bitmap[128];    // white-on-transparent: 0x20-0x7F text, 0x00-0x1F HUD icons
    private final Paint paint = new Paint();
    private final Rect src = new Rect(0, 0, 8, 8), dst = new Rect();

    boolean load(File f) {
        try {
            if (!f.exists()) return false;
            byte[] b = new byte[(int) f.length()];
            FileInputStream in = new FileInputStream(f);
            int n = 0; while (n < b.length) { int r = in.read(b, n, b.length - n); if (r < 0) break; n += r; }
            in.close();
            if (b.length < Gb.ROM_FONT_LZ + 0x800) return false;
            rom = b;
            tiles = lzss(b, Gb.ROM_FONT_LZ, Gb.FONT_TILES_LEN);
            for (int t = 0; t < 128; t++) glyphs[t] = glyph(t);
            paint.setFilterBitmap(false);
            return true;
        } catch (Exception e) { rom = null; return false; }
    }

    boolean ready() { return rom != null && tiles != null; }

    /** Okumura LZSS as used by the game (bank 1 $41BD): 4 KB ring pre-filled with spaces, write position 0xFEE,
     *  flag bit 1 = literal, 0 = (12-bit ring position, 4-bit length + 3). */
    static byte[] lzss(byte[] rom, int off, int len) {
        byte[] ring = new byte[4096], out = new byte[len];
        java.util.Arrays.fill(ring, (byte) ' ');
        int r = 0xFEE, o = 0, p = off;
        while (o < len) {
            int flags = rom[p++] & 255;
            for (int k = 0; k < 8 && o < len; k++, flags >>= 1) {
                if ((flags & 1) != 0) { byte c = rom[p++]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xFFF; }
                else {
                    int lo = rom[p] & 255, hi = rom[p + 1] & 255; p += 2;
                    int pos = lo | ((hi & 0xF0) << 4), n = (hi & 15) + 3;
                    for (int i = 0; i < n && o < len; i++) { byte c = ring[(pos + i) & 0xFFF]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xFFF; }
                }
            }
        }
        return out;
    }

    /** Glyph pixels are colour 1 (the background is colour 3). Char c lives at FONT_BASE + c*16; 0x00-0x1F are the
     *  HUD icons stored at tiles 0x100-0x11F. */
    private Bitmap glyph(int c) {
        int off = Gb.FONT_BASE + c * 16;
        Bitmap bm = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < 8; y++) {
            int lo = tiles[off + y * 2] & 255, hi = tiles[off + y * 2 + 1] & 255;
            for (int x = 0; x < 8; x++) {
                int v = ((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1);
                bm.setPixel(x, y, v == 1 ? 0xFFFFFFFF : v == 2 ? 0xFF808080 : 0);
            }
        }
        return bm;
    }

    /** Draws text in the game's font; px is the size of one Game Boy pixel on screen. */
    void text(Canvas c, String s, float x, float y, float px, int color) {
        if (!ready()) return;
        paint.setColorFilter(new android.graphics.PorterDuffColorFilter(color, android.graphics.PorterDuff.Mode.SRC_IN));
        for (int i = 0; i < s.length(); i++) {
            int ch = s.charAt(i);
            if (ch <= 0x20 || ch >= 0x80) continue;
            dst.set(Math.round(x + i * 8 * px), Math.round(y), Math.round(x + (i + 1) * 8 * px), Math.round(y + 8 * px));
            c.drawBitmap(glyphs[ch], src, dst, paint);
        }
        paint.setColorFilter(null);
    }

    /** One HUD icon (0x00-0x1F) or glyph, tinted. */
    void icon(Canvas c, int code, float x, float y, float px, int color) {
        if (!ready() || code < 0 || code >= 128) return;
        paint.setColorFilter(new android.graphics.PorterDuffColorFilter(color, android.graphics.PorterDuff.Mode.SRC_IN));
        dst.set(Math.round(x), Math.round(y), Math.round(x + 8 * px), Math.round(y + 8 * px));
        c.drawBitmap(glyphs[code], src, dst, paint);
        paint.setColorFilter(null);
    }
}
