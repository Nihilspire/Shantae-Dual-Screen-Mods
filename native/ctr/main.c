/* main.c - Shantae Dual 3DS (alpha): the patched gambatte core (gbcore.c) on the top screen, the Link screen
 * (linkscr.c) on the bottom touch screen. libctru only (no citro): both screens are RGB565 framebuffers.
 *
 * The player's ROM (Shantae (USA), CRC32 E994B59B) goes in the same folder as the .3dsx: shantae.gbc, or any .gbc that
 * is Shantae (USA). sdmc:/3ds/shantae-dual/shantae.gbc (0.1-0.4) still works. The battery save, states, settings and
 * monsters met are written next to the ROM. Nothing from the game ships in the .3dsx.
 *
 * Controls: D-pad, A, B, Start, Select as on the Game Boy. R held: fast-forward (3x, no sound). A, B, Start, Select and
 * fast-forward can be moved to other buttons on the menu's SETTINGS page. L+X / L+Y: save / load state slot 1.
 * Start+Select: save and quit. Touch: the Link screen (tabs, tap an item to equip it); the gear in its top right corner
 * pauses and opens the menu (state slots 1-3 with pictures, SETTINGS, RESUME, QUIT). */
#include <3ds.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <dirent.h>
#include "../gbcore.h"
#include "linkscr.h"
#ifdef CTR_TEST
#include "test_script.h"     /* written by native/ctr/test/build_test.sh: #define TEST_SCRIPT {...}, {...} */
#endif

#define OLD_DIR "sdmc:/3ds/shantae-dual"  /* where 0.1-0.4 looked */
#define ROM_CRC 0xE994B59Bu
static char ROMDIR[256], ROM[320], SRM[320], STATE[320], MONS[320], PREFS[320], HALL[320];   /* set by findRom() */
#define BTN(x) (1u << (x))           /* libretro joypad ids: B 0, SELECT 2, START 3, UP 4, DOWN 5, LEFT 6, RIGHT 7, A 8 */
/* the 3DS buttons in linkscr.h's KEY3_* order (ZL and ZR: New 3DS only) */
static const u32 KEY3[KEY3_N] = { KEY_A, KEY_B, KEY_X, KEY_Y, KEY_L, KEY_R, KEY_ZL, KEY_ZR, KEY_START, KEY_SELECT };

void gb_log(const char *m) { (void)m; }
/* the core's write/opcode tracers exist only in the desktop build (GBX_TRACE); nothing to provide here */

static int peek(unsigned a) { return gb_peek(a); }
static int wram(unsigned b, unsigned o) { return gb_wram(b, o); }
static int vram(unsigned b, unsigned o) { return gb_vram(b, o); }

/* ------------------------------------------------------------------ screens */
/* 3DS framebuffers are stored rotated: pixel (x, y) of a 400x240 / 320x240 screen at fb[x * 240 + 239 - y]. */
static void drawTop(const uint16_t *gb, int w, int h) {
    /* source rows/columns for the 1.5x scale, worked out when the width changes: the ARM11 has no divide instruction */
    static int rowOff[216], colOf[400], tw = -1;
    const int cols = w > 160 ? 400 : 240;                           /* WIDE VIEW fills the screen, cropping what's over at each side */
    if (tw != w) {
        const int crop = w > 160 ? (w * 3 / 2 - 400) / 2 : 0;
        for (int y = 0; y < 216; y++) rowOff[y] = (y * 2 / 3) * w;
        for (int x = 0; x < cols; x++) colOf[x] = (x + crop) * 2 / 3;
        tw = w;
    }
    uint16_t *fb = (uint16_t *)gfxGetFramebuffer(GFX_TOP, GFX_LEFT, NULL, NULL);
    const int ox = (400 - cols) / 2, oy = (240 - 216) / 2;          /* 160x144 at 1.5x = 240x216, centred */
    for (int x = 0; x < cols; x++) {
        const uint16_t *col = gb + colOf[x];
        uint16_t *dst = fb + (ox + x) * 240 + 239 - oy;
        if (x && colOf[x] == colOf[x - 1]) { memcpy(dst - 215, dst - 240 - 215, 216 * 2); continue; }   /* every third column repeats */
        for (int y = 0; y < 216; y++) dst[-y] = col[rowOff[y]];
    }
    (void)h;
}
/* the borders (linkscr.c link_border, 400x240 row-major) onto the top screen; the game is drawn over the middle after */
static void drawBorder(const uint16_t *b) {
    uint16_t *fb = (uint16_t *)gfxGetFramebuffer(GFX_TOP, GFX_LEFT, NULL, NULL);
    for (int x = 0; x < 400; x++) {
        uint16_t *dst = fb + x * 240 + 239;
        for (int y = 0; y < 240; y++) dst[-y] = b[y * 400 + x];
    }
}
static void clearTop(void) {
    for (int i = 0; i < 2; i++) {
        memset(gfxGetFramebuffer(GFX_TOP, GFX_LEFT, NULL, NULL), 0, 400 * 240 * 2);
        gfxFlushBuffers(); gfxSwapBuffers();
    }
}
static void drawBottom(const uint16_t *link) {
    uint16_t *fb = (uint16_t *)gfxGetFramebuffer(GFX_BOTTOM, GFX_LEFT, NULL, NULL);
    for (int x = 0; x < LINK_W; x++) {
        uint16_t *dst = fb + x * 240 + 239;
        for (int y = 0; y < LINK_H; y++) dst[-y] = link[y * LINK_W + x];
    }
}

/* ------------------------------------------------------------------ sound (NDSP; silent when the DSP firmware is missing) */
#define NBUF 4
#define BUFSAMP 2048                          /* stereo frames per buffer, ~62 ms at 32768 Hz */
static ndspWaveBuf wb[NBUF];
static int16_t *sbuf; static int sfill, scur, haveSound;
static void soundInit(double rate) {
    if (R_FAILED(ndspInit())) return;
    ndspSetOutputMode(NDSP_OUTPUT_STEREO);
    ndspChnSetInterp(0, NDSP_INTERP_LINEAR);
    ndspChnSetRate(0, (float)rate);
    ndspChnSetFormat(0, NDSP_FORMAT_STEREO_PCM16);
    sbuf = (int16_t *)linearAlloc(NBUF * BUFSAMP * 4);
    if (!sbuf) { ndspExit(); return; }
    memset(wb, 0, sizeof wb);
    for (int i = 0; i < NBUF; i++) { wb[i].data_vaddr = sbuf + i * BUFSAMP * 2; wb[i].nsamples = BUFSAMP; wb[i].status = NDSP_WBUF_DONE; }
    haveSound = 1;
}
static void soundPush(const int16_t *s, int n) {      /* n = int16 values, interleaved L R */
    if (!haveSound) return;
    for (int i = 0; i + 1 < n; i += 2) {
        if (wb[scur].status != NDSP_WBUF_DONE) return;             /* the DSP is behind: drop (fast-forward, lag) */
        int16_t *d = (int16_t *)wb[scur].data_vaddr;
        d[sfill * 2] = s[i]; d[sfill * 2 + 1] = s[i + 1];
        if (++sfill == BUFSAMP) {
            DSP_FlushDataCache(d, BUFSAMP * 4);
            ndspChnWaveBufAdd(0, &wb[scur]);
            scur = (scur + 1) % NBUF; sfill = 0;
        }
    }
}

/* ------------------------------------------------------------------ files */
static void *readFile(const char *p, size_t *n) {
    FILE *f = fopen(p, "rb"); if (!f) return NULL;
    fseek(f, 0, SEEK_END); *n = ftell(f); fseek(f, 0, SEEK_SET);
    void *b = malloc(*n); if (b && fread(b, 1, *n, f) != *n) { free(b); b = NULL; }
    fclose(f); return b;
}
/* state slots: shantae.st1-st3 (st1 is 0.1-0.7's one state), each with shantae.th1-th3: "SDT1", the place (24 bytes) and
 * a THUMB_W x THUMB_H picture of the game, for the menu */
static LinkMenu menu;
static uint16_t thumbs[MENU_SLOTS][THUMB_W * THUMB_H];
static void slotPath(char *p, size_t n, const char *ext, int slot) { snprintf(p, n, "%s.%s%d", STATE, ext, slot + 1); }
static void readSlots(void) {
    for (int i = 0; i < MENU_SLOTS; i++) {
        char p[340]; FILE *f;
        slotPath(p, sizeof p, "st", i);
        menu.have[i] = (f = fopen(p, "rb")) != NULL; if (f) fclose(f);
        menu.thumb[i] = NULL; menu.place[i][0] = 0;
        slotPath(p, sizeof p, "th", i);
        size_t n; uint8_t *b = readFile(p, &n);
        if (b && n == 4 + 24 + sizeof thumbs[i] && !memcmp(b, "SDT1", 4)) {
            memcpy(menu.place[i], b + 4, 24); menu.place[i][23] = 0;
            memcpy(thumbs[i], b + 28, sizeof thumbs[i]); menu.thumb[i] = thumbs[i];
        }
        free(b);
    }
}
static int saveState(int slot, const char *place) {
    char p[340]; size_t n = gb_state_size(); void *b = malloc(n); int ok = 0;
    slotPath(p, sizeof p, "st", slot);
    if (b && gb_state_save(b, n)) { FILE *f = fopen(p, "wb"); if (f) { ok = fwrite(b, 1, n, f) == n; fclose(f); } }
    free(b);
    int w; const uint16_t *pic = gb_native(&w);                    /* the real screen, not WIDE VIEW's */
    if (ok && pic) {                                               /* the picture: every other pixel of the game screen */
        for (int y = 0; y < THUMB_H; y++) for (int x = 0; x < THUMB_W; x++) thumbs[slot][y * THUMB_W + x] = pic[y * 2 * w + x * 2];
        char pl[24] = { 0 }; snprintf(pl, sizeof pl, "%s", place);
        slotPath(p, sizeof p, "th", slot);
        FILE *f = fopen(p, "wb");
        if (f) { fwrite("SDT1", 1, 4, f); fwrite(pl, 1, 24, f); fwrite(thumbs[slot], 1, sizeof thumbs[slot], f); fclose(f); }
    }
    readSlots();
    return ok;
}
static void savePrefs(void) {
    uint8_t b[256]; size_t n = link_prefs_save(b, sizeof b);
    if (n) { FILE *f = fopen(PREFS, "wb"); if (f) { fwrite(b, 1, n, f); fclose(f); } }
}
static void saveHall(void) {
    static uint8_t b[4096]; size_t n = link_hall_take(b, sizeof b);
    if (n) { FILE *f = fopen(HALL, "ab"); if (f) { fwrite(b, 1, n, f); fclose(f); } }
}
static int loadState(int slot) {
    char p[340]; size_t n;
    slotPath(p, sizeof p, "st", slot);
    void *b = readFile(p, &n); int ok = b && gb_state_load(b, n); free(b); return ok;
}

/* ------------------------------------------------------------------ finding the ROM */
static uint32_t crc32(const uint8_t *d, size_t n) {
    static uint32_t T[256]; static int ready;
    if (!ready) { for (uint32_t i = 0; i < 256; i++) { uint32_t c = i; for (int k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320u ^ (c >> 1) : c >> 1; T[i] = c; } ready = 1; }
    uint32_t c = 0xFFFFFFFFu;
    for (size_t i = 0; i < n; i++) c = T[(c ^ d[i]) & 255] ^ (c >> 8);
    return c ^ 0xFFFFFFFFu;
}
static void usePath(const char *dir, const char *name) {
    snprintf(ROMDIR, sizeof ROMDIR, "%s", dir);
    snprintf(ROM, sizeof ROM, "%s/%s", dir, name);
    snprintf(SRM, sizeof SRM, "%s/shantae.srm", dir);
    snprintf(STATE, sizeof STATE, "%s/shantae", dir);               /* + .st1-.st3 and .th1-.th3 */
    snprintf(MONS, sizeof MONS, "%s/shantae-monsters.bin", dir);  /* the monsters met */
    { char old[320]; snprintf(old, sizeof old, "%s/shantae-icons.bin", dir); remove(old); }   /* 0.5-0.13: icons now come from the ROM */
    snprintf(PREFS, sizeof PREFS, "%s/shantae-link.cfg", dir);    /* settings and the STATS counts */
    snprintf(HALL, sizeof HALL, "%s/shantae-endings.bin", dir);   /* signed ending cards, appended */
}
/* the ROM in folder dir: shantae.gbc, else any .gbc that is Shantae (USA). Loads it into *rom; 1 when found. */
static int findIn(const char *dir, uint8_t **rom, size_t *len) {
    char p[320];
    snprintf(p, sizeof p, "%s/shantae.gbc", dir);
    if ((*rom = readFile(p, len))) { usePath(dir, "shantae.gbc"); return 1; }
    DIR *d = opendir(dir); struct dirent *e;
    if (!d) return 0;
    while ((e = readdir(d))) {
        size_t n = strlen(e->d_name);
        if (n < 5 || strcasecmp(e->d_name + n - 4, ".gbc")) continue;
        snprintf(p, sizeof p, "%s/%s", dir, e->d_name);
        uint8_t *b = readFile(p, len);
        if (b && *len == 0x400000 && crc32(b, *len) == ROM_CRC) { *rom = b; usePath(dir, e->d_name); closedir(d); return 1; }
        free(b);
    }
    closedir(d);
    return 0;
}
/* the folder of the .3dsx (argv[0] from the Homebrew Launcher, e.g. "sdmc:/3ds/Shantae Dual 3DS.3dsx"), then the old place */
static int findRom(int argc, char **argv, uint8_t **rom, size_t *len) {
    char dir[256] = "sdmc:/3ds";
    if (argc > 0 && argv && argv[0] && strchr(argv[0], '/')) {
        snprintf(dir, sizeof dir, "%s", argv[0]);
        *strrchr(dir, '/') = 0;
        if (!strchr(dir, '/')) strcat(dir, "/");                    /* "sdmc:" -> "sdmc:/" */
    }
    if (findIn(dir, rom, len)) return 1;
    if (findIn(OLD_DIR, rom, len)) return 1;
    usePath(dir, "shantae.gbc");                                   /* for the message */
    return 0;
}

static void waitExit(const char *msg) {
    consoleInit(GFX_BOTTOM, NULL);
    printf("\n  SHANTAE DUAL 3DS (alpha)\n\n%s\n\n  Press START to quit.\n", msg);
    while (aptMainLoop()) { hidScanInput(); if (hidKeysDown() & KEY_START) break; gspWaitForVBlank(); }
}

#define SCREEN_HZ 59.83                                            /* the 3DS screen's refresh */
#define WIDE_W 268                                                 /* WIDE VIEW: 268 x 1.5 = 402, a pixel over at each side of the 400 */
static struct { u64 gb, top, link, max; int nGb, n; } tm;           /* the frame timing (ticks) over the last second */

/* New 3DS: 804 MHz, the L2 cache and NO SLOWDOWN, unless OLD 3DS SPEED is on (268 MHz, no cache, no overclock: the
   old 3DS's CPU; the New 3DS's extra memory and buttons stay) */
static void applySpeed(bool n3ds) {
    int old = link_old3ds(-1);
    osSetSpeedupEnable(!old);
    gb_set_overclock(n3ds && !old && gb_overclock_supported());   /* NO SLOWDOWN: New 3DS only, the old one has no spare */
    gb_view(n3ds && !old && link_wide(-1) ? WIDE_W : 160, 144);    /* WIDE VIEW likewise */
}

int main(int argc, char **argv) {
    gfxInitDefault();
    osSetSpeedupEnable(true);                                      /* until the settings are read: applySpeed */
    bool n3ds = false; APT_CheckNew3DS(&n3ds);
    menu.n3ds = n3ds;

    size_t romLen = 0;
    uint8_t *rom = NULL;
    if (!findRom(argc, argv, &rom, &romLen)) {
        char msg[400];
        snprintf(msg, sizeof msg, "  Put your Shantae (USA) ROM in the\n  same folder as this app:\n  %s\n  (no game data ships with this app)", ROMDIR);
        waitExit(msg); gfxExit(); return 0;
    }
    if (!link_init(rom, romLen)) { waitExit("  That file isn't Shantae (USA)."); gfxExit(); return 0; }

    gb_init(ROMDIR, ROMDIR);
#if defined(CTR_TEST) && defined(TEST_OPTS)
    TEST_OPTS                                                      /* test build: core options to compare (timing) */
#endif
    if (gb_load_mem(rom, romLen, ROM)) { waitExit("  The core could not load the ROM."); gfxExit(); return 0; }
    /* rom stays: the Link screen's map reads the level data from it */
    { size_t n; uint8_t *mf = readFile(MONS, &n); if (mf) { link_monsters_load(mf, n); free(mf); } }
    { size_t n; uint8_t *pf = readFile(PREFS, &n); if (pf) { link_prefs_load(pf, n); free(pf); } }
    gb_sram_load(SRM);
    applySpeed(n3ds);

    gfxSetScreenFormat(GFX_TOP, GSP_RGB565_OES);
    gfxSetScreenFormat(GFX_BOTTOM, GSP_RGB565_OES);
    gfxSetDoubleBuffering(GFX_TOP, true);
    gfxSetDoubleBuffering(GFX_BOTTOM, false);
    clearTop();
    soundInit(gb_rate());

    static uint16_t link[LINK_W * LINK_H];
    static int16_t snd[16384];
    LinkIn in = { peek, wram, vram, gb_cgbpal, rom, romLen, 0, 0 };
    static uint8_t monBuf[LINK_MONSTERS_MAX];
    static uint16_t border[400 * 240];
    int borderCopies = 0;
    u64 secAt = osGetTime(); int frames = 0, frame = 0, msgT = 0;
    while (aptMainLoop()) {
        hidScanInput();
        u32 held = hidKeysHeld(), down = hidKeysDown();
        if ((held & KEY_START) && (held & KEY_SELECT)) break;
        if ((held & KEY_L) && (down & KEY_X)) msgT = saveState(0, link_place(&in)) ? 1 : -1;   /* quick save/load: slot 1 */
        if ((held & KEY_L) && (down & KEY_Y)) msgT = loadState(0) ? 2 : -2;
        /* the buttons as set on the menu's SETTINGS page; while L is held, X and Y are the quick save and load */
        u32 game = held; if (held & KEY_L) game &= ~(u32)(KEY_X | KEY_Y);
        unsigned pad = 0;
        if (game & KEY3[link_key(ACT_A)]) pad |= BTN(8);
        if (game & KEY3[link_key(ACT_B)]) pad |= BTN(0);
        if (game & KEY3[link_key(ACT_START)]) pad |= BTN(3);
        if (game & KEY3[link_key(ACT_SELECT)]) pad |= BTN(2);
        if (held & KEY_DUP) pad |= BTN(4);
        if (held & KEY_DDOWN) pad |= BTN(5);
        if (held & KEY_DLEFT) pad |= BTN(6);
        if (held & KEY_DRIGHT) pad |= BTN(7);
        int tapX = -1, tapY = -1, ff = (game & KEY3[link_key(ACT_FF)]) != 0, dragX = 0, dragY = 0;
        /* touch: a tap acts on release when the stylus didn't move; moving it drags (the map pans) */
        static int tDown, tX0, tY0, tLX, tLY, tDrag;
        if (held & KEY_TOUCH) {
            touchPosition t; hidTouchRead(&t);
            if (!tDown) { tDown = 1; tX0 = tLX = t.px; tY0 = tLY = t.py; tDrag = 0; }
            else {
                if (!tDrag && abs(t.px - tX0) + abs(t.py - tY0) > 6) tDrag = 1;
                if (tDrag) { dragX += t.px - tLX; dragY += t.py - tLY; tLX = t.px; tLY = t.py; }
            }
            link_pen(t.px, t.py);                                  /* the ending card's signature */
        } else if (tDown) { tDown = 0; link_pen(-1, -1); if (!tDrag) { tapX = tX0; tapY = tY0; } }
        (void)down;
#ifdef CTR_TEST
        {   /* test build only (native/ctr/test): Game Boy buttons, taps, drags and fast-forward by frame, because an
               emulator's input can't be driven headless. TEST_SCRIPT entries:
               { frame, frames, pad bits, tap x, tap y, ff, drag dx per frame, drag dy per frame } */
            static const struct { int at, len; unsigned pad; int tx, ty, ff, dx, dy; } S[] = { TEST_SCRIPT };
            for (size_t i = 0; i < sizeof S / sizeof S[0]; i++) {
                if (frame < S[i].at || frame >= S[i].at + S[i].len) continue;
                pad |= S[i].pad; ff |= S[i].ff; dragX += S[i].dx; dragY += S[i].dy;
                if (S[i].tx >= 0 && frame == S[i].at) { tapX = S[i].tx; tapY = S[i].ty; }
            }
        }
#endif
        static int menuOpen;
        if (menuOpen) {                                            /* the gear's menu: the game waits */
            static char msg[32];
            int act = tapX >= 0 ? link_menu_tap(tapX, tapY, &menu) : MENU_NONE;
            if (link_menu_listening() >= 0) {                      /* SETTINGS: the next button pressed is the new one */
                for (int k = 0; k < KEY3_N; k++) if (down & KEY3[k]) { link_menu_bind(k); savePrefs(); act = MENU_REDRAW; break; }
            } else if (down & (KEY_B | KEY_START)) act = link_menu_back() ? MENU_REDRAW : MENU_RESUME;
            if (act == MENU_REDRAW) savePrefs();
            if (act == MENU_QUIT) break;
            if (act >= MENU_LOAD) {
                if (loadState(act - MENU_LOAD)) menuOpen = 0;
                else { snprintf(msg, sizeof msg, "COULD NOT LOAD SLOT %d", act - MENU_LOAD + 1); menu.msg = msg; }
            } else if (act >= MENU_SAVE) {
                int ok = saveState(act - MENU_SAVE, link_place(&in));
                snprintf(msg, sizeof msg, ok ? "SAVED TO SLOT %d" : "COULD NOT SAVE SLOT %d", act - MENU_SAVE + 1); menu.msg = msg;
            } else if (act == MENU_BORDERS) {
                if (!link_borders(!link_borders(-1))) clearTop();     /* off: plain black around the game */
                borderCopies = 0; savePrefs();
            } else if (act == MENU_OLD3DS) {
                link_old3ds(!link_old3ds(-1)); applySpeed(n3ds); savePrefs();
            } else if (act == MENU_FRAMESKIP) {
                link_frameskip(!link_frameskip(-1)); savePrefs();
            } else if (act == MENU_WIDE) {
                link_wide(!link_wide(-1)); applySpeed(n3ds); savePrefs();
            } else if (act == MENU_RESUME) menuOpen = 0;
            if (!menuOpen) { in.buttons = 0; link_draw(link, &in); drawBottom(link); }
            else if (act != MENU_NONE) { link_menu_draw(link, &menu); drawBottom(link); }
            frame++;
            gfxFlushBuffers(); gfxSwapBuffers(); gspWaitForVBlank();
            continue;
        }
        if (dragX || dragY) link_drag(dragX, dragY, &in);
        gb_set_pad(pad);
        if (tapX >= 0) {
            int item = link_tap(tapX, tapY, &in);
            if (item >= 0) gb_poke(0xCA84, item);                  /* equip as the game's inventory does */
            saveHall();                                            /* SAVE on the ending card */
            if (item == LINK_TAP_MENU) {
                menuOpen = 1; readSlots(); menu.msg = NULL; menu.fps = in.fps; savePrefs();
                link_menu_draw(link, &menu); drawBottom(link);
                frame++;
                gfxFlushBuffers(); gfxSwapBuffers(); gspWaitForVBlank();
                continue;
            }
            if (link_draw(link, &in)) drawBottom(link);
        }

        /* FRAME SKIP (old 3DS speed only). A loop that takes longer than a refresh waits for the next one, so a frame a
           little over 16.7 ms halves the game to 30. With it on, each loop runs the fewest Game Boy frames N that fit
           in N refreshes, from the running averages of what a frame and a picture cost (1 ms spare), and shows only
           the last: the game keeps its speed and the screen shows 30 or 20. Paying back time owed instead can lock in:
           3 frames take 3 refreshes, which owes 3 again. */
        static double avgGb, avgOther;                             /* ticks */
        u64 t0 = svcGetSystemTick();
        int runs = ff ? 3 : 1;                                    /* fast-forward (R held) */
        if (!ff && link_frameskip(-1) && (!n3ds || link_old3ds(-1)))
            while (runs < 4 && runs * avgGb + avgOther + SYSCLOCK_ARM11 / 1000.0 > runs * (SYSCLOCK_ARM11 / SCREEN_HZ)) runs++;
        for (int r = 0; r < runs; r++) {
            gb_set_pad(pad | link_dance_pad());                    /* auto dance: on the game's own frames */
            gb_wide_skip(r < runs - 1);                            /* only the last is shown */
            gb_run(); frames++;
            int n = gb_audio(snd, 16384);
            if (!ff) soundPush(snd, n);
        }
        u64 t1 = svcGetSystemTick();
        link_work(&in);                                            /* inventory icons; a new room's map, a slice a frame */
        u64 t2 = svcGetSystemTick();
        int w, h, fresh; const uint16_t *pic = gb_frame(&w, &h, &fresh);
        /* WIDE VIEW covers the side borders: black above and below it, and the borders back when the real picture is alone */
        static int shownW = 160, topClears;
        if (pic && w != shownW) {
            shownW = w;
            if (w > 160 || !link_borders(-1)) topClears = 2; else borderCopies = 2;
        }
        if (shownW > 160) borderCopies = 0;
        if (topClears) { memset(gfxGetFramebuffer(GFX_TOP, GFX_LEFT, NULL, NULL), 0, 400 * 240 * 2); topClears--; }
        if (borderCopies) { drawBorder(border); borderCopies--; }  /* both of the top screen's buffers get it */
        if (pic) drawTop(pic, w, h);
        u64 t3 = svcGetSystemTick();

        if (++frame % 10 == 0) {                                   /* the Link screen: 6 times a second */
            in.buttons = pad;
            if (link_draw(link, &in)) drawBottom(link);
            if (link_borders(-1) && link_border(border, &in)) borderCopies = 2;   /* when the area, day/night or HUD changed */
        } else if (dragX || dragY) { in.buttons = pad; if (link_draw(link, &in)) drawBottom(link); }   /* follow the stylus */ else if (pad & BTN(2)) { in.buttons = pad; if (link_draw(link, &in)) drawBottom(link); }   /* catch Select taps */
        if (frame % 600 == 0) {
            gb_sram_save(SRM, 0);                                  /* battery save: written only when it changed */
            size_t n = link_monsters_save(monBuf, sizeof monBuf);  /* newly met monsters */
            if (n) { FILE *f = fopen(MONS, "wb"); if (f) { fwrite(monBuf, 1, n, f); fclose(f); } }
            savePrefs();                                           /* the STATS counts */
        }
        u64 t4 = svcGetSystemTick();
        gfxFlushBuffers();
        gfxSwapBuffers();
        u64 t5 = svcGetSystemTick();
        /* the timing for the menu (0.12): sums over a second, shown as the average in tenths of a ms */
        tm.gb += t1 - t0; tm.nGb += runs; tm.link += (t2 - t1) + (t4 - t3); tm.top += (t3 - t2) + (t5 - t4); tm.n++;
        if (t5 - t0 > tm.max) tm.max = t5 - t0;
        if (!ff) { avgGb += ((double)(t1 - t0) / runs - avgGb) / 16; avgOther += ((double)(t5 - t1) - avgOther) / 16; }
        if (osGetTime() - secAt >= 1000) {
            in.fps = frames; frames = 0; secAt = osGetTime();
            const double tenth = SYSCLOCK_ARM11 / 10000.0;
            menu.drawn = tm.n;
            menu.msGb = (int)(tm.gb / tenth / (tm.nGb ? tm.nGb : 1) + 0.5);
            menu.msTop = (int)(tm.top / tenth / tm.n + 0.5);
            menu.msLink = (int)(tm.link / tenth / tm.n + 0.5);
            menu.msMax = (int)(tm.max / tenth + 0.5);
            if (!menu.msGb) menu.msGb = 1;
            memset(&tm, 0, sizeof tm);
        }
#ifdef CTR_TEST
        in.fps = frame * 10 + (pad ? 1 : 0);                        /* test build: frame count, last digit = buttons sent */
#endif
        (void)msgT;

        gspWaitForVBlank();
    }
    gb_sram_save(SRM, 1);
    savePrefs();
    { size_t n = link_monsters_save(monBuf, sizeof monBuf); if (n) { FILE *f = fopen(MONS, "wb"); if (f) { fwrite(monBuf, 1, n, f); fclose(f); } } }
    if (haveSound) ndspExit();
    gb_unload();
    gfxExit();
    return 0;
}
