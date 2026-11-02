/* linkscr.c - Shantae Dual 3DS Link screen (alpha): SHANTAE and PROGRESS pages, the dance list on Select.
 * A C port of the parts of assets/link (shantae.js, link.js, world.js) that need no browser. RAM layout and names:
 * SHANTAE-RAM.md. Graphics: the font comes from the player's ROM; hearts, bars and frames are drawn here. */
#include <string.h>
#include <stdio.h>
#include <time.h>
#include "linkscr.h"

#define RGB(r, g, b) (uint16_t)((((r) >> 3) << 11) | (((g) >> 2) << 5) | ((b) >> 3))
enum { BG, PANEL, SEL, INK, WHITE, GREY, LGREY, GOLD, GREEN, RED, HEART, HEART0, GEM, PURPLE, TEAL, DPURPLE, BLACK, NCOL };
static const uint16_t COL[NCOL] = {
    RGB(12, 4, 24), RGB(30, 12, 44), RGB(90, 42, 120), RGB(248, 224, 112), RGB(248, 240, 224), RGB(136, 120, 152),
    RGB(200, 184, 216), RGB(248, 192, 72), RGB(120, 224, 152), RGB(224, 88, 74), RGB(248, 88, 120), RGB(90, 48, 72),
    RGB(120, 224, 248), RGB(176, 112, 232), RGB(104, 216, 240), RGB(58, 24, 88), RGB(0, 0, 0) };

/* ------------------------------------------------------------------ font (the game's, from the ROM) */
static uint8_t font[0x800];      /* glyph c (0-127) at c*16: GB 2bpp, ink = colour 1; 0-31 are HUD icons */
static int haveFont;

static void lzss(const uint8_t *src, size_t n, uint8_t *out, int len, int skip) {   /* as RomGfx.lzss */
    uint8_t ring[4096]; memset(ring, ' ', sizeof ring);
    int r = 0xFEE, o = 0; size_t p = 0;
    while (o < len + skip && p < n) {
        int flags = src[p++];
        for (int k = 0; k < 8 && o < len + skip; k++, flags >>= 1) {
            if (flags & 1) { if (p >= n) return; uint8_t c = src[p++]; if (o >= skip) out[o - skip] = c; o++; ring[r] = c; r = (r + 1) & 0xFFF; }
            else {
                if (p + 1 >= n) return;
                int lo = src[p], hi = src[p + 1], pos = lo | ((hi & 0xF0) << 4), m = (hi & 15) + 3; p += 2;
                for (int i = 0; i < m && o < len + skip; i++) { uint8_t c = ring[(pos + i) & 0xFFF]; if (o >= skip) out[o - skip] = c; o++; ring[r] = c; r = (r + 1) & 0xFFF; }
            }
        }
    }
}
int link_init(const uint8_t *rom, size_t len) {
    if (len < 0x3964A3 + 0x1000) return 0;
    lzss(rom + 0x3964A3, len - 0x3964A3, font, 0x800, 0x1000);        /* tiles $100-$17F of the HUD/font tileset */
    haveFont = 1;
    return 1;
}

/* ------------------------------------------------------------------ drawing */
static uint16_t *F;
static int FW = LINK_W, FH = LINK_H;    /* the buffer drawn into: the Link screen, or the top screen's 400x240 borders */
static void rect(int x, int y, int w, int h, int c) {
    for (int j = y; j < y + h; j++) if (j >= 0 && j < FH)
        for (int i = x; i < x + w; i++) if (i >= 0 && i < FW) F[j * FW + i] = COL[c];
}
static void glyph(int ch, int x, int y, int c) {
    if (!haveFont || ch < 0 || ch > 127) return;
    const uint8_t *t = font + ch * 16;
    for (int j = 0; j < 8; j++) for (int i = 0; i < 8; i++) {
        int v = ((t[j * 2] >> (7 - i)) & 1) | (((t[j * 2 + 1] >> (7 - i)) & 1) << 1);
        if (v == 1 && x + i >= 0 && x + i < FW && y + j >= 0 && y + j < FH) F[(y + j) * FW + x + i] = COL[c];
    }
}
static void text(const char *s, int x, int y, int c) { for (; *s; s++, x += 8) if (*s > ' ') glyph(*s, x, y, c); }
static void textR(const char *s, int xr, int y, int c) { text(s, xr - 8 * (int)strlen(s), y, c); }
static void textC(const char *s, int xc, int y, int c) { text(s, xc - 4 * (int)strlen(s), y, c); }
static const char *HEART_PX[] = { ".##.##.", "#######", "#######", ".#####.", "..###..", "...#..." };
static void heart(int x, int y, int quarters) {        /* drawn here: filled from the left by quarters */
    for (int j = 0; j < 6; j++) for (int i = 0; i < 7; i++) if (HEART_PX[j][i] == '#')
        rect(x + i, y + j, 1, 1, (i * 4) / 7 < quarters ? HEART : HEART0);
}

/* ------------------------------------------------------------------ game facts */
static const char *ITEMS[] = { "S.VIAL", "M.VIAL", "L.VIAL", "MUFFIN", "CREAM", "CANDY", "MINTS", "GREEDY", "STORM",
                               "FLASH", "PIKE", "FIRE" };
static const char *ITEM_NOTE[] = { "A FEW HEARTS", "SEVERAL HEARTS", "ALL HEARTS", "SAVES YOU FROM PITS", "SLIP PAST ENEMIES",
                                   "LEAVE A LABYRINTH", "DOUBLE ATTACK", "DOUBLE LOOT", "THUNDER CLOUD", "RANGED SHOT",
                                   "ORBITING MINES", "FAST FIRE SHOT" };
static const char *DANCES[][2] = { {"MONKEY", "DR"}, {"ELEPHANT", "DL"}, {"SPIDER", "DA"}, {"HARPY", "DB"}, {"HEALING", "DUA"},
    {"WARP 1", "DULR"}, {"WARP 2", "DURLBA"}, {"WARP 3", "DURRBA"}, {"WARP 4", "DULLBA"}, {"WARP 5", "DUBLBR"}, {"TINKERBAT", "DUU"} };
/* world.js: rooms keyed by region bank:high byte and the room's top-left corner */
static const struct { uint8_t bank, hi; uint16_t x, y; const char *name; } ROOMS[] = {
    {0x72,0x4B,256,1024,"SCUTTLE TOWN"}, {0x51,0x4F,0,0,"SHANTAE'S LIGHTHOUSE"}, {0x51,0x4F,32,1198,"RISKY'S SHIP"},
    {0x58,0x40,32,0,"SCARECROW FIELD"}, {0x58,0x40,0,1152,"GECKO MATCH"}, {0x59,0x73,552,8,"SCUTTLE TOWN GATES"},
    {0x59,0x73,32,8,"DRIBBLE FOUNTAIN ENT."}, {0x59,0x73,1072,8,"WATER TOWN GATES"}, {0x59,0x73,1576,8,"OASIS TOWN GATES"},
    {0x59,0x73,2096,8,"ZOMBIE CARAVAN GATES"}, {0x59,0x73,2608,8,"BANDIT TOWN GATES"}, {0x66,0x40,32,512,"SPIDERWOOD FOREST"},
    {0x66,0x40,1280,2304,"GOBLIN FOREST"}, {0x66,0x40,256,2560,"FOREST SIDE AREA"}, {0x66,0x40,1280,2816,"GHOST FOREST"},
    {0x66,0x40,1280,5120,"ARCHER FOREST"}, {0x85,0x67,256,768,"WATERFALL LAKE"}, {0x85,0x67,256,1752,"HIDDEN WATERFALL"},
    {0x85,0x67,256,256,"ZOMBIE SWAMP"}, {0x9F,0x40,258,136,"RAIN STORM RIVER"}, {0xB1,0x4E,256,1280,"SNAIL WASTELAND"},
    {0xB1,0x4E,2304,2304,"EAGLE WASTELAND"}, {0xB1,0x4E,256,256,"NAGA WASTELAND"}, {0xA3,0x63,1024,256,"MOUNT POINTY"},
    {0x8C,0x5A,512,144,"MUD BOG"}, {0xAB,0x74,256,1280,"LADIES DESERT"}, {0xAB,0x74,256,256,"MENS DESERT"} };
static const struct { uint8_t bank; const char *name; } LABS[] = {
    {0x4A,"DRIBBLE FOUNTAIN"}, {0xBE,"GOLEM MINE"}, {0x8F,"CACKLE MOUND"}, {0xCA,"TWINKLE PALACE"}, {0xD4,"RISKY'S HIDEOUT"} };
static const struct { uint8_t map; const char *name; } TOWNS[] = {
    {0x04,"SCUTTLE TOWN"}, {0x30,"WATER TOWN"}, {0x31,"ZOMBIE CARAVAN"}, {0x34,"OASIS TOWN"}, {0x35,"BANDIT TOWN"} };

/* ------------------------------------------------------------------ world.js links, for the map cards (0.10) */
/* towns: the street is a room of region 9B:67 at (0, y); door n leads to a building room of region ib:ih at door[n];
 * the door names are the town's label table in the ROM (3-byte far pointers to strings) */
static const struct { const char *name; uint8_t map, gate, lb; uint16_t la, y; uint8_t ib, ih; uint16_t door[8][2]; } TOWN[] = {
    {"SCUTTLE TOWN", 0x04, 6, 0x29, 0x732E, 0, 0x9B, 0x67, {{0,0},{1304,624},{2624,336},{672,360},{1800,360},{248,360},{0,0},{1248,360}}},
    {"WATER TOWN", 0x30, 4, 0x29, 0x765D, 768, 0xBB, 0x62, {{0,0},{2864,872},{672,872},{1800,872},{0,0},{1264,872},{2336,880},{248,872}}},
    {"OASIS TOWN", 0x34, 4, 0x29, 0x76CE, 1120, 0xBB, 0x62, {{0,0},{2816,1400},{672,1384},{1800,1384},{0,0},{1264,1384},{248,1384},{2336,1384}}},
    {"ZOMBIE CARAVAN", 0x31, 4, 0x2A, 0x56FC, 1376, 0xBB, 0x62, {{0,0},{1800,1896},{672,1896},{2336,1896},{0,0},{1264,1896},{248,1896},{0,0}}},
    {"BANDIT TOWN", 0x35, 4, 0x2A, 0x5ECB, 1632, 0xBB, 0x62, {{0,0},{1264,2408},{248,2408},{672,2408},{0,0},{2336,2408},{2848,2416},{1800,2408}}} };
/* the caves (region B8:46): cave n's corner, and where its two ends come out */
static const uint16_t CAVE_AT[13][2] = { {0,0}, {256,256}, {768,256}, {1536,256}, {2560,256}, {3072,256}, {3840,256}, {4608,256},
                                         {5376,256}, {256,768}, {0,0}, {768,768}, {1536,768} };
static const char *const CAVES[13][2] = { {0,0}, {"NAGA WASTELAND",0}, {"LADIES DESERT","NAGA WASTELAND"}, {"MUD BOG",0},
    {"SPIDERWOOD FOREST","GOBLIN FOREST"}, {"GOBLIN FOREST","WATERFALL LAKE"}, {0,"FOREST SIDE AREA"},
    {"WATERFALL LAKE","HIDDEN WATERFALL"}, {"SNAIL WASTELAND","GHOST FOREST"}, {"ARCHER FOREST",0}, {0,0},
    {"HIDDEN WATERFALL","SNAIL WASTELAND"}, {"FOREST SIDE AREA","GOBLIN FOREST"} };
/* walking off the left / right edge */
static const char *const EDGE[][3] = {
    {"SCUTTLE TOWN GATES","NAGA WASTELAND","SCARECROW FIELD"}, {"SCARECROW FIELD","SCUTTLE TOWN GATES","SPIDERWOOD FOREST"},
    {"SPIDERWOOD FOREST","SCARECROW FIELD","DRIBBLE FOUNTAIN ENT."}, {"DRIBBLE FOUNTAIN ENT.","SPIDERWOOD FOREST","WATERFALL LAKE"},
    {"WATERFALL LAKE","DRIBBLE FOUNTAIN ENT.","WATER TOWN GATES"}, {"WATER TOWN GATES","WATERFALL LAKE","RAIN STORM RIVER"},
    {"RAIN STORM RIVER","WATER TOWN GATES","SNAIL WASTELAND"}, {"SNAIL WASTELAND","RAIN STORM RIVER","ZOMBIE SWAMP"},
    {"ZOMBIE SWAMP","SNAIL WASTELAND","GHOST FOREST"}, {"GHOST FOREST","ZOMBIE SWAMP","ARCHER FOREST"},
    {"ZOMBIE CARAVAN GATES","GHOST FOREST","ARCHER FOREST"}, {"ARCHER FOREST","GHOST FOREST","MOUNT POINTY"},
    {"MOUNT POINTY","ARCHER FOREST","EAGLE WASTELAND"}, {"EAGLE WASTELAND","MOUNT POINTY","MUD BOG"},
    {"BANDIT TOWN GATES",0,"EAGLE WASTELAND"}, {"MUD BOG","EAGLE WASTELAND","OASIS TOWN GATES"},
    {"OASIS TOWN GATES","MUD BOG","LADIES DESERT"}, {"LADIES DESERT","OASIS TOWN GATES",0}, {"MENS DESERT",0,"NAGA WASTELAND"},
    {"NAGA WASTELAND","MENS DESERT","SCUTTLE TOWN GATES"} };
/* doors from the overworld into towns and labyrinths */
static const char *const DOORS[][2] = { {"SCUTTLE TOWN GATES","SCUTTLE TOWN"}, {"WATER TOWN GATES","WATER TOWN"},
    {"OASIS TOWN GATES","OASIS TOWN"}, {"BANDIT TOWN GATES","BANDIT TOWN"}, {"ZOMBIE CARAVAN GATES","ZOMBIE CARAVAN"},
    {"DRIBBLE FOUNTAIN ENT.","DRIBBLE FOUNTAIN"}, {"ZOMBIE SWAMP","CACKLE MOUND"}, {"MOUNT POINTY","TWINKLE PALACE"},
    {"MENS DESERT","GOLEM MINE"} };
static const char *const LAB_TO[] = { "DRIBBLE FOUNTAIN ENT.", "MENS DESERT", "ZOMBIE SWAMP", "MOUNT POINTY", 0 };   /* as LABS */
enum { RK_NONE, RK_FIELD, RK_CAVE, RK_TOWN, RK_BUILDING, RK_LAB };
typedef struct { const char *name; int kind, n, town, door; } Place;   /* n: the cave, or the labyrinth's LABS index */
/* world.js W.room: the room she's in from the region ($C9FA:$C9F9) and the room's corner ($C9E9, $C9EC) */
static Place worldRoom(int tb, int th, int x, int y) {
    Place p = { 0, RK_NONE, 0, -1, 0 };
    for (size_t i = 0; i < sizeof ROOMS / sizeof ROOMS[0]; i++)
        if (ROOMS[i].bank == tb && ROOMS[i].hi == th && ROOMS[i].x == x && ROOMS[i].y == y) { p.name = ROOMS[i].name; p.kind = RK_FIELD; return p; }
    if (tb == 0xB8 && th == 0x46)
        for (int n = 1; n < 13; n++) if (CAVE_AT[n][0] == x && CAVE_AT[n][1] == y) { p.name = "CAVE"; p.kind = RK_CAVE; p.n = n; return p; }
    for (int k = 0; k < 5; k++) {
        if (tb == 0x9B && th == 0x67 && x == 0 && y == TOWN[k].y) { p.name = TOWN[k].name; p.kind = RK_TOWN; p.town = k; return p; }
        for (int d = 1; d < 8; d++)
            if (TOWN[k].door[d][0] && tb == TOWN[k].ib && th == TOWN[k].ih && x == TOWN[k].door[d][0] && y == TOWN[k].door[d][1]) {
                p.name = TOWN[k].name; p.kind = RK_BUILDING; p.town = k; p.door = d; return p;
            }
    }
    for (size_t i = 0; i < sizeof LABS / sizeof LABS[0]; i++) if (LABS[i].bank == tb) { p.name = LABS[i].name; p.kind = RK_LAB; p.n = (int)i; return p; }
    return p;
}
typedef struct { char tag[12]; char name[32]; } Way;
static void addWay(Way *w, int *n, const char *tag, const char *name) {
    if (*n >= 10) return;
    snprintf(w[*n].tag, sizeof w[*n].tag, "%s", tag); snprintf(w[*n].name, sizeof w[*n].name, "%s", name); (*n)++;
}
/* world.js W.links: where this room leads */
static int worldLinks(const Place *p, Way *w) {
    int n = 0; char b[32];
    if (p->kind == RK_TOWN) { snprintf(b, sizeof b, "%s GATES", TOWN[p->town].name); addWay(w, &n, "GATES", b); return n; }
    if (p->kind == RK_BUILDING) { addWay(w, &n, "DOOR", TOWN[p->town].name); return n; }
    if (p->kind == RK_LAB) { if (LAB_TO[p->n]) addWay(w, &n, "EXIT", LAB_TO[p->n]); return n; }
    if (p->kind == RK_CAVE) {
        if (CAVES[p->n][0]) addWay(w, &n, "1", CAVES[p->n][0]);
        if (CAVES[p->n][1]) addWay(w, &n, "2", CAVES[p->n][1]);
        return n;
    }
    if (p->kind != RK_FIELD) return 0;
    for (size_t i = 0; i < sizeof EDGE / sizeof EDGE[0]; i++) if (!strcmp(EDGE[i][0], p->name)) {
        if (EDGE[i][1]) addWay(w, &n, "<", EDGE[i][1]);
        if (EDGE[i][2]) addWay(w, &n, ">", EDGE[i][2]);
    }
    if (!strcmp(p->name, "EAGLE WASTELAND")) addWay(w, &n, "SIDE", "BANDIT TOWN GATES");
    if (!strcmp(p->name, "GHOST FOREST")) addWay(w, &n, "NIGHT", "ZOMBIE CARAVAN GATES");
    for (size_t i = 0; i < sizeof DOORS / sizeof DOORS[0]; i++) if (!strcmp(DOORS[i][0], p->name)) addWay(w, &n, "DOOR", DOORS[i][1]);
    for (int c = 1; c < 13; c++) for (int s = 0; s < 2; s++)
        if (CAVES[c][s] && !strcmp(CAVES[c][s], p->name)) {
            snprintf(b, sizeof b, "CAVE %d", c); addWay(w, &n, b, CAVES[c][1 - s] ? CAVES[c][1 - s] : "DEAD END");
        }
    return n;
}
static int romb(const LinkIn *in, int bank, unsigned a) {
    size_t o = a < 0x4000 ? a : (size_t)bank * 0x4000 + (a - 0x4000);
    return in->rom && o < in->romLen ? in->rom[o] : 0;
}
/* a town's door n name from its label table (map.js townLabels), or "" */
static void townLabel(const LinkIn *in, int k, int n, char *out, size_t cap) {
    out[0] = 0;
    unsigned e = TOWN[k].la + 3 * (n - 1), a = romb(in, TOWN[k].lb, e) | romb(in, TOWN[k].lb, e + 1) << 8;
    int b = romb(in, TOWN[k].lb, e + 2);
    if (n < 1 || n > 8 || a < 0x4000 || a >= 0x8000 || !b) return;
    size_t i = 0;
    for (; i + 1 < cap && i < 24; i++) {
        int ch = romb(in, b, a + (unsigned)i);
        if (ch < 32 || ch > 126) break;
        out[i] = (char)(ch >= 'a' && ch <= 'z' ? ch - 32 : ch);
    }
    out[i] = 0;
}

/* the signposts (link.js loadRom): "Welcome to NAME. West: W, East: E" in the ROM at $A5F00, chained east */
typedef struct { char name[28], west[28], east[28]; } Sign;
static Sign signs[24]; static int nsigns = -1;
static void tidy(char *s) {                                     /* "- " -> "-", single spaces, trimmed, upper case */
    char o[64]; int n = 0;
    for (const char *p = s; *p && n < 63; p++) {
        if (*p == ' ' && (n == 0 || o[n - 1] == ' ' || o[n - 1] == '-')) continue;
        o[n++] = (char)(*p >= 'a' && *p <= 'z' ? *p - 32 : *p);
    }
    while (n && o[n - 1] == ' ') n--;
    o[n] = 0; strcpy(s, o);
}
static int signChar(char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '-' || c == ' '; }
static int isWs(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }
static void loadSigns(const LinkIn *in) {
    if (nsigns >= 0 || !in->rom || in->romLen < 0xA5F00 + 0x600) return;
    char t[0x601]; Sign list[24]; int n = 0;
    for (int i = 0; i < 0x600; i++) { int c = in->rom[0xA5F00 + i]; t[i] = c >= 32 && c < 127 ? (char)c : '|'; }
    t[0x600] = 0;
    for (char *p = t; n < 24 && (p = strstr(p, "Welcome to ")); ) {
        char *q = p + 11; p++;
        if (!strncmp(q, "the ", 4)) q += 4;
        char *a = q; while (signChar(*q)) q++;
        if (*q != '.' || q == a) continue;
        int la = (int)(q - a); q++;
        while (isWs(*q)) q++;
        if (strncmp(q, "West:", 5)) continue;
        q += 5; while (isWs(*q)) q++;
        char *w = q; while (signChar(*q)) q++;
        if (*q != ',') continue;
        int lw = (int)(q - w); q++;
        while (isWs(*q)) q++;
        if (strncmp(q, "East:", 5)) continue;
        q += 5; while (isWs(*q)) q++;
        char *e = q; while (signChar(*q)) q++;
        if (*q != '|' || q == e) continue;
        Sign *s = &list[n++];
        snprintf(s->name, sizeof s->name, "%.*s", la, a); snprintf(s->west, sizeof s->west, "%.*s", lw, w);
        snprintf(s->east, sizeof s->east, "%.*s", (int)(q - e), e);
        tidy(s->name); tidy(s->west); tidy(s->east);
    }
    /* walk west from the first as far as the signs go, then east along the chain; the rest at the end */
    int start = 0, used[24] = { 0 }; nsigns = 0;
    if (!n) return;
    for (int k = 0; k < n; k++) {
        int prev = -1;
        for (int j = 0; j < n; j++) if (!strcmp(list[j].name, list[start].west)) prev = j;
        if (prev < 0 || used[prev]) break;
        used[start] = 1; start = prev;
    }
    memset(used, 0, sizeof used);
    for (int c = start; c >= 0 && !used[c]; ) {
        used[c] = 1; signs[nsigns++] = list[c];
        int nx = -1; for (int j = 0; j < n; j++) if (!strcmp(list[j].name, list[c].east)) nx = j;
        c = nx;
    }
    for (int j = 0; j < n; j++) if (!used[j]) signs[nsigns++] = list[j];
}

/* ------------------------------------------------------------------ state from RAM (shantae.js S.parse) */
typedef struct {
    uint8_t items[12], hearts, maxHearts, equipped, squids, fireflies, state, map, flags[33], gear[4];
    int gems, time, x, y, squidGot, stones, tals, dances[11], frames;
    char area[24];
} St;
static int rd(const LinkIn *in, unsigned a) { return in->peek(a) & 255; }
static int rd16(const LinkIn *in, unsigned a) { return rd(in, a) | rd(in, a + 1) << 8; }
static void readSt(const LinkIn *in, St *s) {
    for (int i = 0; i < 12; i++) s->items[i] = rd(in, 0xCA70 + i);
    s->gems = rd16(in, 0xCA7D); s->hearts = rd(in, 0xCA80); s->maxHearts = rd(in, 0xCA82); s->equipped = rd(in, 0xCA84);
    s->squids = rd(in, 0xCA8A); s->fireflies = rd(in, 0xCA8B);
    s->gear[0] = rd(in, 0xCABC); s->gear[1] = rd(in, 0xCABB); s->gear[2] = rd(in, 0xCABA); s->gear[3] = rd(in, 0xCABD);   /* boot sash cuff tiara */
    for (int i = 0; i < 33; i++) s->flags[i] = rd(in, 0xCB1B + i);
    s->state = rd(in, 0xC39D); s->time = rd16(in, 0xC3E9); s->map = rd(in, 0xCBFD);
    s->x = rd16(in, 0xCB43); s->y = rd16(in, 0xCB45); s->frames = rd16(in, 0xC377);   /* the game's frame counter */
    s->stones = s->tals = 0;
    for (int i = 0; i < 4; i++) { s->stones += !!(s->flags[0x1D] & (0x10 << i)); s->tals += !!(s->flags[0x1E] & (0x10 << i)); }
    int d1 = s->flags[0x1F], d2 = s->flags[0x20];
    int dl[11] = { d1 & 1, d1 & 2, d1 & 4, d1 & 8, d1 & 16, d1 & 32, d1 & 64, d2 & 1, d1 & 128, d2 & 2, d2 & 4 };
    for (int i = 0; i < 11; i++) s->dances[i] = !!dl[i];
    s->squidGot = 0;
    for (int n = 1; n <= 20; n++) s->squidGot += !!(s->flags[(n + 10) >> 3] & (1 << ((n + 10) & 7)));
    /* the place: region ($C9FA bank : $C9F9 high byte) and the room's corner ($C9E9, $C9EC) */
    int tb = rd(in, 0xC9FA), th = rd(in, 0xC9F9), rx = rd16(in, 0xC9E9), ry = rd16(in, 0xC9EC);
    s->area[0] = 0;
    for (size_t i = 0; i < sizeof ROOMS / sizeof ROOMS[0]; i++)
        if (ROOMS[i].bank == tb && ROOMS[i].hi == th && ROOMS[i].x == rx && ROOMS[i].y == ry) { snprintf(s->area, sizeof s->area, "%s", ROOMS[i].name); return; }
    for (size_t i = 0; i < sizeof LABS / sizeof LABS[0]; i++) if (LABS[i].bank == tb) { snprintf(s->area, sizeof s->area, "%s", LABS[i].name); return; }
    if (tb == 0xB8 && th == 0x46) { snprintf(s->area, sizeof s->area, "CAVE"); return; }
    for (size_t i = 0; i < sizeof TOWNS / sizeof TOWNS[0]; i++) if (TOWNS[i].map == s->map) { snprintf(s->area, sizeof s->area, "%s", TOWNS[i].name); return; }
}

/* ------------------------------------------------------------------ icons from the game's inventory screen
 * The first time the in-game inventory is open, the item, stone, talisman, squid and firefly icons are copied from live
 * VRAM (2x2 tiles with their CGB attributes and palettes), as link.js does, and kept on the SD card by the frontend.
 * Layout (SHANTAE-RAM.md, "First-start extraction"): item i at row 5 + 2*(i/4), column 11 + 2*(i%4); stones row 12 and
 * talismans row 15, column 11 + 2i; squid 1,14; firefly 1,17. */
static uint16_t iconPx[ICON_N][256];
static uint8_t iconA[ICON_N][256], iconHave[ICON_N];
static int iconsDirty;
static int isInventory(const LinkIn *in) {
    int m = 0x1800;
    return in->vram(0, m) == 0x8A && in->vram(0, m + 19) == 0x8B && in->vram(0, m + 17 * 32) == 0xA1 && in->vram(0, m + 4 * 32 + 10) == 0xDA;
}
static void grabBlock(const LinkIn *in, int key, int row, int col) {
    if (iconHave[key]) return;
    int lcdc = in->peek(0xFF40), m = (lcdc & 8) ? 0x1C00 : 0x1800, filled = 0;
    const uint8_t *pal = in->cgbpal(0);
    uint16_t *px = iconPx[key]; uint8_t *al = iconA[key];
    for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
        int i = m + (row + dy) * 32 + col + dx, t = in->vram(0, i), at = in->vram(1, i);
        int n = (lcdc & 0x10) ? t : (t < 128 ? 256 + t : t), bank = (at >> 3) & 1, p = at & 7;
        for (int y = 0; y < 8; y++) {
            int ry = (at & 0x40) ? 7 - y : y, lo = in->vram(bank, n * 16 + ry * 2), hi = in->vram(bank, n * 16 + ry * 2 + 1);
            for (int x = 0; x < 8; x++) {
                int rx = (at & 0x20) ? 7 - x : x, q = ((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1);
                int c = pal[p * 8 + q * 2] | pal[p * 8 + q * 2 + 1] << 8, r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
                int o = (dy * 8 + y) * 16 + dx * 8 + x;
                px[o] = (uint16_t)(r << 11 | g << 6 | (g >> 4) << 5 | b); al[o] = 1;
                filled += q != 0;
            }
        }
    }
    if (filled <= 8) return;                                    /* an empty slot is all colour 0 */
    /* the inventory panel colour behind some icons: see-through when it fills the corners and is light */
    uint16_t bg = px[0]; int corners = (px[15] == bg) + (px[240] == bg) + (px[255] == bg) + 1;
    int lum = ((bg >> 11) * 8 * 30 + ((bg >> 5) & 63) * 4 * 59 + (bg & 31) * 8 * 11) / 100;
    if (corners >= 3 && lum > 96) for (int i = 0; i < 256; i++) if (px[i] == bg) al[i] = 0;
    iconHave[key] = 1; iconsDirty = 1;
}
static void captureIcons(const LinkIn *in) {
    if (!isInventory(in)) return;
    for (int i = 0; i < 12; i++) if (in->peek(0xCA70 + i) & 255) grabBlock(in, ICON_ITEM + i, 5 + 2 * (i >> 2), 11 + 2 * (i & 3));
    int stones = in->peek(0xCB38), tals = in->peek(0xCB39);
    for (int i = 0; i < 4; i++) {
        if (stones & (0x10 << i)) grabBlock(in, ICON_STONE + i, 12, 11 + 2 * i);
        if (tals & (0x10 << i)) grabBlock(in, ICON_TAL + i, 15, 11 + 2 * i);
    }
    grabBlock(in, ICON_SQUID, 1, 14); grabBlock(in, ICON_FLY, 1, 17);
}
/* draws icon key at (x, y); faded = only every other pixel (collected, or a firefly by day). 0 when not captured. */
static int drawIcon(uint16_t *fb, int key, int x, int y, int faded) {
    if (key < 0 || key >= ICON_N || !iconHave[key]) return 0;
    for (int j = 0; j < 16; j++) for (int i = 0; i < 16; i++) {
        int o = j * 16 + i;
        if (!iconA[key][o] || (faded && ((i + j) & 1))) continue;
        if (x + i >= 0 && x + i < FW && y + j >= 0 && y + j < FH) fb[(y + j) * FW + x + i] = iconPx[key][o];
    }
    return 1;
}
size_t link_icons_save(uint8_t *buf, size_t cap) {
    size_t n = 4 + ICON_N + ICON_N * 256 * 3;
    if (!iconsDirty || cap < n) return 0;
    memcpy(buf, "SDI1", 4); memcpy(buf + 4, iconHave, ICON_N);
    memcpy(buf + 4 + ICON_N, iconPx, sizeof iconPx); memcpy(buf + 4 + ICON_N + sizeof iconPx, iconA, sizeof iconA);
    iconsDirty = 0;
    return n;
}
void link_icons_load(const uint8_t *buf, size_t n) {
    if (n < 4 + ICON_N + sizeof iconPx + sizeof iconA || memcmp(buf, "SDI1", 4)) return;
    memcpy(iconHave, buf + 4, ICON_N);
    memcpy(iconPx, buf + 4 + ICON_N, sizeof iconPx); memcpy(iconA, buf + 4 + ICON_N + sizeof iconPx, sizeof iconA);
}

/* ------------------------------------------------------------------ top-screen borders (BezelTheme.java + GameView HUD)
 * The game sits at 1.5x (240x216) in the middle of the 400x240 top screen. The borders are the most common textured 2x2
 * background tile on screen right now (above the status bar), tiled and darkened, so they follow the area and day and
 * night; the game is framed in that palette's darkest and brightest colours. The left border shows hearts, gems and
 * lives, the right one the place and the time to dusk or dawn. Nothing is shipped: it's all from the running game. */
#define TOP_W 400
#define TOP_H 240
#define GX 80
#define GY 12
#define GW 240
#define GH 216
static uint16_t thBlock[256], thAccent = 0xE51F, thShade = 0x4A2E;
static int thKey = -2;
static uint16_t rgb565(const uint8_t *pal, int p, int i) {
    int c = pal[p * 8 + i * 2] | pal[p * 8 + i * 2 + 1] << 8, r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
    return (uint16_t)(r << 11 | g << 6 | (g >> 4) << 5 | b);
}
static int lum565(uint16_t c) { return (c >> 11) * 8 * 3 + ((c >> 5) & 63) * 4 * 6 + (c & 31) * 8; }
static int tileOff(int lcdc, int t) { return ((lcdc & 0x10) ? t : (t < 128 ? 256 + t : t)) * 16; }
static int coverage(const LinkIn *in, int bank, int off) {
    int n[4] = { 0, 0, 0, 0 };
    for (int y = 0; y < 8; y++) {
        int lo = in->vram(bank, off + y * 2), hi = in->vram(bank, off + y * 2 + 1);
        for (int x = 0; x < 8; x++) n[((lo >> x) & 1) | (((hi >> x) & 1) << 1)]++;
    }
    int distinct = (n[0] > 0) + (n[1] > 0) + (n[2] > 0) + (n[3] > 0), mx = n[0];
    for (int k = 1; k < 4; k++) if (n[k] > mx) mx = n[k];
    return distinct >= 2 ? 64 - mx + 16 : 0;
}
/* the theme for what's on screen now; returns its key (-1: no usable tile, keep the last one) */
static int buildTheme(const LinkIn *in, int area) {
    int lcdc = in->peek(0xFF40), scy = in->peek(0xFF42), scx = in->peek(0xFF43), wy = in->peek(0xFF4A);
    if (!(lcdc & 0x80)) return -1;
    int map = (lcdc & 8) ? 0x1C00 : 0x1800, rows = (lcdc & 0x20) && wy < 144 ? wy / 8 : 18;
    if (rows > 18) rows = 18;
    static uint16_t keys[400]; static uint8_t cnt[400]; int nk = 0, best = -1, bestN = 0, bmx = 0, bmy = 0;
    for (int r = 0; r < rows; r++) for (int col = 0; col < 20; col++) {
        int mx = ((scx >> 3) + col) & 31, my = ((scy >> 3) + r) & 31, t = in->vram(0, map + my * 32 + mx), at = in->vram(1, map + my * 32 + mx);
        if (coverage(in, (at >> 3) & 1, tileOff(lcdc, t)) < 24) continue;
        int k = (at & 0x0F) << 8 | t, i;
        for (i = 0; i < nk && keys[i] != k; i++) {}
        if (i == nk) { keys[nk] = k; cnt[nk] = 0; nk++; }
        if (++cnt[i] > bestN) { bestN = cnt[i]; best = k; bmx = mx & ~1; bmy = my & ~1; }
    }
    if (best < 0 || bestN < 4) return -1;
    int key = best * 64 + (area & 63);
    if (key == thKey) return key;
    const uint8_t *pal = in->cgbpal(0); int p0 = -1;
    for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
        int mx = (bmx + dx) & 31, my = (bmy + dy) & 31, t = in->vram(0, map + my * 32 + mx), at = in->vram(1, map + my * 32 + mx);
        int bank = (at >> 3) & 1, off = tileOff(lcdc, t), p = at & 7;
        if (p0 < 0) p0 = p;
        for (int y = 0; y < 8; y++) {
            int ry = (at & 0x40) ? 7 - y : y, lo = in->vram(bank, off + ry * 2), hi = in->vram(bank, off + ry * 2 + 1);
            for (int x = 0; x < 8; x++) {
                int rx = (at & 0x20) ? 7 - x : x, q = ((lo >> (7 - rx)) & 1) | (((hi >> (7 - rx)) & 1) << 1);
                thBlock[(dy * 8 + y) * 16 + dx * 8 + x] = rgb565(pal, p, q);
            }
        }
    }
    thAccent = thShade = rgb565(pal, p0, 0);
    for (int i = 1; i < 4; i++) { uint16_t c = rgb565(pal, p0, i); if (lum565(c) > lum565(thAccent)) thAccent = c; if (lum565(c) < lum565(thShade)) thShade = c; }
    return key;
}
static int bordTick;
static uint32_t lastHudSig = 1;
int link_border(uint16_t *buf, const LinkIn *in) {
    int st = in->peek(0xC39D) & 255, map = in->peek(0xCBFD) & 255, night = (in->peek(0xC3EA) & 0x80) != 0;
    int inGame = st == 2 || st == 5;
    /* one theme per map section: the region ($C9FA:$C9F9), the map ($CBFD) and day or night. It's picked once the
       section has been on screen ~1 s (not mid-fade) and kept until it changes, so it doesn't follow the scrolling. */
    static int regKey = -1, regStable, locked;
    int reg = (in->peek(0xC9FA) & 255) << 17 | (in->peek(0xC9F9) & 255) << 9 | map << 1 | night, themeChanged = 0;
    if (reg != regKey) { regKey = reg; regStable = 0; locked = 0; }
    else if (regStable < 6) regStable++;                      /* link_border runs 6 times a second */
    if (inGame && !locked && regStable >= 6) {
        int old = thKey; thKey = -2;
        int key = buildTheme(in, map ^ (night << 5));
        if (key >= 0) { thKey = key; locked = 1; themeChanged = 1; } else thKey = old;
    }
    /* the side panels: what's still to find in this room (left), the place and the clock (right). Hearts, gems and
       lives aren't repeated: the game's own status bar shows them. */
    St s; readSt(in, &s);
    int left = (((s.time & 0x8000) ? 0x10000 : 0x8000) - s.time) / 4 / 60, hl[4], ht[4], known = map_left(hl, ht);
    uint32_t sig = 2166136261u;
    #define MIX(v) sig = (sig ^ (uint32_t)(v)) * 16777619u
    MIX(inGame); MIX(left); MIX(night); MIX(thKey); MIX(known);
    for (int k = 0; k < 4; k++) { MIX(hl[k]); MIX(ht[k]); MIX(iconHave[k == 1 ? ICON_FLY : k == 2 ? ICON_SQUID : ICON_TAL]); }
    for (const char *a = s.area; *a; a++) MIX(*a);
    #undef MIX
    if (!themeChanged && sig == lastHudSig && bordTick++) return 0;
    lastHudSig = sig;
    F = buf; FW = TOP_W; FH = TOP_H;
    /* the tile, tiled across the screen and darkened (as Android's 0xA0 black wash) */
    for (int y = 0; y < TOP_H; y++) for (int x = 0; x < TOP_W; x++) {
        uint16_t c = thKey >= 0 ? thBlock[(y & 15) * 16 + (x & 15)] : 0;
        buf[y * TOP_W + x] = (uint16_t)((((c >> 11) * 3 / 8) << 11) | ((((c >> 5) & 63) * 3 / 8) << 5) | ((c & 31) * 3 / 8));
    }
    for (int i = 0; i < 4; i++) {                               /* the frame: shade, accent, black edge */
        uint16_t c = i == 0 ? thShade : i < 3 ? thAccent : 0;
        int d = 4 - i;
        for (int x = GX - d; x < GX + GW + d; x++) { buf[(GY - d) * TOP_W + x] = c; buf[(GY + GH + d - 1) * TOP_W + x] = c; }
        for (int y = GY - d; y < GY + GH + d; y++) { buf[y * TOP_W + GX - d] = c; buf[y * TOP_W + GX + GW + d - 1] = c; }
    }
    if (inGame && haveFont) {
        char b[24];
        /* left border (80 px): heart holders, fireflies, squids and talismans in this room, found / there */
        int lc = GX / 2, y = GY + 16;
        textC("IN THIS", lc, y, GOLD); textC("ROOM", lc, y + 10, GOLD);
        int rows = 0, all = 0, there = 0;
        for (int k = 0; k < 4; k++) { all += ht[k] - hl[k]; there += ht[k]; }
        if (!known) textC("...", lc, y + 30, GREY);
        else if (!there) { textC("NOTHING", lc, y + 30, GREY); textC("TO FIND", lc, y + 40, GREY); }
        else {
            for (int k = 0; k < 4; k++) {
                if (!ht[k]) continue;
                int ry = y + 28 + rows * 22, ix = 10, done = !hl[k];
                int dim = k == 1 && !night && hl[k];               /* fireflies only come out at night */
                int key = k == 1 ? ICON_FLY : k == 2 ? ICON_SQUID : k == 3 ? ICON_TAL : -1;
                if (key < 0 || !drawIcon(buf, key, ix, ry, dim)) {   /* the game's icon once captured, else drawn */
                    if (k == 0) heart(ix + 4, ry + 5, done ? 0 : 4);
                    else rect(ix + 4, ry + 4, 8, 8, k == 1 ? GOLD : k == 2 ? GEM : PURPLE);
                }
                snprintf(b, sizeof b, "%d/%d", ht[k] - hl[k], ht[k]);
                text(b, ix + 22, ry + 4, done ? GREEN : dim ? GREY : WHITE);
                rows++;
            }
            if (all == there) { textC("ALL", lc, y + 32 + rows * 22, GREEN); textC("FOUND", lc, y + 42 + rows * 22, GREEN); }
            else if (hl[1] && !night) { textC("FLIES", lc, y + 32 + rows * 22, GREY); textC("AT NIGHT", lc, y + 42 + rows * 22, GREY); }
        }
        /* right border: the place, and the time to dusk or dawn. 76 px between the frame and the edge, so lines of at
           most 8 letters (up to 3), with the long words split ("SCARE-" "CROW") */
        int rx = GX + GW + (TOP_W - GX - GW) / 2, ry = GY + 16, nl = 0;
        static const char *const SPLIT[][2] = { { "SHANTAE'S LIGHTHOUSE", "LIGHT- HOUSE" }, { "LIGHTHOUSE", "LIGHT- HOUSE" },
            { "SCARECROW", "SCARE- CROW" }, { "SPIDERWOOD", "SPIDER- WOOD" }, { "WATERFALL", "WATER- FALL" }, { "WASTELAND", "WASTE- LAND" } };
        char nm[48], wd[48], ln[3][12] = { "", "", "" };
        snprintf(nm, sizeof nm, "%s", s.area);
        for (size_t i = 0; i < sizeof SPLIT / sizeof SPLIT[0]; i++) {
            char *p = strstr(nm, SPLIT[i][0]);
            if (p && strlen(nm) - strlen(SPLIT[i][0]) + strlen(SPLIT[i][1]) < sizeof nm) {
                snprintf(wd, sizeof wd, "%.*s%s%s", (int)(p - nm), nm, SPLIT[i][1], p + strlen(SPLIT[i][0]));
                memcpy(nm, wd, sizeof nm);
            }
        }
        for (char *w = strtok(nm, " "); w && nl < 3; w = strtok(NULL, " ")) {
            if (ln[nl][0] && strlen(ln[nl]) + 1 + strlen(w) <= 8) { strcat(ln[nl], " "); strcat(ln[nl], w); continue; }
            if (ln[nl][0] && ++nl == 3) break;
            snprintf(ln[nl], sizeof ln[nl], "%.8s", w);
        }
        for (int i = 0; i < 3; i++) textC(ln[i], rx, ry + i * 10, GOLD);
        int lft = (((s.time & 0x8000) ? 0x10000 : 0x8000) - s.time) / 4, secs = lft / 60;
        textC(night ? "DAWN" : "DUSK", rx, ry + 38, night ? PURPLE : GOLD);
        snprintf(b, sizeof b, "%d:%02d", secs / 60, secs % 60); textC(b, rx, ry + 48, LGREY);
    }
    FW = LINK_W; FH = LINK_H;
    return 1;
}

/* ------------------------------------------------------------------ settings and stats (kept by the frontend)
 * Stats as link.js trackStats: counted while the game runs, from the game's own frame counter $C377. A jump of more
 * than 600 frames means a state or save was loaded, and that step isn't counted. */
static struct {
    int32_t borders, progView;
    int32_t t, gemsIn, gemsOut, items, hearts, deaths, dances, nights;
    int64_t since;
    uint8_t keys[8];                                            /* 0.10: KEY3_* + 1 per ACT_*, 0 = the default */
    uint8_t old3ds;                                             /* 0.11: OLD 3DS SPEED */
    uint8_t frameskip;                                          /* 0.12: FRAME SKIP */
} prefs = { 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, { 0 }, 0, 0 };
static int prefsDirty;
static struct { int ok, frames, gems, hearts, night; uint8_t items[12]; } pv;
static void trackStats(const LinkIn *in) {
    St s; readSt(in, &s);
    int night = (s.time & 0x8000) != 0;
    if (!prefs.since) { prefs.since = (int64_t)time(NULL); prefsDirty = 1; }
    if (s.state != 2 && s.state != 5) { pv.ok = 0; return; }
    if (pv.ok) {
        int df = (s.frames - pv.frames) & 0xFFFF;
        if (df && df <= 600) {
            prefs.t += df;
            int dg = s.gems - pv.gems; if (dg > 0) prefs.gemsIn += dg; else prefs.gemsOut -= dg;
            for (int i = 0; i < 12; i++) if (s.items[i] < pv.items[i]) prefs.items += pv.items[i] - s.items[i];
            if (s.hearts < pv.hearts) prefs.hearts += pv.hearts - s.hearts;
            if (pv.hearts > 0 && s.hearts == 0) prefs.deaths++;
            if (!pv.night && night) prefs.nights++;
            prefsDirty = 1;
        }
    }
    pv.ok = 1; pv.frames = s.frames; pv.gems = s.gems; pv.hearts = s.hearts; pv.night = night; memcpy(pv.items, s.items, 12);
}
size_t link_prefs_save(uint8_t *buf, size_t cap) {
    if (!prefsDirty || cap < 4 + sizeof prefs) return 0;
    memcpy(buf, "SDP1", 4); memcpy(buf + 4, &prefs, sizeof prefs);
    prefsDirty = 0;
    return 4 + sizeof prefs;
}
void link_prefs_load(const uint8_t *buf, size_t n) {
    size_t old = (size_t)((const char *)prefs.keys - (const char *)&prefs);   /* 0.9's file stops before the keys */
    if (n >= 4 + old && n <= 4 + sizeof prefs && !memcmp(buf, "SDP1", 4)) memcpy(&prefs, buf + 4, n - 4);
    if (prefs.progView < 0 || prefs.progView > 2) prefs.progView = 0;
    for (int a = 0; a < 8; a++) if (prefs.keys[a] > KEY3_N) prefs.keys[a] = 0;
    if (prefs.old3ds > 1) prefs.old3ds = 0;
    if (prefs.frameskip > 1) prefs.frameskip = 0;
}
/* the buttons: defaults A, B, START, SELECT and R for fast-forward */
static const uint8_t KEY_DEF[ACT_N] = { KEY3_A, KEY3_B, KEY3_START, KEY3_SELECT, KEY3_R };
int link_key(int act) { return act < 0 || act >= ACT_N ? KEY3_A : prefs.keys[act] ? prefs.keys[act] - 1 : KEY_DEF[act]; }
int link_borders(int set) {
    if (set >= 0 && set != prefs.borders) { prefs.borders = set; prefsDirty = 1; lastHudSig = 1; bordTick = 0; }
    return prefs.borders;
}
int link_old3ds(int set) {
    if (set >= 0 && set != prefs.old3ds) { prefs.old3ds = (uint8_t)set; prefsDirty = 1; }
    return prefs.old3ds;
}
int link_frameskip(int set) {
    if (set >= 0 && set != prefs.frameskip) { prefs.frameskip = (uint8_t)set; prefsDirty = 1; }
    return prefs.frameskip;
}

static long workN;
void link_work(const LinkIn *in) {
    if (++workN % 15 == 0 && in->vram && in->cgbpal) captureIcons(in);
    if (workN % 10 == 0) trackStats(in);
    map_work(in);
}

/* ------------------------------------------------------------------ pages */
enum { P_SHANTAE, P_MAP, P_PROGRESS };
static int page;
static int dancePopT = -1, lastSel, tick;
static uint8_t lastSig[72];
/* drag on the Link screen (dx, dy in Link pixels): pans the map */
static int mcard, signScroll;
void link_drag(int dx, int dy, const LinkIn *in) {
    (void)in;
    if (page != P_MAP) return;
    if (mcard == 5) signScroll -= dy;                           /* C_SIGNS: the signpost list scrolls */
    else map_pan(dx, dy);
}

static void frame(int x, int y, int w, int h, const char *title) {
    rect(x, y, w, h, PANEL);
    rect(x, y, w, 1, GOLD); rect(x, y + h - 1, w, 1, GOLD); rect(x, y, 1, h, GOLD); rect(x + w - 1, y, 1, h, GOLD);
    if (title) { rect(x + 8, y - 4, 8 * (int)strlen(title) + 8, 9, BG); text(title, x + 12, y - 4, GOLD); }
}
static void mmss(char *b, size_t n, int frames) { int s = frames / 60; snprintf(b, n, "%d:%02d", s / 60, s % 60); }

static void pageShantae(const St *s) {
    char b[48];
    /* hearts (4 units each) and gems */
    int full = s->maxHearts / 4;
    for (int i = 0; i < full && i < 14; i++) { int q = s->hearts - i * 4; heart(14 + i * 9, 34, q < 0 ? 0 : q > 4 ? 4 : q); }
    snprintf(b, sizeof b, "%d", s->gems); textR(b, 308, 33, WHITE); text("GEMS", 308 - 8 * ((int)strlen(b) + 5), 33, GEM);
    /* items: 3 rows of 4, count beside; the equipped one framed, named below with what it does */
    frame(6, 50, 308, 106, "ITEMS");
    for (int i = 0; i < 12; i++) {
        int x = 12 + (i & 3) * 76, y = 58 + (i >> 2) * 22;
        if (i == s->equipped && s->items[i]) rect(x - 2, y - 4, 74, 18, SEL);
        if (!(s->items[i] && drawIcon(F, ICON_ITEM + i, x, y - 3, 0)))    /* the game's icon once captured, else the name */
            text(ITEMS[i], x, y, s->items[i] ? INK : GREY);
        snprintf(b, sizeof b, "%d", s->items[i]); textR(b, x + 70, y, s->items[i] ? WHITE : GREY);
    }
    if (s->equipped < 12 && s->items[s->equipped]) { text(ITEMS[s->equipped], 12, 128, GOLD); text(ITEM_NOTE[s->equipped], 12, 140, LGREY); }
    else text("TAP AN ITEM TO EQUIP IT", 12, 134, GREY);
    /* stones, talismans, gear, dances */
    frame(6, 166, 308, 50, "COLLECTION");
    int haveIcons = 0;
    for (int i = 0; i < 4; i++) haveIcons += iconHave[ICON_STONE + i] + iconHave[ICON_TAL + i];
    if (haveIcons) {                                            /* stones and talismans as one row of the game's icons */
        int st = s->flags[0x1D], ta = s->flags[0x1E];
        for (int i = 0; i < 4; i++) {
            if (st & (0x10 << i)) drawIcon(F, ICON_STONE + i, 12 + i * 18, 170, 0);
            if (ta & (0x10 << i)) drawIcon(F, ICON_TAL + i, 90 + i * 18, 170, 0);
        }
        snprintf(b, sizeof b, "%d/4 %d/4", s->stones, s->tals); textR(b, 308, 174, LGREY);
    } else { snprintf(b, sizeof b, "STONES %d/4  TALISMANS %d/4", s->stones, s->tals); text(b, 12, 174, LGREY); }
    static const char *GN[] = { "BOOT", "SASH", "CUFF", "TIARA" };
    for (int i = 0; i < 4; i++) text(GN[i], 12 + i * 52, 188, s->gear[i] ? GREEN : GREY);
    int nd = 0; for (int i = 0; i < 11; i++) nd += s->dances[i];
    snprintf(b, sizeof b, "DANCES %d", nd); textR(b, 308, 188, LGREY);
    int toHand = s->squids; snprintf(b, sizeof b, "SQUIDS TO HAND IN %d", toHand); text(b, 12, 202, toHand ? PURPLE : GREY);
}

/* the 100% checklist (link.js completion): PROGRESS > ITEMS and the ending card */
typedef struct { const char *name; int got, of; } Row;
static int completion(const St *s, Row R[6]) {
    int holders = (s->maxHearts - 12) / 4; if (holders < 0) holders = 0; if (holders > 7) holders = 7;
    int warps = 0; for (int k = 5; k <= 9; k++) warps += s->dances[k];
    int squids = s->squidGot; if (warps * 4 + s->squids > squids) squids = warps * 4 + s->squids; if (squids > 20) squids = 20;
    int gear = 0; for (int i = 0; i < 4; i++) gear += !!s->gear[i];
    int dances = 0; for (int i = 0; i < 11; i++) dances += s->dances[i];
    Row r[6] = { {"HEART HOLDERS", holders, 7}, {"FIREFLIES", s->fireflies > 12 ? 12 : s->fireflies, 12},
        {"WARP SQUIDS", squids, 20}, {"TALISMANS", s->tals, 4}, {"FIGHTER GEAR", gear, 4}, {"DANCES", dances, 11} };
    int done = 0, total = 0; for (int i = 0; i < 6; i++) { R[i] = r[i]; done += r[i].got; total += r[i].of; }
    return done * 100 / total;
}
static void hms(char *b, size_t n, long frames) { long s = frames * 10000 / 597275; snprintf(b, n, "%ld:%02ld:%02ld", s / 3600, s / 60 % 60, s % 60); }

enum { V_ITEMS, V_STORY, V_STATS };
static int storyOpen, statArm;
static void viewItems(const St *s) {
    char b[40]; Row R[6];
    int pc = completion(s, R), done = 0, total = 0;
    for (int i = 0; i < 6; i++) { done += R[i].got; total += R[i].of; }
    frame(6, 44, 308, 174, "COLLECTION");
    snprintf(b, sizeof b, "COMPLETION %d%%", pc); text(b, 14, 54, GOLD);
    rect(14, 66, 292, 4, SEL); rect(14, 66, 292 * done / total, 4, GOLD);
    for (int i = 0; i < 6; i++) {
        int y = 80 + i * 22, ok = R[i].got >= R[i].of;
        rect(12, y - 3, 296, 14, PANEL + (i & 1));
        text(R[i].name, 16, y, ok ? GREEN : INK);
        snprintf(b, sizeof b, "%d/%d", R[i].got, R[i].of); textR(b, 304, y, ok ? GREEN : WHITE);
    }
}
/* the story hint (link.js STORY), hidden until tapped: the next step from the stones and transformation dances */
static const char *STORY[][2] = {
    { "THE STEAM ENGINE", "RISKY STOLE SCUTTLE TOWN'S STEAM ENGINE. HEAD EAST THROUGH SCARECROW FIELD AND SPIDERWOOD FOREST TO WATER TOWN, THEN INTO THE DRIBBLE FOUNTAIN LABYRINTH." },
    { "DRIBBLE FOUNTAIN", "YOU HAVE THE MONKEY DANCE: CLIMB WALLS WITH IT IN DRIBBLE FOUNTAIN, FIND THE BOSS AND WIN THE DRIBBLE STONE." },
    { "THE GOLEM STONE", "NEXT STONE: HEAD FOR OASIS TOWN IN THE DESERT, THEN FIND THE GOLEM MINE." },
    { "GOLEM MINE", "YOU HAVE THE ELEPHANT DANCE: SMASH THROUGH BLOCKS IN THE GOLEM MINE AND BEAT ITS BOSS FOR THE GOLEM STONE." },
    { "THE ZOMBIE CARAVAN", "FIND THE ZOMBIE CARAVAN. IT ONLY APPEARS AT NIGHT. ROTTYTOPS CAN TAKE YOU TO THE CACKLE MOUND LABYRINTH." },
    { "CACKLE MOUND", "YOU HAVE THE SPIDER DANCE: CLIMB WEBS AND WALLS IN CACKLE MOUND AND BEAT ITS BOSS FOR THE SIMMER STONE." },
    { "THE TWINKLE STONE", "LAST STONE: THE TWINKLE PALACE NEAR THE TOP OF MOUNT POINTY. BANDIT TOWN IS ON THE WAY." },
    { "TWINKLE PALACE", "YOU HAVE THE HARPY DANCE: FLY THROUGH TWINKLE PALACE AND BEAT ITS BOSS FOR THE TWINKLE STONE." },
    { "RISKY BOOTS", "ALL FOUR STONES ARE YOURS. TAKE THE FIGHT TO RISKY BOOTS AND HER TINKERTANK." } };
static int storyStep(const St *s) {
    for (int k = 0; k < 4; k++) if (!(s->flags[0x1D] & (0x10 << k))) return k * 2 + (s->dances[k] ? 1 : 0);
    return 8;
}
static void viewStory(const St *s) {
    char b[48];
    int step = storyStep(s);
    frame(6, 44, 308, 174, "STORY");
    text("STONES", 14, 56, LGREY);
    for (int i = 0; i < 4; i++) {
        int have = !!(s->flags[0x1D] & (0x10 << i)), x = 70 + i * 22;
        if (!(have && drawIcon(F, ICON_STONE + i, x, 52, 0))) rect(x + 4, 56, 8, 8, have ? GEM : SEL);
    }
    snprintf(b, sizeof b, "STEP %d OF 9", step + 1); text(b, 14, 76, GOLD);
    rect(14, 88, 292, 3, SEL); rect(14, 88, 292 * step / 8, 3, GOLD);
    if (!storyOpen) {
        rect(14, 100, 292, 32, PANEL); rect(14, 100, 292, 1, GOLD); rect(14, 131, 292, 1, GOLD); rect(14, 100, 1, 32, GOLD); rect(305, 100, 1, 32, GOLD);
        textC("TAP TO SHOW A HINT", 160, 106, WHITE); textC("(SPOILS THE NEXT STEP)", 160, 118, GREY);
        return;
    }
    text(STORY[step][0], 14, 100, INK);
    /* the hint, word-wrapped to 36 letters a line */
    const char *p = STORY[step][1]; int y = 114;
    while (*p && y < 196) {
        int n = (int)strlen(p), cut = n;
        if (n > 36) { cut = 36; while (cut > 0 && p[cut] != ' ') cut--; if (!cut) cut = 36; }
        snprintf(b, sizeof b, "%.*s", cut, p); text(b, 14, y, LGREY);
        p += cut; while (*p == ' ') p++;
        y += 11;
    }
    text("TAP TO HIDE", 14, 204, GREY);
}
static void viewStats(void) {
    char v[8][24];
    hms(v[0], sizeof v[0], prefs.t);
    snprintf(v[1], 24, "%ld", (long)prefs.gemsIn); snprintf(v[2], 24, "%ld", (long)prefs.gemsOut);
    snprintf(v[3], 24, "%ld", (long)prefs.items);
    if (prefs.hearts % 4) snprintf(v[4], 24, "%ld.%02ld", (long)prefs.hearts / 4, (long)prefs.hearts % 4 * 25); else snprintf(v[4], 24, "%ld", (long)prefs.hearts / 4);
    snprintf(v[5], 24, "%ld", (long)prefs.deaths); snprintf(v[6], 24, "%ld", (long)prefs.dances); snprintf(v[7], 24, "%ld", (long)prefs.nights);
    static const char *L[8] = { "PLAY TIME", "GEMS EARNED", "GEMS SPENT", "ITEMS USED", "HEARTS LOST", "TIMES DOWN", "DANCES", "NIGHTS" };
    frame(6, 44, 308, 174, "STATS");
    for (int i = 0; i < 8; i++) {
        int y = 56 + i * 17;
        rect(12, y - 4, 296, 15, PANEL + (i & 1));
        text(L[i], 16, y, LGREY); textR(v[i], 304, y, WHITE);
    }
    char b[24]; time_t t = (time_t)prefs.since; struct tm *d = gmtime(&t);
    if (d) { snprintf(b, sizeof b, "SINCE %02d/%02d/%02d", d->tm_mon + 1, d->tm_mday, d->tm_year % 100); text(b, 14, 199, GREY); }
    int armed = statArm > tick;
    rect(242, 194, 64, 18, armed ? RED : PANEL); rect(242, 194, 64, 1, GOLD); rect(242, 211, 64, 1, GOLD);
    textC(armed ? "SURE?" : "RESET", 274, 199, WHITE);
}
static void pageProgress(const St *s) {
    static const char *V[3] = { "ITEMS", "STORY", "STATS" };
    for (int i = 0; i < 3; i++) {
        int on = prefs.progView == i, x = 6 + i * 103;
        rect(x, 23, 102, 13, on ? SEL : PANEL);
        if (on) rect(x, 35, 102, 1, GOLD);
        textC(V[i], x + 51, 26, on ? WHITE : LGREY);
    }
    if (prefs.progView == V_STORY) viewStory(s); else if (prefs.progView == V_STATS) viewStats(); else viewItems(s);
}

static void dancePop(const St *s) {
    frame(20, 40, 280, 170, "DANCES");
    for (int i = 0; i < 11; i++) {
        int y = 50 + i * 14, on = s->dances[i];
        text(DANCES[i][0], 30, y, on ? INK : GREY);
        /* inputs as arrows and letters: the font has the letters; U D L R shown as letters too in this alpha */
        textR(DANCES[i][1], 290, y, on ? WHITE : GREY);
    }
}

/* the gear in the top right corner (opens the menu), drawn here */
static const char *GEAR_PX[] = { ".....###.....", "..#..###..#..", ".###########.", "..#########..", "..###...###..",
    "####.....####", "####.....####", "####.....####", "..###...###..", "..#########..", ".###########.", "..#..###..#..",
    ".....###....." };
static void gear(int x, int y, int c) {
    for (int j = 0; j < 13; j++) for (int i = 0; i < 13; i++) if (GEAR_PX[j][i] == '#') rect(x + i, y + j, 1, 1, c);
}
#define GEAR_X 303
#define GEAR_Y 3

/* ------------------------------------------------------------------ ending card (link.js endingCard)
 * While the credits roll (and on THE END after them) node 0 or 1 runs the credits code: bank $1C, PC $7040 and up
 * (SHANTAE-RAM.md, "Defeat and ending"). The card shows the date and time, play time and collection, and a box to sign
 * with the stylus. SAVE hands the signed card to the frontend (link_hall_take), which appends it to a file. */
#define SIG_X 8
#define SIG_Y 112
#define SIG_W 304
#define SIG_H 94
static struct { int on, saved, pc, penX, penY; long frames; int32_t deaths; char date[12], clock[8]; Row rows[6]; } card;
static uint8_t sigPx[SIG_W * SIG_H], hallBuf[64 + SIG_W * SIG_H / 8];
static size_t hallLen;
static int inCredits(const LinkIn *in, const St *s) {
    if (s->state == 2 || s->state == 5) return 0;
    for (int i = 0; i < 2; i++) {
        int o = i * 0x7E + 2, pc = in->wram(3, o) | in->wram(3, o + 1) << 8, bank = in->wram(3, o + 2);
        if (bank == 0x1C && pc >= 0x7040) return 1;
    }
    return 0;
}
static void cardStart(const St *s) {
    memset(&card, 0, sizeof card); memset(sigPx, 0, sizeof sigPx);
    card.on = 1; card.penX = -1;
    time_t t = time(NULL); struct tm *d = gmtime(&t);       /* the 3DS clock is local time */
    if (d) { snprintf(card.date, sizeof card.date, "%04d-%02d-%02d", d->tm_year + 1900, d->tm_mon + 1, d->tm_mday);
             snprintf(card.clock, sizeof card.clock, "%02d:%02d", d->tm_hour, d->tm_min); }
    card.pc = completion(s, card.rows); card.frames = prefs.t; card.deaths = prefs.deaths;
    prefsDirty = 1;
}
static void endingCard(void) {
    char b[40];
    text("QUEST COMPLETE", 6, 6, GOLD); gear(GEAR_X, GEAR_Y, LGREY);
    rect(0, 18, LINK_W, 1, SEL);
    snprintf(b, sizeof b, "%s  %s", card.date, card.clock); textC(b, 160, 25, WHITE);
    struct { const char *l; char v[16]; int c; } R[10];
    int n = 0;
    R[n].l = "PLAY TIME"; hms(R[n].v, 16, card.frames); R[n++].c = WHITE;
    R[n].l = "COMPLETION"; snprintf(R[n].v, 16, "%d%%", card.pc); R[n].c = card.pc >= 100 ? GREEN : GOLD; n++;
    static const char *SHORT[6] = { "HEARTS", "FIREFLIES", "WARP SQUIDS", "TALISMANS", "GEAR", "DANCES" };
    for (int i = 0; i < 6; i++) { R[n].l = SHORT[i]; snprintf(R[n].v, 16, "%d/%d", card.rows[i].got, card.rows[i].of);
                                  R[n++].c = card.rows[i].got >= card.rows[i].of ? GREEN : WHITE; }
    R[n].l = "TIMES DOWN"; snprintf(R[n].v, 16, "%ld", (long)card.deaths); R[n++].c = WHITE;
    for (int i = 0; i < n; i++) {
        int col = i / 5, row = i % 5, x0 = 8 + col * 156;
        text(R[i].l, x0, 40 + row * 11, LGREY); textR(R[i].v, x0 + 148, 40 + row * 11, R[i].c);
    }
    text(card.saved ? "SIGNED AND SAVED" : "SIGN YOUR NAME", SIG_X, 100, card.saved ? GREEN : INK);
    rect(SIG_X - 1, SIG_Y - 1, SIG_W + 2, SIG_H + 2, PANEL); rect(SIG_X, SIG_Y, SIG_W, SIG_H, BG);
    rect(SIG_X + 8, SIG_Y + SIG_H - 9, SIG_W - 16, 1, SEL);                /* the signing line */
    for (int j = 0; j < SIG_H; j++) for (int i = 0; i < SIG_W; i++) if (sigPx[j * SIG_W + i]) F[(SIG_Y + j) * LINK_W + SIG_X + i] = COL[WHITE];
    if (!card.saved) {
        rect(204, 212, 48, 18, PANEL); textC("CLEAR", 228, 217, LGREY);
        rect(258, 212, 54, 18, SEL); textC("SAVE", 285, 217, WHITE);
    }
}
static void sigDot(int x, int y) {                              /* a 2 px pen */
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
        int px = x - SIG_X + i, py = y - SIG_Y + j;
        if (px >= 0 && px < SIG_W && py >= 0 && py < SIG_H) sigPx[py * SIG_W + px] = 1;
    }
}
void link_pen(int x, int y) {
    if (!card.on || card.saved) return;
    if (x < 0 || x < SIG_X || x >= SIG_X + SIG_W || y < SIG_Y || y >= SIG_Y + SIG_H) { card.penX = -1; return; }
    if (card.penX < 0) sigDot(x, y);
    else {                                                      /* a line from the last point (Bresenham) */
        int x0 = card.penX, y0 = card.penY, dx = x > x0 ? x - x0 : x0 - x, dy = -(y > y0 ? y - y0 : y0 - y);
        int sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1, err = dx + dy;
        for (int k = 0; k < 1000; k++) {
            sigDot(x0, y0);
            if (x0 == x && y0 == y) break;
            int e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
    card.penX = x; card.penY = y;
}
/* the signed card, once, for the frontend to append to its file: "SDH1", date, clock, play frames, completion, times
 * down, then the signature as SIG_W x SIG_H bits */
size_t link_hall_take(uint8_t *buf, size_t cap) {
    size_t n = hallLen;
    if (!n || cap < n) return 0;
    memcpy(buf, hallBuf, n); hallLen = 0;
    return n;
}
static void cardSave(void) {
    int ink = 0; for (size_t i = 0; i < sizeof sigPx; i++) ink |= sigPx[i];
    if (!ink) return;
    uint8_t *p = hallBuf;
    memcpy(p, "SDH1", 4); memcpy(p + 4, card.date, 12); memcpy(p + 16, card.clock, 8);
    int32_t v[5] = { (int32_t)card.frames, card.pc, card.deaths, SIG_W, SIG_H }; memcpy(p + 24, v, sizeof v);
    p += 24 + sizeof v;
    memset(p, 0, SIG_W * SIG_H / 8);
    for (int i = 0; i < SIG_W * SIG_H; i++) if (sigPx[i]) p[i >> 3] |= 0x80 >> (i & 7);
    hallLen = (size_t)(p - hallBuf) + SIG_W * SIG_H / 8;
    card.saved = 1;
}

/* ------------------------------------------------------------------ boss bars (link.js readBoss, 0.20)
 * HP lives in the boss's object node (WRAM bank 3, nodes every $7E from $D000). Risky's ship fight (map $03): the
 * Tinker ship's node at $D276, HP at +$64; Risky's node at $D0FC, HP at +$63. A bar shows only while that node runs the
 * boss's script (bank $1A, a PC in its range). Risky waits at full HP (64) until her turn. */
static const struct { const char *name; uint16_t node; uint8_t hp, bank; uint16_t lo, hi; uint8_t full, hidden; } BOSS[] = {
    { "TINKER SHIP", 0x276, 0x64, 0x1A, 0x5300, 0x5600, 10, 0 }, { "RISKY BOOTS", 0x0FC, 0x63, 0x1A, 0x4D00, 0x5000, 0, 64 } };
#define NBOSS 2
static int bossMax[NBOSS], bossHp[NBOSS];                       /* bossHp 0: no bar */
static void readBoss(const LinkIn *in, const St *s) {
    for (int i = 0; i < NBOSS; i++) {
        bossHp[i] = 0;
        if (s->map != 3) { bossMax[i] = 0; continue; }
        if (s->state != 2 || !in->wram) continue;
        int o = BOSS[i].node, pc = in->wram(3, o + 2) | in->wram(3, o + 3) << 8, bank = in->wram(3, o + 4), hp = in->wram(3, o + BOSS[i].hp) & 255;
        if (bank != BOSS[i].bank || pc < BOSS[i].lo || pc >= BOSS[i].hi) continue;
        if (bossMax[i] < BOSS[i].full) bossMax[i] = BOSS[i].full;
        if (hp > bossMax[i]) bossMax[i] = hp;
        if (BOSS[i].hidden && hp == BOSS[i].hidden && bossMax[i] == hp) continue;
        bossHp[i] = hp;
    }
}
static void drawBoss(void) {
    int n = 0; for (int i = 0; i < NBOSS; i++) n += bossHp[i] > 0;
    int w = 200, x = LINK_W - w - 6, y = 218 - n * 22;
    for (int i = 0; i < NBOSS; i++) {
        if (bossHp[i] <= 0) continue;
        char b[16]; int hp = bossHp[i], mx = bossMax[i] > 0 ? bossMax[i] : 1;
        rect(x, y, w, 20, BG); rect(x, y, w, 1, RED); rect(x, y + 19, w, 1, RED); rect(x, y, 1, 20, RED); rect(x + w - 1, y, 1, 20, RED);
        text(BOSS[i].name, x + 4, y + 3, WHITE);
        snprintf(b, sizeof b, "%d/%d", hp, mx); textR(b, x + w - 4, y + 3, LGREY);
        rect(x + 4, y + 13, w - 8, 4, HEART0);
        rect(x + 4, y + 13, (w - 8) * (hp > mx ? mx : hp) / mx, 4, hp * 4 <= mx ? RED : HEART);
        y += 22;
    }
}

/* ------------------------------------------------------------------ map cards (map.js 0.12-0.25)
 * Buttons down the map's left edge with an icon and a count: WAYS (where the room leads), DOORS (a town's doors, with the
 * names from the ROM), ITEMS (what's here to collect), ROOMS (all the rooms of the region) and SIGNS (the signposts).
 * Tapping one opens a card over the map; tapping the card or the button again closes it. The NIGHT card opens from the
 * dusk/dawn timer in the title bar. */
enum { C_NONE, C_WAYS, C_DOORS, C_ITEMS, C_ROOMS, C_SIGNS, C_NIGHT };   /* C_SIGNS is 5 in link_drag */
static int signMax;
static struct { int x, y, w, h, key; } side[6]; static int nside;
static int cardX, cardY, cardW, cardH;                          /* the open card's box (cardW 0: none) */
static void side2(int c, int x, int y, int a, int b, int w, int h) { rect(x + a * 2, y + b * 2, w * 2, h * 2, c); }
static void sideIcon(int k, int x, int y, int on) {            /* 8x8 drawn at 2x, as map.js sideIcon (no game art) */
    if (k == C_WAYS) { side2(TEAL, x, y, 0, 3, 5, 2); side2(TEAL, x, y, 4, 1, 1, 6); side2(TEAL, x, y, 5, 2, 1, 4); side2(TEAL, x, y, 6, 3, 1, 2); }
    else if (k == C_DOORS) { side2(GOLD, x, y, 1, 0, 6, 8); side2(DPURPLE, x, y, 2, 1, 4, 7); side2(GOLD, x, y, 4, 4, 1, 1); }
    else if (k == C_ITEMS) { for (int j = 0; j < 6; j++) for (int i = 0; i < 7; i++) if (HEART_PX[j][i] == '#') side2(HEART, x, y, i, j + 1, 1, 1); }
    else if (k == C_ROOMS) { side2(LGREY, x, y, 0, 0, 3, 3); side2(LGREY, x, y, 4, 0, 4, 3); side2(GOLD, x, y, 0, 4, 4, 4); side2(LGREY, x, y, 5, 4, 3, 4); }
    else if (k == C_SIGNS) { side2(RGB(160, 112, 64), x, y, 3, 3, 2, 5); side2(on ? GOLD : INK, x, y, 0, 0, 8, 4); side2(DPURPLE, x, y, 1, 1, 6, 1); }
}
/* the landmark tags on the map (linkmap.c): 0 plain, 1 her door, 2 a way out, 3 gold */
static void mapTag(uint16_t *fb, const char *s, int x, int y, int style) {
    (void)fb;
    int w = 8 * (int)strlen(s);
    rect(x - 2, y - 2, w + 4, 12, style == 1 ? GOLD : BLACK);
    text(s, x, y, style == 1 ? BLACK : style == 2 ? TEAL : style == 3 ? GOLD : WHITE);
}
/* left / right arrows, drawn here: the game's font has other symbols at '<' and '>' */
static void arrow(int x, int y, int right, int c) {
    static const char *A[7] = { "...#...", "..##...", ".######", "#######", ".######", "..##...", "...#..." };
    for (int j = 0; j < 7; j++) for (int i = 0; i < 7; i++) if (A[j][i] == '#') rect(x + (right ? 6 - i : i), y + j, 1, 1, c);
}
static void textArrows(const char *s, int x, int y, int c) {   /* text, with '<' and '>' as arrows */
    for (; *s; s++, x += 8) { if (*s == '<' || *s == '>') arrow(x, y, *s == '>', c); else if (*s > ' ') glyph(*s, x, y, c); }
}
typedef struct { char a[36]; int ca; char b[40]; int cb; char r[16]; int cr; int hi; } CRow;
static void cut(char *d, size_t cap, const char *s, int n) {
    if ((int)strlen(s) > n && n > 1) snprintf(d, cap, "%.*s.", n - 1, s); else snprintf(d, cap, "%s", s);
}
static int townDoorList(int k, int *out) {                      /* a town's door numbers: its buildings and the gates */
    int n = 0;
    for (int d = 1; d < 8; d++) if (TOWN[k].door[d][0] || d == TOWN[k].gate) out[n++] = d;
    return n;
}
static void mapCards(const LinkIn *in, const St *s) {
    int tb = rd(in, 0xC9FA), th = rd(in, 0xC9F9);
    Place pl = worldRoom(tb, th, rd16(in, 0xC9E9), rd16(in, 0xC9EC));
    Way ways[12]; int nw = worldLinks(&pl, ways);
    if (map_has_genie()) addWay(ways, &nw, "G", "GUARDIAN GENIE");
    int hl[4], ht[4], known = map_left(hl, ht), left = 0, total = 0;
    for (int k = 0; k < 4; k++) { left += hl[k]; total += ht[k]; }
    int town = pl.kind == RK_TOWN || pl.kind == RK_BUILDING ? pl.town : -1, doors[8], nd = town >= 0 ? townDoorList(town, doors) : 0;
    int nrooms = map_rooms();
    loadSigns(in);
    /* the side buttons */
    struct { int key; char n[4]; } bs[6]; int nb = 0;
    if (nw) { bs[nb].key = C_WAYS; snprintf(bs[nb++].n, 4, "%d", nw); }
    if (nd) { bs[nb].key = C_DOORS; snprintf(bs[nb++].n, 4, "%d", nd); }
    if (known && total) { bs[nb].key = C_ITEMS; snprintf(bs[nb++].n, 4, left ? "%d" : "OK", left); }
    if (nrooms) { bs[nb].key = C_ROOMS; snprintf(bs[nb++].n, 4, "%d", nrooms); }
    if (nsigns > 0) { bs[nb].key = C_SIGNS; bs[nb++].n[0] = 0; }
    int y = 23; nside = 0;
    for (int i = 0; i < nb; i++) {
        int h = bs[i].n[0] ? 32 : 22, on = mcard == bs[i].key;
        rect(1, y, 34, h, on ? SEL : BG);
        rect(1, y, 34, 1, on ? GOLD : GREY); rect(1, y + h - 1, 34, 1, on ? GOLD : GREY); rect(1, y, 1, h, on ? GOLD : GREY); rect(34, y, 1, h, on ? GOLD : GREY);
        sideIcon(bs[i].key, 10, y + 3, on);
        if (bs[i].n[0]) textC(bs[i].n, 18, y + 22, !strcmp(bs[i].n, "OK") ? GREEN : WHITE);
        side[nside].x = 1; side[nside].y = y; side[nside].w = 34; side[nside].h = h; side[nside++].key = bs[i].key;
        y += h + 3;
    }
    /* the open card */
    cardW = 0;
    if (!mcard) return;
    int ok = mcard == C_NIGHT;
    for (int i = 0; i < nb; i++) ok |= bs[i].key == mcard;
    if (!ok) { mcard = C_NONE; return; }
    CRow R[24]; int nr = 0, maxc = 33, night = (s->time & 0x8000) != 0;
    char title[40] = "", t[16];
    int nightLeft = ((night ? 0x10000 : 0x8000) - s->time) / 4;
    memset(R, 0, sizeof R);
    #define ROW(A, CA, B, CB) do { if (nr < 24) { cut(R[nr].a, sizeof R[nr].a, A, maxc); R[nr].ca = CA; \
        cut(R[nr].b, sizeof R[nr].b, B, maxc - (int)strlen(R[nr].a)); R[nr].cb = CB; nr++; } } while (0)
    if (mcard == C_WAYS) {
        snprintf(title, sizeof title, "THIS PLACE LEADS TO");
        for (int i = 0; i < nw; i++) { char b[40]; snprintf(b, sizeof b, " %s", ways[i].name); ROW(ways[i].tag, TEAL, b, WHITE); }
    } else if (mcard == C_DOORS) {
        int cur = pl.kind == RK_TOWN ? rd(in, 0xCBD6) : pl.door;
        snprintf(title, sizeof title, pl.kind == RK_TOWN ? "DOORS ON THIS STREET" : "DOORS IN TOWN");
        for (int i = 0; i < nd; i++) {
            int d = doors[i], on = d == cur, gate = d == TOWN[town].gate;
            char nm[32], a[8], b[40];
            townLabel(in, town, d, nm, sizeof nm);
            if (!nm[0]) snprintf(nm, sizeof nm, "DOOR %d", d);
            snprintf(a, sizeof a, "%2d", d); snprintf(b, sizeof b, " %s", nm);
            ROW(a, on ? GOLD : gate ? TEAL : LGREY, b, on ? GOLD : gate ? TEAL : WHITE);
            R[nr - 1].hi = on;
        }
        ROW("TEAL IS THE WAY OUT", TEAL, "", WHITE);
    } else if (mcard == C_ITEMS) {
        static const char *NM[4] = { "HEART HOLDER", "FIREFLY", "BABY SQUID", "TALISMAN" };
        snprintf(title, sizeof title, "TO COLLECT HERE");
        for (int k = 0; k < 4; k++) {
            if (!ht[k]) continue;
            char a[24], r[12]; int all = !hl[k];
            if (ht[k] > 1) snprintf(a, sizeof a, "%s X%d", NM[k], ht[k]); else snprintf(a, sizeof a, "%s", NM[k]);
            if (all) snprintf(r, sizeof r, "ALL GOT"); else snprintf(r, sizeof r, "%d LEFT", hl[k]);
            ROW(a, all ? GREY : WHITE, "", WHITE);
            snprintf(R[nr - 1].r, sizeof R[nr - 1].r, "%s", r); R[nr - 1].cr = all ? GREEN : GOLD;
            if (k == 1 && !all) {                                /* fireflies only come out at night */
                mmss(t, sizeof t, nightLeft);
                if (night) ROW(" NIGHT ONLY: OUT NOW", GOLD, "", WHITE); else ROW(" NIGHT ONLY: IN ", PURPLE, t, LGREY);
            }
        }
        ROW("BLINKING ON THE MAP", GREY, "", WHITE);
    } else if (mcard == C_NIGHT) {
        snprintf(title, sizeof title, night ? "IT IS NIGHT" : "IT IS DAY");
        mmss(t, sizeof t, nightLeft);
        ROW(night ? "DAWN IN " : "NIGHT IN ", LGREY, t, night ? GOLD : PURPLE);
        ROW(night ? "ENEMIES HAVE DOUBLE HEALTH" : "AT NIGHT ENEMIES HAVE", night ? RED : WHITE, "", WHITE);
        if (!night) ROW("DOUBLE HEALTH", WHITE, "", WHITE);
        char b[40];
        if (known && ht[1]) {
            if (hl[1]) snprintf(b, sizeof b, "%s%d", night ? "FIREFLIES OUT HERE: " : "FIREFLIES HERE AT NIGHT: ", hl[1]);
            else snprintf(b, sizeof b, "ALL FIREFLIES HERE GOT");
            ROW(b, hl[1] ? INK : GREEN, "", WHITE);
        } else ROW("NO FIREFLIES IN THIS AREA", GREY, "", WHITE);
        ROW("THE ZOMBIE CARAVAN ONLY", LGREY, "", WHITE);
        ROW("APPEARS AT NIGHT", LGREY, "", WHITE);
        if (!night && known && hl[1]) ROW("FIREFLIES DIM ON THE MAP", GREY, "", WHITE);
    } else if (mcard == C_ROOMS) snprintf(title, sizeof title, "ALL ROOMS HERE");
    else if (mcard == C_SIGNS) snprintf(title, sizeof title, "SEQUIN LAND SIGNPOSTS");
    #undef ROW
    int x = 38, w = 278, h = 16 + nr * 10 + 4;
    if (mcard == C_ROOMS || mcard == C_SIGNS) h = 195;
    if (h > 195) h = 195;
    y = 23;
    rect(x, y, w, h, BG);
    rect(x, y, w, 1, GOLD); rect(x, y + h - 1, w, 1, GOLD); rect(x, y, 1, h, GOLD); rect(x + w - 1, y, 1, h, GOLD);
    rect(x + 1, y + 1, w - 2, 12, DPURPLE);
    text(title, x + 6, y + 3, GOLD);
    cardX = x; cardY = y; cardW = w; cardH = h;
    int ry = y + 17;
    for (int i = 0; i < nr; i++) {
        if (ry + 8 > y + h - 2) break;
        if (R[i].hi) rect(x + 2, ry - 1, w - 4, 10, SEL);
        textArrows(R[i].a, x + 6, ry, R[i].ca);
        text(R[i].b, x + 6 + 8 * (int)strlen(R[i].a), ry, R[i].cb);
        if (R[i].r[0]) textR(R[i].r, x + w - 6, ry, R[i].cr);
        ry += 10;
    }
    if (mcard == C_ROOMS) map_rooms_draw(F, x + 4, ry, w - 8, y + h - 4 - ry);
    if (mcard == C_SIGNS) {                                     /* a list you drag up and down */
        int top = ry, viewH = y + h - 3 - top, rowH = 20, all = nsigns * rowH, lw = w - 12;
        signMax = all > viewH ? all - viewH : 0;
        if (signScroll > signMax) signScroll = signMax;
        if (signScroll < 0) signScroll = 0;
        for (int i = 0; i < nsigns; i++) {
            int yy = top + i * rowH - signScroll;
            if (yy + rowH - 3 <= top || yy >= top + viewH) continue;
            if (yy < top || yy + rowH - 3 > top + viewH) continue;   /* whole rows only (no clipping in rect/text) */
            rect(x + 4, yy, lw, rowH - 3, DPURPLE);
            text(signs[i].name, x + 8, yy + 1, INK);
            char a[24], b[24]; int half = (lw - 8) / 16 - 2;
            snprintf(a, sizeof a, "%.*s", half, signs[i].west); snprintf(b, sizeof b, "%.*s", half, signs[i].east);
            arrow(x + 8, yy + 9, 0, GREY); text(a, x + 17, yy + 9, LGREY);
            textR(b, x + lw - 9, yy + 9, LGREY); arrow(x + lw - 7, yy + 9, 1, GREY);
        }
        if (signMax) {
            int bh = viewH * viewH / all; if (bh < 12) bh = 12;
            rect(x + w - 6, top, 3, viewH, PANEL); rect(x + w - 6, top + (viewH - bh) * signScroll / signMax, 3, bh, GOLD);
        }
    }
}

int link_draw(uint16_t *fb, const LinkIn *in) {
    St s; readSt(in, &s);
    tick++;
    /* the credits: the ending card instead of the pages */
    int cr = inCredits(in, &s);
    if (cr && !card.on) cardStart(&s);
    if (!cr && card.on && (s.state == 2 || s.state == 5)) card.on = 0;   /* a new game or a state loaded */
    if (card.on) { F = fb; FW = LINK_W; FH = LINK_H; rect(0, 0, LINK_W, LINK_H, BG); endingCard(); return 1; }
    /* Select in play starts a dance: show the list for about 5 s (the Dual app closes it when she moves; alpha: time) */
    int sel = (in->buttons >> 2) & 1;
    if (sel && !lastSel && s.state == 2) { dancePopT = tick; prefs.dances++; prefsDirty = 1; }
    lastSel = sel;
    if (dancePopT >= 0 && tick - dancePopT > 30) dancePopT = -1;          /* link_draw runs ~6 times a second */
    uint8_t sig[72]; memset(sig, 0, sizeof sig);
    memcpy(sig, &s, 64 < sizeof s ? 64 : sizeof s);
    readBoss(in, &s);
    sig[64] = bossHp[0]; sig[65] = bossMax[0]; sig[66] = bossHp[1]; sig[67] = bossMax[1];
    sig[68] = page; sig[69] = dancePopT >= 0; sig[70] = in->fps; sig[71] = in->fps >> 8;
    /* the map follows the camera and STATS counts the time: those are always drawn */
    if (!memcmp(sig, lastSig, sizeof sig) && tick > 1 && page == P_SHANTAE) return 0;
    memcpy(lastSig, sig, sizeof sig);
    F = fb; FW = LINK_W; FH = LINK_H;
    rect(0, 0, LINK_W, LINK_H, BG);
    if (s.state != 2 && s.state != 5 && s.maxHearts == 0) {             /* title, file select: nothing to show yet */
        textC("SHANTAE DUAL 3DS", 160, 100, GOLD); textC("START OR CONTINUE A GAME", 160, 120, GREY);
        if (in->fps) { char b[24]; snprintf(b, sizeof b, "%u", in->fps); textC(b, 160, 200, GREY); }
        gear(GEAR_X, GEAR_Y, LGREY);
        return 1;
    }
    /* title bar: the place and the time to dusk or dawn ($C3E9: +4 a frame, night from $8000) */
    char b[48], t[16];
    int night = (s.time & 0x8000) != 0, left = ((night ? 0x10000 : 0x8000) - s.time) / 4;
    mmss(t, sizeof t, left);
    text(s.area[0] ? s.area : "SHANTAE", 6, 6, GOLD);
    snprintf(b, sizeof b, "%s %s", night ? "DAWN" : "DUSK", t); textR(b, GEAR_X - 6, 6, night ? PURPLE : GOLD);
    gear(GEAR_X, GEAR_Y, LGREY);
    rect(0, 18, LINK_W, 1, SEL);
    if (page == P_SHANTAE) pageShantae(&s);
    else if (page == P_PROGRESS) pageProgress(&s);
    else {
        if (!map_draw(fb, 0, 21, LINK_W, 199, in, drawIcon, mapTag)) textC(map_status(), 160, 116, GREY);
        else {                                                  /* the zoom level in the map's corner (tap to change) */
            int z = map_zoom_level(); const char *zt = z == 1 ? "X1" : z == 2 ? "X2" : "ALL";
            int w = 8 * (int)strlen(zt) + 4; rect(LINK_W - w, 21, w, 11, BG); text(zt, LINK_W - w + 2, 23, GOLD);
        }
        mapCards(in, &s);
    }
    drawBoss();
    if (dancePopT >= 0) dancePop(&s);
    /* tab bar */
    static const char *TABS[] = { "SHANTAE", "MAP", "PROGRESS" };
    for (int i = 0; i < 3; i++) { rect(i * 94, 222, 92, 18, i == page ? SEL : PANEL); textC(TABS[i], i * 94 + 46, 227, i == page ? WHITE : LGREY); }
    if (in->fps) { snprintf(b, sizeof b, "%u", in->fps); textC(b, 301, 227, GREY); }
    return 1;
}

static int menuPage, listenAct = -1;                            /* the menu: 0 slots, 1 settings; the button being given */
int link_tap(int x, int y, const LinkIn *in) {
    if (x >= GEAR_X - 8 && y < 20) { menuPage = 0; listenAct = -1; return LINK_TAP_MENU; }
    if (card.on) {                                              /* the ending card: CLEAR and SAVE */
        if (!card.saved && y >= 212 && y < 230) {
            if (x >= 204 && x < 252) { memset(sigPx, 0, sizeof sigPx); card.penX = -1; }
            else if (x >= 258 && x < 312) cardSave();
        }
        return -1;
    }
    if (y >= 222) { if (x < 282) { page = x / 94; memset(lastSig, 0xFF, sizeof lastSig); } return -1; }
    if (dancePopT >= 0) { dancePopT = -1; memset(lastSig, 0xFF, sizeof lastSig); return -1; }
    if (y < 18 && x >= 190) {                                   /* the dusk/dawn timer: the NIGHT card on the map */
        St s; readSt(in, &s);
        if (s.state == 2 || s.state == 5) { mcard = page == P_MAP && mcard == C_NIGHT ? C_NONE : C_NIGHT; page = P_MAP; memset(lastSig, 0xFF, sizeof lastSig); }
        return -1;
    }
    if (page == P_MAP && y >= 21 && y < 220) {
        for (int i = 0; i < nside; i++)                         /* a side button: its card (again: closed) */
            if (x >= side[i].x && x < side[i].x + side[i].w && y >= side[i].y && y < side[i].y + side[i].h) {
                mcard = mcard == side[i].key ? C_NONE : side[i].key;
                if (mcard == C_SIGNS) signScroll = 0;
                return -1;
            }
        if (cardW && x >= cardX && x < cardX + cardW && y >= cardY && y < cardY + cardH) { mcard = C_NONE; return -1; }
        map_zoom();                                             /* tap the map: x1 -> x2 -> ALL */
        return -1;
    }
    if (page == P_PROGRESS) {
        if (y >= 22 && y < 37) { int v = (x - 6) / 103; if (v >= 0 && v < 3 && v != prefs.progView) { prefs.progView = v; prefsDirty = 1; } }
        else if (prefs.progView == V_STORY && y >= 96 && y < 218) storyOpen = !storyOpen;
        else if (prefs.progView == V_STATS && y >= 192 && y < 214 && x >= 240) {
            if (statArm <= tick) statArm = tick + 24;           /* tap again within ~4 s */
            else {
                int32_t b = prefs.borders, v = prefs.progView; uint8_t k[8]; memcpy(k, prefs.keys, sizeof k);
                memset(&prefs, 0, sizeof prefs); prefs.borders = b; prefs.progView = v; prefs.since = (int64_t)time(NULL);
                memcpy(prefs.keys, k, sizeof k);
                prefsDirty = 1; statArm = 0;
            }
        }
        return -1;
    }
    if (page == P_SHANTAE && y >= 56 && y < 122 && x >= 10 && x < 314) {
        int i = ((y - 56) / 22) * 4 + (x - 10) / 76;
        St s; readSt(in, &s);
        if (i >= 0 && i < 12 && s.items[i] && (s.state == 2 || s.state == 5)) return i;
    }
    return -1;
}

const char *link_place(const LinkIn *in) {
    static St s; readSt(in, &s);
    return s.area[0] ? s.area : (s.state == 2 || s.state == 5) ? "SHANTAE" : "TITLE";
}

/* ------------------------------------------------------------------ the menu (gear)
 * Three slots side by side: a picture of the game when it was saved, the place, SAVE and LOAD. RESUME and QUIT below. */
#define SLOT_X(i) (8 + (i) * 104)
#define SLOT_Y 30
static void button(int x, int y, int w, int h, const char *label, int on) {
    rect(x, y, w, h, on ? SEL : PANEL);
    rect(x, y, w, 1, on ? GOLD : GREY); rect(x, y + h - 1, w, 1, on ? GOLD : GREY);
    rect(x, y, 1, h, on ? GOLD : GREY); rect(x + w - 1, y, 1, h, on ? GOLD : GREY);
    textC(label, x + w / 2, y + (h - 8) / 2, on ? WHITE : GREY);
}
/* the SETTINGS page (0.10): the top screen's borders, OLD 3DS SPEED (0.11), and which 3DS button does each action */
static const char *const KEY3_NAME[KEY3_N] = { "A", "B", "X", "Y", "L", "R", "ZL", "ZR", "START", "SELECT" };
static const char *const ACT_NAME[ACT_N] = { "GAME BOY A", "GAME BOY B", "START", "SELECT", "FAST-FORWARD" };
#define SYS_ROW(i) (30 + (i) * 17)
#define SET_ROW(i) (100 + (i) * 17)
static void fpsLine(const LinkMenu *m) {                         /* the title bar: FPS, and the pictures shown if fewer */
    char b[32];
    if (!m->fps) return;
    if (m->drawn && m->drawn + 2 < m->fps) snprintf(b, sizeof b, "%u FPS, %u SHOWN", m->fps, m->drawn);
    else snprintf(b, sizeof b, "%u FPS", m->fps);
    textR(b, GEAR_X - 6, 6, GREY);
}
static void menuSettings(const LinkMenu *m) {
    char b[48];
    text("SETTINGS", 6, 6, GOLD);
    fpsLine(m);
    gear(GEAR_X, GEAR_Y, GOLD);
    rect(0, 18, LINK_W, 1, SEL);
    int slow = !m->n3ds || prefs.old3ds;                        /* FRAME SKIP only acts at the old 3DS's speed */
    frame(6, 26, 308, 62, "SYSTEM");
    text("BORDERS", 16, SYS_ROW(0) + 4, INK);
    button(200, SYS_ROW(0), 108, 16, prefs.borders ? "ON" : "OFF", prefs.borders);
    text("OLD 3DS SPEED", 16, SYS_ROW(1) + 4, m->n3ds ? INK : GREY);
    button(200, SYS_ROW(1), 108, 16, !m->n3ds ? "NEW 3DS ONLY" : prefs.old3ds ? "ON" : "OFF", m->n3ds && prefs.old3ds);
    text(slow ? "FRAME SKIP" : "FRAME SKIP (OLD SPEED)", 16, SYS_ROW(2) + 4, slow ? INK : GREY);
    button(200, SYS_ROW(2), 108, 16, prefs.frameskip ? "ON" : "OFF", prefs.frameskip && slow);
    frame(6, 92, 308, 96, listenAct >= 0 ? "PRESS ITS NEW BUTTON, TAP: CANCEL" : "BUTTONS: TAP ONE, PRESS A BUTTON");
    for (int i = 0; i < ACT_N; i++) {
        int y = SET_ROW(i), lis = listenAct == i;
        text(ACT_NAME[i], 16, y + 4, INK);
        button(200, y, 108, 16, lis ? "PRESS ONE" : KEY3_NAME[link_key(i)], 1);
        if (lis) { rect(200, y, 108, 1, GOLD); rect(200, y + 15, 108, 1, GOLD); }
    }
    button(8, 194, 98, 24, "DEFAULTS", 1);
    button(214, 194, 98, 24, "BACK", 1);
    if (m->msGb) {                                              /* the timing: what a frame costs, against 16.7 ms */
        snprintf(b, sizeof b, "GB %d.%d TOP %d.%d LINK %d.%d MAX %d.%d MS", m->msGb / 10, m->msGb % 10, m->msTop / 10,
                 m->msTop % 10, m->msLink / 10, m->msLink % 10, m->msMax / 10, m->msMax % 10);
        textC(b, 160, 229, m->msGb + m->msTop + m->msLink > 167 ? GOLD : GREY);
    } else textC("D-PAD MOVES  L+X/L+Y: SLOT 1", 160, 229, GREY);
}
int link_menu_listening(void) { return listenAct; }
void link_menu_bind(int key3) {
    int a = listenAct;
    listenAct = -1;
    if (a < 0 || key3 < 0 || key3 >= KEY3_N) return;
    int old = link_key(a);
    for (int i = 0; i < ACT_N; i++) if (i != a && link_key(i) == key3) prefs.keys[i] = (uint8_t)(old + 1);   /* swap */
    prefs.keys[a] = (uint8_t)(key3 + 1);
    prefsDirty = 1;
}
int link_menu_back(void) {
    if (listenAct >= 0) { listenAct = -1; return 1; }
    if (menuPage) { menuPage = 0; return 1; }
    return 0;
}
void link_menu_draw(uint16_t *fb, const LinkMenu *m) {
    char b[32];
    F = fb; FW = LINK_W; FH = LINK_H;
    rect(0, 0, LINK_W, LINK_H, BG);
    memset(lastSig, 0xFF, sizeof lastSig);                      /* the page is drawn again after the menu */
    if (menuPage) { menuSettings(m); return; }
    text("PAUSED", 6, 6, GOLD);
    fpsLine(m);
    gear(GEAR_X, GEAR_Y, GOLD);
    rect(0, 18, LINK_W, 1, SEL);
    for (int i = 0; i < MENU_SLOTS; i++) {
        int x = SLOT_X(i);
        snprintf(b, sizeof b, "SLOT %d", i + 1);
        frame(x, SLOT_Y, 96, 132, b);
        int tx = x + 8, ty = SLOT_Y + 8;
        rect(tx - 1, ty - 1, THUMB_W + 2, THUMB_H + 2, m->have[i] ? GOLD : SEL);
        if (m->have[i] && m->thumb[i])
            for (int j = 0; j < THUMB_H; j++) memcpy(fb + (ty + j) * LINK_W + tx, m->thumb[i] + j * THUMB_W, THUMB_W * 2);
        else { rect(tx, ty, THUMB_W, THUMB_H, BG); textC(m->have[i] ? "SAVED" : "EMPTY", tx + THUMB_W / 2, ty + 32, GREY); }
        char nm[24], ln[2][12] = { "", "" }; int n = 0;          /* the place on two lines of 11, split at a space */
        snprintf(nm, sizeof nm, "%s", m->have[i] ? m->place[i] : "");
        for (char *w = strtok(nm, " "); w && n < 2; w = strtok(NULL, " ")) {
            if (ln[n][0] && strlen(ln[n]) + 1 + strlen(w) <= 11) { strcat(ln[n], " "); strcat(ln[n], w); continue; }
            if (ln[n][0] && ++n == 2) break;
            snprintf(ln[n], sizeof ln[n], "%.11s", w);
        }
        textC(ln[0], x + 48, SLOT_Y + 84, LGREY); textC(ln[1], x + 48, SLOT_Y + 94, LGREY);
        button(x + 6, SLOT_Y + 106, 40, 18, "SAVE", 1);
        button(x + 50, SLOT_Y + 106, 40, 18, "LOAD", m->have[i]);
    }
    if (m->msg) textC(m->msg, 160, 168, GREEN);
    button(8, 184, 98, 30, "RESUME", 1);
    button(111, 184, 98, 30, "SETTINGS", 1);
    button(214, 184, 98, 30, "QUIT", 1);
    textC("B: RESUME   L+X/L+Y: SLOT 1", 160, 225, GREY);
}
int link_menu_tap(int x, int y, const LinkMenu *m) {
    if (x >= GEAR_X - 8 && y < 20) return MENU_RESUME;
    if (menuPage) {                                             /* SETTINGS */
        if (listenAct >= 0) { listenAct = -1; return MENU_REDRAW; }   /* a tap cancels */
        if (y >= 26 && y < SYS_ROW(1) && x >= 196) return MENU_BORDERS;
        if (y >= SYS_ROW(1) && y < SYS_ROW(2) && x >= 196) return m->n3ds ? MENU_OLD3DS : MENU_NONE;
        if (y >= SYS_ROW(2) && y < 88 && x >= 196) return MENU_FRAMESKIP;
        for (int i = 0; i < ACT_N; i++) if (y >= SET_ROW(i) && y < SET_ROW(i) + 17 && x >= 120) { listenAct = i; return MENU_REDRAW; }
        if (y >= 192 && y < 222) {
            if (x < 109) { memset(prefs.keys, 0, sizeof prefs.keys); prefsDirty = 1; return MENU_REDRAW; }
            if (x >= 212) { menuPage = 0; return MENU_REDRAW; }
        }
        return MENU_NONE;
    }
    if (y >= 184 && y < 214) {
        if (x >= 109 && x < 212) { menuPage = 1; listenAct = -1; return MENU_REDRAW; }
        return x < 109 ? MENU_RESUME : MENU_QUIT;
    }
    if (y >= SLOT_Y + 104 && y < SLOT_Y + 126)
        for (int i = 0; i < MENU_SLOTS; i++) {
            int sx = SLOT_X(i);
            if (x >= sx + 6 && x < sx + 46) return MENU_SAVE + i;
            if (x >= sx + 50 && x < sx + 90 && m->have[i]) return MENU_LOAD + i;
        }
    return MENU_NONE;
}
