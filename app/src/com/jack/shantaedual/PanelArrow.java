package com.jack.shantaedual;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/** SINGLE SCREEN: the see-through tab on the game's right edge that slides the Link panel in and out. Drawn in square blocks, like the game. */
final class PanelArrow extends View {
    private final Paint p = new Paint();
    private boolean pointsRight;

    PanelArrow(Context c) {
        super(c);
        setContentDescription("Link panel");
    }

    /** t: 0 shut, 1 open. See-through while shut, so it doesn't hide the game. */
    void setOpen(float t) {
        setAlpha(0.55f + 0.30f * t);
        boolean right = t > 0.5f;
        if (right != pointsRight) { pointsRight = right; invalidate(); }
    }

    @Override protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        float u = Math.max(1, Math.round(w / 13f));
        // the tab, its outer corners cut in steps
        p.setColor(0xFF000000);
        c.drawRect(u, 0, w, h, p);
        c.drawRect(0, u, u, h - u, p);
        p.setColor(0xFFF8D068);
        // the arrow: rows of blocks, longest in the middle
        float cx = w / 2f, cy = h / 2f;
        for (int i = -4; i <= 4; i++) {
            int len = 5 - Math.abs(i);
            float y = cy + (i - 0.5f) * u, x0 = pointsRight ? cx - 2.5f * u : cx + 2.5f * u - len * u;
            c.drawRect(x0, y, x0 + len * u, y + u, p);
        }
    }
}
