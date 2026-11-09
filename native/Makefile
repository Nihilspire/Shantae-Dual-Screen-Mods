# Builds libretro-gambatte (static, with gambatte-dual.patch applied) + glue for a target.
#   make TARGET=android android  -> out/android/libshantaedual.so
#   make TARGET=host host        -> out/host/drive (desktop test driver)
CORE_DIR := $(GAMBATTE)/libgambatte/src
include $(GAMBATTE)/Makefile.common
TARGET ?= android
ROOT := $(abspath ..)
OBJDIR := $(ROOT)/out/$(TARGET)/obj
LIBCXX := $(HOME)/src/libcxx
ifeq ($(TARGET),android)
CC := clang --target=aarch64-linux-android23 --sysroot=$(ROOT)/out/sysroot
CXX := clang++ --target=aarch64-linux-android23 --sysroot=$(ROOT)/out/sysroot -nostdinc++ \
  -isystem $(ROOT)/out/libcxx/include -isystem $(LIBCXX)/libcxx/include -isystem $(LIBCXX)/libcxxabi/include
CFLAGS := -O2 -fPIC -ffunction-sections -fdata-sections -fvisibility=hidden -DANDROID
CXXONLY := -fno-exceptions -fno-rtti -D_LIBCPP_DISABLE_EXTERN_TEMPLATE -D_LIBCPP_HAS_NO_VENDOR_AVAILABILITY_ANNOTATIONS
else
CC := clang
CXX := clang++
CFLAGS := -O1 -g -fPIC -DGBX_TRACE
CXXONLY := -fno-exceptions -fno-rtti
endif
DEFS := -D__LIBRETRO__ -DHAVE_STDINT_H -DHAVE_INTTYPES_H -DCC_RESAMPLER_NO_HIGHPASS -DVIDEO_RGB565 -DNDEBUG
CFLAGS += $(INCFLAGS) $(DEFS) -Wno-everything
CORE_CXX := $(filter-out %/libretro/libretro.cpp,$(SOURCES_CXX))
OBJS := $(patsubst $(GAMBATTE)/%.cpp,$(OBJDIR)/%.o,$(CORE_CXX)) $(patsubst $(GAMBATTE)/%.c,$(OBJDIR)/%.o,$(SOURCES_C)) $(OBJDIR)/gbglue.o
$(OBJDIR)/%.o: $(GAMBATTE)/%.cpp
	@mkdir -p $(dir $@)
	@$(CXX) $(CFLAGS) $(CXXONLY) -std=gnu++11 -c $< -o $@
$(OBJDIR)/%.o: $(GAMBATTE)/%.c
	@mkdir -p $(dir $@)
	@$(CC) $(CFLAGS) -std=gnu99 -c $< -o $@
$(OBJDIR)/gbglue.o: gbglue.cpp $(GAMBATTE)/libgambatte/libretro/libretro.cpp
	@mkdir -p $(dir $@)
	@$(CXX) $(CFLAGS) $(CXXONLY) -std=gnu++11 -c $< -o $@
$(ROOT)/out/$(TARGET)/libgambatte.a: $(OBJS)
	@llvm-ar rcs $@ $^
android: $(ROOT)/out/android/libgambatte.a gbjni.c gbcore.c wide.c extract.c cxxrt.c
	$(CC) $(CFLAGS) -std=gnu99 -shared -nostdlib -fuse-ld=lld -Wl,--gc-sections -Wl,-soname,libshantaedual.so \
	  -Wl,--version-script=jni.map -Wl,-z,max-page-size=16384 \
	  gbjni.c gbcore.c wide.c extract.c cxxrt.c $(ROOT)/out/android/libgambatte.a -L$(ROOT)/out/sysroot/usr/lib -lbuiltins -lm -llog -ldl -lc \
	  -o $(ROOT)/out/android/libshantaedual.so
host: $(ROOT)/out/host/libgambatte.a drive.c gbcore.c wide.c extract.c
	$(CXX) $(CFLAGS) -x c drive.c gbcore.c wide.c extract.c -x none $(ROOT)/out/host/libgambatte.a -lm -o $(ROOT)/out/host/drive
