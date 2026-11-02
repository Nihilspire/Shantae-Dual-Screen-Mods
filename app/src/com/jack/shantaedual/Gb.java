package com.jack.shantaedual;

/** Game Boy constants: libretro joypad bits, Shantae (USA) RAM/ROM addresses (see SHANTAE-RAM.md). */
final class Gb {
    private Gb() {}

    // RETRO_DEVICE_ID_JOYPAD_* bits
    static final int B = 1, Y = 1 << 1, SELECT = 1 << 2, START = 1 << 3, UP = 1 << 4, DOWN = 1 << 5,
            LEFT = 1 << 6, RIGHT = 1 << 7, A = 1 << 8;
    static final String[] BUTTON_NAMES = { "UP", "DOWN", "LEFT", "RIGHT", "B", "A", "SELECT", "START", "TURBO B", "TURBO A", "MENU", "FAST", "SAVE", "LOAD" };
    static final int[] BUTTON_BITS = { UP, DOWN, LEFT, RIGHT, B, A, SELECT, START, 0, 0, 0, 0, 0, 0 };

    // Shantae (USA) RAM (WRAM bank 0 unless noted)
    static final int GAME_STATE = 0xC39D,            // 2 = playing, 5 = dialogue, 0 = title/menus
            ITEMS = 0xCA70,                          // 12 consumable counts
            GEMS = 0xCA7D,                           // 16-bit little endian
            LIVES = 0xCA7F,
            HEARTS = 0xCA80, MAX_HEARTS = 0xCA82,    // 4 units per heart
            EQUIPPED = 0xCA84,                       // equipped item 0-11
            SQUIDS = 0xCA8A,                         // baby warp squids carried
            FIREFLIES = 0xCA8B,
            TIME = 0xC3E9,                           // 16-bit, +4 per frame; >= $8000 is night
            MAP = 0xCBFD,
            STONES = 0xCB38,                         // bits 4-7
            TALISMANS = 0xCB39,                      // bits 4-7
            DANCES = 0xCB3A, DANCES2 = 0xCB3B;

    // ROM: the game's tileset with the font is LZSS-compressed (Okumura LZSS, 4 KB ring filled with spaces, r = 0xFEE)
    static final int ROM_FONT_LZ = 0x3964A3, FONT_TILES_LEN = 0x1800, FONT_BASE = 0x1000;   // glyph c at FONT_BASE + c * 16

    static final long ROM_CRC = 0xE994B59BL;          // Shantae (USA), whole file

    /** "SHANTAE" in the cartridge header (the extraction route only works on this game). */
    static boolean isShantae(byte[] rom) {
        try { return rom.length > 0x150 && new String(rom, 0x134, 7, "ISO-8859-1").equals("SHANTAE"); } catch (Exception e) { return false; }
    }

    static boolean inGame() { return Native.peek(GAME_STATE) == 2; }

    // Filled in from the RAM map (SHANTAE-RAM.md)
    static int area() { return Native.peek(MAP); }
    static boolean night() { return (Native.peek(TIME + 1) & 0x80) != 0; }
    static String areaName() { return ""; }
    /** "DAY 1:23" / "NIGHT 0:45": time left until the switch. */
    static String clockText() {
        int t = Native.peek(TIME) | Native.peek(TIME + 1) << 8;
        boolean n = (t & 0x8000) != 0;
        int frames = ((n ? 0x10000 : 0x8000) - t) / 4, s = (int) Math.round(frames / 59.7275);
        return (n ? "NIGHT " : "DAY ") + (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    static int gems() { return Native.peek(GEMS) | Native.peek(GEMS + 1) << 8; }
}
