/* gbjni.c - JNI bridge for Shantae Dual (com.jack.shantaedual.Native). */
#include <jni.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <android/log.h>
#include "gbcore.h"

#define J(name) Java_com_jack_shantaedual_Native_##name
#define EXPORT __attribute__((visibility("default")))

void gb_log(const char *m) { __android_log_write(ANDROID_LOG_INFO, "ShantaeDual", m); }

static int16_t abuf[16384];

EXPORT jint J(init)(JNIEnv *e, jclass c, jstring sys, jstring save) {
  const char *a = (*e)->GetStringUTFChars(e, sys, 0), *b = (*e)->GetStringUTFChars(e, save, 0);
  int r = gb_init(a, b);
  (*e)->ReleaseStringUTFChars(e, sys, a); (*e)->ReleaseStringUTFChars(e, save, b);
  return r;
}
EXPORT jint J(load)(JNIEnv *e, jclass c, jstring path) {
  const char *p = (*e)->GetStringUTFChars(e, path, 0); int r = gb_load(p);
  (*e)->ReleaseStringUTFChars(e, path, p); return r;
}
EXPORT void J(unload)(JNIEnv *e, jclass c) { gb_unload(); }
EXPORT void J(reset)(JNIEnv *e, jclass c) { gb_reset(); }
EXPORT jdouble J(fps)(JNIEnv *e, jclass c) { return gb_fps(); }
EXPORT jdouble J(rate)(JNIEnv *e, jclass c) { return gb_rate(); }
EXPORT void J(setOverclock)(JNIEnv *e, jclass c, jboolean on) { gb_set_overclock(on); }
EXPORT void J(setOption)(JNIEnv *e, jclass c, jstring k, jstring v) {
  const char *a = (*e)->GetStringUTFChars(e, k, 0), *b = (*e)->GetStringUTFChars(e, v, 0);
  gb_set_option(a, b);
  (*e)->ReleaseStringUTFChars(e, k, a); (*e)->ReleaseStringUTFChars(e, v, b);
}
/* Runs one frame with the given pad bits. Copies the picture into dst (direct buffer, RGB565).
 * Returns (w << 16 | h) when a new picture was produced, else 0. */
EXPORT jint J(runFrame)(JNIEnv *e, jclass c, jint pad, jobject dst) {
  gb_set_pad((unsigned)pad);
  gb_run();
  int w, h, fresh; const uint16_t *fb = gb_frame(&w, &h, &fresh);
  if (!fresh || !dst) return 0;
  void *d = (*e)->GetDirectBufferAddress(e, dst); jlong cap = (*e)->GetDirectBufferCapacity(e, dst);
  if (!d || cap < (jlong)w * h * 2) return 0;
  memcpy(d, fb, (size_t)w * h * 2);
  return (w << 16) | h;
}
EXPORT jint J(backend)(JNIEnv *e, jclass c) { return gb_backend(); }
EXPORT void J(view)(JNIEnv *e, jclass c, jint width, jint height) { gb_view(width, height); }
EXPORT jint J(audio)(JNIEnv *e, jclass c, jshortArray out) {
  int max = (*e)->GetArrayLength(e, out); if (max > 16384) max = 16384;
  int n = gb_audio(abuf, max);
  if (n > 0) (*e)->SetShortArrayRegion(e, out, 0, n, abuf);
  return n;
}
EXPORT jint J(peek)(JNIEnv *e, jclass c, jint a) { return gb_peek((unsigned)a); }
EXPORT void J(poke)(JNIEnv *e, jclass c, jint a, jint v) { gb_poke((unsigned)a, (unsigned)v); }
EXPORT jint J(warp)(JNIEnv *e, jclass c, jint map) { return gb_warp((int)map); }
/* Reads memory ranges "addr:len,addr:len" (hex addr, decimal len) and returns them as one hex string.
 * "wN:addr" reads WRAM bank N at D000-DFFF (or C000-CFFF for bank 0) regardless of SVBK; "v1:addr" VRAM bank 1. */
EXPORT jstring J(mem)(JNIEnv *e, jclass c, jstring spec) {
  const char *s = (*e)->GetStringUTFChars(e, spec, 0);
  static char out[16384 * 2 + 8]; int o = 0; const char *p = s;
  static const char hx[] = "0123456789abcdef";
  while (*p) {
    int kind = 0, bank = 0;
    if ((p[0] == 'w' || p[0] == 'v') && p[1] >= '0' && p[1] <= '7' && p[2] == ':') { kind = p[0]; bank = p[1] - '0'; p += 3; }
    char *end; unsigned a = strtoul(p, &end, 16); unsigned n = 1;
    if (*end == ':') n = strtoul(end + 1, &end, 10);
    for (unsigned i = 0; i < n && o < 16384 * 2; i++) {
      unsigned ad = (a + i) & 0xFFFF; int v;
      if (kind == 'w') v = gb_wram(bank, ad);
      else if (kind == 'v') v = gb_vram(bank, ad - 0x8000);
      else v = gb_peek(ad);
      out[o++] = hx[(v >> 4) & 15]; out[o++] = hx[v & 15];
    }
    p = *end ? end + 1 : end;
  }
  out[o] = 0;
  (*e)->ReleaseStringUTFChars(e, spec, s);
  return (*e)->NewStringUTF(e, out);
}
EXPORT void J(video)(JNIEnv *e, jclass c, jbyteArray out) {
  static uint8_t b[GB_SNAP_LEN];
  gb_snapshot(b);
  (*e)->SetByteArrayRegion(e, out, 0, GB_SNAP_LEN, (const jbyte *)b);
}
EXPORT jint J(stateSave)(JNIEnv *e, jclass c, jstring path) {
  size_t n = gb_state_size(); if (!n) return -1;
  void *buf = malloc(n); int ok = gb_state_save(buf, n);
  const char *p = (*e)->GetStringUTFChars(e, path, 0);
  FILE *f = ok ? fopen(p, "wb") : NULL; int r = -2;
  if (f) { r = fwrite(buf, 1, n, f) == n ? 0 : -3; fclose(f); }
  (*e)->ReleaseStringUTFChars(e, path, p); free(buf); return r;
}
EXPORT jint J(stateLoad)(JNIEnv *e, jclass c, jstring path) {
  const char *p = (*e)->GetStringUTFChars(e, path, 0);
  FILE *f = fopen(p, "rb"); (*e)->ReleaseStringUTFChars(e, path, p);
  if (!f) return -1;
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  void *buf = malloc(n); int r = -2;
  if (fread(buf, 1, n, f) == (size_t)n) r = gb_state_load(buf, n) ? 0 : -3;
  fclose(f); free(buf); return r;
}

/* ---- first-start asset extraction: files are written into dir as they arrive ---- */
static volatile int extractPct = -1;
static char extractDir[512];
static void exSink(int id, const void *d, size_t n, void *u) {
  static const char *names[] = { "title.wav" };
  if (id < 0 || id >= GBX_COUNT) return;
  char p[600], t[610]; snprintf(p, sizeof p, "%s/%s", extractDir, names[id]); snprintf(t, sizeof t, "%s.tmp", p);
  FILE *f = fopen(t, "wb"); if (!f) return;
  int ok = fwrite(d, 1, n, f) == n; fclose(f);
  if (ok) rename(t, p); else remove(t);
}
static int exProgress(int pct, void *u) { extractPct = pct; return 0; }
/* Runs on the emulation thread with the ROM freshly loaded (blank save RAM). Returns 0 on success. */
EXPORT jint J(extract)(JNIEnv *e, jclass c, jstring dir) {
  const char *p = (*e)->GetStringUTFChars(e, dir, 0);
  snprintf(extractDir, sizeof extractDir, "%s", p);
  (*e)->ReleaseStringUTFChars(e, dir, p);
  extractPct = 0;
  int r = gb_extract(exSink, exProgress, NULL);
  extractPct = r == 0 ? 100 : -1;
  return r;
}
EXPORT jint J(extractProgress)(JNIEnv *e, jclass c) { return extractPct; }
EXPORT jint J(sramLoad)(JNIEnv *e, jclass c, jstring path) {
  const char *p = (*e)->GetStringUTFChars(e, path, 0); int r = gb_sram_load(p);
  (*e)->ReleaseStringUTFChars(e, path, p); return r;
}
EXPORT jint J(sramSave)(JNIEnv *e, jclass c, jstring path, jboolean force) {
  const char *p = (*e)->GetStringUTFChars(e, path, 0); int r = gb_sram_save(p, force);
  (*e)->ReleaseStringUTFChars(e, path, p); return r;
}
