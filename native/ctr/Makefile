# Shantae Dual 3DS (alpha): libgambatte with gambatte-dual.patch + gbcore.c + the 3DS frontend -> .3dsx
#   make -C native/ctr GAMBATTE=$HOME/src/gambatte         -> out/ctr/Shantae Dual 3DS.3dsx
# Needs devkitPro's 3ds-dev (devkitARM, libctru, 3dsxtool, smdhtool) and ImageMagick for the icon.
DEVKITPRO	?= /opt/devkitpro
DEVKITARM	?= $(DEVKITPRO)/devkitARM
GAMBATTE	?= $(HOME)/src/gambatte
CORE_DIR	:= $(GAMBATTE)/libgambatte/src
include $(GAMBATTE)/Makefile.common
ROOT		:= $(abspath ../..)
OUT		?= $(ROOT)/out/ctr
OBJDIR		?= $(OUT)/obj
# test builds (test/build_test.sh): EXTRA="-DCTR_TEST -I<dir with test_script.h>", OUT elsewhere
VERSION		:= 0.13-alpha

PREFIX		:= $(DEVKITARM)/bin/arm-none-eabi-
CC		:= $(PREFIX)gcc
CXX		:= $(PREFIX)g++
ARCH		:= -march=armv6k -mtune=mpcore -mfloat-abi=hard -mtp=soft
DEFS		:= -D__3DS__ -D__LIBRETRO__ -DHAVE_STDINT_H -DHAVE_INTTYPES_H -DCC_RESAMPLER_NO_HIGHPASS -DVIDEO_RGB565 -DNDEBUG
CFLAGS		:= -O2 -ffunction-sections -fdata-sections $(ARCH) $(DEFS) -I$(DEVKITPRO)/libctru/include $(INCFLAGS) -Wno-everything $(EXTRA)
CXXONLY		:= -fno-exceptions -fno-rtti -std=gnu++11
# the core at -O3 (0.13): ~4% fewer instructions per Game Boy frame in Azahar (the old 3DS has no time to spare)
CORE_OPT	:= -O3
LDFLAGS		:= -specs=3dsx.specs $(ARCH) -Wl,--gc-sections -L$(DEVKITPRO)/libctru/lib

CORE_CXX	:= $(filter-out %/libretro/libretro.cpp,$(SOURCES_CXX))
OBJS		:= $(patsubst $(GAMBATTE)/%.cpp,$(OBJDIR)/%.o,$(CORE_CXX)) $(patsubst $(GAMBATTE)/%.c,$(OBJDIR)/%.o,$(SOURCES_C)) \
		   $(OBJDIR)/gbglue.o $(OBJDIR)/gbcore.o $(OBJDIR)/extract.o $(OBJDIR)/main.o $(OBJDIR)/linkscr.o $(OBJDIR)/linkmap.o

all: $(OUT)/Shantae\ Dual\ 3DS.3dsx

$(OBJDIR)/%.o: $(GAMBATTE)/%.cpp
	@mkdir -p $(dir $@)
	@$(CXX) $(CFLAGS) $(CORE_OPT) $(CXXONLY) -c $< -o $@
$(OBJDIR)/%.o: $(GAMBATTE)/%.c
	@mkdir -p $(dir $@)
	@$(CC) $(CFLAGS) $(CORE_OPT) -std=gnu99 -c $< -o $@
$(OBJDIR)/gbglue.o: ../gbglue.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CFLAGS) $(CXXONLY) -c $< -o $@
$(OBJDIR)/gbcore.o: ../gbcore.c
	$(CC) $(CFLAGS) -std=gnu99 -c $< -o $@
$(OBJDIR)/extract.o: ../extract.c
	$(CC) $(CFLAGS) -std=gnu99 -c $< -o $@
$(OBJDIR)/main.o: main.c linkscr.h
	$(CC) $(CFLAGS) -std=gnu99 -c $< -o $@
$(OBJDIR)/linkscr.o: linkscr.c linkscr.h
	$(CC) $(CFLAGS) -std=gnu99 -c $< -o $@
$(OBJDIR)/linkmap.o: linkmap.c linkscr.h
	$(CC) $(CFLAGS) -O3 -std=gnu99 -c $< -o $@

$(OUT)/shantaedual3ds.elf: $(OBJS)
	$(CXX) $(LDFLAGS) $(OBJS) -lctru -lm -o $@

$(OUT)/icon.png: $(ROOT)/app/res/mipmap-xhdpi/ic_launcher.png
	convert $< -filter point -resize 48x48 $@

$(OUT)/shantaedual3ds.smdh: $(OUT)/icon.png
	$(DEVKITPRO)/tools/bin/smdhtool --create "Shantae Dual 3DS" "$(VERSION): Shantae (USA) + a Link screen" "Jack" $< $@

$(OUT)/Shantae\ Dual\ 3DS.3dsx: $(OUT)/shantaedual3ds.elf $(OUT)/shantaedual3ds.smdh
	$(DEVKITPRO)/tools/bin/3dsxtool $< "$@" --smdh=$(OUT)/shantaedual3ds.smdh
	@ls -la "$@"

clean:
	rm -rf $(OBJDIR) $(OUT)/*.elf $(OUT)/*.3dsx $(OUT)/*.smdh $(OUT)/icon.png
