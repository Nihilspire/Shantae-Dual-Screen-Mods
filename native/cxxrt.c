/* cxxrt.c - the few C++ runtime pieces Gambatte needs, so the .so links without libc++/libc++abi
 * (no exceptions, no RTTI, libc++ headers only). */
#include <stdlib.h>
#include <stdio.h>
#include <stdarg.h>
#include <android/log.h>
void *_Znwm(size_t n) { void *p = malloc(n ? n : 1); if (!p) abort(); return p; }            /* operator new */
void *_Znam(size_t n) { return _Znwm(n); }                                                   /* operator new[] */
void _ZdlPv(void *p) { free(p); }                                                            /* operator delete */
void _ZdaPv(void *p) { free(p); }
void _ZdlPvm(void *p, size_t n) { free(p); }
void _ZdaPvm(void *p, size_t n) { free(p); }
void __cxa_pure_virtual(void) { abort(); }
int __cxa_guard_acquire(long long *g) { return !*(char *)g; }
void __cxa_guard_release(long long *g) { *(char *)g = 1; }
void __cxa_guard_abort(long long *g) {}
/* libc++ (no exceptions) reports errors through this */
void _ZNSt3__122__libcpp_verbose_abortEPKcz(const char *fmt, ...) {
  char b[256]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
  __android_log_write(ANDROID_LOG_ERROR, "ShantaeDual", b); abort();
}
void *__dso_handle = &__dso_handle;
