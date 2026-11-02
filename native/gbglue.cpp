/* gbglue.cpp - compiles gambatte's libretro.cpp and adds C accessors for the Dual frontend. */
#include "libretro.cpp"
extern "C" {
unsigned gbx_peek(unsigned a) { return gb.isLoaded() ? gb.peek(a) : 0xFF; }
void gbx_poke(unsigned a, unsigned v) { if (gb.isLoaded()) gb.poke(a, v); }
void gbx_jump(unsigned pc, unsigned sp, unsigned bank) { if (gb.isLoaded()) gb.dualJump(pc, sp, bank); }
void gbx_write(unsigned a, unsigned v) { if (gb.isLoaded()) gb.dualWrite(a, v); }
const unsigned char *gbx_wram(void) { return (const unsigned char *)gb.rambank0_ptr(); }
const unsigned char *gbx_vram(void) { return (const unsigned char *)gb.vram_ptr(); }
const unsigned char *gbx_cgbpal(int obj) { return gb.cgbpal(obj); }
/* BGR555 -> the colour the core would display (colour correction applied), as RGB565. */
unsigned gbx_color(unsigned bgr15) { return (unsigned)gb.gbcToRgb32(bgr15); }
}
#ifdef ANDROID
/* libc++ is used headers-only: instantiate std::string here so nothing needs libc++.so. */
template class std::basic_string<char>;
#endif
