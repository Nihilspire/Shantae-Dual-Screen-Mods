package com.jack.shantaedual;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

/** Draws the Game Boy picture, plus game-themed borders in the space left around it on wide screens. */
final class GameView extends View {
    final Object lock = new Object();
    Bitmap frame;                       // written by the emulation thread under lock
    String aspect = "square";           // "square" (GB pixels are square, 10:9) or "stretch"
    boolean bezels = true, hud = true, integer = false, showStats = false;
    MainActivity host;
    volatile BezelTheme theme;
    volatile String osd = "";
    volatile long osdUntil;
    RomGfx gfx;

    private final Paint pix = new Paint(), fill = new Paint();
    private final Rect src = new Rect();
    final RectF dst = new RectF();
    private BezelTheme shaderFor;
    private BitmapShader shader;
    private final Matrix m = new Matrix();
    private int hudTick;
    private int hudHearts, hudMax, hudGems, hudLives;
    private boolean hudInGame;
    String hudArea = "", hudClock = "";

    GameView(Context c) {
        super(c);
        pix.setFilterBitmap(false);
        pix.setDither(false);
        setBackgroundColor(0xFF000000);
    }

    void layoutGame(int w, int h) {
        float W = getWidth(), H = getHeight();
        if (W <= 0 || H <= 0) return;
        if (aspect.equals("stretch")) { dst.set(0, 0, W, H); return; }
        float s = Math.min(W / w, H / (float) h);
        if (integer && s >= 1) s = (float) Math.floor(s);
        float gw = w * s, gh = h * s;
        float x = (W - gw) / 2f, y = (H - gh) / 2f;
        dst.set(Math.round(x), Math.round(y), Math.round(x + gw), Math.round(y + gh));
    }

    @Override protected void onDraw(Canvas c) {
        Bitmap f;
        synchronized (lock) {
            f = frame;
            if (f == null) { c.drawColor(0xFF000000); return; }
            src.set(0, 0, f.getWidth(), f.getHeight());
            layoutGame(f.getWidth(), f.getHeight());
            float px = dst.height() / f.getHeight();
            drawBezels(c, px);
            c.drawBitmap(f, src, dst, pix);
        }
        drawStats(c);
        drawOsd(c);
    }

    private void drawStats(Canvas c) {
        if (showStats && host != null && host.emu != null) {
            float spx = Math.max(1, getHeight() / 240f);
            fill.setColor(0xB0000000);
            String st = host.emu.stats;
            c.drawRect(0, 0, (st.length() * 8 + 4) * spx, 12 * spx, fill);
            if (gfx != null && gfx.ready()) gfx.text(c, st, 2 * spx, 2 * spx, spx, 0xFF98F8B8);
        }
    }

    /** Short message centred near the top of the picture. */
    void showOsd(String text) { osd = text; osdUntil = System.currentTimeMillis() + 1500; postInvalidate(); }
    private void drawOsd(Canvas c) {
        if (System.currentTimeMillis() >= osdUntil || gfx == null || !gfx.ready()) return;
        float spx = Math.max(1, Math.round(getHeight() / 200f));
        String t = osd;
        float tw = (t.length() * 8 + 8) * spx, x = (getWidth() - tw) / 2f, y = dst.top + 12 * spx;
        fill.setColor(0xC0000000);
        c.drawRect(x, y, x + tw, y + 12 * spx, fill);
        gfx.text(c, t, x + 4 * spx, y + 2 * spx, spx, 0xFFF8D068);
        postInvalidateDelayed(200);
    }

    private void drawBezels(Canvas c, float px) {
        c.drawColor(0xFF000000);
        float W = getWidth(), H = getHeight();
        boolean space = dst.left > 2 * px || dst.top > 2 * px;
        if (!bezels || !space) return;
        BezelTheme th = theme;
        if (th != null && th.block != null) {
            if (shaderFor != th) {
                shader = new BitmapShader(th.block, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
                shaderFor = th;
            }
            m.reset();
            m.setScale(px, px);
            m.postTranslate(dst.left % (16 * px), dst.top % (16 * px));
            shader.setLocalMatrix(m);
            fill.setShader(shader);
            fill.setFilterBitmap(false);
            c.drawRect(0, 0, W, H, fill);
            fill.setShader(null);
            fill.setColor(0xA0000000);
            c.drawRect(0, 0, W, H, fill);
        }
        int accent = th != null ? th.accent : 0xFFE8A0F8;
        int shade = th != null ? th.shade : 0xFF4A2470;
        fill.setColor(shade);
        c.drawRect(dst.left - 4 * px, dst.top - 4 * px, dst.right + 4 * px, dst.bottom + 4 * px, fill);
        fill.setColor(accent);
        c.drawRect(dst.left - 3 * px, dst.top - 3 * px, dst.right + 3 * px, dst.bottom + 3 * px, fill);
        fill.setColor(0xFF000000);
        c.drawRect(dst.left - 1 * px, dst.top - 1 * px, dst.right + 1 * px, dst.bottom + 1 * px, fill);
        if (hud && gfx != null && gfx.ready() && dst.left > 44 * px) drawHud(c, px, accent);
    }

    /** Compact status in the side borders, used when there is no Link screen. */
    private void drawHud(Canvas c, float px, int accent) {
        if (hudTick++ % 10 == 0) readHud();
        if (!hudInGame) return;
        float lw = dst.left / px;                       // border width in GB pixels
        float lx = (dst.left - Math.min(lw - 8, 40) * px) / 2f, y = dst.top + 16 * px;
        int full = hudHearts / 4, max = (hudMax + 3) / 4;
        int perRow = 5;
        for (int i = 0; i < max; i++) {
            float hx = lx + (i % perRow) * 8 * px, hy = y + (i / perRow) * 9 * px;
            boolean on = i < full, part = i == full && hudHearts % 4 != 0;
            gfx.icon(c, on || part ? 0x0D : 0x1D, hx, hy, px, on ? 0xFFF85878 : part ? 0xFFF8A0B0 : 0xFF806878);
        }
        float gy = y + ((max + perRow - 1) / perRow) * 9 * px + 8 * px;
        gfx.icon(c, 0x0B, lx, gy, px, 0xFF78E0F8);
        gfx.text(c, three(hudGems), lx + 10 * px, gy, px, 0xFFF8F8F8);
        gfx.text(c, "x" + hudLives, lx + 10 * px, gy + 12 * px, px, 0xFFF8D068);
        float rx = dst.right + (getWidth() - dst.right) / 2f, room = (getWidth() - dst.right) / px - 4;
        String a = hudArea;
        if (a.length() * 8 > room) { int sp = a.indexOf(' '); if (sp > 0) a = a.substring(0, sp); }
        if (a.length() * 8 <= room) gfx.text(c, a, rx - a.length() * 4 * px, y, px, accent);
        if (!hudClock.isEmpty()) gfx.text(c, hudClock, rx - hudClock.length() * 4 * px, y + 14 * px, px, 0xFFC8C0D8);
    }

    private void readHud() {
        hudInGame = Gb.inGame() || Native.peek(Gb.GAME_STATE) == 5;
        hudHearts = Native.peek(Gb.HEARTS);
        hudMax = Math.min(Native.peek(Gb.MAX_HEARTS), 60);
        hudGems = Math.min(999, Gb.gems());
        hudLives = Math.min(99, Native.peek(Gb.LIVES));
        if (host != null) { hudArea = host.areaName(); hudClock = host.clockText(); }
    }

    private static String three(int v) { return v < 10 ? "00" + v : v < 100 ? "0" + v : String.valueOf(v); }
}
