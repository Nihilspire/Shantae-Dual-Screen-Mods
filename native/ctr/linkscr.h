/* linkscr.h - the Link screen of Shantae Dual 3DS, in C: draws into a 320x240 RGB565 buffer (row-major) from the
 * game's RAM, VRAM and the player's ROM. No platform code: the 3DS frontend copies the buffer to the bottom screen,
 * and the desktop test (`linkhost`) writes it to a picture. */
#pragma once
#include <stdint.h>
#include <stddef.h>

#define LINK_W 320
#define LINK_H 240

typedef struct {
    int (*peek)(unsigned addr);                   /* CPU view (C000-CFFF, HRAM, I/O ...) */
    int (*wram)(unsigned bank, unsigned off);     /* WRAM bank 0-7, offset 0-FFF */
    int (*vram)(unsigned bank, unsigned off);     /* VRAM bank 0-1, offset 0-1FFF */
    const uint8_t *(*cgbpal)(int obj);            /* 64 bytes: 8 palettes x 4 colours, BGR555 (0 = BG, 1 = OBJ) */
    const uint8_t *rom; size_t romLen;            /* the player's ROM (the map reads the level data from it) */
    unsigned buttons;                             /* Game Boy buttons held: libretro joypad bits (Select = bit 2) */
    unsigned fps;                                 /* emulated frames in the last second, for the corner (0 = hide) */
} LinkIn;

/* Loads the font from the player's ROM (LZSS at 0x3964A3). Returns 0 when the ROM is too short. */
int link_init(const uint8_t *rom, size_t len);
/* Every emulated frame: catches the inventory icons, and draws a new room's map a few rows at a time. */
void link_work(const LinkIn *in);
/* Draws the page; returns 1 when anything changed (the frontend can skip the copy otherwise). */
int link_draw(uint16_t *fb, const LinkIn *in);
/* A tap at (x, y) in Link screen pixels: switches page, equips an item (returns the item 0-11 to write to $CA84),
 * LINK_TAP_MENU for the gear in the top right corner, or -1 for nothing to do. */
#define LINK_TAP_MENU (-2)
int link_tap(int x, int y, const LinkIn *in);

/* The menu behind the gear (the game is paused while it's open): three state slots with a picture and the place each was
 * saved, RESUME and QUIT. The frontend owns the files and fills this in. */
#define MENU_SLOTS 3
#define THUMB_W 80
#define THUMB_H 72
typedef struct {
    int have[MENU_SLOTS];                        /* the slot holds a state */
    const uint16_t *thumb[MENU_SLOTS];           /* THUMB_W x THUMB_H RGB565, or NULL */
    char place[MENU_SLOTS][24];                  /* where it was saved */
    const char *msg;                             /* a line under the slots, or NULL */
    unsigned fps;                                /* emulated frames a second before the pause (0 = hide) */
    int n3ds;                                    /* a New 3DS: the OLD 3DS SPEED setting can be changed */
    unsigned drawn;                              /* frames shown a second (fewer than fps when FRAME SKIP skips) */
    int msGb, msTop, msLink, msMax;              /* 0.12 timing, tenths of a ms (0 = none yet): a Game Boy frame, the
                                                    top screen and the Link screen per shown frame, the slowest loop */
} LinkMenu;
/* MENU_REDRAW: the menu changed (its settings page opened or closed, a button was given): draw it again */
enum { MENU_NONE = -1, MENU_RESUME = 0, MENU_QUIT = 1, MENU_BORDERS = 2, MENU_REDRAW = 3, MENU_OLD3DS = 4, MENU_FRAMESKIP = 5, MENU_SAVE = 10, MENU_LOAD = 20 };   /* + slot 0-2 */
void link_menu_draw(uint16_t *fb, const LinkMenu *m);
int link_menu_tap(int x, int y, const LinkMenu *m);
/* B or START in the menu: back from the settings page (returns 1), or 0 to resume the game */
int link_menu_back(void);

/* The buttons (the menu's SETTINGS page, kept in the settings file): which 3DS button does each action. The D-pad is
 * fixed, L+X / L+Y stay the quick save and load, and Start+Select quits. */
enum { KEY3_A, KEY3_B, KEY3_X, KEY3_Y, KEY3_L, KEY3_R, KEY3_ZL, KEY3_ZR, KEY3_START, KEY3_SELECT, KEY3_N };
enum { ACT_A, ACT_B, ACT_START, ACT_SELECT, ACT_FF, ACT_N };   /* Game Boy A, B, Start, Select; fast-forward (held) */
int link_key(int act);                 /* the KEY3_* button for an action */
int link_menu_listening(void);         /* the action waiting for a button on the settings page, or -1 */
void link_menu_bind(int key3);         /* that button (KEY3_*), or -1 to cancel; a button already used swaps over */
/* the place name now (for a state's label) */
const char *link_place(const LinkIn *in);

/* Settings and the PROGRESS > STATS counts, kept on the SD card by the frontend: link_prefs_save fills buf (returns the
 * length, 0 when unchanged since the last save), link_prefs_load restores them. */
size_t link_prefs_save(uint8_t *buf, size_t cap);
void link_prefs_load(const uint8_t *buf, size_t n);
/* the top-screen borders setting: -1 reads it, 0 off, 1 on (returns the setting) */
int link_borders(int set);
/* OLD 3DS SPEED (0.11): a New 3DS runs at the old one's 268 MHz, no L2 cache and no NO SLOWDOWN; -1 reads, 0 off, 1 on */
int link_old3ds(int set);
/* FRAME SKIP (0.12): at the old 3DS's speed, the loop keeps to the clock and leaves out pictures it has no time for,
 * so the game and music stay at full speed; -1 reads, 0 off, 1 on */
int link_frameskip(int set);
/* the stylus held at (x, y) on the Link screen, or (-1, -1) when lifted: signing the ending card */
void link_pen(int x, int y);
/* a signed ending card, once, for the frontend to append to its file (returns the length, 0 if none) */
size_t link_hall_take(uint8_t *buf, size_t cap);
/* The captured inventory icons, to keep on the SD card: link_icons_save fills buf (returns the length, 0 if none or
 * unchanged since the last save), link_icons_load restores them. */
size_t link_icons_save(uint8_t *buf, size_t cap);
void link_icons_load(const uint8_t *buf, size_t n);
/* A drag on the Link screen by (dx, dy) pixels (the map pans; a tap is link_tap on release without a drag). */
void link_drag(int dx, int dy, const LinkIn *in);
/* The top screen's borders into a 400x240 RGB565 buffer (row-major): the area's own tile, darkened, a frame around the
 * game at (80,12) 240x216, and hearts/gems/lives and the place/clock in the side borders. Returns 1 when it changed. */
int link_border(uint16_t *buf, const LinkIn *in);

/* linkmap.c (used by linkscr.c) */
void map_work(const LinkIn *in);
/* Icon keys: 0-11 items, 12-15 stones, 16-19 talismans, 20 squid, 21 firefly. drawIcon returns 0 when not captured. */
enum { ICON_ITEM = 0, ICON_STONE = 12, ICON_TAL = 16, ICON_SQUID = 20, ICON_FLY = 21, ICON_N = 22 };
/* Draws the map into the box; returns 0 when there's no picture yet (map_status() says why). tag draws a landmark's
 * label (town door numbers, cave numbers, EXIT, G for a Guardian Genie); style 0 plain, 1 her door, 2 a way out, 3 gold. */
int map_draw(uint16_t *fb, int x, int y, int w, int h, const LinkIn *in,
             int (*drawIcon)(uint16_t *fb, int key, int x, int y, int faded),
             void (*tag)(uint16_t *fb, const char *s, int x, int y, int style));
int map_has_genie(void);             /* the room on the map has a Guardian Genie */
int map_rooms(void);                 /* rooms for the ROOMS card (0: no card here) */
int map_rooms_draw(uint16_t *fb, int x, int y, int w, int h);   /* draws them; returns the height used */
const char *map_status(void);
void map_zoom(void);                 /* tap on the map: x1 -> x2 -> ALL -> x1 */
int map_zoom_level(void);            /* 1, 2, or 0 for ALL */
void map_pan(int dx, int dy);        /* drag on the map */
/* per kind (0 heart holders, 1 fireflies, 2 squids, 3 talismans) in the room on the map: left to find and total;
 * 0 while the room has no picture yet */
int map_left(int left[4], int total[4]);
