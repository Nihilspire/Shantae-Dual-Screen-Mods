/* linkhost.c - desktop test for the 3DS Link screen: loads the ROM and a driver save state in the desktop core, runs
 * frames with link_work() every frame (as the 3DS frontend does), applies taps, and writes the Link screen as a PPM.
 *   linkhost ROM STATE OUT.ppm [frames] [script] [select 0|1]
 * script: ";"-separated steps, each "t:X,Y" (tap), "p:BITS:N" (hold Game Boy pad bits for N frames), "r:N" (run N
 * frames). The picture uses the ROM's font and the game's graphics: keep it out of chat. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../gbcore.h"
#include "linkscr.h"

/* what the desktop core build expects from its frontend (drive.c has the real tracers) */
void gb_log(const char *m) { (void)m; }
int gbx_trace_on, gbx_pctrace_on;
void gbx_pctrace(unsigned pc, unsigned bank, unsigned op, unsigned a, unsigned hl, unsigned de) {}
void gbx_trace_write(unsigned a, unsigned v, unsigned pc, unsigned bank, unsigned hl, unsigned sp) {}

static int peek(unsigned a) { return gb_peek(a); }
static int wram(unsigned b, unsigned o) { return gb_wram(b, o); }
static int vram(unsigned b, unsigned o) { return gb_vram(b, o); }
static int16_t snd[16384];
static LinkIn in;
static uint16_t top[400 * 240];
static long nf;
static uint16_t th[THUMB_W * THUMB_H];
static LinkMenu menu = { { 1, 0, 1 }, { th, NULL, NULL }, { "", "", "SCUTTLE TOWN" }, "SAVED TO SLOT 1", 60, 1, 0, 0, 0, 0, 0 };
static void frames(int n, unsigned pad) {
    gb_set_pad(pad);
    for (int i = 0; i < n; i++) { gb_run(); gb_audio(snd, 16384); link_work(&in); if (++nf % 10 == 0) link_border(top, &in); }   /* as main.c */
    gb_set_pad(0);
}

int main(int argc, char **argv) {
    if (argc < 4) { fprintf(stderr, "usage: linkhost ROM STATE OUT.ppm [frames] [script] [select]\n"); return 1; }
    FILE *f = fopen(argv[1], "rb"); if (!f) return 1;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *rom = malloc(n); if (fread(rom, 1, n, f) != (size_t)n) return 1; fclose(f);
    size_t romLen = (size_t)n;
    if (!link_init(rom, romLen)) { fprintf(stderr, "no font\n"); return 1; }
    gb_init(".", "/tmp");
    if (gb_load(argv[1])) { fprintf(stderr, "load failed\n"); return 1; }
    f = fopen(argv[2], "rb"); if (!f) return 1;
    fseek(f, 0, SEEK_END); n = ftell(f); fseek(f, 0, SEEK_SET);
    void *st = malloc(n); if (fread(st, 1, n, f) != (size_t)n) return 1; fclose(f);
    if (!gb_state_load(st, n)) { fprintf(stderr, "state failed\n"); return 1; }
    menu.n3ds = !getenv("O3DS");                               /* O3DS=1: the menu as on an old 3DS */
    if (getenv("MS")) {                                        /* MS=drawn,gb,top,link,max: the timing line (tenths of a ms) */
        int v[5] = { 0 }; sscanf(getenv("MS"), "%d,%d,%d,%d,%d", v, v + 1, v + 2, v + 3, v + 4);
        menu.drawn = v[0]; menu.msGb = v[1]; menu.msTop = v[2]; menu.msLink = v[3]; menu.msMax = v[4];
    }
    if (getenv("PREFS")) {                                     /* PREFS=file: a settings file to load (and save back) */
        static uint8_t pb[256]; FILE *pf = fopen(getenv("PREFS"), "rb");
        if (pf) { size_t pn = fread(pb, 1, sizeof pb, pf); fclose(pf); link_prefs_load(pb, pn); printf("prefs %zu bytes: old3ds %d borders %d\n", pn, link_old3ds(-1), link_borders(-1)); }
    }
    LinkIn i0 = { peek, wram, vram, gb_cgbpal, rom, romLen, 0, 60 };
    in = i0;
    static uint16_t fb[LINK_W * LINK_H];
    frames(argc > 4 ? atoi(argv[4]) : 10, 0);
    if (argc > 6) in.buttons = (unsigned)atoi(argv[6]) << 2;
    link_draw(fb, &in);
    if (argc > 5 && argv[5][0]) {
        for (char *p = argv[5]; *p; ) {
            if (p[0] == 't' && p[1] == ':') {
                int x = atoi(p + 2), y = atoi(strchr(p, ',') + 1), r = link_tap(x, y, &in);
                if (r >= 0) { gb_poke(0xCA84, r); printf("equip %d\n", r); }
            } else if (p[0] == 'p' && p[1] == ':') {
                unsigned bits = strtoul(p + 2, NULL, 10); int k = atoi(strchr(p + 2, ':') + 1); frames(k, bits);
            } else if (p[0] == 'r' && p[1] == ':') frames(atoi(p + 2), 0);
            else if (p[0] == 'w' && p[1] == ':') {                 /* w:X0,Y0,X1,Y1: a pen stroke (the ending card's signature) */
                int v[4] = { 0 }; char *q = p + 2;
                for (int j = 0; j < 4; j++) { v[j] = atoi(q); q = strchr(q, ','); if (!q) break; q++; }
                link_pen(v[0], v[1]); link_pen(v[2], v[3]); link_pen(-1, -1);
            } else if (p[0] == 'm' && p[1] == ':') {                 /* m:X,Y: a tap on the gear's menu (MENU= draws it) */
                int r = link_menu_tap(atoi(p + 2), atoi(strchr(p, ',') + 1), &menu);
                if (r == MENU_OLD3DS) link_old3ds(!link_old3ds(-1));   /* as main.c */
                if (r == MENU_FRAMESKIP) link_frameskip(!link_frameskip(-1));
                printf("menu tap %d,%d -> %d (old3ds %d frameskip %d)\n", atoi(p + 2), atoi(strchr(p, ',') + 1), r, link_old3ds(-1), link_frameskip(-1));
            } else if (p[0] == 'k' && p[1] == ':') {                 /* k:N: 3DS button N (KEY3_*) pressed on the menu */
                printf("listening %d, button %d ->", link_menu_listening(), atoi(p + 2)); link_menu_bind(atoi(p + 2));
                for (int a = 0; a < ACT_N; a++) printf(" %d", link_key(a));
                printf("\n");
            } else if (p[0] == 'd' && p[1] == ':') {                 /* d:DX,DY,N: drag by (DX, DY) per frame for N frames */
                int dx = atoi(p + 2), dy = atoi(strchr(p, ',') + 1), k = atoi(strchr(strchr(p, ',') + 1, ',') + 1);
                for (int j = 0; j < k; j++) { link_drag(dx, dy, &in); frames(1, 0); }
            }
            link_draw(fb, &in);
            p = strchr(p, ';'); if (!p) break; p++;
        }
    }
    link_draw(fb, &in);
    f = fopen(argv[3], "wb");
    fprintf(f, "P6 %d %d 255\n", LINK_W, LINK_H);
    for (int i = 0; i < LINK_W * LINK_H; i++) {
        uint16_t c = fb[i];
        fputc((c >> 11) << 3, f); fputc(((c >> 5) & 63) << 2, f); fputc((c & 31) << 3, f);
    }
    fclose(f);
    if (getenv("TOP")) {                                       /* TOP=out.ppm: the top screen, borders + game at 1.5x */
        link_border(top, &in);
        int w, h, fr; const uint16_t *pic = gb_frame(&w, &h, &fr);
        for (int y = 0; y < 216; y++) for (int x = 0; x < 240; x++) top[(12 + y) * 400 + 80 + x] = pic[(y * 2 / 3) * w + x * 2 / 3];
        f = fopen(getenv("TOP"), "wb");
        fprintf(f, "P6 400 240 255\n");
        for (int i = 0; i < 400 * 240; i++) { uint16_t c = top[i]; fputc((c >> 11) << 3, f); fputc(((c >> 5) & 63) << 2, f); fputc((c & 31) << 3, f); }
        fclose(f);
    }
    if (getenv("MENU")) {                                      /* MENU=out.ppm: the gear's menu, slot 1 = now, 3 = no picture */
        int w, h, fr; const uint16_t *pic = gb_frame(&w, &h, &fr);
        for (int y = 0; y < THUMB_H; y++) for (int x = 0; x < THUMB_W; x++) th[y * THUMB_W + x] = pic[y * 2 * w + x * 2];
        LinkMenu m = menu;
        snprintf(m.place[0], 24, "%s", link_place(&in));
        if (getenv("MENUTAPS")) {                               /* (opens the menu: its first page) */
            static const int T[7][2] = { {310, 8}, {130, 140}, {170, 140}, {270, 140}, {60, 200}, {250, 200}, {160, 200} };
            int r[7]; r[0] = link_tap(T[0][0], T[0][1], &in);
            for (int i = 1; i < 7; i++) r[i] = link_menu_tap(T[i][0], T[i][1], &m);
            printf("gear tap -> %d, menu taps: save2 %d load2 %d load3 %d resume %d quit %d settings %d\n", r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
        }
        link_menu_draw(fb, &m);
        f = fopen(getenv("MENU"), "wb");
        fprintf(f, "P6 %d %d 255\n", LINK_W, LINK_H);
        for (int i = 0; i < LINK_W * LINK_H; i++) { uint16_t c = fb[i]; fputc((c >> 11) << 3, f); fputc(((c >> 5) & 63) << 2, f); fputc((c & 31) << 3, f); }
        fclose(f);
    }
    if (getenv("PREFS")) {
        static uint8_t pb[256]; size_t pn = link_prefs_save(pb, sizeof pb); FILE *pf = pn ? fopen(getenv("PREFS"), "wb") : NULL;
        if (pf) { fwrite(pb, 1, pn, pf); fclose(pf); printf("prefs saved %zu bytes\n", pn); }
    }
    { static uint8_t hb[4096]; size_t hn = link_hall_take(hb, sizeof hb); if (hn) printf("ending card saved: %zu bytes, %.10s %.5s\n", hn, hb + 4, hb + 16); }
    printf("CA84=%02X state=%02X map=%s zoom=%d\n", gb_peek(0xCA84), gb_peek(0xC39D), map_status(), map_zoom_level());
    { extern int map_objects(char *, int); static char ob[4096]; int k = map_objects(ob, sizeof ob); if (k) printf("objects %d\n%s", k, ob); }
    return 0;
}
