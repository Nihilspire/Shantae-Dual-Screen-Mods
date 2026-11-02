#!/bin/bash
# Builds "Shantae Dual X.Y.apk". Run tools/setup_toolchain.sh once first (sysroot + compiler-rt).
# Needs: aapt zipalign apksigner dalvik-exchange openjdk-17, android.jar (API 33) at $ANDROID_JAR.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
GAMBATTE=${GAMBATTE:-$HOME/src/gambatte}
ANDROID_JAR=${ANDROID_JAR:-$HOME/src/platforms/android-33/android.jar}
VER=$(grep -o 'VERSION = "[^"]*"' "$ROOT/app/src/com/jack/shantaedual/MainActivity.java" | cut -d'"' -f2)
B=$ROOT/out/apk; rm -rf "$B"; mkdir -p "$B/gen" "$B/classes" "$B/lib/arm64-v8a"
sed -i "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VER\"/" "$ROOT/app/AndroidManifest.xml"
# native
if [ ! -f "$ROOT/out/android/libshantaedual.so" ] || [ -n "$REBUILD_NATIVE" ] || [ -n "$(find "$ROOT/native" -newer "$ROOT/out/android/libshantaedual.so" -type f)" ]; then
  make -C "$ROOT/native" TARGET=android GAMBATTE="$GAMBATTE" -j8 android
fi
cp "$ROOT/out/android/libshantaedual.so" "$B/lib/arm64-v8a/"
# resources + java
aapt package -f -m -J "$B/gen" -M "$ROOT/app/AndroidManifest.xml" -S "$ROOT/app/res" -A "$ROOT/app/assets" -I "$ANDROID_JAR" -F "$B/res.apk"
if ! javac -nowarn --release 8 -encoding UTF-8 -cp "$ANDROID_JAR" -d "$B/classes" $(find "$B/gen" "$ROOT/app/src" -name '*.java') > "$B/javac.log" 2>&1; then
  grep -v "^Note:" "$B/javac.log"; echo "javac failed"; exit 1
fi
dalvik-exchange --dex --min-sdk-version=23 --output="$B/classes.dex" "$B/classes"
cp "$B/res.apk" "$B/unsigned.apk"
(cd "$B" && aapt add unsigned.apk classes.dex >/dev/null && aapt add -0 so unsigned.apk lib/arm64-v8a/libshantaedual.so >/dev/null)
zipalign -f -p 16 "$B/unsigned.apk" "$B/aligned.apk"
# Signing key and its password stay out of git (tools/*.keystore*): the password is the one line of $KS.pass.
# A fresh checkout gets a new key with a random password (it can't update an APK signed with the old key).
KS=$ROOT/tools/shantaedual.keystore
if [ ! -f "$KS" ]; then
  [ -f "$KS.pass" ] || { head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$KS.pass"; chmod 600 "$KS.pass"; }
  P=$(cat "$KS.pass")
  keytool -genkeypair -keystore "$KS" -storepass "$P" -keypass "$P" -alias shantaedual \
    -keyalg RSA -keysize 2048 -validity 20000 -dname "CN=Shantae Dual, O=Jack" >/dev/null 2>&1
fi
[ -f "$KS.pass" ] || { echo "missing $KS.pass (the keystore's password, one line)"; exit 1; }
OUT="$ROOT/out/Shantae Dual $VER.apk"
apksigner sign --ks "$KS" --ks-pass "file:$KS.pass" --ks-key-alias shantaedual --out "$OUT" "$B/aligned.apk"
apksigner verify "$OUT" && ls -la "$OUT"
