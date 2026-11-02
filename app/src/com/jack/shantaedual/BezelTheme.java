package com.jack.shantaedual;

import android.graphics.Bitmap;

/**
 * Builds the 16:9 side-border texture from what the game is drawing right now: the most common solid
 * background tile pair on screen (CGB BG map + attributes + tile data + palettes), so the borders follow
 * Scuttle Town, the forests, the labyrinths, day and night, with no art shipped in the APK.
 */
final class BezelTheme {
    Bitmap block;          // 16x16 (2x2 tiles)
    int accent = 0xFFE8A0F8, shade = 0xFF4A2470, key, area = -1;

    /** v = Native.video() snapshot: VRAM 0x4000 | BG pal 64 | OBJ pal 64 | OAM 160 | LCDC SCY SCX WY WX. */
    static BezelTheme build(byte[] v, int area) {
        int lcdc = v[0x4120] & 255, scy = v[0x4121] & 255, scx = v[0x4122] & 255, wy = v[0x4123] & 255;
        if ((lcdc & 0x80) == 0) return null;
        int map = (lcdc & 0x08) != 0 ? 0x1C00 : 0x1800;
        int rows = Math.min(18, (lcdc & 0x20) != 0 && wy < 144 ? wy / 8 : 18);   // stop at the window (status bar)
        java.util.HashMap<Integer, int[]> count = new java.util.HashMap<Integer, int[]>();
        int best = -1, bestN = 0, bestMx = 0, bestMy = 0;
        for (int r = 0; r < rows; r++) for (int col = 0; col < 20; col++) {
            int mx = ((scx >> 3) + col) & 31, my = ((scy >> 3) + r) & 31;
            int t = v[map + my * 32 + mx] & 255, at = v[0x2000 + map + my * 32 + mx] & 255;
            int off = tileOff(lcdc, t, at);
            if (coverage(v, off) < 24) continue;
            int k = (at & 0x0F) << 8 | t;
            int[] n = count.get(k); if (n == null) { n = new int[1]; count.put(k, n); }
            if (++n[0] > bestN) { bestN = n[0]; best = k; bestMx = mx & ~1; bestMy = my & ~1; }
        }
        if (best < 0 || bestN < 4) return null;
        BezelTheme th = new BezelTheme();
        th.block = Bitmap.createBitmap(16, 16, Bitmap.Config.ARGB_8888);
        int[] pal0 = null;
        for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
            int mx = (bestMx + dx) & 31, my = (bestMy + dy) & 31;
            int t = v[map + my * 32 + mx] & 255, at = v[0x2000 + map + my * 32 + mx] & 255;
            int[] cols = palette(v, at & 7);
            if (pal0 == null) pal0 = cols;
            int off = tileOff(lcdc, t, at);
            boolean fx = (at & 0x20) != 0, fy = (at & 0x40) != 0;
            for (int y = 0; y < 8; y++) {
                int ry = fy ? 7 - y : y;
                int lo = v[off + ry * 2] & 255, hi = v[off + ry * 2 + 1] & 255;
                for (int x = 0; x < 8; x++) {
                    int rx = fx ? 7 - x : x;
                    int c = ((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1);
                    th.block.setPixel(dx * 8 + x, dy * 8 + y, cols[c]);
                }
            }
        }
        th.accent = brightest(pal0);
        th.shade = darkest(pal0);
        th.key = best * 64 + (area & 63);
        th.area = area;
        return th;
    }

    static int tileOff(int lcdc, int t, int at) {
        int bank = (at & 0x08) != 0 ? 0x2000 : 0;
        int idx = (lcdc & 0x10) != 0 ? t : (t < 128 ? 256 + t : t);   // 8000 unsigned / 8800 signed addressing
        return bank + idx * 16;
    }

    /** CGB colour (BGR555) to ARGB. */
    static int rgb(int lo, int hi) {
        int c = (lo & 255) | (hi & 255) << 8;
        int r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
        return 0xFF000000 | (r * 255 / 31) << 16 | (g * 255 / 31) << 8 | (b * 255 / 31);
    }

    /** BG palette p as the core displays it (colour correction applied; snapshot offset 0x4125). */
    static int[] palette(byte[] v, int p) {
        int[] c = new int[4];
        for (int i = 0; i < 4; i++) {
            int o = 0x4125 + (p * 4 + i) * 3;
            c[i] = 0xFF000000 | (v[o] & 255) << 16 | (v[o + 1] & 255) << 8 | (v[o + 2] & 255);
        }
        return c;
    }

    private static int coverage(byte[] v, int off) {
        int[] n = new int[4];
        for (int y = 0; y < 8; y++) {
            int lo = v[off + y * 2] & 255, hi = v[off + y * 2 + 1] & 255;
            for (int x = 0; x < 8; x++) n[((lo >> x) & 1) | (((hi >> x) & 1) << 1)]++;
        }
        int distinct = 0; for (int k : n) if (k > 0) distinct++;
        return distinct >= 2 ? 64 - Math.max(Math.max(n[0], n[1]), Math.max(n[2], n[3])) + 16 : 0;
    }

    private static int lum(int c) { return ((c >> 16) & 255) * 3 + ((c >> 8) & 255) * 6 + (c & 255); }
    private static int brightest(int[] c) { int b = c[0]; for (int x : c) if (lum(x) > lum(b)) b = x; return b; }
    private static int darkest(int[] c) { int b = c[0]; for (int x : c) if (lum(x) < lum(b)) b = x; return b; }
}
