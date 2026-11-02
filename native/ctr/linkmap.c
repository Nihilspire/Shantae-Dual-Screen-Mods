/* linkmap.c - the MAP tab of Shantae Dual 3DS: the room you're in, drawn from the level data in the player's ROM with
 * the tiles in live VRAM and the game's own colours, with what the game screen shows, Shantae's dot, and the heart
 * holders, fireflies, squids and talismans placed in the room (grey once collected). A C port of assets/link/map.js
 * (the room picture and the collectibles; no cards, zoom or drag yet). Formats: SHANTAE-RAM.md, "Level data" and
 * "Object placement".
 *
 * A room is drawn once into one byte per pixel (BG palette * 4 + colour) and coloured when shown, so fades and day/night
 * cost nothing. A new room is drawn a bounded number of metatiles per frame (map_work), so entering one doesn't stall
 * the game. The last few rooms stay in memory and show at once when you come back. */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "linkscr.h"

static const LinkIn *IN;
static long frameNo;
static int rbk(int bank, unsigned a) {
    size_t o = a < 0x4000 ? a : (size_t)bank * 0x4000 + (a - 0x4000);
    return o < IN->romLen ? IN->rom[o] : 0;
}
static int pk(unsigned a) { return IN->peek(a) & 255; }
static int pk16(unsigned a) { return pk(a) | pk(a + 1) << 8; }

/* ------------------------------------------------------------------ rooms: the room code calls 03:7920 + 17 bytes */
typedef struct { int x, y, w, h, th, tb, df; } Room;
static Room *rooms; static int nrooms, scanned;
static void scanRooms(void) {
    static const uint8_t SIG[6] = { 0xCD, 0x40, 0x05, 0x20, 0x79, 0x03 };
    int cap = 0;
    for (size_t i = 0; i + 23 < IN->romLen; i++) {
        if (IN->rom[i] != 0xCD || memcmp(IN->rom + i, SIG, 6)) continue;
        const uint8_t *h = IN->rom + i + 6;
        if (!h[9] && !h[10]) continue;
        if (nrooms == cap) { cap = cap ? cap * 2 : 128; rooms = realloc(rooms, cap * sizeof *rooms); }
        Room r = { h[0] | h[1] << 8, h[2] | h[3] << 8, (h[4] | h[5] << 8) + 160, (h[6] | h[7] << 8) + 128, h[9], h[10], h[13] };
        rooms[nrooms++] = r;
    }
    scanned = 1;
}

/* ------------------------------------------------------------------ RAM: room rectangle, region, camera, Shantae */
typedef struct { int x, y, w, h, th, tb, camX, camY, df, px, py, state, map, oh, ob, street; } Vars;
static void readVars(Vars *v) {
    v->x = pk16(0xC9E9); v->y = pk16(0xC9EC); v->w = pk16(0xC9F4) + 160; v->h = pk16(0xC9F6) + 128;
    v->th = pk(0xC9F9); v->tb = pk(0xC9FA); v->camX = pk16(0xC9FB); v->camY = pk16(0xC9FD); v->df = pk(0xFFDF);
    v->px = pk16(0xCB43); v->py = pk16(0xCB45); v->state = pk(0xC39D); v->map = pk(0xCBFD); v->oh = pk(0xC39A); v->ob = pk(0xC39B);
    /* town streets (state 5): the street wraps every 640 px and Shantae stands mid-screen */
    v->street = v->state == 5 && (v->map == 0x04 || v->map == 0x30 || v->map == 0x31 || v->map == 0x34 || v->map == 0x35);
    if (v->street) { v->w = 640; v->camX %= 640; v->px = (v->camX + 80) % 640; v->py = v->y + 112; }
    else { v->px += 26; v->py += 49; }                         /* $CB43/$CB45 -> the middle of her sprites, her feet */
}

/* the 8 bytes (4 tiles, 4 attributes) of the metatile at world pixel (X, Y) of a region, or NULL */
static const uint8_t *cellDef(int tb, int th, int df, int X, int Y) {
    if (X < 0 || Y < 0 || (X >> 8) >= 32) return NULL;
    unsigned e = (th << 8) + (Y >> 8) * 64 + (X >> 8) * 2;
    if (e >= 0x8000) return NULL;
    int page = rbk(tb, e), bk = rbk(tb, e + 1);
    if (!page || !bk || page < 0x40 || page > 0x7E) return NULL;
    unsigned a = (page << 8) + ((Y >> 4) & 15) * 32 + ((X >> 4) & 15) * 2;
    int w0 = rbk(bk, a), w1 = rbk(bk, a + 1);
    unsigned da = (w1 << 8) | (w0 & 0xF0); int db = df + (w0 & 15);
    if (da < 0x4000 || da > 0x7FF8) return NULL;
    size_t o = (size_t)db * 0x4000 + da - 0x4000;
    return o + 8 <= IN->romLen ? IN->rom + o : NULL;
}
/* the smallest listed room that holds r and is bigger (the overworld's areas are parts of one big room) */
static int hostOf(const Vars *v, int *hx, int *hy, int *hw, int *hh) {
    int best = -1;
    if (v->tb == 0x51 && v->th == 0x4F) return 0;              /* story scenes share that region: just this room */
    for (int i = 0; i < nrooms; i++) {
        Room *q = &rooms[i];
        if (q->tb != v->tb || q->th != v->th || q->w >= 8000 || q->h >= 8000) continue;
        if (v->x >= q->x && v->y >= q->y && v->x + v->w <= q->x + q->w && v->y + v->h <= q->y + q->h &&
            (q->w > v->w + 16 || q->h > v->h + 16) && (best < 0 || q->w * q->h < rooms[best].w * rooms[best].h)) best = i;
    }
    if (best < 0) return 0;
    *hx = rooms[best].x; *hy = rooms[best].y; *hw = rooms[best].w; *hh = rooms[best].h;
    return 1;
}
/* whole-region rooms (8192 square) -> the part the level data fills, at most 9 x 9 screens around Shantae */
static void clampRoom(const Vars *v, int *x, int *y, int *w, int *h) {
    if (*w < 8000 && *h < 8000) return;
    int minX = 99, minY = 99, maxX = -1, maxY = -1;
    for (int sy = *y >> 8; sy < 32 && sy < (*y + *h + 255) >> 8; sy++)
        for (int sx = *x >> 8; sx < 32 && sx < (*x + *w + 255) >> 8; sx++)
            if (cellDef(v->tb, v->th, v->df, sx * 256 + 8, sy * 256 + 8)) {
                if (sx < minX) minX = sx;
                if (sy < minY) minY = sy;
                if (sx > maxX) maxX = sx;
                if (sy > maxY) maxY = sy;
            }
    if (maxX < 0) return;
    int cx = v->px >> 8, cy = v->py >> 8;
    if (minX < cx - 4) minX = cx - 4;
    if (maxX > cx + 4) maxX = cx + 4;
    if (minY < cy - 4) minY = cy - 4;
    if (maxY > cy + 4) maxY = cy + 4;
    *x = minX * 256; *y = minY * 256; *w = (maxX - minX + 1) * 256; *h = (maxY - minY + 1) * 256;
}

/* ------------------------------------------------------------------ collectibles placed in the room */
/* (0.10) and the landmarks the map cards name: town doors (type 157, param 0 = door), cave ladders and mouths (param 0 =
 * cave, 1 = side; type 111 is the ladder inside the cave), a labyrinth's way out */
enum { K_HEART = 1, K_FLY, K_SQUID, K_TAL, K_GENIE, K_TDOOR, K_CDOOR, K_EXIT };
typedef struct { uint8_t kind, n, off, mask, side, inCave; int x, y; } Obj;
/* world.js LABS: a labyrinth's region bank -> where you arrive from the overworld (walking left from there leads out) */
static const struct { uint8_t tb; uint16_t x, y; } LAB_EXIT[] = { {0x4A, 556, 1130}, {0xBE, 4377, 368}, {0x8F, 2624, 4976}, {0xCA, 3848, 1056} };
#define MAXOBJ 48

/* ------------------------------------------------------------------ pictures */
typedef struct {
    int used, tb, th, df, rx, ry, rw, rh, sh, s, W, H, row, done, ok, bad, doneAt, lcdc, hasLut;
    uint8_t *idx;
    uint16_t lut[32];
    int ntl; uint16_t tl[768]; uint32_t th_[768];
    Obj obj[MAXOBJ]; int nobj;
    long stamp;
} Pic;
#define NPIC 6
static Pic pics[NPIC], *cur;
static char status[32] = "WAITING FOR THE GAME";
const char *map_status(void) { return status; }

static uint8_t tileUsed[768];                                   /* bank * 384 + tile number, for the picture being drawn */
/* metatile blocks of the picture being drawn: def offset in the ROM -> 16x16 palette bytes (at its scale) */
#define MTN 2048
static uint32_t mtKey[MTN]; static uint16_t mtSlot[MTN]; static uint8_t *mtPool; static int mtUsed;
static const Pic *mtOwner;                                      /* the picture the cache was filled for (its scale) */

static uint32_t tileHash(int bank, int off) {
    uint32_t h = 2166136261u;
    for (int i = 0; i < 16; i++) h = (h ^ (uint32_t)IN->vram(bank, off + i)) * 16777619u;
    return h;
}
static const uint8_t *metatile(const uint8_t *def, int sh, int lcdc) {
    uint32_t k = (uint32_t)(def - IN->rom) + 1;
    unsigned hsh = (k * 2654435761u) >> 21;
    for (unsigned p = hsh; ; p = (p + 1) & (MTN - 1)) {
        if (mtKey[p] == k) return mtPool + mtSlot[p] * 256;
        if (!mtKey[p]) {
            if (mtUsed >= MTN - 1) return NULL;
            mtKey[p] = k; mtSlot[p] = mtUsed++;
            uint8_t *m = mtPool + mtSlot[p] * 256;
            int s = 1 << sh, cs = 16 >> sh;
            for (int q = 0; q < 4; q++) {
                int t = def[q], at = def[4 + q], n = (lcdc & 0x10) ? t : (t < 128 ? 256 + t : t), bank = (at >> 3) & 1;
                tileUsed[bank * 384 + n] = 1;
                int qx = (q & 1) * 8, qy = (q >> 1) * 8, pb = (at & 7) * 4;
                for (int yy = 0; yy < 8; yy += s) {
                    int ry = (at & 0x40) ? 7 - yy : yy, lo = IN->vram(bank, n * 16 + ry * 2), hi = IN->vram(bank, n * 16 + ry * 2 + 1);
                    for (int xx = 0; xx < 8; xx += s) {
                        int rx = (at & 0x20) ? 7 - xx : xx;
                        m[((qy + yy) >> sh) * cs + ((qx + xx) >> sh)] = pb + (((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1));
                    }
                }
            }
            return m;
        }
    }
}
static int floordiv(int a, int b) { return a >= 0 ? a / b : -((-a + b - 1) / b); }

static void roomObjects(Pic *p, const Vars *v) {
    p->nobj = 0;
    if (!v->ob) return;
    for (int r = p->ry >> 8; r <= 31 && r <= (p->ry + p->rh - 1) >> 8; r++)
        for (int c = p->rx >> 8; c <= 31 && c <= (p->rx + p->rw - 1) >> 8; c++) {
            unsigned a = ((v->oh + (r >> 1)) << 8) | ((r & 1) << 7) | (c * 4);
            if (a >= 0x8000) continue;
            unsigned ptr = rbk(v->ob, a) | rbk(v->ob, a + 1) << 8; int bk = rbk(v->ob, a + 2);
            if (!bk || ptr < 0x4000 || ptr >= 0x8000) continue;
            int n = rbk(bk, ptr);
            for (int i = 0; i < n && i < 40 && p->nobj < MAXOBJ; i++) {
                unsigned e = ptr + 1 + 17 * i;
                #define G16(o) (rbk(bk, e + (o)) | rbk(bk, e + (o) + 1) << 8)
                unsigned sa = G16(10); int sb = rbk(bk, e + 12);
                if (sb != 0x0A || sa < 0x4000 || (sa & 3)) continue;
                int tk = (sa - 0x4000) >> 2, kind = tk == 38 ? K_SQUID : (tk >= 99 && tk <= 102) ? K_TAL : tk == 104 ? K_FLY :
                         tk == 105 ? K_HEART : tk == 39 ? K_GENIE : 0;
                int x = (G16(2) + G16(0)) >> 1, y = (G16(6) + G16(4)) >> 1, dup = 0;
                if (tk == 157 || tk == 111 || tk == 119 || tk == 124 || tk == 131 || tk == 141 || tk == 151) {
                    int a0 = rbk(bk, e + 13), a1 = rbk(bk, e + 14), door = tk == 157;
                    if (!a0 || (door && (x < p->rx || x >= p->rx + p->rw)) || (!door && a1 != 1 && a1 != 2)) continue;
                    for (int j = 0; j < p->nobj; j++) if (door && p->obj[j].kind == K_TDOOR && p->obj[j].n == a0) dup = 1;
                    if (dup) continue;
                    Obj *o = &p->obj[p->nobj++];
                    memset(o, 0, sizeof *o); o->kind = door ? K_TDOOR : K_CDOOR; o->n = a0; o->side = a1; o->inCave = tk == 111;
                    o->x = x; o->y = y; o->off = 0xFF;
                    continue;
                }
                if (!kind) continue;
                for (int j = 0; j < p->nobj; j++) if (p->obj[j].kind == kind && p->obj[j].x == x && p->obj[j].y == y) dup = 1;
                if (dup) continue;
                Obj *o = &p->obj[p->nobj++];
                memset(o, 0, sizeof *o); o->kind = kind; o->x = x; o->y = y; o->off = 0xFF;
                if (kind == K_GENIE) continue;
                /* the type's flag table in bank $11: (byte offset from $CB1B, mask) per param (param 3 for squids) */
                unsigned tbl = kind == K_TAL ? 0x6EEF : kind == K_HEART ? 0x6EFF : kind == K_FLY ? 0x6F4F : 0x6F0F;
                int idx = rbk(bk, e + 13 + (kind == K_SQUID ? 3 : 0));
                o->n = idx; o->off = rbk(0x11, tbl + idx * 2); o->mask = rbk(0x11, tbl + idx * 2 + 1);
                #undef G16
            }
        }
    for (size_t i = 0; i < sizeof LAB_EXIT / sizeof LAB_EXIT[0] && p->nobj < MAXOBJ; i++) {
        int ex = LAB_EXIT[i].x, ey = LAB_EXIT[i].y;
        if (LAB_EXIT[i].tb != v->tb || ex < p->rx || ex >= p->rx + p->rw || ey < p->ry || ey >= p->ry + p->rh) continue;
        Obj *o = &p->obj[p->nobj++];
        memset(o, 0, sizeof *o); o->kind = K_EXIT; o->x = ex; o->y = ey - 12; o->off = 0xFF;
    }
}
static int collected(const Obj *o) { return o->off != 0xFF && o->off < 48 && (pk(0xCB1B + o->off) & o->mask); }

static void startPic(Pic *p, const Vars *v, int x, int y, int w, int h) {
    free(p->idx); memset(p, 0, sizeof *p);
    p->used = 1; p->tb = v->tb; p->th = v->th; p->df = v->df; p->rx = x; p->ry = y; p->rw = w; p->rh = h;
    long px = (long)w * h; p->sh = px > 16000000 ? 2 : px > 4000000 ? 1 : 0; p->s = 1 << p->sh;
    p->W = (w + p->s - 1) / p->s; p->H = (h + p->s - 1) / p->s;
    p->idx = malloc((size_t)p->W * p->H);
    if (!p->idx) { p->used = 0; return; }
    memset(p->idx, 255, (size_t)p->W * p->H);
    p->row = y & ~15; p->lcdc = pk(0xFF40);
    if (!mtPool) mtPool = malloc(MTN * 256);
    memset(mtKey, 0, sizeof mtKey); mtUsed = 0; mtOwner = p; memset(tileUsed, 0, sizeof tileUsed);
    roomObjects(p, v);
    snprintf(status, sizeof status, "READING THE MAP...");
}
/* draws metatile rows until about `budget` metatiles are done; returns 1 when the picture is complete */
static int renderSome(Pic *p, int budget) {
    int s = p->s, cs = 16 >> p->sh, x0 = p->rx & ~15, done = 0;
    if (mtOwner != p) { memset(mtKey, 0, sizeof mtKey); mtUsed = 0; mtOwner = p; }   /* the cache is at one picture's scale */
    while (p->row < p->ry + p->rh && done < budget) {
        int Y = p->row, oy = floordiv(Y - p->ry, s), ra = oy < 0 ? -oy : 0, rbn = cs < p->H - oy ? cs : p->H - oy;
        for (int X = x0; X < p->rx + p->rw; X += 16, done++) {
            const uint8_t *def = cellDef(p->tb, p->th, p->df, X, Y);
            if (!def) continue;
            const uint8_t *m = metatile(def, p->sh, p->lcdc);
            if (!m) continue;
            int ox = floordiv(X - p->rx, s), xa = ox < 0 ? -ox : 0, xb = cs < p->W - ox ? cs : p->W - ox;
            for (int r = ra; r < rbn; r++) memcpy(p->idx + (size_t)(oy + r) * p->W + ox + xa, m + r * cs + xa, xb - xa);
        }
        p->row += 16;
    }
    if (p->row < p->ry + p->rh) return 0;
    p->ntl = 0;                                                  /* the tiles it used, to check against VRAM later */
    for (int i = 0; i < 768 && p->ntl < 768; i++) if (tileUsed[i]) {
        p->tl[p->ntl] = i; p->th_[p->ntl] = tileHash(i / 384, (i % 384) * 16); p->ntl++;
    }
    p->done = 1; p->doneAt = frameNo;
    return 1;
}
static double tilesMatch(const Pic *p) {
    if (!p->ntl) return 0;
    int ok = 0;
    for (int i = 0; i < p->ntl; i++) ok += tileHash(p->tl[i] / 384, (p->tl[i] % 384) * 16) == p->th_[i];
    return (double)ok / p->ntl;
}
static int mostlyBlank(const Pic *p) {
    if (!p->ntl) return 1;
    int blank = 0;
    for (int i = 0; i < p->ntl; i++) {
        int b = p->tl[i] / 384, o = (p->tl[i] % 384) * 16, a0 = IN->vram(b, o), a1 = IN->vram(b, o + 1);
        int same = (a0 == 0 || a0 == 255) && (a1 == 0 || a1 == 255);
        for (int k = 2; k < 16 && same; k += 2) same = IN->vram(b, o + k) == a0 && IN->vram(b, o + k + 1) == a1;
        blank += same;
    }
    return blank > p->ntl * 6 / 10;
}
/* the BG map under the camera matches the level data (the picture's tiles are the room's) */
static int selfCheck(const Vars *v) {
    int scx = pk(0xFF43), scy = pk(0xFF42), d, ok = 0, n = 0;
    d = (v->camX - scx) & 255; if (d >= 128) d -= 256; int cx = v->camX - d;
    d = (v->camY - scy) & 255; if (d >= 128) d -= 256; int cy = v->camY - d;
    for (int Y = cy + 8; Y < cy + 120; Y += 24) for (int X = cx + 8; X < cx + 152; X += 24) {
        const uint8_t *def = cellDef(v->tb, v->th, v->df, X, Y); if (!def) continue;
        int ty = (Y >> 3) & ~1, tx = (X >> 3) & ~1;
        n++; ok += IN->vram(0, 0x1800 + (ty & 31) * 32 + (tx & 31)) == def[0];
    }
    return n >= 6 && ok * 10 >= n * 7;
}

/* ------------------------------------------------------------------ colours: settled, not dark */
static uint16_t lutNow[32]; static long lutSince; static int lutBright;
static void readLut(void) {
    const uint8_t *p = IN->cgbpal(0);
    int changed = 0, lo = 999, hi = 0;
    for (int i = 0; i < 32; i++) {
        int c = p[i * 2] | p[i * 2 + 1] << 8, r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
        uint16_t v = (uint16_t)(r << 11 | g << 6 | (g >> 4) << 5 | b);
        if (v != lutNow[i]) { changed++; lutNow[i] = v; }
        int br = (r + g + b) * 255 / 31; if (br < lo) lo = br; if (br > hi) hi = br;
    }
    if (changed > 6) lutSince = frameNo;                       /* a fade changes most colours; water only a few */
    lutBright = hi > 150 && hi - lo > 90;
}
static int usable(void) { return lutBright && frameNo - lutSince >= 27; }

static Vars V; static int haveV, picChecks, inPlay;
/* the ROOMS card's picture (map.js overview): the region's rooms drawn from the level data with the tiles in VRAM, a
 * slice a frame once the room she's in is drawn and checked */
static Pic ovPic;
static int overviewList(void);
static int ovR[64][4];
static int ovArea(int n, int *ax, int *ay, int *aw, int *ah) {
    int x0 = 1 << 30, y0 = 1 << 30, x1 = 0, y1 = 0;
    for (int i = 0; i < n; i++) {
        if (ovR[i][0] < x0) x0 = ovR[i][0];
        if (ovR[i][1] < y0) y0 = ovR[i][1];
        if (ovR[i][0] + ovR[i][2] > x1) x1 = ovR[i][0] + ovR[i][2];
        if (ovR[i][1] + ovR[i][3] > y1) y1 = ovR[i][1] + ovR[i][3];
    }
    *ax = x0 & ~255; *ay = y0 & ~255; *aw = ((x1 + 255) & ~255) - *ax; *ah = ((y1 + 255) & ~255) - *ay;
    return n > 0;
}
static void ovCheck(void) {
    int n = overviewList(), x, y, w, h;
    if (!n || !ovArea(n, &x, &y, &w, &h)) return;
    Pic *o = &ovPic;
    if (o->used && o->tb == V.tb && o->th == V.th && o->df == V.df && o->rx == x && o->ry == y && o->rw == w && o->rh == h) return;
    free(o->idx); memset(o, 0, sizeof *o);
    long px = (long)w * h; o->sh = px > 16000000 ? 2 : px > 4000000 ? 1 : 0; o->s = 1 << o->sh;
    o->W = (w + o->s - 1) / o->s; o->H = (h + o->s - 1) / o->s;
    o->idx = malloc((size_t)o->W * o->H);
    if (!o->idx) return;
    memset(o->idx, 255, (size_t)o->W * o->H);
    o->used = 1; o->tb = V.tb; o->th = V.th; o->df = V.df; o->rx = x; o->ry = y; o->rw = w; o->rh = h;
    o->row = y & ~15; o->lcdc = pk(0xFF40);
}
void map_work(const LinkIn *in) {
    IN = in; frameNo++;
    if (!in->rom || !in->vram || !in->cgbpal) return;
    if (!scanned) { scanRooms(); return; }
    int st = pk(0xC39D), mp = pk(0xCBFD);
    inPlay = st == 2 || (st == 5 && (mp == 0x04 || mp == 0x30 || mp == 0x31 || mp == 0x34 || mp == 0x35));
    if (!inPlay) { lutSince = frameNo; return; }                 /* menus, dialogue, transitions: keep the last map and
                                                                    its colours (a menu loads its own palettes) */
    readLut();
    if (cur && !cur->done) { renderSome(cur, 600); return; }    /* a new room: a slice per frame */
    if (ovPic.used && !ovPic.done && cur && cur->ok && usable() && ovPic.tb == V.tb && ovPic.th == V.th && ovPic.df == V.df)
        renderSome(&ovPic, 400);                                 /* spare frames: the ROOMS card's picture */
    if (frameNo % 6) return;
    readVars(&V);
    if (!V.tb) return;
    haveV = 1;
    int x = V.x, y = V.y, w = V.w, h = V.h, hx, hy, hw, hh;
    if (!V.street && hostOf(&V, &hx, &hy, &hw, &hh)) { x = hx; y = hy; w = hw; h = hh; }
    clampRoom(&V, &x, &y, &w, &h);
    Pic *p = NULL;
    for (int i = 0; i < NPIC; i++)
        if (pics[i].used && pics[i].tb == V.tb && pics[i].th == V.th && pics[i].df == V.df &&
            pics[i].rx == x && pics[i].ry == y && pics[i].rw == w && pics[i].rh == h) p = &pics[i];
    if (p) {
        cur = p; p->stamp = frameNo;
        if (!p->done) return;
        if (usable()) { memcpy(p->lut, lutNow, sizeof lutNow); p->hasLut = 1; }
        /* kept only when its tiles are the same a moment later; redrawn when most stop matching VRAM */
        if (p->ok && usable()) ovCheck();
        if (!p->ok && frameNo - p->doneAt >= 10) {
            if (tilesMatch(p) >= 0.9 && !mostlyBlank(p)) { p->ok = 1; status[0] = 0; }
            else if (usable() && selfCheck(&V)) startPic(p, &V, x, y, w, h);
        } else if (p->ok && usable() && ++picChecks % 4 == 0) {
            if (tilesMatch(p) < 0.8) { if (++p->bad >= 2 && selfCheck(&V)) startPic(p, &V, x, y, w, h); } else p->bad = 0;
        }
        return;
    }
    /* a room not drawn yet: only from settled colours and the room's own tiles in VRAM */
    if (!usable() || !selfCheck(&V)) { snprintf(status, sizeof status, "READING THE MAP..."); return; }
    Pic *slot = &pics[0];
    for (int i = 0; i < NPIC; i++) { if (!pics[i].used) { slot = &pics[i]; break; } if (pics[i].stamp < slot->stamp) slot = &pics[i]; }
    startPic(slot, &V, x, y, w, h);
    if (slot->used) { cur = slot; slot->stamp = frameNo; }
}

/* what's in the room on the map, per kind (0 heart holders, 1 fireflies, 2 squids, 3 talismans): how many there are
 * and how many are still to find. Returns 0 while there's no picture of the room yet. */
int map_left(int left[4], int total[4]) {
    for (int k = 0; k < 4; k++) left[k] = total[k] = 0;
    if (!cur || !cur->done) return 0;
    for (int i = 0; i < cur->nobj; i++) {
        int k = cur->obj[i].kind == K_HEART ? 0 : cur->obj[i].kind == K_FLY ? 1 : cur->obj[i].kind == K_SQUID ? 2 : cur->obj[i].kind == K_TAL ? 3 : -1;
        if (k < 0) continue;
        total[k]++; if (!collected(&cur->obj[i])) left[k]++;
    }
    return 1;
}

/* tests: the current room's collectibles as "kind:x,y:got" lines (kinds 1 heart, 2 firefly, 3 squid, 4 talisman, 5 genie) */
int map_objects(char *out, int cap) {
    int n = 0; out[0] = 0;
    if (!cur || !cur->done) return 0;
    for (int i = 0; i < cur->nobj && n < cap - 32; i++)
        n += snprintf(out + n, cap - n, "%d:%d,%d:%d\n", cur->obj[i].kind, cur->obj[i].x, cur->obj[i].y, collected(&cur->obj[i]));
    return cur->nobj;
}

/* ------------------------------------------------------------------ drawing */
static uint16_t *FB; static int CX0, CY0, CX1, CY1;             /* clip box */
static void px(int x, int y, uint16_t c) { if (x >= CX0 && x < CX1 && y >= CY0 && y < CY1) FB[y * LINK_W + x] = c; }
static void fill(int x, int y, int w, int h, uint16_t c) { for (int j = y; j < y + h; j++) for (int i = x; i < x + w; i++) px(i, j, c); }
static void box(int x, int y, int w, int h, uint16_t c) { fill(x, y, w, 1, c); fill(x, y + h - 1, w, 1, c); fill(x, y, 1, h, c); fill(x + w - 1, y, 1, h, c); }
#define C565(r, g, b) (uint16_t)((((r) >> 3) << 11) | (((g) >> 2) << 5) | ((b) >> 3))
static const char *HEARTPX[] = { ".##.##.", "#######", "#######", ".#####.", "..###..", "...#..." };

/* zoom (map.js 0.13): x1 fills the pane and follows the camera, x2 twice as close, ALL the whole room at fit scale and
 * staying where it's dragged; any view drags, and x1/x2 drift back to the camera ~4 s after the finger lets go */
static double viewX = -1, viewY = -1, panX, panY, allX = -1, allY, lastZ = 1;
static long panAt; static int zoomLvl = 1; static const void *allPic;
void map_zoom(void) { zoomLvl = zoomLvl == 1 ? 2 : zoomLvl == 2 ? 0 : 1; viewX = -1; panX = panY = 0; allX = -1; }
int map_zoom_level(void) { return zoomLvl; }
void map_pan(int dx, int dy) {
    double w = dx / lastZ, h = dy / lastZ;
    if (zoomLvl == 0 && allX >= 0) { allX -= w; allY -= h; } else { panX -= w; panY -= h; panAt = frameNo; }
    viewX = -1;
}
int map_draw(uint16_t *fb, int bx0, int by0, int bw, int bh, const LinkIn *in,
             int (*drawIcon)(uint16_t *fb, int key, int x, int y, int faded),
             void (*tag)(uint16_t *fb, const char *s, int x, int y, int style)) {
    IN = in;
    Pic *p = cur;
    if (!p || !p->done || !haveV) return 0;
    FB = fb;
    /* the game's colours while playing and settled, else the ones the room was last seen in */
    const uint16_t *L = (inPlay && (usable() || !p->hasLut)) ? lutNow : p->hasLut ? p->lut : lutNow;
    /* viewport: fill the box, never closer than one game screen, following the game camera */
    bh -= 5;                                                     /* room for the position bar */
    double zW = (double)bw / p->rw, zH = (double)bh / p->rh, zFit = zW < zH ? zW : zH, zBig = zW > zH ? zW : zH;
    double zMax = (double)bw / 160 < (double)bh / 128 ? (double)bw / 160 : (double)bh / 128;
    double zFill = zBig < zMax ? zBig : zMax; if (zFill < zFit) zFill = zFit;
    double z = zFill;
    if (zoomLvl == 0) z = zFit;                                  /* ALL: the whole room */
    else if (zoomLvl == 2) { double z2 = zFill * 2, zc = (double)bw / 100 > zFill ? (double)bw / 100 : zFill; z = z2 < zc ? z2 : zc; }
    lastZ = z;
    double vw = p->rw < bw / z ? p->rw : bw / z, vh = p->rh < bh / z ? p->rh : bh / z;
    double cx = V.camX + 80, cy = V.camY + 64;
    int held = 0;
    if (zoomLvl == 0) {                                          /* ALL: stays where it was dragged (starts at the camera) */
        if (allX < 0 || allPic != p) { allX = cx; allY = cy; allPic = p; }
        if (allX < p->rx + vw / 2) allX = p->rx + vw / 2;
        if (allX > p->rx + p->rw - vw / 2) allX = p->rx + p->rw - vw / 2;
        if (allY < p->ry + vh / 2) allY = p->ry + vh / 2;
        if (allY > p->ry + p->rh - vh / 2) allY = p->ry + p->rh - vh / 2;
        cx = allX; cy = allY; held = 1;
    } else if (panX != 0 || panY != 0) {
        if (frameNo - panAt > 240) {                             /* let go ~4 s ago: drift back to the camera */
            panX *= 0.6; panY *= 0.6;
            if ((panX < 0 ? -panX : panX) + (panY < 0 ? -panY : panY) < 4) panX = panY = 0;
        } else held = 1;
        cx += panX; cy += panY;
    }
    double x0 = cx - vw / 2, y0 = cy - vh / 2;
    if (x0 > p->rx + p->rw - vw) x0 = p->rx + p->rw - vw;
    if (x0 < p->rx) x0 = p->rx;
    if (y0 > p->ry + p->rh - vh) y0 = p->ry + p->rh - vh;
    if (y0 < p->ry) y0 = p->ry;
    if (zoomLvl && held) { panX = x0 + vw / 2 - (V.camX + 80); panY = y0 + vh / 2 - (V.camY + 64); }   /* no drag past the edge */
    if (!held && viewX >= 0 && x0 - viewX < vw && viewX - x0 < vw && y0 - viewY < vh && viewY - y0 < vh) {   /* glide */
        x0 = viewX + (x0 - viewX) * 0.5; y0 = viewY + (y0 - viewY) * 0.5;
    }
    viewX = x0; viewY = y0;
    int mw = (int)(vw * z + 0.5), mh = (int)(vh * z + 0.5), bx = bx0 + (bw - mw) / 2, by = by0;
    CX0 = bx; CY0 = by; CX1 = bx + mw; CY1 = by + mh;
    static int colIx[LINK_W];
    for (int sx = 0; sx < mw && sx < LINK_W; sx++) {
        int ix = (int)((x0 + (sx + 0.5) / z - p->rx) / p->s); colIx[sx] = ix < 0 ? 0 : ix >= p->W ? p->W - 1 : ix;
    }
    for (int sy = 0; sy < mh; sy++) {
        int iy = (int)((y0 + (sy + 0.5) / z - p->ry) / p->s); if (iy < 0) iy = 0; if (iy >= p->H) iy = p->H - 1;
        const uint8_t *row = p->idx + (size_t)iy * p->W;
        uint16_t *dst = fb + (by + sy) * LINK_W + bx;
        for (int sx = 0; sx < mw; sx++) { int q = row[colIx[sx]]; dst[sx] = q == 255 ? 0 : L[q & 31]; }
    }
    CX0 = 0; CY0 = 0; CX1 = LINK_W; CY1 = LINK_H;
    if (vw < p->rw - 1) {                                        /* where this view is in the whole room */
        fill(bx, by + mh + 2, mw, 2, C565(42, 24, 56));
        int fx = (int)((x0 - p->rx) / p->rw * mw), fw = (int)(vw / p->rw * mw); if (fw < 2) fw = 2;
        fill(bx + fx, by + mh + 2, fw, 2, C565(248, 192, 72));
    }
    CX0 = bx; CY0 = by; CX1 = bx + mw; CY1 = by + mh;
    #define SX(X) (bx + (int)(((X) - x0) * z))
    #define SY(Y) (by + (int)(((Y) - y0) * z))
    int night = (pk(0xC3EA) & 0x80) != 0, blink = (int)(frameNo >> 3) & 1, big = z >= 0.9;
    int door = V.street ? pk(0xCBD6) : 0, gate = V.map == 0x04 ? 6 : 4;   /* the door she stands at; the town's gates */
    for (int i = 0; i < p->nobj; i++) {
        const Obj *o = &p->obj[i];
        int x = SX(o->x) - 4, y = SY(o->y) - 4, got = collected(o);
        if (o->kind >= K_GENIE) {                                /* landmarks: tags in the game's font (map.js) */
            if (!tag) continue;
            char t[8]; int st = 2;
            if (o->kind == K_GENIE) { snprintf(t, sizeof t, "G"); st = 3; }
            else if (o->kind == K_EXIT) snprintf(t, sizeof t, "EXIT");
            else snprintf(t, sizeof t, "%d", o->kind == K_CDOOR && o->inCave ? o->side : o->n);
            int len = (int)strlen(t) * 8, tx = SX(o->x) - len / 2, ty = SY(o->y) - 4;
            if (o->kind == K_TDOOR) { ty = SY(o->y) - 24; st = o->n == door ? 1 : V.street && o->n == gate ? 2 : 0; }
            else if (o->kind == K_CDOOR) { tx = SX(o->x) - 4; ty = SY(o->y) - 8; }
            if (tx < bx + 2) tx = bx + 2;                         /* keep it in view */
            if (tx > bx + mw - len - 2) tx = bx + mw - len - 2;
            if (tx + len < CX0 || tx > CX1 || ty + 10 < CY0 || ty > CY1) continue;
            tag(fb, t, tx, ty, st);
            continue;
        }
        int key = o->kind == K_FLY ? ICON_FLY : o->kind == K_SQUID ? ICON_SQUID : o->kind == K_TAL ? ICON_TAL + (o->n > 0 ? o->n - 1 : 0) : -1;
        if (big && key >= 0 && drawIcon) {                       /* close up: the game's own inventory icon */
            fill(x - 5, y - 5, 18, 18, 0);
            if (drawIcon(fb, key, x - 4, y - 4, got || (o->kind == K_FLY && !night))) {
                if (!got && blink) box(x - 5, y - 5, 18, 18, C565(248, 192, 72));
                continue;
            }
        }
        if (o->kind == K_HEART) {
            for (int j = 0; j < 6; j++) for (int k = 0; k < 7; k++) if (HEARTPX[j][k] == '#') px(x + k, y + 1 + j, got ? C565(136, 120, 152) : C565(248, 88, 120));
        } else if (o->kind == K_FLY) {
            fill(x + 1, y + 1, 6, 6, 0); fill(x + 2, y + 2, 4, 4, got ? C565(136, 120, 152) : night ? C565(248, 240, 128) : C565(124, 120, 64));
        } else if (o->kind == K_SQUID) {
            fill(x + 1, y, 6, 8, 0); uint16_t c = got ? C565(136, 120, 152) : C565(104, 216, 240);
            fill(x + 2, y + 1, 4, 4, c); fill(x + 2, y + 5, 1, 2, c); fill(x + 5, y + 5, 1, 2, c);
        } else { fill(x + 1, y + 1, 6, 6, 0); fill(x + 2, y + 2, 4, 4, got ? C565(136, 120, 152) : C565(248, 192, 72)); }
    }
    /* what the game screen shows, and Shantae */
    int cw = (int)(160 * z), chh = (int)(128 * z); if (cw < 3) cw = 3; if (chh < 3) chh = 3;
    box(SX(V.camX), SY(V.camY), cw, V.street ? mh : chh, C565(240, 240, 240));
    int r = (int)(3 * (z * 4 < 1 ? z * 4 : 1)); if (r < 2) r = 2;
    int sx = SX(V.px), sy = SY(V.py - 12);
    if (!((frameNo >> 2) & 1)) fill(sx - r - 1, sy - r - 1, 2 * r + 2, 2 * r + 2, 0);
    fill(sx - r, sy - r, 2 * r, 2 * r, ((frameNo >> 2) & 1) ? C565(248, 88, 120) : 0xFFFF);
    #undef SX
    #undef SY
    CX0 = 0; CY0 = 0; CX1 = LINK_W; CY1 = LINK_H;
    return 1;
}

/* ------------------------------------------------------------------ for the map cards (0.10) */
int map_has_genie(void) {
    if (!cur || !cur->done) return 0;
    for (int i = 0; i < cur->nobj; i++) if (cur->obj[i].kind == K_GENIE) return 1;
    return 0;
}
/* The ROOMS card (map.js overview): the region's listed rooms, when she isn't in a part of a bigger room, there are 3
 * or more, and it isn't a town or a story-scene region. Rooms with a picture in memory are drawn from it, dimmed except
 * hers; the others are outlines. */
#define OVMAX 64
static int overviewList(void) {
    if (!haveV || !scanned || V.street) return 0;
    if ((V.tb == 0x51 && V.th == 0x4F) || (V.tb == 0x9B && V.th == 0x67) || (V.tb == 0xBB && V.th == 0x62)) return 0;
    int hx, hy, hw, hh, n = 0;
    if (hostOf(&V, &hx, &hy, &hw, &hh)) return 0;
    for (int i = 0; i < nrooms && n < OVMAX; i++) {
        const Room *q = &rooms[i];
        if (q->tb != V.tb || q->th != V.th || q->w >= 8000 || q->h >= 8000) continue;
        int dup = 0;
        for (int j = 0; j < n; j++) if (ovR[j][0] == q->x && ovR[j][1] == q->y && ovR[j][2] == q->w && ovR[j][3] == q->h) dup = 1;
        if (dup) continue;
        ovR[n][0] = q->x; ovR[n][1] = q->y; ovR[n][2] = q->w; ovR[n][3] = q->h; n++;
    }
    return n >= 3 ? n : 0;
}
int map_rooms(void) { return overviewList(); }
static uint16_t dim565(uint16_t c) { return (uint16_t)((((c >> 11) * 9 / 16) << 11) | ((((c >> 5) & 63) * 9 / 16) << 5) | ((c & 31) * 9 / 16)); }
int map_rooms_draw(uint16_t *fb, int bx, int by, int bw, int bh) {
    int n = overviewList();
    if (!n) return 0;
    int ax, ay, aw, ah; ovArea(n, &ax, &ay, &aw, &ah);
    int ex = ax + aw, ey = ay + ah;
    const Pic *ov = ovPic.used && ovPic.tb == V.tb && ovPic.th == V.th && ovPic.df == V.df && ovPic.rx == ax && ovPic.ry == ay ? &ovPic : NULL;
    double s = (double)bw / (ex - ax) < (double)bh / (ey - ay) ? (double)bw / (ex - ax) : (double)bh / (ey - ay);
    int ow = (int)((ex - ax) * s), oh = (int)((ey - ay) * s), ox = bx + (bw - ow) / 2, oy = by;
    FB = fb; CX0 = ox; CY0 = oy; CX1 = ox + ow; CY1 = oy + oh;
    fill(ox, oy, ow, oh, 0);
    for (int pass = 0; pass < 2; pass++)                         /* the other rooms, then hers on top */
        for (int i = 0; i <= n; i++) {
            int r[4], mine = i == n;
            if (mine) { r[0] = V.x; r[1] = V.y; r[2] = V.w; r[3] = V.h; } else memcpy(r, ovR[i], sizeof r);
            if (mine != pass) continue;
            int x0 = ox + (int)((r[0] - ax) * s), y0 = oy + (int)((r[1] - ay) * s), w = (int)(r[2] * s), h = (int)(r[3] * s);
            if (w < 2) w = 2;
            if (h < 2) h = 2;
            for (int sy = y0; sy < y0 + h; sy++) {
                if (sy < CY0 || sy >= CY1) continue;
                int Y = ay + (int)((sy - oy + 0.5) / s);
                for (int sx = x0; sx < x0 + w; sx++) {
                    if (sx < CX0 || sx >= CX1) continue;
                    int X = ax + (int)((sx - ox + 0.5) / s);
                    uint16_t c = C565(30, 20, 40);
                    int v0 = ov && X >= ax && Y >= ay && X < ex && Y < ey ? ov->idx[(size_t)((Y - ay) / ov->s) * ov->W + (X - ax) / ov->s] : 255;
                    if (v0 != 255) { const uint16_t *L = cur && cur->hasLut ? cur->lut : lutNow; c = L[v0 & 31]; }
                    else for (int k = 0; k < NPIC; k++) {             /* else a room picture in memory that covers it */
                        const Pic *q = &pics[k];
                        if (!q->used || !q->done || q->tb != V.tb || q->th != V.th || X < q->rx || Y < q->ry || X >= q->rx + q->rw || Y >= q->ry + q->rh) continue;
                        int v = q->idx[(size_t)((Y - q->ry) / q->s) * q->W + (X - q->rx) / q->s];
                        if (v != 255) c = (q->hasLut ? q->lut : lutNow)[v & 31];
                        break;
                    }
                    fb[sy * LINK_W + sx] = mine ? c : dim565(c);
                }
            }
            box(x0, y0, w, h, mine ? C565(248, 192, 72) : C565(120, 104, 136));
        }
    if (!((frameNo >> 2) & 1)) {                                  /* Shantae */
        int dx = ox + (int)((V.px - ax) * s), dy = oy + (int)((V.py - 12 - ay) * s);
        fill(dx - 1, dy - 1, 3, 3, C565(248, 88, 120));
    }
    CX0 = 0; CY0 = 0; CX1 = LINK_W; CY1 = LINK_H;
    return oh;
}
