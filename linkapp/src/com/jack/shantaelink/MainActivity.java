package com.jack.shantaelink;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.util.zip.CRC32;

/**
 * Shantae Link: the Shantae Dual Link screen on its own, reading Shantae (USA) running in RetroArch (Gambatte core)
 * through its network commands. The page (assets/link, shared with Shantae Dual) gets the same window.Native it has in
 * the Dual app from ra.js, which sits on the "RA" bridge below. The window never takes input focus, so the controller
 * stays with RetroArch (as Xenogears Link). Nothing from the game ships: the player picks their own ROM for the map,
 * the font and the signposts.
 */
public class MainActivity extends Activity {
    static final String VERSION = "0.12";
    static final long ROM_CRC = 0xE994B59BL;
    static final int PICK_ROM = 1;

    WebView web;
    final RetroArch ra = new RetroArch();
    SharedPreferences prefs;
    File romFile;
    volatile String romName = "";
    volatile long romCrc;
    /* Freeze report (0.9, as Xenogears Link 2.0.0.18): the page says what it is working on (Bridge.beat); a thread checks
       that and Android's main thread once a second. If either stops for 4 s while the app is on screen, what it was doing
       is kept and the page shows it on the next start. An "isn't responding" dialog with no report afterwards means
       nothing stalled: it comes from input Android is holding for this never-focused window. */
    volatile String beatStage = "";
    volatile long beatAt, uiAt;
    volatile boolean watching, hangKept;
    final Handler ui = new Handler(Looper.getMainLooper());

    /** 0.11: if the last run ended with the player tapping Close on Android's "isn't responding" dialog, Android's reason
     *  (Android 11+, once per exit). "NO FOCUSED WINDOW" = a key waiting on this never-focused window, nothing stalled. */
    String lastAnr() {
        if (android.os.Build.VERSION.SDK_INT < 30) return "";
        try {
            java.util.List<android.app.ApplicationExitInfo> l = ((android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE)).getHistoricalProcessExitReasons(null, 0, 1);
            if (l.isEmpty()) return "";
            android.app.ApplicationExitInfo e = l.get(0);
            if (e.getTimestamp() <= prefs.getLong("exitSeen", 0)) return "";
            prefs.edit().putLong("exitSeen", e.getTimestamp()).apply();
            if (e.getReason() != android.app.ApplicationExitInfo.REASON_ANR) return "";
            String d = e.getDescription() == null ? "" : e.getDescription();
            prefs.edit().putString("anrText", d).apply();           // the whole text, for anyone reading it later
            return d.contains("focused window") ? "ANDROID: NO FOCUSED WINDOW" : "ANDROID: " + d;
        } catch (Exception x) { return ""; }
    }

    void startWatch() {
        Thread t = new Thread(new Runnable() { public void run() {
            while (true) {
                try { Thread.sleep(1000); } catch (InterruptedException e) { return; }
                if (!watching) continue;
                ui.post(new Runnable() { public void run() { uiAt = System.currentTimeMillis(); } });
                long now = System.currentTimeMillis();
                String what = now - uiAt > 4000 ? "android main thread" : beatAt > 0 && now - beatAt > 4000 ? "page: " + beatStage : null;
                if (what == null) hangKept = false;
                else if (!hangKept) { hangKept = true; prefs.edit().putString("hang", what).commit(); }
            }
        } }, "freeze-watch");
        t.setDaemon(true);
        t.start();
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        prefs = getSharedPreferences("shantaelink", MODE_PRIVATE);
        romFile = new File(getFilesDir(), "rom.gbc");
        romName = prefs.getString("romName", "");
        romCrc = prefs.getLong("romCrc", 0);
        ra.setTarget("127.0.0.1", 55355);   // 0.6: RetroArch on this device, its default command port (no address setting)
        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "RA");
        setContentView(web);
        web.loadUrl("file:///android_asset/link/index.html");
        immersive();
        startWatch();
    }

    @Override protected void onStart() {
        super.onStart(); ra.start();
        uiAt = System.currentTimeMillis(); if (beatAt > 0) beatAt = uiAt;   // beatAt stays 0 until the page's first beat
        watching = true;
    }
    @Override protected void onStop() { watching = false; ra.stop(); super.onStop(); }
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }

    void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    void js(final String code) { runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(code, null); } }); }

    // ------------------------------------------------------------------ the player's ROM
    void pickRom() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        try { startActivityForResult(i, PICK_ROM); } catch (Exception e) { }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK_ROM || res != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        new Thread(new Runnable() { public void run() {
            String name = "rom";
            Cursor c = null;
            try {
                c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
                if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
            } catch (Exception e) { } finally { if (c != null) c.close(); }
            try {
                File tmp = new File(getFilesDir(), "rom.tmp");
                InputStream in = getContentResolver().openInputStream(uri);
                FileOutputStream out = new FileOutputStream(tmp);
                CRC32 crc = new CRC32(); byte[] buf = new byte[65536]; long n = 0; int r;
                while ((r = in.read(buf)) > 0) { out.write(buf, 0, r); crc.update(buf, 0, r); n += r; if (n > (8 << 20)) break; }
                in.close(); out.close();
                if (n < 0x100000 || n > (8 << 20)) { tmp.delete(); js("window.onRomPicked&&onRomPicked('NOT A GAME BOY ROM')"); return; }
                tmp.renameTo(romFile);
                romName = name; romCrc = crc.getValue();
                prefs.edit().putString("romName", name).putLong("romCrc", romCrc).apply();
                js("window.onRomPicked&&onRomPicked(" + (romCrc == ROM_CRC ? "''" : "'NOT SHANTAE (USA): CRC " + Long.toHexString(romCrc).toUpperCase() + "'") + ")");
            } catch (Exception e) { js("window.onRomPicked&&onRomPicked('COULD NOT READ IT')"); }
        } }).start();
    }

    String romB64(long off, int len) {
        if (!romFile.exists() || len <= 0 || len > (1 << 20)) return "";
        try {
            RandomAccessFile f = new RandomAccessFile(romFile, "r");
            try {
                if (off < 0 || off >= f.length()) return "";
                byte[] d = new byte[(int) Math.min(len, f.length() - off)];
                f.seek(off); f.readFully(d);
                return Base64.encodeToString(d, Base64.NO_WRAP);
            } finally { f.close(); }
        } catch (Exception e) { return ""; }
    }

    /** window.RA: the transport ra.js builds window.Native on. */
    final class Bridge {
        @JavascriptInterface public String version() { return VERSION; }
        @JavascriptInterface public void beat(String stage) { beatStage = stage == null ? "" : stage; beatAt = System.currentTimeMillis(); }
        /** What had stalled last time ("" if nothing); read once. */
        @JavascriptInterface public String lastHang() {
            String a = lastAnr();                    // Android's own reason wins: it says which kind of "isn't responding"
            if (!a.isEmpty()) return a;
            String h = prefs.getString("hang", ""); if (!h.isEmpty()) prefs.edit().remove("hang").commit(); return h;
        }
        @JavascriptInterface public String read(String csv) { return ra.read(csv); }
        @JavascriptInterface public void setPace(int hotMs, int fullMs) { ra.setPace(hotMs, fullMs); }
        @JavascriptInterface public void setHot(String csv) { ra.setHot(csv); }
        @JavascriptInterface public String status() { return ra.status(); }
        @JavascriptInterface public void send(String cmd) { if (cmd != null && cmd.matches("[A-Z_]+( [0-9]+)?")) ra.send(cmd); }
        /** "CMD|CMD|..." sent one at a time, gapMs apart (hotkey commands such as STATE_SLOT_PLUS). */
        @JavascriptInterface public void sendPaced(String cmds, int gapMs) {
            if (cmds == null || !cmds.matches("[A-Z_]+( [0-9]+)?(\\|[A-Z_]+( [0-9]+)?)*") || gapMs < 10 || gapMs > 1000) return;
            ra.sendPaced(java.util.Arrays.asList(cmds.split("\\|")), gapMs);
        }
        @JavascriptInterface public void write(String addrHex, String bytesHex) {
            try { ra.write(Long.parseLong(addrHex, 16), bytesHex); } catch (NumberFormatException e) { }
        }
        @JavascriptInterface public String rom(int off, int len) { return romB64(off, len); }
        @JavascriptInterface public String romInfo() {
            return romFile.exists() ? "{\"name\":\"" + romName.replace("\"", "'") + "\",\"crc\":\"" + Long.toHexString(romCrc) + "\",\"ok\":" + (romCrc == ROM_CRC) + "}" : "";
        }
        @JavascriptInterface public void pickRom() { runOnUiThread(new Runnable() { public void run() { MainActivity.this.pickRom(); } }); }
    }
}
