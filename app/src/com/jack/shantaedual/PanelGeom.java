package com.jack.shantaedual;

/** Sizes for the SINGLE SCREEN layout, without Android parts so tests/paneltest.py can run them on a desktop JVM. */
final class PanelGeom {
    private PanelGeom() {}

    /** The panel: 4:3 at the screen's full height (3/4 of a 16:9 screen), always leaving some of the game showing. */
    static int width(int W, int H) {
        int cap = W > H ? W * 3 / 4 : W * 7 / 8;
        return Math.min(Math.round(H * 4f / 3f), cap);
    }
    static int arrowW(int W, int H) { return Math.round(Math.min(W, H) * 26 / 320f); }
    static int arrowH(int W, int H) { return Math.round(Math.min(W, H) * 44 / 320f); }
}
