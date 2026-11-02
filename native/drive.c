/* drive.c - desktop test driver. Usage: drive rom script
 * script lines:  run N [buttons]   (buttons: U D L R A B T(start) E(select))
 *                tap buttons | shot out.ppm | dump out.bin | save f | load f | peek addr [n] | poke addr val
 *                oc 0|1 (overclock) | opt key value | reset | lag N buttons (count frames where the game polled no input)
 * dump layout: CPU view $0000-$FFFF | WRAM banks 0-7 (0x8000) | VRAM banks 0-1 (0x4000) | BG pal 64 | OBJ pal 64 | SRAM */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "gbcore.h"
#include "libretro.h"
void gb_log(const char *m) { if (getenv("GBLOG")) fputs(m, stderr); }
static unsigned parse(const char *s) {
  unsigned b = 0;
  for (; s && *s; s++) switch (*s) {
    case 'U': b |= 1 << RETRO_DEVICE_ID_JOYPAD_UP; break;   case 'D': b |= 1 << RETRO_DEVICE_ID_JOYPAD_DOWN; break;
    case 'L': b |= 1 << RETRO_DEVICE_ID_JOYPAD_LEFT; break; case 'R': b |= 1 << RETRO_DEVICE_ID_JOYPAD_RIGHT; break;
    case 'A': b |= 1 << RETRO_DEVICE_ID_JOYPAD_A; break;    case 'B': b |= 1 << RETRO_DEVICE_ID_JOYPAD_B; break;
    case 'T': b |= 1 << RETRO_DEVICE_ID_JOYPAD_START; break; case 'E': b |= 1 << RETRO_DEVICE_ID_JOYPAD_SELECT; break; }
  return b;
}
static long frames;
int gbx_trace_on, gbx_pctrace_on; static FILE *pcout; static long pcmax;
void gbx_pctrace(unsigned pc, unsigned bank, unsigned op, unsigned a, unsigned hl, unsigned de) {
  if (pcmax-- <= 0) { gbx_pctrace_on = 0; return; }
  fprintf(pcout, "%02X:%04X %02X a=%02X hl=%04X de=%04X f=%ld\n", pc < 0x4000 ? 0 : bank, pc, op, a, hl, de, frames);
} static unsigned tlo = 1, thi = 0, tmax = 0, tcount = 0; static FILE *tout;
void gbx_trace_write(unsigned a, unsigned v, unsigned pc, unsigned bank, unsigned hl, unsigned sp) {
  if (a < tlo || a > thi || tcount >= tmax) return;
  tcount++;
  unsigned r[4]; for (int i = 0; i < 4; i++) r[i] = gb_peek(sp + 2 + 2 * i) | gb_peek(sp + 3 + 2 * i) << 8;
  fprintf(tout ? tout : stdout, "W %04X %02X ly=%3d pc=%02X:%04X f=%ld hl=%04X vbk=%d b96=%02X stk=%04X,%04X,%04X,%04X svbk=%d\n", a, v, gb_peek(0xFF44), bank, pc, frames, hl,
    gb_peek(0xFF4F) & 1, gb_peek(0xFF96), r[0], r[1], r[2], r[3], (gb_peek(0xFF70) & 7) ? gb_peek(0xFF70) & 7 : 1);
} static int16_t tmp[16384];
static void step(void) { gb_run(); gb_audio(tmp, 16384); frames++; }
static const char *exdir;
static void sink(int id, const void *d, size_t n, void *u) {
  static const char *names[] = { "title.wav" };
  char p[512]; snprintf(p, sizeof p, "%s/%s", exdir, names[id]); FILE *f = fopen(p, "wb"); fwrite(d, 1, n, f); fclose(f);
  fprintf(stderr, "extract: %s %zu bytes\n", names[id], n);
}
static int progress(int pct, void *u) { if (pct % 10 == 0) fprintf(stderr, "extract %d%%\n", pct); return 0; }
int main(int argc, char **argv) {
  gb_init(".", "/tmp");
  if (getenv("GBHW")) gb_set_option("gambatte_gb_hwmode", getenv("GBHW"));
  if (gb_load(argv[1])) { fprintf(stderr, "load failed\n"); return 1; }
  fprintf(stderr, "fps %.4f rate %.0f state %zu\n", gb_fps(), gb_rate(), gb_state_size());
  FILE *sc = strcmp(argv[2], "-") ? fopen(argv[2], "r") : stdin; char line[256];
  while (fgets(line, sizeof line, sc)) {
    char cmd[32] = "", a[200] = "", b[64] = ""; sscanf(line, "%31s %199s %63s", cmd, a, b);
    if (!strcmp(cmd, "run")) { int n = atoi(a); gb_set_pad(parse(b)); for (int i = 0; i < n; i++) step(); }
    else if (!strcmp(cmd, "tap")) { for (int k = 0; k < 2; k++) { gb_set_pad(k ? 0 : parse(a)); for (int i = 0; i < 6; i++) step(); } }
    else if (!strcmp(cmd, "shot")) { int w, h, f; const uint16_t *p = gb_frame(&w, &h, &f); FILE *o = fopen(a, "wb");
      fprintf(o, "P6 %d %d 255\n", w, h);
      for (int i = 0; i < w * h; i++) { uint16_t c = p[i]; fputc((c >> 11) << 3, o); fputc(((c >> 5) & 63) << 2, o); fputc((c & 31) << 3, o); }
      fclose(o); }
    else if (!strcmp(cmd, "dump")) { FILE *o = fopen(a, "wb");
      for (unsigned x = 0; x < 0x10000; x++) fputc(gb_peek(x), o);
      for (unsigned x = 0; x < 0x8000; x++) fputc(gb_wram(x >> 12, x), o);
      for (unsigned x = 0; x < 0x4000; x++) fputc(gb_vram(x >> 13, x), o);
      fwrite(gb_cgbpal(0), 1, 64, o); fwrite(gb_cgbpal(1), 1, 64, o);
      size_t n; const uint8_t *s = gb_sram(&n); if (s) fwrite(s, 1, n, o); fclose(o); }
    else if (!strcmp(cmd, "save")) { size_t n = gb_state_size(); void *buf = malloc(n); gb_state_save(buf, n); FILE *o = fopen(a, "wb"); fwrite(buf, 1, n, o); fclose(o); free(buf); }
    else if (!strcmp(cmd, "load")) { FILE *i = fopen(a, "rb"); if (!i) { printf("no %s\n", a); continue; } fseek(i, 0, SEEK_END); size_t n = ftell(i); rewind(i); void *buf = malloc(n); fread(buf, 1, n, i); fclose(i); printf("load %d\n", gb_state_load(buf, n)); free(buf); }
    else if (!strcmp(cmd, "warp")) printf("warp %d\n", gb_warp((int)strtol(a, 0, 16)));
    else if (!strcmp(cmd, "poke")) { gb_poke(strtoul(a, 0, 16), strtoul(b, 0, 16)); }
    else if (!strcmp(cmd, "peek")) { unsigned ad = strtoul(a, 0, 16); int n = b[0] ? atoi(b) : 1; printf("%04X:", ad); for (int i = 0; i < n; i++) printf(" %02X", gb_peek(ad + i)); printf("\n"); fflush(stdout); }
    else if (!strcmp(cmd, "trace")) { char c[16] = "", f[128] = ""; sscanf(line, "%*s %199s %63s %15s %127s", a, b, c, f);
      tlo = strtoul(a, 0, 16); thi = strtoul(b, 0, 16); tmax = c[0] ? atoi(c) : 100000; tcount = 0; gbx_trace_on = 1;
      if (tout) fclose(tout); tout = f[0] ? fopen(f, "w") : NULL; }
    else if (!strcmp(cmd, "untrace")) gbx_trace_on = 0;
    else if (!strcmp(cmd, "pctrace")) { pcout = fopen(a, "w"); pcmax = atol(b); gbx_pctrace_on = 1; }
    else if (!strcmp(cmd, "wav")) {   /* wav file N [buttons]: run N frames recording audio (16-bit stereo, core rate) */
      FILE *o = fopen(a, "wb"); int n = atoi(b); unsigned rate = (unsigned)gb_rate(); long bytes = 0;
      unsigned char hdr[44] = {0}; fwrite(hdr, 1, 44, o);
      for (int i = 0; i < n; i++) { gb_run(); int k = gb_audio(tmp, 16384); fwrite(tmp, 2, k, o); bytes += k * 2; frames++; }
      fseek(o, 0, SEEK_SET);
      unsigned v[11] = { 0x46464952, 36 + bytes, 0x45564157, 0x20746d66, 16, 0x00020001, rate, rate * 4, 0x00100004, 0x61746164, bytes };
      fwrite(v, 4, 11, o); fclose(o); }
    else if (!strcmp(cmd, "extract")) { exdir = strdup(a); printf("extract result %d\n", gb_extract(sink, progress, NULL)); }
    else if (!strcmp(cmd, "sramsave")) printf("sramsave %d\n", gb_sram_save(a, 1));
    else if (!strcmp(cmd, "sramload")) printf("sramload %d\n", gb_sram_load(a));
    else if (!strcmp(cmd, "oc")) gb_set_overclock(atoi(a));
    else if (!strcmp(cmd, "opt")) gb_set_option(a, b);
    else if (!strcmp(cmd, "reset")) gb_reset();
    else if (!strcmp(cmd, "drops")) { extern unsigned gbx_vram_drops; extern unsigned gbx_pal_drops; printf("drops %u %u\n", gbx_vram_drops, gbx_pal_drops); gbx_vram_drops = gbx_pal_drops = 0; fflush(stdout); }
    else if (!strcmp(cmd, "echo")) { printf("%s", line + 5); fflush(stdout); }
  }
  fprintf(stderr, "frames %ld\n", frames);
  return 0;
}
