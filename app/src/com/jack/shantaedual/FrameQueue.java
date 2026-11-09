package com.jack.shantaedual;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Finished pictures on their way from the emulation thread to the screen. The emulator runs one frame per refresh and so does the
 * UI thread, and the two wake at about the same moment. With only "the latest picture", a draw that comes just before the emulator
 * finishes shows nothing new and the next one skips a frame: on screen a double step, then a hold (a recording from a device showed
 * about 6 double steps in 100 frames while scrolling). Taking one picture per draw, oldest first, lets either thread be a little early or late. It costs at most
 * one frame of delay. Not thread-safe: the caller holds its lock.
 */
final class FrameQueue {
    static final class Slot {
        final ByteBuffer pic;
        int w, h;
        Slot(int picBytes) { pic = ByteBuffer.allocateDirect(picBytes).order(ByteOrder.nativeOrder()); }
    }

    private final Slot[] slots = new Slot[2];
    private int head, count;

    FrameQueue(int picBytes) {
        for (int i = 0; i < slots.length; i++) slots[i] = new Slot(picBytes);
    }

    /** px is w x h RGB565. When the queue is full the oldest picture goes. */
    void put(ByteBuffer px, int w, int h) {
        if (count == slots.length) { head = (head + 1) % slots.length; count--; }
        Slot s = slots[(head + count) % slots.length];
        px.clear(); px.limit(w * h * 2); s.pic.clear(); s.pic.put(px); px.clear(); s.pic.rewind();
        s.w = w; s.h = h;
        count++;
    }

    /** The oldest picture, or null. It stays valid until the next put. */
    Slot take() {
        if (count == 0) return null;
        Slot s = slots[head];
        head = (head + 1) % slots.length; count--;
        return s;
    }

    boolean waiting() { return count > 0; }
    void clear() { head = count = 0; }
}
