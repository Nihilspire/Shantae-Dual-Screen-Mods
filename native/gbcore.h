#pragma once
#include <stdint.h>
#include <stddef.h>
void gb_log(const char *msg);                  /* provided by the frontend */
int gb_init(const char *sysdir, const char *savedir);
int gb_load_mem(const void *data, size_t n, const char *path);
int gb_load(const char *path);
void gb_unload(void);
void gb_reset(void);
void gb_set_pad(unsigned bits);
void gb_run(void);
const uint16_t *gb_frame(int *w, int *h, int *fresh);
int gb_audio(int16_t *out, int max);
double gb_fps(void);
double gb_rate(void);
int gb_peek(unsigned a);                       /* CPU view, current banks, no side effects */
void gb_poke(unsigned a, unsigned v);
/* Dev room warp (Shantae): start the scene the game loads for map id 0-67, like resuming a save there. Call between
 * frames. Returns 0, or -1 when no game is loaded or the id is out of range. */
int gb_warp(int map);
int gb_wram(unsigned bank, unsigned off);      /* raw WRAM bank 0-7 */
int gb_vram(unsigned bank, unsigned off);      /* raw VRAM bank 0-1, off 0-0x1FFF */
const uint8_t *gb_cgbpal(int obj);             /* 64 bytes: 8 palettes x 4 colours, BGR555 little-endian */
const uint8_t *gb_sram(size_t *n);
size_t gb_state_size(void);
int gb_state_save(void *buf, size_t n);
int gb_state_load(const void *buf, size_t n);
void gb_set_option(const char *key, const char *val);  /* gambatte_* core option */
void gb_set_overclock(int on);
#define GB_SNAP_LEN (0x4125 + 192)
void gb_snapshot(uint8_t *out);
int gb_sram_load(const char *path);
int gb_sram_save(const char *path, int force);
/* First-start asset extraction (extract.c). Run on a freshly loaded ROM with blank save RAM. */
enum { GBX_MUSIC, GBX_COUNT };                   /* 0.28: the menu-art snapshots are gone, only the title theme */
typedef void (*gbx_sink)(int id, const void *data, size_t n, void *user);
typedef int (*gbx_progress)(int percent, void *user);   /* return nonzero to cancel */
int gb_extract(gbx_sink sink, gbx_progress progress, void *user);
int gb_overclock_supported(void);
const uint8_t *gb_rom(size_t *n);              /* the loaded ROM as read from the file */
/* WIDE VIEW (wide.c): gb_view asks for a picture wider than the Game Boy's: gb_frame then gives the world around the real picture
 * (at gb_wide_left, gb_wide_top in it) wherever the game is drawing a level, the real 160 x 144 elsewhere. 160 is off. Also moves the
 * game's spawn window to match. Call between frames. */
#define GB_WIDE_MAX 64
int gb_wide_left(void);
int gb_wide_top(void);
int gb_wide_bg_out(void);
void gb_wide_skip(int skip);                   /* 1: gb_run doesn't build the wide picture (a frame nobody will see). gambatte build only */
const uint16_t *gb_native(int *w);             /* the real picture alone, whatever gb_frame gives; gambatte build only */
/* Which core: 0 gambatte, 1 the static recompilation (native/recomp). The recomp also takes gb_view's height. */
int gb_backend(void);
void gb_view(int width, int height);
