package com.jack.shantaedual;

import java.nio.ByteBuffer;

/** JNI entry points into libshantaedual.so (libretro-gambatte + glue in native/gbjni.c). */
public final class Native {
    static { System.loadLibrary("shantaedual"); }
    private Native() {}
    public static native int init(String sysDir, String saveDir);
    public static native int load(String romPath);
    public static native void unload();
    public static native void reset();
    public static native double fps();
    public static native double rate();
    /** gambatte_* core option (e.g. gambatte_gb_hwmode = GBA). */
    public static native void setOption(String key, String value);
    public static native void setOverclock(boolean on);
    /** Runs one frame; returns (w << 16 | h) when a new picture was copied into dst. */
    public static native int runFrame(int pad, ByteBuffer dst);
    public static native int audio(short[] out);
    /** CPU view ($0000-$FFFF, current banks), no side effects. */
    public static native int peek(int addr);
    public static native void poke(int addr, int value);
    /** Dev room warp: start the scene the game loads for map id 0x00-0x43 (between frames, on the emu thread). */
    public static native int warp(int map);
    /** "CA70:16,C39D:1" -> hex string of the bytes, in order. Addresses "w3:D042" read WRAM bank 3 directly. */
    public static native String mem(String spec);
    /** VRAM banks 0+1 (0x4000) | BG palettes 64 | OBJ palettes 64 | OAM 160 | LCDC SCY SCX WY WX |
     *  64 displayed colours RGB888 (VIDEO_LEN bytes). Same layout as the extracted *.bin assets. */
    public static native void video(byte[] out);
    public static final int VIDEO_LEN = 0x4125 + 192;
    /** First-start asset extraction into dir (see native/extract.c). Call with the ROM freshly loaded. 0 = OK. */
    public static native int extract(String dir);
    /** 0-100 while extracting, 100 when done, -1 failed / idle. */
    public static native int extractProgress();
    public static native int sramLoad(String path);
    /** Writes the battery save if it changed (or always with force). 1 = written. */
    public static native int sramSave(String path, boolean force);
    public static native int stateSave(String path);
    public static native int stateLoad(String path);
}
