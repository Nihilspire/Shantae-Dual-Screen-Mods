/* gbcore.c - minimal libretro frontend around the statically linked Gambatte core.
 * Shared by the Android JNI layer (gbjni.c) and the desktop test driver (drive.c). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>
#include "libretro.h"
#include "gbcore.h"

void gb_wide_reset(void);
unsigned gbx_peek(unsigned a);
unsigned gbx_color(unsigned bgr15);
void gbx_poke(unsigned a, unsigned v);
const unsigned char *gbx_wram(void);
const unsigned char *gbx_vram(void);
const unsigned char *gbx_cgbpal(int obj);
extern int gbx_overclock;           /* cpu.cpp (Dual patch): CPU cycle divisor shift, 0 = off */

static char sysdir[512] = ".", savedir[512] = ".";
static uint16_t fb[160 * 144];
static int fb_w = 160, fb_h = 144, fb_new;
static int16_t abuf[16384 * 2];
static volatile int alen;
static uint16_t pad;
static int loaded, var_update;
static void *rombuf; static size_t romsize;

/* Core options we care about; everything else gets the core's default. */
static struct { const char *k; char v[32]; } opts[] = {
  { "gambatte_gb_hwmode", "GBA" },                 /* Shantae's GBA bonus (restart required) */
  { "gambatte_gbc_color_correction", "GBC only" },
  { "gambatte_gbc_color_correction_mode", "accurate" },
  { "gambatte_gbc_frontlight_position", "central" },
  { "gambatte_mix_frames", "disabled" },
  { "gambatte_audio_resampler", "sinc" },
  { "gambatte_gb_bootloader", "disabled" },
  { "gambatte_up_down_allowed", "disabled" },
  { "gambatte_gb_colorization", "disabled" },
  { "gambatte_dark_filter_level", "0" },
  { "gambatte_rumble_level", "0" },
  { "gambatte_show_gb_link_settings", "disabled" },
  { "gambatte_gb_link_mode", "Not Connected" },
};
extern int gbx_nolimit;              /* ppu.cpp (Dual patch): draw sprites past the 10-per-line limit */
void gb_set_option(const char *k, const char *v) {
  if (!strcmp(k, "dual_sprite_limit")) { gbx_nolimit = !strcmp(v, "off"); return; }
  for (size_t i = 0; i < sizeof opts / sizeof *opts; i++)
    if (!strcmp(opts[i].k, k)) { snprintf(opts[i].v, sizeof opts[i].v, "%s", v); var_update = 1; }
}

static void core_log(enum retro_log_level l, const char *fmt, ...) {
  char b[512]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  gb_log(b);
}
static bool env_cb(unsigned cmd, void *data) {
  switch (cmd) {
  case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback *)data)->log = core_log; return true;
  case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)data = sysdir; return true;
  case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char **)data = savedir; return true;
  case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: return *(enum retro_pixel_format *)data == RETRO_PIXEL_FORMAT_RGB565;
  case RETRO_ENVIRONMENT_GET_VARIABLE: {
    struct retro_variable *v = data; v->value = NULL;
    for (size_t i = 0; i < sizeof opts / sizeof *opts; i++) if (!strcmp(opts[i].k, v->key)) v->value = opts[i].v;
    return v->value != NULL;
  }
  case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)data = var_update; var_update = 0; return true;
  case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)data = true; return true;
  case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned *)data = 0; return true;
  case RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE: *(int *)data = 3; return true;
  case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
  case RETRO_ENVIRONMENT_SET_MEMORY_MAPS: case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
  case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS: case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
  case RETRO_ENVIRONMENT_SET_SUPPORT_ACHIEVEMENTS: return true;
  default: return false;
  }
}
static void video_cb(const void *d, unsigned w, unsigned h, size_t pitch) {
  if (!d) return;
  if (w > 160) w = 160; if (h > 144) h = 144;
  fb_w = w; fb_h = h;
  for (unsigned y = 0; y < h; y++) memcpy(fb + y * w, (const uint8_t *)d + y * pitch, w * 2);
  fb_new = 1;
}
static size_t audio_batch_cb(const int16_t *d, size_t frames) {
  int n = (int)frames * 2, cap = (int)(sizeof abuf / 2);
  if (alen + n > cap) n = cap - alen;
  if (n > 0) { memcpy(abuf + alen, d, n * 2); alen += n; }
  return frames;
}
static void audio_cb(int16_t l, int16_t r) { int16_t s[2] = {l, r}; audio_batch_cb(s, 1); }
static void poll_cb(void) {}
static int16_t input_cb(unsigned port, unsigned dev, unsigned idx, unsigned id) {
  if (port || dev != RETRO_DEVICE_JOYPAD) return 0;
  if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return pad;
  return (pad >> id) & 1;
}

int gb_init(const char *sys, const char *save) {
  snprintf(sysdir, sizeof sysdir, "%s", sys); snprintf(savedir, sizeof savedir, "%s", save);
  retro_set_environment(env_cb);
  retro_set_video_refresh(video_cb);
  retro_set_audio_sample(audio_cb);
  retro_set_audio_sample_batch(audio_batch_cb);
  retro_set_input_poll(poll_cb);
  retro_set_input_state(input_cb);
  retro_init();
  return 0;
}
int gb_load_mem(const void *data, size_t n, const char *path) {
  free(rombuf); rombuf = malloc(n); memcpy(rombuf, data, n); romsize = n;
  struct retro_game_info gi = { path, rombuf, n, NULL };
  if (loaded) retro_unload_game();
  loaded = retro_load_game(&gi);
  if (loaded) retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
  alen = 0;
  if (loaded) gb_wide_reset();
  return loaded ? 0 : -3;
}
int gb_load(const char *path) {
  FILE *f = fopen(path, "rb"); if (!f) return -1;
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  void *b = malloc(n);
  if (fread(b, 1, n, f) != (size_t)n) { fclose(f); free(b); return -2; }
  fclose(f);
  int r = gb_load_mem(b, n, path); free(b); return r;
}
void gb_unload(void) { if (loaded) retro_unload_game(); loaded = 0; }
void gb_wide_reset(void);
void gb_reset(void) { if (loaded) { retro_reset(); gb_wide_reset(); } }
void gb_set_pad(unsigned bits) { pad = bits; }
/* WIDE VIEW (wide.c): the picture with the world around it, for the frame the core just finished. */
int gb_wide_frame(const uint16_t *native, uint16_t *out);
void gb_wide_reset(void);
static uint16_t wfb[(160 + 2 * GB_WIDE_MAX) * 144];
static int wfb_w, wide_skip;
void gb_wide_skip(int skip) { wide_skip = skip; }
void gb_run(void) { if (loaded) { retro_run(); if (fb_new && !wide_skip) wfb_w = gb_wide_frame(fb, wfb); } }
const uint16_t *gb_frame(int *w, int *h, int *fresh) {
  *fresh = fb_new; fb_new = 0;
  if (wfb_w) { *w = wfb_w; *h = 144; return wfb; }
  *w = fb_w; *h = fb_h; return fb;
}
const uint16_t *gb_native(int *w) { *w = fb_w; return fb; }
int gb_audio(int16_t *out, int max) { int n = alen < max ? alen : max; memcpy(out, abuf, n * 2);
  memmove(abuf, abuf + n, (alen - n) * 2); alen -= n; return n; }
double gb_fps(void) { struct retro_system_av_info av; retro_get_system_av_info(&av); return av.timing.fps; }
double gb_rate(void) { struct retro_system_av_info av; retro_get_system_av_info(&av); return av.timing.sample_rate; }
int gb_peek(unsigned a) { return loaded ? (int)gbx_peek(a & 0xFFFF) : 0; }
void gb_poke(unsigned a, unsigned v) { if (loaded) gbx_poke(a & 0xFFFF, v & 0xFF); }
void gbx_jump(unsigned pc, unsigned sp, unsigned bank);
void gbx_write(unsigned a, unsigned v);
/* The game starts a saved/debug-selected map through a dispatcher on the map id: 0A:4919 compares $CBFD and far-calls
 * that map's scene entry (SHANTAE-RAM.md, "Dev room warp"). Jumping there between frames with a fresh stack does
 * the same mid-game: the scene sets up the room, graphics and music; the save block is left alone. */
int gb_warp(int map) {
  if (!loaded || map < 0 || map > 0x43) return -1;
  gbx_poke(0xCBFF, 1);              /* not the debug list (Select would open it) */
  gbx_poke(0xCBFC, 1);              /* "start at map $CBFD" */
  gbx_poke(0xCBFD, (unsigned)map);
  gbx_poke(0xCBF3, 0);              /* no pending exit warp code */
  for (unsigned v = 0xC000; v < 0xC010; v++) gbx_poke(v, 0);   /* per-bank room variables: each scene's first room */
  gbx_poke(0xCB71, 0);              /* arrival point: the scene's default */
  gbx_write(0xFF70, 3);             /* WRAM bank 3, as in play */
  gbx_poke(0xFF91, 0x0A);           /* the game's copy of the ROM bank */
  gbx_jump(0x4919, 0xCFFF, 0x0A);
  return 0;
}
int gb_wram(unsigned bank, unsigned off) { return loaded ? gbx_wram()[(bank & 7) * 0x1000 + (off & 0xFFF)] : 0; }
int gb_vram(unsigned bank, unsigned off) { return loaded ? gbx_vram()[(bank & 1) * 0x2000 + (off & 0x1FFF)] : 0; }
const uint8_t *gb_cgbpal(int obj) { static uint8_t z[64]; return loaded ? gbx_cgbpal(obj) : z; }
const uint8_t *gb_sram(size_t *n) { *n = loaded ? retro_get_memory_size(RETRO_MEMORY_SAVE_RAM) : 0;
  return *n ? retro_get_memory_data(RETRO_MEMORY_SAVE_RAM) : NULL; }
size_t gb_state_size(void) { return loaded ? retro_serialize_size() : 0; }
int gb_state_save(void *buf, size_t n) { return loaded && retro_serialize(buf, n); }
int gb_state_load(const void *buf, size_t n) { int r = loaded && retro_unserialize(buf, n); if (r) gb_wide_reset(); return r; }
void gb_set_overclock(int on) { gbx_overclock = on ? 1 : 0; }
int gb_overclock_supported(void) { return 1; }
int gb_backend(void) { return 0; }
const uint8_t *gb_rom(size_t *n) { *n = loaded && rombuf ? romsize : 0; return *n ? rombuf : NULL; }

/* Video snapshot (GB_SNAP_LEN bytes): VRAM banks 0+1 (0x4000) | BG pal 64 | OBJ pal 64 | OAM 160 |
 * LCDC SCY SCX WY WX | 64 colours as the core displays them (BG 0-31, OBJ 32-63), RGB888 (192). */
void gb_snapshot(uint8_t *b) {
  for (int i = 0; i < 0x4000; i++) b[i] = (uint8_t)gb_vram(i >> 13, i);
  const uint8_t *bp = gb_cgbpal(0), *op = gb_cgbpal(1);
  memcpy(b + 0x4000, bp, 64); memcpy(b + 0x4040, op, 64);
  for (int i = 0; i < 160; i++) b[0x4080 + i] = (uint8_t)gb_peek(0xFE00 + i);
  b[0x4120] = gb_peek(0xFF40); b[0x4121] = gb_peek(0xFF42); b[0x4122] = gb_peek(0xFF43);
  b[0x4123] = gb_peek(0xFF4A); b[0x4124] = gb_peek(0xFF4B);
  for (int i = 0; i < 64; i++) {
    const uint8_t *p = i < 32 ? bp + i * 2 : op + (i - 32) * 2;
    unsigned c = loaded ? gbx_color(p[0] | p[1] << 8) : 0;      /* RGB565 */
    b[0x4125 + i * 3] = ((c >> 11) & 31) * 255 / 31; b[0x4126 + i * 3] = ((c >> 5) & 63) * 255 / 63; b[0x4127 + i * 3] = (c & 31) * 255 / 31;
  }
}

/* Battery save RAM: load after gb_load*, save whenever it changed (returns 1 if written). */
static uint8_t *sram_copy; static size_t sram_copy_n;
int gb_sram_load(const char *path) {
  size_t n; uint8_t *s = (uint8_t *)gb_sram(&n); if (!s) return -1;
  FILE *f = fopen(path, "rb"); int r = -2;
  if (f) { r = fread(s, 1, n, f) == n ? 0 : -3; fclose(f); }
  free(sram_copy); sram_copy = malloc(n); memcpy(sram_copy, s, n); sram_copy_n = n;
  return r;
}
int gb_sram_save(const char *path, int force) {
  size_t n; const uint8_t *s = gb_sram(&n); if (!s) return 0;
  if (!force && sram_copy && sram_copy_n == n && !memcmp(sram_copy, s, n)) return 0;
  char tmp[600]; snprintf(tmp, sizeof tmp, "%s.tmp", path);
  FILE *f = fopen(tmp, "wb"); if (!f) return -1;
  int ok = fwrite(s, 1, n, f) == n; fclose(f);
  if (!ok || rename(tmp, path)) return -1;
  if (sram_copy_n != n) { free(sram_copy); sram_copy = malloc(n); sram_copy_n = n; }
  memcpy(sram_copy, s, n);
  return 1;
}
