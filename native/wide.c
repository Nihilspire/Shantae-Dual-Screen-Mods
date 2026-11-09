/* wide.c - WIDE VIEW: the world beside the Game Boy's picture, as wide as the screen (SHANTAE-RAM.md "Widescreen").
 *
 * The drawing is ported from the Shantae recomp's expanded view (github.com/vibecodekun/shantaerecomp, expanded_view.c and
 * expanded_background.inc, pin d870bd2), PolyForm Noncommercial 1.0.0: its text is app/assets/licenses/wide-view-LICENSE.txt. Only the picture came over.
 * Its zoom, taller views, 157 object slots and object activation stayed behind; objects here wake through the game's own spawn
 * window, widened by two bytes (spawnWindow). The world bindings and the addresses in the hooks are upstream's findings.
 *
 * The game runs as it always does and the real 160 x 144 picture stays exact in the middle. Around it, for the same frame:
 * - the level from the ROM, through the live VRAM tiles and colours;
 * - sprites from the game's own draw list: captured where it builds them (00:1DC6), before the cull, and kept with the shadow
 *   OAM page they were built for, so they are on the same frame as the picture;
 * - objects drawn into the BG map (01:4F16), which also cull: rocks, blocks, gates;
 * - the scroll as the VBlank handler really committed it (00:0A57), with the bosses' background-only offset apart (03:725A...).
 *
 * The hooks are a bit table the CPU checks at each opcode, on only while WIDE VIEW is (cpu.cpp, gbx_hook). The frame is built
 * right after the core finishes it, at the start of VBlank: nothing that's drawn from has moved on since line 0 but the palettes,
 * which frame_palettes handles. gambatte's picture is RGB565 and so is this. */
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "gbcore.h"

unsigned gbx_color(unsigned bgr15);
void gbx_rompoke(unsigned a, unsigned v);
const unsigned char *gbx_wram(void);
const unsigned char *gbx_vram(void);
extern unsigned char gbx_hookbits[8192];
extern int gbx_hook_on;

static const uint8_t *rom; static size_t romn;
static const uint8_t *wram, *vram;
static int view_w = 160;

static inline unsigned rom8(unsigned bank, unsigned addr) {
  if (addr >= 0x8000) return 0xFF;
  size_t o = addr < 0x4000 ? addr : bank * (size_t)0x4000 + addr - 0x4000;
  return o < romn ? rom[o] : 0xFF;
}
static inline unsigned rom16(unsigned bank, unsigned addr) { return rom8(bank, addr) | rom8(bank, addr + 1) << 8; }
static inline unsigned word(const uint8_t *p) { return p[0] | p[1] << 8; }
static inline unsigned mem16(unsigned a) { return (unsigned)gb_peek(a) | (unsigned)gb_peek(a + 1) << 8; }
#define H(x) gb_peek(0xFF80 + (x))
static inline unsigned H16(unsigned x) { return mem16(0xFF80 + x); }
/* A colour as the core shows it. The core's conversion runs powf on each channel, too much for the 3DS 64 times a frame, and the 3DS
 * has no COLORS setting to change the answer. Android's does, so it asks every time. 0 is black or not asked yet. */
#ifdef __3DS__
static inline unsigned color_of(unsigned bgr15) {
  static uint16_t known[32768];
  bgr15 &= 0x7FFF;
  if (!known[bgr15]) known[bgr15] = (uint16_t)gbx_color(bgr15);
  return known[bgr15];
}
#else
#define color_of gbx_color
#endif
static inline int clamp(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ---- what the game builds, by frame ---- */
#define MAX_SPRITES 256
typedef struct { int x, y; unsigned bank, descriptor, graphics; } Draw;
typedef struct { Draw draws[MAX_SPRITES]; int count; } DrawList;
static DrawList pending[2], visible;        /* the game's two shadow OAM pages, D700 and D800 */
typedef struct { int x, y; uint8_t tile, attr; uint32_t pattern; } BackgroundTile;
#define MAX_BG_TILES 16384
typedef struct { BackgroundTile tiles[MAX_BG_TILES]; int count; } Background;
static Background bg_pending, bg_visible;
/* Scroll the VBlank handler last copied to SCX/SCY; the offset in the scroll the camera routine last built, and in that one */
static int committed, committed_x, committed_y, built_dx, built_dy, committed_dx, committed_dy;
static int line0_taken; static uint8_t line0_bg[64], line0_obj[64];
static uint64_t frames_done;

static inline void copy_draws(DrawList *to, const DrawList *from) {
  to->count = from->count; memcpy(to->draws, from->draws, (size_t)from->count * sizeof(Draw));
}
static inline void copy_bg(Background *to, const Background *from) {
  to->count = from->count; memcpy(to->tiles, from->tiles, (size_t)from->count * sizeof(BackgroundTile));
}

/* An object that loads its own tiles: a labyrinth's picture quarters and key doors. Upstream's table: more than one of them
 * in reach would each show the last one's tiles in VRAM, so each draws from the ROM bytes it last asked for. */
typedef struct { uint8_t bank; uint16_t first, end; } ScriptRange;
static const ScriptRange own_graphics[] = {
  {0x26, 0x51AF, 0x576C},   /* 0A:4320, a picture's quarter */
  {0x26, 0x620C, 0x6293},   /* 0A:430C, a key door */
  {0x22, 0x71CB, 0x723E},   /* 0A:415C, a key door of map 5E:8F */
};
typedef struct { uint32_t rom; uint16_t first, size, record; uint8_t record_bank; } Load;
#define SLOTS 32
#define NODE 0x7E
static Load loads[SLOTS];
static int slot_index(unsigned o) {
  if (o < 0xD000 || o >= 0xD000 + SLOTS * NODE || (o - 0xD000) % NODE) return -1;
  return (int)((o - 0xD000) / NODE);
}
static inline unsigned node8(unsigned o) { return (unsigned)gb_wram(3, o - 0xD000); }
static inline unsigned node16(unsigned o) { return node8(o) | node8(o + 1) << 8; }
static int loads_own_graphics(unsigned o) {
  if (slot_index(o) < 0 || node8(o) == 0xFF) return 0;
  unsigned bank = node8(o + 4), pc = node16(o + 2);
  for (size_t i = 0; i < sizeof own_graphics / sizeof *own_graphics; i++)
    if (own_graphics[i].bank == bank && pc >= own_graphics[i].first && pc < own_graphics[i].end) return 1;
  return 0;
}
static inline unsigned tile_data(int lcdc, unsigned tile, unsigned attr) {
  return ((lcdc & 16) ? tile * 16 : 0x1000 + (int8_t)tile * 16) + ((attr & 8) ? 0x2000 : 0);
}
static const Load *own_load(unsigned o) {
  int slot = slot_index(o);
  if (slot < 0 || !loads[slot].rom || !loads_own_graphics(o)) return NULL;
  const Load *l = &loads[slot];
  return l->record == node16(o + 0x25) && l->record_bank == node8(o + 0x24) ? l : NULL;
}

/** The CPU reached one of the addresses below, before running the instruction there. */
void gbx_hook(unsigned pc, unsigned bank, unsigned bc, unsigned de, unsigned hl, unsigned sp) {
  switch (pc) {
  case 0x0A57:    /* LD A,(C9FB): the VBlank handler copies the scroll to SCX, once the main loop has finished its frame */
    committed_x = mem16(0xC9FB); committed_dx = built_dx; break;
  case 0x0A5C:    /* LD A,(C9FD) */
    committed_y = mem16(0xC9FD); committed_dy = built_dy; committed = 1; break;
  case 0x725A: case 0x72F0:   /* 03: ADD A,(HL): the scroll is the camera plus C9D2/C9D4. Sprites use the camera alone. */
    if (bank == 3) built_dx = (int16_t)mem16(0xC9D2);
    break;
  case 0x726A: case 0x7300:
    if (bank == 3) built_dy = (int16_t)mem16(0xC9D4);
    break;
  case 0x667C:    /* 01: DMA has just consumed a page; keep its list before the game reuses the page for a future frame */
    if (bank == 1) {
      unsigned shown = gb_peek(0xFF46), next = H(0x57) ^ 8;
      if (shown == 0xD7 || shown == 0xD8) copy_draws(&visible, &pending[shown - 0xD7]);
      pending[next ? 0 : 1].count = 0;              /* 667C toggles the page: new zero draws into D800, new eight D700 */
      copy_bg(&bg_visible, &bg_pending);
      bg_pending.count = 0;
    }
    break;
  case 0x5E0B:    /* 01: the LYC=0 handler, before it uploads this frame's palettes */
    if (bank == 1) { memcpy(line0_bg, gb_cgbpal(0), 64); memcpy(line0_obj, gb_cgbpal(1), 64); line0_taken = 1; }
    break;
  case 0x1DC6: {  /* a metasprite: HL its layout, the top of the stack the cel, the position in FF92/FF94 plus the camera */
    unsigned page = H(0x59);
    if (page != 0xD7 && page != 0xD8) break;
    DrawList *l = &pending[page - 0xD7];
    if (l->count == MAX_SPRITES) break;
    unsigned base = mem16(sp), graphic = rom16(bank, base + 8), count = rom8(bank, hl + 32);
    if (count > 40 || graphic < 0x4000 || graphic + 1 + count * 32 > 0x8000) break;
    Draw *d = &l->draws[l->count++];
    d->x = (int16_t)H16(0x12) + (int)H16(0x61);
    d->y = (int16_t)H16(0x14) + (int)H16(0x63);
    d->bank = bank; d->descriptor = hl; d->graphics = graphic;
    break;
  }
  case 0x4F16:    /* 01: an object drawn in the BG map, not culled yet: width, height, then tile/attribute pairs */
    if (bank == 1) {
      unsigned obj = bc, b = (unsigned)gb_peek(obj + 0x2E), ptr = mem16(obj + 0x2F), cols = rom8(b, ptr), rows = rom8(b, ptr + 1);
      int x = (int16_t)mem16(obj + 0x5B), y = (int16_t)mem16(obj + 0x5F);
      if (cols && rows && cols <= 128 && rows <= 64 && ptr >= 0x4000 && ptr + 2 + cols * rows * 2 <= 0x8000) {
        const Load *own = own_load(obj);
        int lcdc = gb_peek(0xFF40);
        for (unsigned r = 0; r < rows; r++) for (unsigned c = 0; c < cols; c++) {
          if (bg_pending.count == MAX_BG_TILES) break;
          unsigned data = ptr + 2 + (r * cols + c) * 2;
          BackgroundTile *t = &bg_pending.tiles[bg_pending.count++];
          t->x = x + (int)c; t->y = y + (int)r;
          t->tile = rom8(b, data); t->attr = rom8(b, data + 1);
          unsigned at = tile_data(lcdc, t->tile, t->attr);
          t->pattern = own && at >= own->first && at - own->first + 16 <= own->size ? own->rom + (at - own->first) : 0;
        }
      }
    }
    break;
  case 0x1AEB:    /* LD A,(BC): the script's load: BC the length, then the data, in the graphics' bank. DE the destination. */
    if (bc >= 0x4000) {
      unsigned o = mem16(sp + 4); int slot = slot_index(o);
      if (slot < 0) break;
      loads[slot].rom = 0;
      if (!loads_own_graphics(o)) break;
      unsigned data = (bc + 1u) & 0xFFF0, size = ((rom8(bank, bc) & 0x7F) + 1) * 16;
      size_t off = bank * (size_t)0x4000 + data - 0x4000;
      if (data < 0x4000 || data + size > 0x8000 || off + size > romn) break;
      unsigned d = de >> 8, e = de & 255;
      loads[slot] = (Load){(uint32_t)off, (uint16_t)((e & 1) << 13 | (d & 0x1F) << 8 | (e & 0xF0)), (uint16_t)size,
                           (uint16_t)node16(o + 0x25), (uint8_t)node8(o + 0x24)};
    }
    break;
  }
}
static void hook_set(int on) {
  static const uint16_t at[] = {0x0A57, 0x0A5C, 0x725A, 0x72F0, 0x726A, 0x7300, 0x667C, 0x5E0B, 0x1DC6, 0x4F16, 0x1AEB};
  memset(gbx_hookbits, 0, sizeof gbx_hookbits);
  if (on) for (size_t i = 0; i < sizeof at / sizeof *at; i++) gbx_hookbits[at[i] >> 3] |= 1 << (at[i] & 7);
  gbx_hook_on = on;
}
/** A state was loaded or the game restarted: nothing noted so far holds. */
void gb_wide_reset(void) {
  committed = 0; line0_taken = 0;
  built_dx = built_dy = 0;
  if (gb_rom(&romn) && gbx_wram()) { built_dx = (int16_t)word(gbx_wram() + 0x9D2); built_dy = (int16_t)word(gbx_wram() + 0x9D4); }
  pending[0].count = pending[1].count = visible.count = 0;
  bg_pending.count = bg_visible.count = 0;
  memset(loads, 0, sizeof loads);
}

/* ---- the room ---- */
/* Towns: all five are one map, 67:9B, whose bounds give them away. The street wraps at 640, and its art ends above the name panel. */
static int town_room(void) {
  return wram[0x9F9] == 0x67 && wram[0x9FA] == 0x9B && word(wram + 0x9DB) == 0 && word(wram + 0x9DD) == 480 &&
         word(wram + 0x9DF) == word(wram + 0x9E1);
}
#define TOWN_WIDTH 640
#define TOWN_ART 116
#define TOWN_PANEL 40
#define VIEW_MAX 8192

/* A map holds several pictures, most kept apart by sectors that draw nothing, so a room keeps to the pictures the camera's screen is
 * in: 8-connected groups of drawn sectors less their bands of one metatile, or the pictures listed where two touch. Ends exclusive. */
typedef struct { int x0, y0, x1, y1; } Box;
typedef struct { Box box; int masked; uint32_t sectors[32]; } Room;
static const struct { uint16_t map; Box box; } pictures[] = {
  {0x4F51, {0, 0, 3584, 512}},        /* the bridge */
  {0x4F51, {0, 512, 256, 1024}},      /* the intro's house */
  {0x7359, {4096, 0, 4256, 472}},     /* game over */
  {0x7359, {3616, 0, 3808, 8192}},
  {0x7359, {3872, 0, 4064, 8192}},
};
#define MAX_PICTURES 255
typedef struct { unsigned key; uint8_t id[32][32]; Box box[MAX_PICTURES + 1]; } MapPictures;
static MapPictures map_pictures[2];
static int map_pictures_next;
static unsigned map_cell(unsigned page, unsigned bank, int x, int y) {
  unsigned entry = (page << 8) + (y >> 8) * 64 + (x >> 8) * 2, cells = rom8(bank, entry) << 8, cell_bank = rom8(bank, entry + 1);
  unsigned c = cells + ((y & 255) >> 4) * 32 + ((x & 255) >> 4) * 2;
  return rom8(cell_bank, c) | rom8(cell_bank, c + 1) << 8;
}
static int sector_drawn(unsigned page, unsigned bank, int x, int y) {
  unsigned entry = (page << 8) + y * 64 + x * 2;
  if (entry < 0x4000 || entry + 1 >= 0x8000) return 0;
  unsigned cells = rom8(bank, entry), cell_bank = rom8(bank, entry + 1);
  return cells >= 0x40 && cells < 0x80 && cell_bank * (size_t)0x4000 < romn;
}
static int uniform_line(const MapPictures *m, unsigned page, unsigned bank, int id, int x, int y, int dx, int dy, int n, int *tile) {
  for (int i = 0; i < n; i++, x += dx, y += dy) {
    if (m->id[y >> 8][x >> 8] != id) continue;
    int t = (int)map_cell(page, bank, x, y);
    if (*tile < 0) *tile = t; else if (t != *tile) return 0;
  }
  return 1;
}
static void trim_picture(const MapPictures *m, unsigned page, unsigned bank, int id, Box *b) {
  int tile = -1;
  while (b->x1 - b->x0 > 16 && uniform_line(m, page, bank, id, b->x1 - 16, b->y0, 0, 16, (b->y1 - b->y0) / 16, &tile)) b->x1 -= 16;
  tile = -1;
  while (b->x1 - b->x0 > 16 && uniform_line(m, page, bank, id, b->x0, b->y0, 0, 16, (b->y1 - b->y0) / 16, &tile)) b->x0 += 16;
  tile = -1;
  while (b->y1 - b->y0 > 16 && uniform_line(m, page, bank, id, b->x0, b->y1 - 16, 16, 0, (b->x1 - b->x0) / 16, &tile)) b->y1 -= 16;
  tile = -1;
  while (b->y1 - b->y0 > 16 && uniform_line(m, page, bank, id, b->x0, b->y0, 16, 0, (b->x1 - b->x0) / 16, &tile)) b->y0 += 16;
}
static const MapPictures *pictures_of(unsigned page, unsigned bank) {
  unsigned key = (page << 8 | bank) + 1;
  for (int i = 0; i < 2; i++) if (map_pictures[i].key == key) return &map_pictures[i];
  MapPictures *m = &map_pictures[map_pictures_next];
  map_pictures_next ^= 1;
  m->key = key;
  uint8_t drawn[32][32];
  for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) drawn[y][x] = sector_drawn(page, bank, x, y);
  memset(m->id, 0, sizeof m->id);
  int count = 0;
  static uint8_t stack[32 * 32][2];
  for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) {
    if (!drawn[y][x] || m->id[y][x]) continue;
    int id = MAX_PICTURES;
    if (count < MAX_PICTURES) { id = ++count; m->box[id] = (Box){x * 256, y * 256, x * 256 + 256, y * 256 + 256}; }
    int top = 0;
    m->id[y][x] = id;
    stack[top][0] = x; stack[top++][1] = y;
    while (top) {
      int sx = stack[--top][0], sy = stack[top][1];
      Box *b = &m->box[id];
      if (sx * 256 < b->x0) b->x0 = sx * 256;
      if (sy * 256 < b->y0) b->y0 = sy * 256;
      if (sx * 256 + 256 > b->x1) b->x1 = sx * 256 + 256;
      if (sy * 256 + 256 > b->y1) b->y1 = sy * 256 + 256;
      for (int ny = sy - 1; ny <= sy + 1; ny++) for (int nx = sx - 1; nx <= sx + 1; nx++) {
        if (nx < 0 || ny < 0 || nx > 31 || ny > 31 || !drawn[ny][nx] || m->id[ny][nx]) continue;
        m->id[ny][nx] = id;
        stack[top][0] = nx; stack[top++][1] = ny;
      }
    }
  }
  for (int id = 1; id <= count; id++) trim_picture(m, page, bank, id, &m->box[id]);
  return m;
}
static int overlaps(const Box *a, const Box *b) { return a->x0 < b->x1 && b->x0 < a->x1 && a->y0 < b->y1 && b->y0 < a->y1; }
static void box_add(Box *a, const Box *b) {
  if (b->x0 < a->x0) a->x0 = b->x0;
  if (b->y0 < a->y0) a->y0 = b->y0;
  if (b->x1 > a->x1) a->x1 = b->x1;
  if (b->y1 > a->y1) a->y1 = b->y1;
}
/** The room around camera cx,cy with a status bar `hud` lines tall: the camera's range (C9DB-C9E2), stopping where the pictures do. */
static Room room_at(int cx, int cy, int hud, int want_sectors) {
  Room room;
  room.box = (Box){(int)word(wram + 0x9DB), (int)word(wram + 0x9DF), (int)word(wram + 0x9DD) + 160, (int)word(wram + 0x9E1) + 144};
  room.masked = 0;
  unsigned map = wram[0x9F9] << 8 | wram[0x9FA];
  Box screen = {cx, cy, cx + 160, cy + 144 - hud}, pictured = screen;
  int found = 0;
  for (size_t i = 0; i < sizeof pictures / sizeof *pictures; i++)
    if (pictures[i].map == map && overlaps(&pictures[i].box, &screen)) {
      if (!found++) pictured = pictures[i].box; else box_add(&pictured, &pictures[i].box);
    }
  if (!found && wram[0x9F9] >= 0x40 && wram[0x9F9] < 0x80) {
    const MapPictures *m = pictures_of(wram[0x9F9], wram[0x9FA]);
    uint8_t in[MAX_PICTURES + 1] = {0};
    for (int y = clamp(screen.y0 >> 8, 0, 31); y <= clamp((screen.y1 - 1) >> 8, 0, 31); y++)
      for (int x = clamp(screen.x0 >> 8, 0, 31); x <= clamp((screen.x1 - 1) >> 8, 0, 31); x++) {
        int id = m->id[y][x];
        if (!id || in[id]) continue;
        in[id] = 1;
        if (!found++) pictured = m->box[id]; else box_add(&pictured, &m->box[id]);
      }
    if (found && want_sectors) {
      room.masked = 1;
      for (int y = 0; y < 32; y++) {
        room.sectors[y] = 0;
        for (int x = 0; x < 32; x++) room.sectors[y] |= (uint32_t)in[m->id[y][x]] << x;
      }
    }
  }
  if (found) {
    pictured.y1 += hud;        /* the camera's greatest y shows a picture's bottom above the status bar */
    Box b = room.box;
    if (b.x0 < pictured.x0) b.x0 = pictured.x0;
    if (b.y0 < pictured.y0) b.y0 = pictured.y0;
    if (b.x1 > pictured.x1) b.x1 = pictured.x1;
    if (b.y1 > pictured.y1) b.y1 = pictured.y1;
    Box cam = {cx, cy, cx + 160, cy + 144};
    box_add(&b, &cam);
    if (b.x0 < room.box.x0) b.x0 = room.box.x0;
    if (b.y0 < room.box.y0) b.y0 = room.box.y0;
    if (b.x1 > room.box.x1) b.x1 = room.box.x1;
    if (b.y1 > room.box.y1) b.y1 = room.box.y1;
    if (b.x0 < b.x1 && b.y0 < b.y1) room.box = b;
  }
  if (town_room()) {
    int y = (int)word(wram + 0x9DF);
    room.box = (Box){cx - VIEW_MAX, y, cx + 160 + VIEW_MAX, y + TOWN_ART};
    room.masked = 0;
  }
  return room;
}
static inline int room_fits_screen(const Room *r) { return r->box.x1 - r->box.x0 <= 160 && r->box.y1 - r->box.y0 <= 144; }
/* Lines of a window along the bottom: the status bar from line 128, the intro's strip from 136. */
static inline int status_bar(int lcdc, int wx, int wy) { return (lcdc & 0x20) && wx == 0 && wy >= 128 && wy < 144 ? 144 - wy : 0; }

/** Level tile at world pixel x,y. */
static int world_tile(int x, int y, unsigned *tile, unsigned *attr) {
  if (town_room()) x = (x % TOWN_WIDTH + TOWN_WIDTH) % TOWN_WIDTH;
  if (x < 0 || y < 0 || x >= 8192 || y >= 8192) return 0;
  unsigned directory = (wram[0x9F9] << 8) + (y >> 8) * 64 + (x >> 8) * 2;
  if (directory < 0x4000 || directory + 1 >= 0x8000) return 0;
  unsigned page = rom8(wram[0x9FA], directory), bank = rom8(wram[0x9FA], directory + 1);
  unsigned cell = (page << 8) + ((y & 255) >> 4) * 32 + ((x & 255) >> 4) * 2;
  if (cell < 0x4000 || cell + 1 >= 0x8000) return 0;
  unsigned lo = rom8(bank, cell), hi = rom8(bank, cell + 1);
  bank = (unsigned)H(0x5F) + (lo & 15);
  unsigned ptr = (hi << 8) | (lo & 240);
  if (ptr < 0x4000 || ptr + 7 >= 0x8000 || bank * (size_t)0x4000 >= romn) return 0;
  unsigned q = ((y & 8) >> 2) + ((x & 8) >> 3);
  *tile = rom8(bank, ptr + q); *attr = rom8(bank, ptr + 4 + q);
  return 1;
}

/* ---- the frame ---- */
static int lcdc, window_x, window_y, scroll_x, scroll_y, camera_x, camera_y;
static int status_lines = 16;
/** Is the hardware drawing this map? The visible tile map against the ROM's plus this frame's background objects. Menus keep the map
 *  pointers but replace the tile map; a majority tolerates tiles streamed between frames. */
static int map_agrees(int hud) {
  enum { COLS = 20, ROWS = 18 };
  int objects[COLS * ROWS];
  int x0 = (scroll_x + 7) / 8, x1 = (scroll_x + 160) / 8, y0 = (scroll_y + 7) / 8, y1 = (scroll_y + 144 - hud) / 8;
  for (int i = 0; i < COLS * ROWS; i++) objects[i] = -1;
  for (int i = 0; i < bg_visible.count; i++) {
    const BackgroundTile *t = &bg_visible.tiles[i];
    if (t->x >= x0 && t->x < x1 && t->y >= y0 && t->y < y1) objects[(t->y - y0) * COLS + t->x - x0] = t->tile | t->attr << 8;
  }
  unsigned base = (lcdc & 8) ? 0x1C00 : 0x1800;
  int checked = 0, matched = 0;
  for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) {
    int expected = objects[(y - y0) * COLS + x - x0];
    unsigned tile, attr, off = base + (y & 31) * 32 + (x & 31);
    if (expected < 0 && world_tile(x * 8, y * 8, &tile, &attr)) expected = (int)(tile | attr << 8);
    checked++;
    matched += expected == (int)(vram[off] | vram[off + 0x2000] << 8);
  }
  return checked && matched * 2 >= checked;
}
/* A window across the bottom stays at the bottom: the status bar, a dialogue box, a town's name panel. */
static inline int window_strip(void) {
  int hud = status_bar(lcdc, window_x, window_y);
  if (hud || !(lcdc & 0x20) || window_x != 0 || window_y <= 0 || window_y >= 144) return hud;
  return 144 - window_y;
}
static inline int window_covers(void) { return (lcdc & 0x20) && window_x < 160 && window_y < 128; }

/* The room shown eases when it jumps in play, so an arena locking pans instead of snapping. A new map, a cut or a dark frame snaps. */
#define EASE_FRAMES 16
#define ROOM_JUMP 8
static Box room_shown, room_from, room_target;
static uint64_t room_frame;
static uint8_t room_map[3];
static int room_snap = 1, cut_x, cut_y, easing;
static Box shown_room(const uint16_t *native, const Box *target) {
  int jumped = abs(target->x0 - room_target.x0) > ROOM_JUMP || abs(target->y0 - room_target.y0) > ROOM_JUMP ||
               abs(target->x1 - room_target.x1) > ROOM_JUMP || abs(target->y1 - room_target.y1) > ROOM_JUMP;
  int dark = 1;
  for (int i = 0; i < 160 * 144 && dark; i++) if (native[i] & 0xFFDF) dark = 0;     /* any channel past the first step */
  if (room_snap || memcmp(wram + 0x9F8, room_map, 3) || dark) easing = 0;
  else if (jumped) { room_from = room_shown; room_frame = frames_done; easing = 1; }
  room_snap = 0;
  memcpy(room_map, wram + 0x9F8, 3);
  room_target = *target;
  uint64_t t = frames_done - room_frame;
  if (t >= EASE_FRAMES) easing = 0;
  room_shown = *target;
  if (easing) {
    double u = (double)t / EASE_FRAMES;
    u = u * u * (3 - 2 * u);
    room_shown.x0 = room_from.x0 + (int)lround((target->x0 - room_from.x0) * u);
    room_shown.y0 = room_from.y0 + (int)lround((target->y0 - room_from.y0) * u);
    room_shown.x1 = room_from.x1 + (int)lround((target->x1 - room_from.x1) * u);
    room_shown.y1 = room_from.y1 + (int)lround((target->y1 - room_from.y1) * u);
    Box screen = {clamp(camera_x, target->x0, target->x1), clamp(camera_y, target->y0, target->y1),
                  clamp(camera_x + 160, target->x0, target->x1), clamp(camera_y + 144, target->y0, target->y1)};
    if (screen.x0 < screen.x1 && screen.y0 < screen.y1) box_add(&room_shown, &screen);
  }
  return room_shown;
}
/* A room narrower or shorter than the view is centred. */
static void view_origin(const Box *room, int cx, int cy, int width, int height, int *x, int *y) {
  int maxx = room->x1 - width, maxy = room->y1 - height;
  *x = maxx < room->x0 ? room->x0 + (maxx - room->x0) / 2 : clamp(cx - (width - 160) / 2, room->x0, maxx);
  *y = maxy < room->y0 ? room->y0 + (maxy - room->y0) / 2 : clamp(cy - (height - 144) / 2, room->y0, maxy);
}

/* The background is drawn map cell by cell. mirror[b]: b with its bits reversed, for a flipped tile. */
static uint8_t mirror[256];
static void init_mirror(void) {
  for (int b = 0; b < 256; b++) for (int i = 0; i < 8; i++) mirror[b] |= ((b >> i) & 1) << (7 - i);
}
typedef struct { const uint8_t *data; unsigned attr; } Cell;
typedef struct { const Cell *cells; int cols, gx0, gy0, x0, x1, y0, y1, wx0, wy0; } Grid;
/* The level from view column x0 up to x1 on line y. */
static void draw_span(uint16_t *row, const Grid *g, const uint16_t *colors, int y, int x0, int x1) {
  int wy = g->wy0 + y, wx = g->wx0 + x0;
  const Cell *line = &g->cells[((wy >> 3) - g->gy0) * g->cols];
  for (int x = x0; x < x1;) {
    const Cell *c = &line[(wx >> 3) - g->gx0];
    int skip = wx & 7, n = 8 - skip;
    if (n > x1 - x) n = x1 - x;
    if (!c->data) memset(row + x, 0, (size_t)n * 2);
    else {
      const uint8_t *p = c->data + ((c->attr & 64) ? 7 - (wy & 7) : wy & 7) * 2;
      unsigned lo = p[0], hi = p[1];
      if (c->attr & 32) { lo = mirror[lo]; hi = mirror[hi]; }
      lo <<= skip; hi <<= skip;
      const uint16_t *pal = colors + (c->attr & 7) * 4;
      for (int i = 0; i < n; i++, lo <<= 1, hi <<= 1) row[x + i] = pal[((lo >> 7) & 1) | ((hi >> 6) & 2)];
    }
    x += n; wx += n;
  }
}
/* Palette entry (0-31) at view pixel x,y plus 0x100 for BG priority, -1 where none is drawn */
static int background_at(const Grid *g, int x, int y) {
  if (x < g->x0 || x >= g->x1 || y < g->y0 || y >= g->y1) return -1;
  int wx = g->wx0 + x, wy = g->wy0 + y;
  const Cell *c = &g->cells[((wy >> 3) - g->gy0) * g->cols + (wx >> 3) - g->gx0];
  if (!c->data) return -1;
  int py = (c->attr & 64) ? 7 - (wy & 7) : wy & 7, bit = (c->attr & 32) ? wx & 7 : 7 - (wx & 7);
  const uint8_t *p = c->data + py * 2;
  int pixel = ((p[0] >> bit) & 1) | ((p[1] >> bit) & 1) << 1;
  return (int)((c->attr & 7) * 4 + pixel) | (c->attr & 128) << 1;
}
#define PALETTE_UPLOAD_LINES 24    /* 01:5E0B uploads 16 palettes one HBlank-gated block at a time: done by about line 16 */

#define PIC_W (160 + 2 * GB_WIDE_MAX)
/* The game's spawn window, 8 past the screen as it ships, side + 8 here, but never past 48: the scanner (00:0FA9) only reads the object
 * lists of the screen columns (256 pixels) the window's two edges are in. Wider than 256, a window can lie across three columns and skip
 * the middle one: one-screen rooms lost their exits and doors (Water Town Gates, 0.37-0.44). At 48 it's 256 wide, two columns at most;
 * objects then appear 40 pixels past the real screen, not at the edge of a wider view. tests/spawntest.py. */
#define SPAWN_MAX 48
static void spawnWindow(int side) {
  int m = side ? side + 8 : 8;
  if (m > SPAWN_MAX) m = SPAWN_MAX;
  if (romn <= 0x5085 || rom[0x506D] != 0xD6 || rom[0x5084] != 0xC6) return;    /* not this game's code */
  gbx_rompoke(0x506E, m);           /* 01:506D sub $08 */
  gbx_rompoke(0x5085, 0xA0 + m);    /* 01:5084 add $A8 */
}

static int shown_left, shown_top, shown_bg_out;
int gb_wide_bg_out(void) { return shown_bg_out; }   /* for the test: tiles of BG-drawn objects off the real screen */
int gb_wide_left(void) { return shown_left; }
int gb_wide_top(void) { return shown_top; }

/** The width to draw, from the app: 160 is WIDE VIEW off. Between frames. */
void gb_view(int width, int height) {
  (void)height;                     /* 144: the taller views are upstream's, and need its activation */
  if (width < 160) width = 160;
  if (width > PIC_W) width = PIC_W;
  width &= ~1;
  if (width == view_w) return;
  int was = view_w > 160;
  view_w = width;
  if (gb_rom(&romn)) {
    rom = gb_rom(&romn);
    spawnWindow((width - 160) / 2);
  }
  if (!was && width > 160) gb_wide_reset();
  hook_set(width > 160);
  room_snap = 1;
}

/** Called with each new picture. Draws the frame into out and returns its width, or 0 for the real picture alone. */
int gb_wide_frame(const uint16_t *native, uint16_t *out) {
  if (view_w <= 160) return 0;
  rom = gb_rom(&romn);
  if (!rom) return 0;
  wram = gbx_wram(); vram = gbx_vram();
  spawnWindow((view_w - 160) / 2);  /* every frame: loading a ROM brings the original bytes back */
  frames_done++;
  const int width = view_w, height = 144;
  const uint8_t *bgp = gb_cgbpal(0), *objp = gb_cgbpal(1);
  if (!line0_taken) { memcpy(line0_bg, bgp, 64); memcpy(line0_obj, objp, 64); }   /* no upload this frame */
  line0_taken = 0;

  lcdc = gb_peek(0xFF40);
  if (!(lcdc & 0x80)) return 0;
  window_y = gb_peek(0xFF4A); window_x = gb_peek(0xFF4B) - 7;
  /* Until the first commit after a reset, C9FB/C9FD are the best guess */
  int dx = committed ? committed_dx : built_dx, dy = committed ? committed_dy : built_dy;
  camera_x = (uint16_t)((committed ? committed_x : (int)word(wram + 0x9FB)) - dx);
  camera_y = (uint16_t)((committed ? committed_y : (int)word(wram + 0x9FD)) - dy);
  scroll_x = camera_x + dx; scroll_y = camera_y + dy;
  int bar0 = status_bar(lcdc, window_x, window_y);
  if (bar0 || !window_covers()) status_lines = bar0;
  if (abs(camera_x - cut_x) > 64 || abs(camera_y - cut_y) > 64) room_snap = 1;    /* a cut in a scene */
  cut_x = camera_x; cut_y = camera_y;

  int ready = 0;
  if (wram[0x9FA] && (lcdc & 1)) {
    unsigned t, a;
    Room r0 = room_at(camera_x, camera_y, bar0, 0);
    ready = world_tile(scroll_x, scroll_y, &t, &a) && map_agrees(bar0) && !room_fits_screen(&r0);
  }
  int strip = window_strip();
  if (!ready || (window_covers() && !strip)) { room_snap = 1; return 0; }

  const int town = town_room();
  const int hud = town ? 0 : window_covers() ? status_lines : bar0;
  const int bottom = town ? TOWN_PANEL : hud;
  const Room room = room_at(camera_x, camera_y, hud, 1);
  const int world_height = height - strip;
  const Box box = shown_room(native, &room.box);
  int min_x = box.x0, min_y = box.y0, max_x = box.x1, max_y = box.y1 - hud;
  int origin_x, origin_y;
  view_origin(&box, camera_x, camera_y, width, height - (bottom - hud), &origin_x, &origin_y);
  int left = camera_x - origin_x, top = camera_y - origin_y;
  shown_left = left; shown_top = top;
  int room_left = clamp(min_x - origin_x, 0, width), room_right = clamp(max_x - origin_x, 0, width);
  int room_top = clamp(min_y - origin_y, 0, world_height), room_bottom = clamp(max_y - origin_y, 0, world_height);
  Grid g;
  g.wx0 = origin_x + (scroll_x - camera_x);
  g.wy0 = origin_y + (scroll_y - camera_y);
  g.x0 = clamp(min_x - origin_x > -g.wx0 || town ? min_x - origin_x : -g.wx0, 0, width);
  g.x1 = clamp(max_x - origin_x, g.x0, width);
  g.y0 = clamp(min_y - origin_y > -g.wy0 ? min_y - origin_y : -g.wy0, 0, world_height);
  g.y1 = clamp(max_y - origin_y, g.y0, world_height);
  g.gx0 = (g.wx0 + g.x0) >> 3;
  g.gy0 = (g.wy0 + g.y0) >> 3;
  g.cols = g.x1 > g.x0 ? ((g.wx0 + g.x1 - 1) >> 3) - g.gx0 + 1 : 0;
  int rows = g.y1 > g.y0 ? ((g.wy0 + g.y1 - 1) >> 3) - g.gy0 + 1 : 0;
  /* Background objects replace map cells, the last one listed on top. */
  enum { OVER_W = PIC_W / 8 + 2, OVER_H = 144 / 8 + 2 };
  static Cell cells[OVER_W * OVER_H];
  static int overlay[OVER_W * OVER_H];
  g.cells = cells;
  if (!mirror[1]) init_mirror();
  /* The fade correction below is only needed when the palettes moved since line 0. */
  const int lines = memcmp(line0_bg, bgp, 64) || memcmp(line0_obj, objp, 64) ? PALETTE_UPLOAD_LINES : 0;
  uint16_t colors[64], stale[64];
  for (int i = 0; i < 64; i++) {
    const uint8_t *p = i < 32 ? bgp + i * 2 : objp + (i - 32) * 2, *q = i < 32 ? line0_bg + i * 2 : line0_obj + (i - 32) * 2;
    colors[i] = (uint16_t)color_of(p[0] | p[1] << 8);
    if (lines) stale[i] = (uint16_t)color_of(q[0] | q[1] << 8);
  }
  /* The real picture goes over the middle at the end, so nothing is worked out for what it covers: view columns mid0 to mid1 on lines
   * cover0 to cover1. Its first `lines` lines still need the level and sprites underneath, for the fade correction: free0 is below them. */
  const int clip_x = room_left > left ? room_left - left : 0;
  const int copy_width = clamp(room_right - left, 0, 160) - clip_x;
  const int mid0 = left + clip_x, mid1 = copy_width > 0 ? mid0 + copy_width : mid0;
  const int cover0 = top > room_top ? top : room_top;
  const int cover1 = top + 144 - strip < room_bottom ? top + 144 - strip : room_bottom;
  const int free0 = top + lines > cover0 ? top + lines : cover0;
  for (int i = 0; i < OVER_W * OVER_H; i++) overlay[i] = -1;
  int tile_x = g.wx0 >> 3, tile_y = g.wy0 >> 3;
  shown_bg_out = 0;
  for (int i = 0; i < bg_visible.count; i++) {
    const BackgroundTile *t = &bg_visible.tiles[i];
    int x = t->x - tile_x, y = t->y - tile_y;
    if (x >= 0 && x < OVER_W && y >= 0 && y < OVER_H) overlay[y * OVER_W + x] = i;
    if (t->x * 8 + 8 <= scroll_x || t->x * 8 >= scroll_x + 160) shown_bg_out++;
  }
  for (int cy = 0; cy < rows; cy++) for (int cx = 0; cx < g.cols; cx++) {
    Cell *c = &cells[cy * g.cols + cx];
    unsigned tile, attr;
    const int wx = (g.gx0 + cx) * 8, wy = (g.gy0 + cy) * 8;
    c->data = NULL;
    if (wx - g.wx0 >= mid0 && wx - g.wx0 + 8 <= mid1 && wy - g.wy0 >= free0 && wy - g.wy0 + 8 <= cover1) continue;   /* under the real picture */
    if (room.masked && (wx >> 8 > 31 || wy >> 8 > 31 || !(room.sectors[wy >> 8] >> (wx >> 8) & 1))) continue;   /* another picture's */
    if (!world_tile(wx, wy, &tile, &attr)) continue;
    int ox = g.gx0 + cx - tile_x, oy = g.gy0 + cy - tile_y;
    size_t pattern = 0;
    if (ox >= 0 && ox < OVER_W && oy >= 0 && oy < OVER_H && overlay[oy * OVER_W + ox] >= 0) {
      const BackgroundTile *t = &bg_visible.tiles[overlay[oy * OVER_W + ox]];
      tile = t->tile; attr = t->attr; pattern = t->pattern;
    }
    c->data = pattern && pattern + 16 <= romn ? rom + pattern : vram + tile_data(lcdc, tile, attr);
    c->attr = attr;
  }
  for (int y = 0; y < height; y++) {
    uint16_t *row = out + y * width;
    if (y < g.y0 || y >= g.y1 || g.x0 >= g.x1) { memset(row, 0, (size_t)width * 2); continue; }
    memset(row, 0, (size_t)g.x0 * 2);
    memset(row + g.x1, 0, (size_t)(width - g.x1) * 2);
    if (y >= cover0 && y < cover1 && mid1 > mid0) {
      draw_span(row, &g, colors, y, g.x0, mid0 < g.x1 ? mid0 : g.x1);
      draw_span(row, &g, colors, y, mid1 > g.x0 ? mid1 : g.x0, g.x1);
    } else draw_span(row, &g, colors, y, g.x0, g.x1);
  }
  /* The native picture's top lines, for the fade correction below: the palette entry at each pixel (0-31 BG, 32-63 OBJ, 255 none) */
  uint8_t entry[PALETTE_UPLOAD_LINES][160];
  for (int y = 0; y < lines; y++) for (int x = clip_x; x < clip_x + copy_width; x++) {
    int bg = background_at(&g, left + x, top + y);
    entry[y][x] = bg < 0 ? 255 : (uint8_t)(bg & 31);
  }
  /* Sprites, from the last listed: OAM triples (biased Y, biased X, attributes), the cel's block has their 32-byte 8x16 tile pairs */
  for (int n = visible.count - 1; n >= 0; n--) {
    const Draw *d = &visible.draws[n];
    unsigned count = rom8(d->bank, d->descriptor + 32);
    for (int i = (int)count - 1; i >= 0; i--) {
      unsigned layout = d->descriptor + 35 + i * 3, attr = rom8(d->bank, layout + 2);
      int sy = d->y - camera_y + top + (int8_t)rom8(d->bank, layout) - 16;
      int sx = d->x - camera_x + left + (int8_t)rom8(d->bank, layout + 1) - 8;
      if (sx + 8 <= room_left || sx >= room_right || sy + 16 <= room_top || sy >= room_bottom) continue;
      if (sx >= mid0 && sx + 8 <= mid1 && sy >= free0 && sy + 16 <= cover1) continue;   /* under the real picture */
      for (int y = 0; y < 16; y++) {
        int yy = sy + y;
        if (yy < room_top || yy >= room_bottom) continue;
        int py = (attr & 64) ? 15 - y : y;
        unsigned gr = d->graphics + 1 + i * 32 + py * 2, lo = rom8(d->bank, gr), hi = rom8(d->bank, gr + 1);
        for (int x = 0; x < 8; x++) {
          int xx = sx + x;
          if (xx < room_left || xx >= room_right) continue;
          int bit = (attr & 32) ? x : 7 - x, pixel = ((lo >> bit) & 1) | ((hi >> bit) & 1) << 1;
          if (!pixel) continue;
          if (xx >= mid0 && xx < mid1 && yy >= free0 && yy < cover1) continue;
          int bg = background_at(&g, xx, yy);
          if (bg >= 0 && (bg & 3) && ((attr & 128) || (bg & 0x100))) continue;
          int e = 32 + (int)(attr & 7) * 4 + pixel;
          out[yy * width + xx] = colors[e];
          int ny = yy - top, nx = xx - left;
          if (ny >= 0 && ny < lines && nx >= clip_x && nx < clip_x + copy_width) entry[ny][nx] = (uint8_t)e;
        }
      }
    }
  }
  /* The window's own background (the colour of most of it) continues beside it: the status bar's is black, the intro's a letterbox */
  const uint16_t *bar = native + (144 - strip) * 160;
  uint16_t fill = 0; int votes = 0, cnt = 0;
  for (int i = 0; i < strip * 160; i++) { if (!votes) fill = bar[i]; votes += bar[i] == fill ? 1 : -1; }
  for (int i = 0; i < strip * 160; i++) cnt += bar[i] == fill;
  if (cnt * 2 <= strip * 160) fill = 0;
  const int bar_left = (width - 160) / 2;
  for (int y = 0; y < strip; y++) {
    uint16_t *row = out + (world_height + y) * width;
    for (int x = 0; x < width; x++) row[x] = fill;
  }
  /* The hardware's exact picture, raster effects and all, with the status bar at the bottom. During a fade the top lines are drawn
   * before their palettes are uploaded: where the predicted colour still shows its line-0 value, use the settled one. */
  for (int y = 0; y < 144 - strip; y++) {
    if (y + top < room_top || y + top >= room_bottom || copy_width <= 0) continue;
    uint16_t *at = out + (y + top) * width + left + clip_x;
    memcpy(at, native + y * 160 + clip_x, (size_t)copy_width * 2);
    for (int x = 0; y < lines && x < copy_width; x++) {
      unsigned e = entry[y][clip_x + x];
      if (e < 64 && at[x] == stale[e]) at[x] = colors[e];
    }
  }
  for (int y = 0; y < strip; y++) memcpy(out + (world_height + y) * width + bar_left, bar + y * 160, 320);
  return width;
}
