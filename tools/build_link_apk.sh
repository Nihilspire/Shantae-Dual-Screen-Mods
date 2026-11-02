#!/bin/bash
# Builds "Shantae Link X.Y.apk": the Link page on its own, reading Shantae in RetroArch (linkapp/).
# The page is app/assets/link (shared with Shantae Dual) plus linkapp/ra.js, loaded first. No native code.
# Needs: aapt zipalign apksigner dalvik-exchange openjdk-17, android.jar (API 33) at $ANDROID_JAR.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ANDROID_JAR=${ANDROID_JAR:-$HOME/src/platforms/android-33/android.jar}
VER=$(grep -o 'VERSION = "[^"]*"' "$ROOT/linkapp/src/com/jack/shantaelink/MainActivity.java" | cut -d'"' -f2)
B=$ROOT/out/linkapk; rm -rf "$B"; mkdir -p "$B/gen" "$B/classes" "$B/assets/link" "$B/res"
sed -i "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VER\"/" "$ROOT/linkapp/AndroidManifest.xml"
# resources: the Dual app's icon, the Link app's name
cp -r "$ROOT/app/res/." "$B/res/"
cp -r "$ROOT/linkapp/res/." "$B/res/"
# assets: the shared Link page with ra.js in front of every other script
cp "$ROOT/app/assets/link/"* "$B/assets/link/"
cp "$ROOT/linkapp/ra.js" "$B/assets/link/"
sed -i 's|<script src="gbgfx.js"></script>|<script src="ra.js"></script>\n<script src="gbgfx.js"></script>|' "$B/assets/link/index.html"
grep -q 'src="ra.js"' "$B/assets/link/index.html" || { echo "ra.js not added to index.html"; exit 1; }
aapt package -f -m -J "$B/gen" -M "$ROOT/linkapp/AndroidManifest.xml" -S "$B/res" -A "$B/assets" -I "$ANDROID_JAR" -F "$B/res.apk"
if ! javac -nowarn --release 8 -encoding UTF-8 -cp "$ANDROID_JAR" -d "$B/classes" $(find "$B/gen" "$ROOT/linkapp/src" -name '*.java') > "$B/javac.log" 2>&1; then
  grep -v "^Note:" "$B/javac.log"; echo "javac failed"; exit 1
fi
dalvik-exchange --dex --min-sdk-version=23 --output="$B/classes.dex" "$B/classes"
cp "$B/res.apk" "$B/unsigned.apk"
(cd "$B" && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
# Signing key and its password stay out of git (tools/*.keystore*): the password is the one line of $KS.pass.
# A fresh checkout gets a new key with a random password (it can't update an APK signed with the old key).
KS=$ROOT/tools/shantaelink.keystore
if [ ! -f "$KS" ]; then
  [ -f "$KS.pass" ] || { head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$KS.pass"; chmod 600 "$KS.pass"; }
  P=$(cat "$KS.pass")
  keytool -genkeypair -keystore "$KS" -storepass "$P" -keypass "$P" -alias shantaelink \
    -keyalg RSA -keysize 2048 -validity 20000 -dname "CN=Shantae Link, O=Jack" >/dev/null 2>&1
fi
[ -f "$KS.pass" ] || { echo "missing $KS.pass (the keystore's password, one line)"; exit 1; }
OUT="$ROOT/out/Shantae Link $VER.apk"
apksigner sign --ks "$KS" --ks-pass "file:$KS.pass" --ks-key-alias shantaelink --out "$OUT" "$B/aligned.apk"
apksigner verify "$OUT" && ls -la "$OUT"
