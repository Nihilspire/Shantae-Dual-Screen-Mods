package com.jack.shantaedual;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Random;

/** See framequeuetest.py. Emulator and UI thread each act once per refresh, in an order that keeps changing, as on the device. Frame numbers go in
 *  the picture's first bytes. Compares what the screen shows from "only the latest picture" (0.38) with FrameQueue. */
public class FrameQueueTest {
    static ByteBuffer direct(int n) { return ByteBuffer.allocateDirect(n).order(ByteOrder.nativeOrder()); }
    /** A run of refreshes: pEarly = the chance the UI draws before this refresh's picture is ready; it changes in long stretches like real timing drift. */
    static int[] run(boolean queued, double flip, long seed) {
        Random r = new Random(seed);
        FrameQueue q = new FrameQueue(160 * 144 * 2);
        ByteBuffer px = direct(160 * 144 * 2);
        int latest = -1, shown = -1, jumps = 0, holds = 0, n = 0, maxLag = 0, emu = 0;
        boolean early = false;
        for (int v = 0; v < 20000; v++) {
            if (r.nextDouble() < flip) early = !early;
            for (int step = 0; step < 2; step++) {
                boolean drawNow = (step == 0) == early;
                if (!drawNow) {
                    px.clear(); px.putInt(0, emu);
                    if (queued) q.put(px, 160, 144); else latest = emu;
                    emu++;
                } else {
                    int got = -1;
                    if (queued) {
                        FrameQueue.Slot s = q.take();
                        if (s != null) got = s.pic.getInt(0);
                    } else { got = latest; latest = -1; }
                    if (got < 0) { if (shown >= 0) holds++; continue; }
                    if (shown >= 0 && got - shown > 1) jumps++;
                    if (got <= shown) throw new RuntimeException("went backwards");
                    shown = got; n++;
                    maxLag = Math.max(maxLag, emu - 1 - got);
                }
            }
        }
        return new int[] { n, jumps, holds, maxLag };
    }
    public static void main(String[] a) {
        boolean ok = true;
        for (double flip : new double[] { 0, 0.02, 0.06, 0.3 }) {
            int[] o = run(false, flip, 1), f = run(true, flip, 1);
            System.out.printf("timing flips %.0f%% of refreshes:  latest only: %d jumps, %d holds   queue: %d jumps, %d holds, up to %d frame behind%n", flip * 100, o[1], o[2], f[1], f[2], f[3]);
            if (f[1] > 0 || f[2] > 2 || f[3] > 1) ok = false;
            if (flip >= 0.02 && o[1] == 0) ok = false;
        }
        System.out.println("RESULT " + (ok ? "PASS" : "FAIL"));
    }
}
