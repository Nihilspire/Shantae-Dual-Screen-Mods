/* extract.c - first-start asset extraction for Shantae Dual.
 * Powers the game on with no one watching and records the title theme while the title screen plays:
 *   GBX_MUSIC      the title theme as a WAV (mono, 22050 Hz, 16-bit), trimmed (SOUND > MENU MUSIC: TITLE THEME)
 * 0.2-0.27 also played on into a debug game for menu art (title, file select, status bar, inventory, Dance Menu
 * snapshots: the "game-styled menus"), and 0.24-0.26 captured a bestiary; both were removed (0.28 and 0.27; see git
 * history). Nothing is saved: the caller loads the ROM with blank save RAM and unloads it afterwards. */
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "gbcore.h"
#include "libretro.h"

static int16_t abuf[16384];
static int16_t *rec; static size_t recN, recCap;     /* mono samples at the core rate */
static int recording;
static long frameNo;
static gbx_progress prog; static void *puser; static int pctBase, pctSpan; static long pctFrames, pctDone;

static int step(unsigned pad) {
  gb_set_pad(pad); gb_run(); frameNo++;
  int n = gb_audio(abuf, 16384);
  if (recording) {
    if (recN + n / 2 > recCap) { recCap = (recN + n / 2) * 2 + 65536; rec = realloc(rec, recCap * 2); }
    for (int i = 0; i + 1 < n; i += 2) rec[recN++] = (int16_t)((abuf[i] + abuf[i + 1]) / 2);
  }
  if (prog && ++pctDone % 60 == 0 && prog(pctBase + (int)(pctSpan * pctDone / (pctFrames ? pctFrames : 1)), puser)) return -1;
  return 0;
}
static int run(int n, unsigned pad) { for (int i = 0; i < n; i++) if (step(pad)) return -1; return 0; }

/* Downmix done while recording; here: trim silence, low-pass + resample to 22050 Hz, wrap in a WAV header. */
static int emitMusic(gbx_sink sink, void *user, double rate) {
  size_t a = 0, z = recN;
  while (a < recN && abs(rec[a]) < 300) a++;
  while (z > a && abs(rec[z - 1]) < 300) z--;
  if (z - a < (size_t)(rate * 10)) return 0;             /* less than 10 s of music: something went wrong */
  z += (size_t)(rate * 1.5); if (z > recN) z = recN;     /* keep the last note's tail */
  double outRate = 22050, ratio = rate / outRate;
  size_t n = (size_t)((z - a) / ratio);
  uint8_t *w = malloc(44 + n * 2); int16_t *o = (int16_t *)(w + 44);
  for (size_t i = 0; i < n; i++) {
    double p = a + i * ratio; size_t k = (size_t)p; double f = p - k, acc = 0, wsum = 0;
    for (int t = -2; t <= 2; t++) {                     /* 5-tap triangle low-pass around the sample point */
      long q = (long)k + t; if (q < (long)a || q + 1 >= (long)z) continue;
      double s = rec[q] * (1 - f) + rec[q + 1] * f, wt = 3 - abs(t);
      acc += s * wt; wsum += wt;
    }
    double v = wsum ? acc / wsum : 0;
    if (i < 2205) v *= i / 2205.0;                       /* 0.1 s fade in */
    if (n - i < 22050) v *= (n - i) / 22050.0;           /* 1 s fade out */
    o[i] = (int16_t)(v > 32767 ? 32767 : v < -32768 ? -32768 : v);
  }
  uint32_t bytes = (uint32_t)(n * 2), r = (uint32_t)outRate;
  uint32_t h[11] = { 0x46464952, 36 + bytes, 0x45564157, 0x20746d66, 16, 0x00010001, r, r * 2, 0x00100002, 0x61746164, bytes };
  memcpy(w, h, 44);
  sink(GBX_MUSIC, w, 44 + n * 2, user);
  free(w);
  return 1;
}


int gb_extract(gbx_sink sink, gbx_progress progress, void *user) {
  prog = progress; puser = user; frameNo = 0; recN = 0; recording = 0;
  double rate = gb_rate();
  int err = 0;
  /* power on and wait on the title, recording its music (~90 s of game time, a few seconds of real time) */
  pctBase = 0; pctSpan = 100; pctFrames = 900 + 5400; pctDone = 0;
  if (run(900, 0)) goto cancel;
  recording = 1;
  if (run(5400, 0)) goto cancel;
  recording = 0;
  if (!emitMusic(sink, user, rate)) { err = -10; goto done; }
  if (progress) progress(100, user);
  goto done;
cancel:
  err = -1;
done:
  free(rec); rec = NULL; recN = recCap = 0; recording = 0;
  return err;
}
