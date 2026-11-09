package com.jack.shantaedual;

import android.app.Activity;
import android.app.Presentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Display;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.zip.CRC32;

public class MainActivity extends Activity {
    static final String VERSION = "0.45";
    static final String ALPHA = "0.1-alpha";   // the recomp build's own number (tools/build_recomp_apk.sh)
    static String version() { return Native.backend() == 1 ? ALPHA : VERSION; }
    static final int PICK_ROM = 1;

    SharedPreferences prefs;
    File romFile, stateDir, assetDir, sramFile;
    static final int ASSET_VERSION = 3;   // 0.28: the title theme only (menu-art snapshots gone); re-records once, clearing old files
    volatile boolean extracting;
    android.media.MediaPlayer titleMusic;
    boolean titleMusicWanted;
    final RomGfx gfx = new RomGfx();
    final Handler ui = new Handler(Looper.getMainLooper());

    DualLayout root;
    FrameLayout gamePane, linkPane;
    GameView game;
    TouchPadView pad;
    WebView menu, link;
    WebView v3d;                // playtest 3D view (assets/view3d), made the first time it is switched on
    volatile boolean v3dOn;
    volatile String frame3d = "";
    Presentation presentation;
    DisplayManager displays;

    Emu emu;
    volatile boolean started; // a game session exists (launcher closed at least once)
    boolean menuOpen = true;
    boolean linkOverlay;
    volatile int keyBits, axisBits, specialBits;
    volatile boolean ffOn;      // 0.26: fast-forward toggled by the Link screen's FF button (the FAST key still works held)
    int rebindTarget = -1, swallowUp = -1;
    boolean usingPad;
    final Binds binds = new Binds();

    // ------------------------------------------------------------------ lifecycle

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        prefs = getSharedPreferences("shantaedual", MODE_PRIVATE);
        romFile = new File(getFilesDir(), "rom.gbc");
        assetDir = new File(getFilesDir(), "gameassets");
        assetDir.mkdirs();
        sramFile = new File(getFilesDir(), "shantae.srm");
        File ext = getExternalFilesDir("states");
        stateDir = ext != null ? ext : new File(getFilesDir(), "states");
        stateDir.mkdirs();
        binds.load(prefs.getString("keyBinds", ""));
        gfx.load(romFile);

        Native.init(getFilesDir().getAbsolutePath(), getFilesDir().getAbsolutePath());
        applyCoreOptions();
        Native.setOverclock(prefs.getBoolean("overclock", true));

        root = new DualLayout(this);
        gamePane = new FrameLayout(this);
        linkPane = new FrameLayout(this);
        linkPane.setBackgroundColor(0xFF000000);
        game = new GameView(this);
        game.gfx = gfx;
        game.host = this;
        game.setFocusable(true);
        game.setFocusableInTouchMode(true);
        pad = new TouchPadView(this);
        pad.gfx = gfx;
        pad.listener = new TouchPadView.Listener() { public void onMenu() { openMenu(); } };
        menu = web("file:///android_asset/menu/index.html", new Host(), "Host");
        link = web("file:///android_asset/link/index.html", new LinkBridge(), "Native");
        gamePane.addView(game, new FrameLayout.LayoutParams(-1, -1));
        gamePane.addView(pad, new FrameLayout.LayoutParams(-1, -1));
        gamePane.addView(menu, new FrameLayout.LayoutParams(-1, -1));
        linkPane.addView(link, new FrameLayout.LayoutParams(-1, -1));
        panelArrow = new PanelArrow(this);
        panelArrow.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { setPanel(!panelOpen, true); } });
        root.addView(gamePane);
        root.addView(linkPane);
        root.addView(panelArrow);
        setContentView(root);
        applySettings();

        displays = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        displays.registerDisplayListener(new DisplayManager.DisplayListener() {
            public void onDisplayAdded(int id) { updatePresentation(); }
            public void onDisplayRemoved(int id) { updatePresentation(); }
            public void onDisplayChanged(int id) { root.requestLayout(); }
        }, ui);
        updatePresentation();

        emu = new Emu();
        emu.start();
        if (prefs.getBoolean("skipLauncher", false) && romFile.exists() && new File(stateDir, "auto.st").exists())
            ui.post(new Runnable() { public void run() { startGame(true); } });     // menu art waits for the launcher
        else ensureAssets();
    }

    private WebView web(String url, Object bridge, String name) {
        WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        w.setBackgroundColor(0xFF000000);
        w.setWebViewClient(new WebViewClient());
        w.setWebChromeClient(new WebChromeClient());
        w.setVerticalScrollBarEnabled(false);
        w.setFocusable(false);                    // controller focus lock: taps never move key focus here
        w.setFocusableInTouchMode(false);
        w.setHorizontalScrollBarEnabled(false);
        w.addJavascriptInterface(bridge, name);
        w.loadUrl(url);
        return w;
    }

    @Override protected void onResume() {
        super.onResume();
        immersive();
        if (started && !menuOpen) emu.setPaused(false);
        if (menuOpen && !started) evalMenu("window.musicStart&&musicStart()");
        if (!started && !extracting && !assetsReady()) ensureAssets();
    }

    @Override protected void onPause() {
        super.onPause();
        emu.setPaused(true);
        evalMenu("window.musicStop&&musicStop()");
        if (started) emu.call(new Runnable() { public void run() { saveSlot("auto"); saveSram(true); } }, 1500);
        playTitleMusic(false);
    }

    @Override protected void onDestroy() {
        if (presentation != null) presentation.dismiss();
        if (titleMusic != null) { titleMusic.release(); titleMusic = null; }
        emu.quit();
        super.onDestroy();
    }

    @Override public void onWindowFocusChanged(boolean f) {
        super.onWindowFocusChanged(f);
        if (f) { immersive(); (menuOpen ? menu : game).requestFocus(); }
    }

    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        root.requestLayout();
        evalLink("window.onLayout&&onLayout()");
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    // ------------------------------------------------------------------ game control

    void startGame(final boolean cont) {
        if (!romFile.exists() || extracting) return;
        playTitleMusic(false);
        emu.call(new Runnable() { public void run() {
            if (Native.load(romFile.getAbsolutePath()) != 0) return;
            Native.sramLoad(sramFile.getAbsolutePath());          // the game's own battery save
            emu.newSession();
            devUsed = codeHearts || codeGems;
            File auto = new File(stateDir, "auto.st");
            if (cont && auto.exists()) Native.stateLoad(auto.getAbsolutePath());
        } }, 4000);
        started = true;
        closeMenu();
        evalLink("window.onSession&&onSession()");
    }

    void openMenu() {
        if (menuOpen) return;
        setPanel(false, false);     // the panel is above the menu
        emu.setPaused(true);
        menuOpen = true;
        syncPanel();
        menu.setVisibility(View.VISIBLE);
        menu.requestFocus();
        evalMenu("window.show&&show('pause')");
    }

    void closeMenu() {
        menuOpen = false;
        menu.setVisibility(View.GONE);
        evalMenu("window.musicStop&&musicStop()");
        game.requestFocus();
        if (started) emu.setPaused(false);
        syncPanel();
    }

    // ------------------------------------------------------------------ SINGLE SCREEN (0.42, after Xenogears Dual's panel)
    // The game fills the window and WIDE VIEW fills its sides. Link's page sits just past the right edge, still running, so its map and
    // bestiary keep up; the arrow slides it in over the game. The game keeps running under it, and its controller input stays with the game.
    PanelArrow panelArrow;
    boolean panelOpen;
    private float panelT;                       // 0 shut .. 1 open
    private android.animation.ValueAnimator panelAnim;

    boolean singleScreen() { return prefs.getString("layout", "second").equals("single"); }

    void setPanel(boolean open, boolean animate) {
        if (open && (!singleScreen() || !started || menuOpen)) return;
        panelOpen = open;
        setHud();
        if (panelAnim != null) { panelAnim.cancel(); panelAnim = null; }
        if (!animate) { panelT = open ? 1 : 0; syncPanel(); return; }
        panelAnim = android.animation.ValueAnimator.ofFloat(panelT, open ? 1 : 0);
        panelAnim.setDuration(260);
        panelAnim.setInterpolator(new android.view.animation.DecelerateInterpolator());
        panelAnim.addUpdateListener(new android.animation.ValueAnimator.AnimatorUpdateListener() {
            public void onAnimationUpdate(android.animation.ValueAnimator a) { panelT = (Float) a.getAnimatedValue(); syncPanel(); }
        });
        panelAnim.start();
    }

    /** Puts the panel and arrow where panelT says, and shows the arrow only in play. */
    void syncPanel() {
        if (panelArrow == null || root == null) return;
        if (!singleScreen()) {
            panelOpen = false; panelT = 0;
            linkPane.setTranslationX(0); panelArrow.setTranslationX(0);
            if (panelArrow.getVisibility() != View.GONE) panelArrow.setVisibility(View.GONE);
            return;
        }
        int pw = root.panelW;
        linkPane.setTranslationX(pw * (1 - panelT));
        panelArrow.setTranslationX(-pw * panelT);
        panelArrow.setOpen(panelT);
        int vis = started && !menuOpen ? View.VISIBLE : View.GONE;
        if (panelArrow.getVisibility() != vis) panelArrow.setVisibility(vis);
    }

    void quitToLauncher() {
        boolean was = started;
        started = false;          // stop frames and RAM reads first, then save and unload between frames
        setPanel(false, false);
        if (was) emu.call(new Runnable() { public void run() { saveSlot("auto"); saveSram(true); Native.unload(); } }, 3000);
        game.clearFrame();
        game.invalidate();
        evalMenu("window.show&&show('launcher')");
        ensureAssets();                                  // after a GBA mode / colour change made while playing
    }

    /** Runs on the emulation thread. */
    boolean saveSlot(String name) {
        int r = Native.stateSave(new File(stateDir, name + ".st").getAbsolutePath());
        Bitmap f = emu.lastFrame();
        if (r == 0 && f != null) {
            try {
                FileOutputStream o = new FileOutputStream(new File(stateDir, name + ".png"));
                f.compress(Bitmap.CompressFormat.PNG, 100, o);
                o.close();
            } catch (Exception ignored) {}
        }
        return r == 0;
    }

    /** Slot screenshot as a data: URL for the menu and the Link screen ("" when there is none). */
    String slotThumb(int slot) {
        File f = new File(stateDir, "slot" + slot + ".png");
        if (!f.exists()) return "";
        try {
            byte[] b = new byte[(int) f.length()];
            InputStream in = new java.io.FileInputStream(f); int n = 0; while (n < b.length) n += in.read(b, n, b.length - n); in.close();
            return "data:image/png;base64," + Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }

    void applySettings() {
        game.aspect = prefs.getString("aspect", "square");
        game.bezels = prefs.getBoolean("bezels", true);
        game.wideOn = prefs.getBoolean("wideView", true);
        game.viewRows = parseInt(prefs.getString("viewRows", "144"), 144);
        game.integer = prefs.getBoolean("integer", false);
        game.showStats = prefs.getBoolean("stats", false);
        loadCodes();
        apply3d();
        pad.opacity = prefs.getInt("padOpacity", 70);
        updatePadVisibility();
        root.requestLayout();
        game.invalidate();
    }

    /** PLAYTEST CODES > 3D VIEW: a transparent WebView between the game picture and the touch pad. It draws only while
     *  the screen is a level room and hides itself otherwise, so the 2D game shows through. */
    void apply3d() {
        boolean on = prefs.getBoolean("devUnlock", false) && prefs.getBoolean("view3d", false);
        if (on && v3d == null) {
            v3d = web("file:///android_asset/view3d/index.html", new View3dBridge(), "V3");
            v3d.setBackgroundColor(0);
            gamePane.addView(v3d, 1, new FrameLayout.LayoutParams(-1, -1));
        }
        if (on && !v3dOn) frame3d = "";
        v3dOn = on;
        if (on) devUsed = true;
        if (v3d != null) {
            v3d.setVisibility(on ? View.VISIBLE : View.GONE);
            if (on) v3d.onResume(); else v3d.onPause();
        }
    }

    void updatePadVisibility() {
        String mode = prefs.getString("touch", "auto");
        boolean show = mode.equals("on") || (mode.equals("auto") && !usingPad);
        pad.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    static final int SLOTS = 4;

    /** Core options from settings. GBA MODE and the colour setting go to Gambatte; GBA MODE needs a restart. */
    void applyCoreOptions() {
        Native.setOption("gambatte_gb_hwmode", prefs.getBoolean("gbaMode", true) ? "GBA" : "GBC");
        Native.setOption("gambatte_gbc_color_correction", prefs.getString("color", "lcd").equals("lcd") ? "GBC only" : "disabled");
        // ALL SPRITES (0.17): draw sprites past the hardware's 10 per line (gambatte-dual.patch, ppu.cpp)
        Native.setOption("dual_sprite_limit", prefs.getBoolean("allSprites", true) ? "off" : "on");
        if (Native.backend() == 1) {                     // the recomp's changes to the game, on as upstream has them (menu: RECOMP)
            for (String k : RC_TOGGLES) Native.setOption("recomp_" + k, prefs.getBoolean("rc_" + k, true) ? "1" : "0");
            Native.setOption("recomp_whip", prefs.getString("rc_whip", "1"));
            Native.setOption("recomp_text_speed", prefs.getString("rc_text_speed", "10"));
        }
    }
    static final String[] RC_TOGGLES = { "input_lag", "smooth_moves", "air_speed", "fast_crawl", "smooth_forms", "easy_dance", "quick_steps", "safe_transform" };
    static int parseInt(String s, int or) { try { return Integer.parseInt(s); } catch (NumberFormatException e) { return or; } }

    // ------------------------------------------------------------------ playtest codes (hidden, Konami code)
    volatile boolean codeHearts, codeGems, devUsed;

    /** Runs on the emulation thread after every frame while an always-on code is enabled. */
    void applyCodes() {
        if (!Gb.inGame()) return;
        if (codeHearts) Native.poke(Gb.HEARTS, Native.peek(Gb.MAX_HEARTS));
        if (codeGems && Gb.gems() < 999) { Native.poke(Gb.GEMS, 999 & 255); Native.poke(Gb.GEMS + 1, 999 >> 8); }
    }

    void loadCodes() {
        boolean unlocked = prefs.getBoolean("devUnlock", false);
        codeHearts = unlocked && prefs.getBoolean("codeHearts", false);
        codeGems = unlocked && prefs.getBoolean("codeGems", false);
        if (codeHearts || codeGems) devUsed = true;
    }

    /** One-shot playtest actions. Returns a short message for the menu. */
    String devAction(final String what) {
        if (!started) return "START A GAME FIRST";
        devUsed = true;
        final String[] msg = { "DONE" };
        if (what.startsWith("warp:")) {                     // dev room warp: the game's own map-start dispatcher
            final int map = Integer.parseInt(what.substring(5), 16);
            final int[] r = { -1 };
            emu.call(new Runnable() { public void run() { r[0] = Native.warp(map); } }, 1000);
            evalLink("window.onDev&&onDev()");
            return r[0] == 0 ? "WARPED" : "NO GAME";
        }
        emu.call(new Runnable() { public void run() {
            switch (what) {
                case "items":       // 10 of every consumable, 999 gems
                    for (int i = 0; i < 12; i++) Native.poke(Gb.ITEMS + i, 10);
                    Native.poke(Gb.GEMS, 999 & 255); Native.poke(Gb.GEMS + 1, 999 >> 8);
                    msg[0] = "ITEMS + GEMS"; break;
                case "dances":      // every dance, stone and talisman (Tinkerbat only in GBA mode)
                    Native.poke(Gb.DANCES, 0xFF);
                    Native.poke(Gb.DANCES2, Native.peek(Gb.DANCES2) | (prefs.getBoolean("gbaMode", true) ? 0x07 : 0x03));
                    Native.poke(Gb.STONES, Native.peek(Gb.STONES) | 0xF0);
                    Native.poke(Gb.TALISMANS, Native.peek(Gb.TALISMANS) | 0xF0);
                    msg[0] = "ALL DANCES"; break;
                case "refill":
                    Native.poke(Gb.HEARTS, Native.peek(Gb.MAX_HEARTS));
                    msg[0] = "HEARTS FULL"; break;
                case "hearts":      // +1 heart (max 7 heart holders on top of the starting 3)
                    int mx = Math.min(10 * 4, Native.peek(Gb.MAX_HEARTS) + 4);
                    Native.poke(Gb.MAX_HEARTS, mx); Native.poke(Gb.HEARTS, mx);
                    msg[0] = "MAX HEARTS " + (mx / 4); break;
                case "squids":
                    Native.poke(Gb.SQUIDS, Math.min(20, Native.peek(Gb.SQUIDS) + 4));
                    msg[0] = "SQUIDS " + Native.peek(Gb.SQUIDS); break;
                case "lives":
                    Native.poke(Gb.LIVES, 9); msg[0] = "LIVES 9"; break;
            }
        } }, 1000);
        evalLink("window.onDev&&onDev()");
        return msg[0];
    }

    void setHud() {
        boolean h = !linkVisibleSomewhere();
        game.hud = h;
    }

    boolean linkVisibleSomewhere() {
        return presentation != null || root.split != 0 || root.side || linkOverlay || panelOpen;
    }

    // ------------------------------------------------------------------ second display (presentation)

    void updatePresentation() {
        Display target = null;
        if (prefs.getBoolean("useExternal", true) && !singleScreen()) {
            Display mine = getWindowManager().getDefaultDisplay();
            for (Display d : displays.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION))
                if (d.getDisplayId() != mine.getDisplayId()) { target = d; break; }
        }
        if (presentation != null && (target == null || presentation.getDisplay().getDisplayId() != target.getDisplayId())) {
            ((ViewGroup) link.getParent()).removeView(link);
            presentation.dismiss();
            presentation = null;
            linkPane.addView(link, new FrameLayout.LayoutParams(-1, -1));
        }
        if (target != null && presentation == null) {
            try {
                presentation = new LinkPresentation(this, target);
                // Controller focus lock: the Link display's window can be touched but never takes input focus,
                // so tapping it doesn't steal the controller from the game (Android moves focus to the last
                // touched display otherwise).
                presentation.getWindow().addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
                ((ViewGroup) link.getParent()).removeView(link);
                FrameLayout box = new FrameLayout(presentation.getContext());
                box.setBackgroundColor(0xFF000000);
                box.addView(link, new FrameLayout.LayoutParams(-1, -1));
                presentation.setContentView(box);
                presentation.show();
            } catch (Exception e) {
                presentation = null;
                if (link.getParent() == null) linkPane.addView(link, new FrameLayout.LayoutParams(-1, -1));
            }
        }
        root.requestLayout();
        setHud();
    }

    /** Presentation that hands any key or stick input it receives straight back to the game. */
    final class LinkPresentation extends Presentation {
        LinkPresentation(Context c, Display d) { super(c, d); }
        @Override public boolean dispatchKeyEvent(KeyEvent e) { return MainActivity.this.dispatchKeyEvent(e); }
        @Override public boolean dispatchGenericMotionEvent(MotionEvent e) {
            return (e.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                    ? MainActivity.this.dispatchGenericMotionEvent(e) : super.dispatchGenericMotionEvent(e);
        }
    }

    // ------------------------------------------------------------------ input

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_MUTE)
            return super.dispatchKeyEvent(e);
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        if (e.getAction() == KeyEvent.ACTION_UP && code == swallowUp) { swallowUp = -1; return true; }
        if (isGamepad(e) && !usingPad) { usingPad = true; updatePadVisibility(); }
        if (rebindTarget >= 0 && down && e.getRepeatCount() == 0) {
            int idx = rebindTarget;
            rebindTarget = -1;
            swallowUp = code;
            binds.assign(code, idx);
            prefs.edit().putString("keyBinds", binds.save()).apply();
            evalMenu("window.onRebind&&onRebind(" + idx + ")");
            return true;
        }
        int btn = binds.button(code);
        if (menuOpen) {
            if (!down) return true;
            String nav = null;
            if (btn == 0) nav = "up"; else if (btn == 1) nav = "down"; else if (btn == 2) nav = "left"; else if (btn == 3) nav = "right";
            else if (btn == 5 || btn == 7 || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_DPAD_CENTER) nav = "ok";
            else if (btn == 4 || btn == 10 || code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_ESCAPE) nav = "back";
            if (nav != null) { evalMenu("window.pad&&pad('" + nav + "')"); return true; }
            return code == KeyEvent.KEYCODE_BACK || super.dispatchKeyEvent(e);
        }
        if (linkOverlay && (code == KeyEvent.KEYCODE_BACK || btn == 10)) {
            if (down) { linkOverlay = false; root.requestLayout(); setHud(); }
            return true;
        }
        if (panelOpen && code == KeyEvent.KEYCODE_BACK) {
            if (down) setPanel(false, true);
            return true;
        }
        if (code == KeyEvent.KEYCODE_BACK && down) { openMenu(); return true; }
        if (btn < 0) return super.dispatchKeyEvent(e);
        if (btn == 10) { if (down) openMenu(); return true; }
        if (btn == 14) { if (down && e.getRepeatCount() == 0) setPanel(!panelOpen, true); return true; }
        int bit = btn < 8 ? Gb.BUTTON_BITS[btn] : 0;
        int special = btn >= 8 ? 1 << (btn - 8) : 0;
        if (down) { keyBits |= bit; specialBits |= special; } else { keyBits &= ~bit; specialBits &= ~special; }
        if (down && e.getRepeatCount() == 0) {
            if (btn == 12) emu.call(new Runnable() { public void run() { saveSlot("quick"); } }, 0);
            if (btn == 13) emu.call(new Runnable() { public void run() { Native.stateLoad(new File(stateDir, "quick.st").getAbsolutePath()); } }, 0);
        }
        return true;
    }

    private static boolean isGamepad(KeyEvent e) {
        int s = e.getSource();
        return (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                || (s & InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD && e.getDevice() != null && !e.getDevice().isVirtual();
    }

    private int lastNav;

    @Override public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if ((e.getSource() & InputDevice.SOURCE_JOYSTICK) != InputDevice.SOURCE_JOYSTICK || e.getAction() != MotionEvent.ACTION_MOVE)
            return super.dispatchGenericMotionEvent(e);
        if (!usingPad) { usingPad = true; updatePadVisibility(); }
        float x = e.getAxisValue(MotionEvent.AXIS_HAT_X), y = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        float sx = e.getAxisValue(MotionEvent.AXIS_X), sy = e.getAxisValue(MotionEvent.AXIS_Y);
        if (Math.abs(sx) > Math.abs(x)) x = sx;
        if (Math.abs(sy) > Math.abs(y)) y = sy;
        int b = 0;
        if (x < -0.5f) b |= Gb.LEFT; else if (x > 0.5f) b |= Gb.RIGHT;
        if (y < -0.5f) b |= Gb.UP; else if (y > 0.5f) b |= Gb.DOWN;
        if (menuOpen) {
            if (b != lastNav && b != 0) {
                String nav = (b & Gb.UP) != 0 ? "up" : (b & Gb.DOWN) != 0 ? "down" : (b & Gb.LEFT) != 0 ? "left" : "right";
                evalMenu("window.pad&&pad('" + nav + "')");
            }
            lastNav = b;
            axisBits = 0;
        } else axisBits = b;
        return true;
    }

    // ------------------------------------------------------------------ JS helpers

    void evalMenu(final String js) { ui.post(new Runnable() { public void run() { menu.evaluateJavascript(js, null); } }); }
    void evalLink(final String js) { ui.post(new Runnable() { public void run() { link.evaluateJavascript(js, null); } }); }

    String romB64(int off, int len) {
        byte[] r = gfx.rom;
        if (r == null || off < 0 || off + len > r.length) return "";
        return Base64.encodeToString(r, off, len, Base64.NO_WRAP);
    }

    JSONObject romInfo() throws Exception {
        JSONObject o = new JSONObject();
        o.put("present", romFile.exists());
        if (romFile.exists() && gfx.rom != null) {
            CRC32 crc = new CRC32();
            crc.update(gfx.rom, 0, gfx.rom.length);
            o.put("ok", crc.getValue() == Gb.ROM_CRC);
            o.put("crc", Long.toHexString(crc.getValue()));
            o.put("name", prefs.getString("romName", "rom.gbc"));
            o.put("title", new String(gfx.rom, 0x134, 11, "ISO-8859-1").trim());
        }
        return o;
    }

    // ------------------------------------------------------------------ ROM picking

    void pickRom() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        try { startActivityForResult(i, PICK_ROM); } catch (Exception e) {
            Intent g = new Intent(Intent.ACTION_GET_CONTENT); g.setType("*/*"); g.addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(g, PICK_ROM);
        }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK_ROM || res != RESULT_OK || data == null || data.getData() == null) { evalMenu("window.refresh&&refresh()"); return; }
        Uri u = data.getData();
        try {
            InputStream in = getContentResolver().openInputStream(u);
            File tmp = new File(getFilesDir(), "rom.tmp");
            OutputStream out = new FileOutputStream(tmp);
            byte[] buf = new byte[65536]; int n, total = 0;
            while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); total += n; }
            in.close(); out.close();
            if (total < 0x8000 || total > 0x800000) { tmp.delete(); evalMenu("window.toast&&toast('NOT A GAME BOY ROM')"); return; }
            tmp.renameTo(romFile);
            String name = u.getLastPathSegment();
            if (name != null && name.contains("/")) name = name.substring(name.lastIndexOf('/') + 1);
            prefs.edit().putString("romName", name == null ? "rom.gbc" : name).apply();
            gfx.load(romFile);
            pad.invalidate();
            ensureAssets();
            evalLink("window.onRom&&onRom()");
        } catch (Exception e) {
            evalMenu("window.toast&&toast('COULD NOT READ FILE')");
        }
        evalMenu("window.refresh&&refresh()");
    }

    // ------------------------------------------------------------------ bridges

    /** Bridge for the launcher / pause menu page (assets/menu). */
    final class Host {
        @JavascriptInterface public String info() {
            try {
                JSONObject o = new JSONObject();
                o.put("version", version());
                o.put("recomp", Native.backend() == 1);
                o.put("mode", started ? "pause" : "launcher");
                o.put("rom", romInfo());
                o.put("auto", new File(stateDir, "auto.st").exists());
                o.put("extracting", extracting);
                o.put("extractPct", extracting ? Native.extractProgress() : -1);
                o.put("assets", assetsReady());
                JSONObject s = new JSONObject();
                s.put("aspect", prefs.getString("aspect", "square"));
                s.put("bezels", prefs.getBoolean("bezels", true));
                s.put("wideView", prefs.getBoolean("wideView", true));
                s.put("viewRows", prefs.getString("viewRows", "144"));
                for (String k : RC_TOGGLES) s.put("rc_" + k, prefs.getBoolean("rc_" + k, true));
                s.put("rc_whip", prefs.getString("rc_whip", "1"));
                s.put("rc_text_speed", prefs.getString("rc_text_speed", "10"));
                s.put("integer", prefs.getBoolean("integer", false));
                s.put("touch", prefs.getString("touch", "auto"));
                s.put("padOpacity", prefs.getInt("padOpacity", 70));
                s.put("split", prefs.getString("split", "auto"));
                s.put("swap", prefs.getBoolean("swap", false));
                s.put("gap", prefs.getInt("gap", 0));
                s.put("side", prefs.getBoolean("side", false));
                s.put("useExternal", prefs.getBoolean("useExternal", true));
                s.put("layout", prefs.getString("layout", "second"));
                s.put("skipLauncher", prefs.getBoolean("skipLauncher", false));
                s.put("audio", prefs.getBoolean("audio", true));
                s.put("overclock", prefs.getBoolean("overclock", true));
                s.put("music", prefs.getBoolean("music", true));
                s.put("musicSrc", prefs.getString("musicSrc", "game"));
                s.put("stats", prefs.getBoolean("stats", false));
                s.put("gbaMode", prefs.getBoolean("gbaMode", true));
                s.put("color", prefs.getString("color", "lcd"));
                s.put("allSprites", prefs.getBoolean("allSprites", true));
                s.put("devUnlock", prefs.getBoolean("devUnlock", false));
                s.put("codeHearts", prefs.getBoolean("codeHearts", false));
                s.put("codeGems", prefs.getBoolean("codeGems", false));
                s.put("view3d", prefs.getBoolean("view3d", false));
                s.put("cam3d", prefs.getString("cam3d", "FLAT"));
                o.put("settings", s);
                o.put("devUsed", devUsed);
                o.put("screens", root.describe());
                o.put("linkShown", linkVisibleSomewhere());
                JSONArray slots = new JSONArray();
                for (int i = 1; i <= SLOTS; i++) {
                    File f = new File(stateDir, "slot" + i + ".st");
                    JSONObject sl = new JSONObject();
                    sl.put("n", i);
                    sl.put("time", f.exists() ? f.lastModified() : 0);
                    slots.put(sl);
                }
                o.put("slots", slots);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }
        /** The game's font + HUD icons: 128 GB 2bpp tiles (char c = tile c; 0x00-0x1F icons), decompressed from the ROM. */
        @JavascriptInterface public String font() { return gfx.ready() ? Base64.encodeToString(gfx.tiles, Gb.FONT_BASE, 0x800, Base64.NO_WRAP) : ""; }
        @JavascriptInterface public String rom(int off, int len) { return romB64(off, len); }
        @JavascriptInterface public void pickRom() { ui.post(new Runnable() { public void run() { MainActivity.this.pickRom(); } }); }
        @JavascriptInterface public void start(final boolean cont) { ui.post(new Runnable() { public void run() { startGame(cont); } }); }
        @JavascriptInterface public void resume() { ui.post(new Runnable() { public void run() { if (started) closeMenu(); } }); }
        @JavascriptInterface public void reset() {
            emu.call(new Runnable() { public void run() { Native.reset(); } }, 1000);
            ui.post(new Runnable() { public void run() { closeMenu(); } });
        }
        @JavascriptInterface public boolean save(final int slot) {
            final boolean[] ok = { false };
            emu.call(new Runnable() { public void run() { ok[0] = saveSlot("slot" + slot); } }, 3000);
            return ok[0];
        }
        @JavascriptInterface public boolean load(final int slot) {
            final File f = new File(stateDir, "slot" + slot + ".st");
            if (!f.exists()) return false;
            final boolean[] ok = { false };
            if (!started) {
                ui.post(new Runnable() { public void run() {
                    startGame(false);
                    emu.call(new Runnable() { public void run() { Native.stateLoad(f.getAbsolutePath()); } }, 3000);
                } });
                return true;
            }
            emu.call(new Runnable() { public void run() { ok[0] = Native.stateLoad(f.getAbsolutePath()) == 0; } }, 3000);
            if (ok[0]) ui.post(new Runnable() { public void run() { closeMenu(); } });
            return ok[0];
        }
        @JavascriptInterface public String thumb(int slot) { return slotThumb(slot); }
        @JavascriptInterface public void quit() { ui.post(new Runnable() { public void run() { quitToLauncher(); } }); }
        @JavascriptInterface public void exit() { ui.post(new Runnable() { public void run() { finish(); } }); }
        @JavascriptInterface public void set(final String k, final String v) {
            ui.post(new Runnable() { public void run() {
                SharedPreferences.Editor ed = prefs.edit();
                if (v.equals("true") || v.equals("false")) ed.putBoolean(k, v.equals("true"));
                else if (k.equals("padOpacity") || k.equals("gap")) ed.putInt(k, Integer.parseInt(v));
                else ed.putString(k, v);
                ed.apply();
                if (k.equals("color") || k.equals("gbaMode") || k.equals("allSprites") || k.startsWith("rc_")) applyCoreOptions();
                if ((k.equals("color") || k.equals("gbaMode")) && !started) ensureAssets();
                if (k.equals("overclock")) Native.setOverclock(v.equals("true"));
                if (k.equals("touch")) usingPad = false;
                if (k.equals("useExternal") || k.equals("layout")) updatePresentation();
                if (k.equals("layout")) setPanel(false, false);
                applySettings();
                setHud();
            } });
        }
        @JavascriptInterface public String binds() { return binds.describe(); }
        @JavascriptInterface public boolean titleMusic(final boolean on) {
            final boolean have = new File(assetDir, "title.wav").exists() && !extracting;
            ui.post(new Runnable() { public void run() { playTitleMusic(on && have); } });
            return have;
        }
        @JavascriptInterface public void extractAgain() {
            ui.post(new Runnable() { public void run() { prefs.edit().remove("assetKey").apply(); ensureAssets(); } });
        }
        @JavascriptInterface public String dev(String what) { return prefs.getBoolean("devUnlock", false) ? devAction(what) : "LOCKED"; }
        @JavascriptInterface public void rebind(int idx) { rebindTarget = idx; }
        @JavascriptInterface public void cancelRebind() { rebindTarget = -1; }
        @JavascriptInterface public void resetBinds() {
            binds.load("");
            prefs.edit().remove("keyBinds").apply();
        }
        @JavascriptInterface public void showLink(final boolean on) {
            ui.post(new Runnable() { public void run() {
                if (singleScreen()) {
                    if (on) closeMenu();
                    setPanel(on, true);
                    return;
                }
                linkOverlay = on;
                root.requestLayout();
                setHud();
                if (on) closeMenu();
            } });
        }
    }

    /** Bridge for the Link page (assets/link). Same idea as the Link apps' window.Native, answered from emulator RAM. */
    final class LinkBridge {
        @JavascriptInterface public String version() { return MainActivity.version(); }
        @JavascriptInterface public boolean dual() { return true; }
        @JavascriptInterface public boolean running() { return started && Native.peek(0) >= 0; }
        @JavascriptInterface public String mem(String spec) { return started ? Native.mem(spec) : ""; }
        @JavascriptInterface public String pal() { return started ? emu.palHex : ""; }
        /** The game's font tiles, as Host.font(). */
        @JavascriptInterface public String font() { return gfx.ready() ? Base64.encodeToString(gfx.tiles, Gb.FONT_BASE, 0x800, Base64.NO_WRAP) : ""; }
        @JavascriptInterface public String rom(int off, int len) { return romB64(off, len); }
        @JavascriptInterface public boolean overlay() { return linkOverlay; }
        /** SINGLE SCREEN: the page is in the slide-in panel. */
        @JavascriptInterface public boolean panelOn() { return singleScreen(); }
        @JavascriptInterface public void panel(final boolean open) {
            ui.post(new Runnable() { public void run() { setPanel(open, true); } });
        }
        @JavascriptInterface public void close() {
            ui.post(new Runnable() { public void run() { linkOverlay = false; root.requestLayout(); setHud(); } });
        }
        @JavascriptInterface public boolean devUsed() { return devUsed; }
        /** Fast-forward (0.26): -1 reads it, 0 off, 1 on, 2 toggles. Returns the new state. About 3x, sound off. */
        @JavascriptInterface public boolean ff(int mode) {
            if (mode == 0) ffOn = false; else if (mode == 1) ffOn = true; else if (mode == 2) ffOn = !ffOn;
            return ffOn;
        }
        /** Save state slots 1-4, same files as the pause menu's SAVE/LOAD STATE. */
        @JavascriptInterface public String slots() {
            try {
                JSONArray a = new JSONArray();
                for (int i = 1; i <= SLOTS; i++) {
                    File f = new File(stateDir, "slot" + i + ".st");
                    JSONObject o = new JSONObject(); o.put("n", i); o.put("time", f.exists() ? f.lastModified() : 0); a.put(o);
                }
                return a.toString();
            } catch (Exception e) { return "[]"; }
        }
        @JavascriptInterface public boolean saveSlot(final int n) {
            if (!started || n < 1 || n > SLOTS) return false;
            final boolean[] ok = { false };
            emu.call(new Runnable() { public void run() { ok[0] = MainActivity.this.saveSlot("slot" + n); } }, 3000);
            return ok[0];
        }
        @JavascriptInterface public String thumb(int n) { return slotThumb(n); }
        @JavascriptInterface public boolean loadSlot(final int n) {
            final File f = new File(stateDir, "slot" + n + ".st");
            if (!started || !f.exists()) return false;
            final boolean[] ok = { false };
            emu.call(new Runnable() { public void run() { ok[0] = Native.stateLoad(f.getAbsolutePath()) == 0; } }, 3000);
            return ok[0];
        }
        /** Video snapshot (VRAM, palettes, OAM, LCD registers), refreshed 6 times a second while playing. */
        @JavascriptInterface public String video() { return started ? emu.videoB64 : ""; }
        /** Plays an input sequence ("bits:frames,bits:frames,...", libretro joypad bits) on top of the player's input. */
        @JavascriptInterface public void input(String seq) { if (started) emu.queueInput(seq); }
        @JavascriptInterface public boolean gbaMode() { return prefs.getBoolean("gbaMode", true); }
        /** Equips item i (0-11) the way the game's own inventory does ($CA84). Only while playing. */
        @JavascriptInterface public boolean equip(final int i) {
            if (!started || i < 0 || i > 11) return false;
            final boolean[] ok = { false };
            emu.call(new Runnable() { public void run() {
                if (Gb.inGame() && Native.peek(Gb.ITEMS + i) > 0) { Native.poke(Gb.EQUIPPED, i); ok[0] = true; }
            } }, 500);
            return ok[0];
        }
        @JavascriptInterface public void menu() { ui.post(new Runnable() { public void run() { if (started) openMenu(); } }); }
    }

    /** Bridge for the 3D view (assets/view3d). */
    final class View3dBridge {
        /** "seq|RAM hex|video base64" for the newest frame, or "" when the page already has it. */
        @JavascriptInterface public String frame(int seen) {
            String f = frame3d;
            return !started || f.isEmpty() || f.startsWith(seen + "|") ? "" : f;
        }
        @JavascriptInterface public String rom(int off, int len) { return romB64(off, len); }
        @JavascriptInterface public String cam() { return prefs.getString("cam3d", "FLAT"); }
        @JavascriptInterface public void setCam(String name) { prefs.edit().putString("cam3d", name).apply(); }
    }

    // ------------------------------------------------------------------ emulation thread

    final class Emu extends Thread {
        private final Object pauseLock = new Object();
        private volatile boolean paused = true, quit;
        private final ConcurrentLinkedQueue<Runnable> jobs = new ConcurrentLinkedQueue<Runnable>();
        private int fw, fh;
        private final ByteBuffer px = ByteBuffer.allocateDirect(Native.PIC_W * Native.PIC_H * 2).order(ByteOrder.nativeOrder());
        private int viewW, viewH;
        private final short[] samples = new short[16384];
        private AudioOut audio;
        final VSync vsync = new VSync();
        volatile String stats = "";
        private final byte[] video = new byte[Native.VIDEO_LEN], video3d = new byte[Native.VIDEO_LEN];
        private int seq3d;
        volatile String palHex = "", videoB64 = "";
        /** Scripted input from the Link page (tap-to-dance): pairs of {bits, frames}. */
        private final ConcurrentLinkedQueue<int[]> inputQ = new ConcurrentLinkedQueue<int[]>();
        private int[] inputCur;
        private boolean comboHeld, selHeld;
        private long frame;
        private int lastArea = -1, themeSamples;
        private final java.util.HashMap<Integer, BezelTheme> areaThemes = new java.util.HashMap<Integer, BezelTheme>(),
                candidates = new java.util.HashMap<Integer, BezelTheme>();
        private final java.util.HashMap<Integer, Integer> tally = new java.util.HashMap<Integer, Integer>();

        Emu() { super("emu"); }

        void setPaused(boolean p) {
            paused = p;
            if (p) vsync.stop(); else vsync.start();
            final AudioOut a = audio;
            if (a != null) { if (p) a.pause(); else { a.resync(); a.play(); } }
            synchronized (pauseLock) { pauseLock.notifyAll(); }
        }

        void quit() { quit = true; setPaused(true); }

        void queueInput(String seq) {
            for (String part : seq.split(",")) {
                String[] kv = part.trim().split(":");
                if (kv.length != 2) continue;
                try { inputQ.add(new int[] { Integer.parseInt(kv[0]), Math.max(1, Math.min(600, Integer.parseInt(kv[1]))) }); }
                catch (NumberFormatException ignored) {}
            }
        }

        private int scripted() {
            if (inputCur == null || inputCur[1] <= 0) inputCur = inputQ.poll();
            if (inputCur == null) return 0;
            inputCur[1]--;
            return inputCur[0];
        }

        /** Runs r on this thread between frames, waiting up to timeoutMs for it to finish. */
        void call(final Runnable r, long timeoutMs) {
            final Object done = new Object();
            final boolean[] fin = { false };
            jobs.add(new Runnable() { public void run() {
                try { r.run(); } finally { synchronized (done) { fin[0] = true; done.notifyAll(); } }
            } });
            synchronized (pauseLock) { pauseLock.notifyAll(); }
            if (timeoutMs <= 0 || Thread.currentThread() == this) return;
            long end = System.currentTimeMillis() + timeoutMs;
            synchronized (done) {
                while (!fin[0]) {
                    long left = end - System.currentTimeMillis();
                    if (left <= 0) break;
                    try { done.wait(left); } catch (InterruptedException e) { break; }
                }
            }
        }

        void newSession() {
            frame = 0; lastArea = -1;
            game.theme = null;
            double rate = Native.rate();
            if (audio != null) { audio.release(); audio = null; }
            audio = new AudioOut((int) Math.round(rate > 0 ? rate : 48000));
            if (!paused) audio.play();
        }

        /** The picture just run, for a save slot's thumbnail. On the emulation thread. */
        Bitmap lastFrame() {
            if (fw == 0) return null;
            Bitmap b = Bitmap.createBitmap(fw, fh, Bitmap.Config.RGB_565);
            px.clear(); px.limit(fw * fh * 2); b.copyPixelsFromBuffer(px); px.clear();
            // Thumbnails have the original's shape in the menus: a wider picture (WIDE VIEW) gives its middle
            return fw > 160 || fh > 144 ? Bitmap.createBitmap(b, (fw - 160) / 2, (fh - 144) / 2, 160, 144) : b;
        }

        /*
         * Pacing: one emulated frame per display refresh (or per N refreshes on 120/144 Hz screens) when the
         * display is within 2% of the NES rate, so every frame is shown exactly once. Otherwise (e.g. 90 Hz) an
         * accumulator decides how many frames to run on each refresh. Audio is resampled to follow (AudioOut).
         * Without vsync ticks (window hidden) it falls back to a timer.
         */
        @Override public void run() {
            long seen = 0, next = System.nanoTime(), statT = System.nanoTime();
            double acc = 0;
            int statFrames = 0, vsyncsSinceRun = 0;
            while (!quit) {
                Runnable j;
                while ((j = jobs.poll()) != null) j.run();
                if (paused || !started) {
                    synchronized (pauseLock) {
                        if ((paused || !started) && jobs.isEmpty() && !quit) {
                            try { pauseLock.wait(200); } catch (InterruptedException ignored) {}
                        }
                    }
                    seen = vsync.count(); next = System.nanoTime(); acc = 0;
                    continue;
                }
                double coreFps = Native.fps(); if (coreFps <= 0) coreFps = 60.0988;
                double hz = vsync.hz();
                int runs;
                double effFps;
                long v = vsync.waitAfter(seen, 50);
                if (v < 0) {                                    // no vsync: timer pacing
                    next += (long) (1e9 / coreFps);
                    long wait = next - System.nanoTime();
                    if (wait > 0) { try { Thread.sleep(wait / 1000000, (int) (wait % 1000000)); } catch (InterruptedException ignored) {} }
                    else if (wait < -100000000) next = System.nanoTime();
                    runs = 1; effFps = coreFps;
                } else {
                    long ticks = Math.min(v - seen, 4);
                    seen = v;
                    next = System.nanoTime();
                    int m = (int) Math.round(hz / coreFps);
                    if (m >= 1 && Math.abs(hz / m - coreFps) / coreFps < 0.02) {
                        vsyncsSinceRun += ticks;
                        runs = vsyncsSinceRun / m;              // normally 1; 2 after a missed refresh
                        vsyncsSinceRun -= runs * m;
                        effFps = hz / m;
                    } else {
                        acc += ticks * coreFps / hz;
                        runs = (int) acc; acc -= runs;
                        effFps = coreFps;
                    }
                    if (runs > 2) runs = 2;
                }
                if (runs == 0) continue;
                boolean fast = (specialBits & (1 << 3)) != 0 || ffOn;
                if (fast) runs *= 3;
                boolean audioOn = prefs.getBoolean("audio", true);
                int r = 0;
                if (game.wantW > 0 && (game.wantW != viewW || game.wantH != viewH)) {
                    viewW = game.wantW; viewH = game.wantH;
                    Native.view(viewW, viewH);
                }
                for (int i = 0; i < runs; i++) {
                    int turbo = ((frame >> 1) & 1) == 0 ? 0 : ((specialBits & 1) != 0 ? Gb.B : 0) | ((specialBits & 2) != 0 ? Gb.A : 0);
                    int held = keyBits | axisBits | pad.bits;
                    // SELECT alone starts a dance in play: the Link screen pops its dance list up (0.15)
                    boolean sel = (held & Gb.SELECT) != 0 && (held & Gb.START) == 0;
                    if (sel && !selHeld && Native.peek(Gb.GAME_STATE) == 2) evalLink("window.onSelect&&onSelect()");
                    selHeld = sel;
                    // SELECT+START opens the pause menu (the game itself has no use for the pair)
                    if ((held & (Gb.SELECT | Gb.START)) == (Gb.SELECT | Gb.START)) {
                        if (!comboHeld) { comboHeld = true; ui.post(new Runnable() { public void run() { openMenu(); } }); }
                        held &= ~(Gb.SELECT | Gb.START);
                    } else if ((held & (Gb.SELECT | Gb.START)) == 0) comboHeld = false;
                    if (comboHeld) held &= ~(Gb.SELECT | Gb.START);
                    int rr = Native.runFrame(held | turbo | scripted(), px);
                    if (codeHearts || codeGems) applyCodes();
                    if (rr != 0) r = rr;
                    frame++;
                    int n = Native.audio(samples);
                    if (!fast && audioOn && audio != null) audio.write(samples, n, coreFps / effFps);
                    if (frame % 10 == 0) sampleTheme();
                    if (frame % 600 == 0) saveSram(false);
                }
                if (r != 0) publish(r >> 16, r & 0xFFFF);
                if (v3dOn && r != 0) feed3d();
                statFrames += runs;
                long now = System.nanoTime();
                if (now - statT >= 1000000000L) {
                    stats = String.format("%.1f FPS  %.0f HZ  AUD %d%%", statFrames * 1e9 / (now - statT), hz,
                            audio != null ? (int) (audio.fill * 100) : 0);
                    statFrames = 0; statT = now;
                    if (game.showStats) game.postInvalidate();
                }
            }
            if (audio != null) audio.release();
            vsync.stop();
        }

        private void publish(int w, int h) {
            fw = w; fh = h;
            game.post(px, w, h);
        }

        /** The 3D view's frame: room/camera/Shantae RAM (view3d.js poll()) and the video snapshot, taken as the picture
         *  just drawn ends (before the game's vblank work changes scroll, sprites or VRAM). */
        private void feed3d() {
            Native.video(video3d);
            frame3d = (++seq3d) + "|" + Native.mem("C9E9:22,FFDF:1,CB43:4,C39D:1") + "|" + Base64.encodeToString(video3d, Base64.NO_WRAP);
        }

        private void sampleTheme() {
            Native.video(video);
            StringBuilder sb = new StringBuilder(256);
            for (int i = 0; i < 128; i++) sb.append(String.format("%02x", video[0x4000 + i] & 255));
            palHex = sb.toString();
            videoB64 = Base64.encodeToString(video, Base64.NO_WRAP);     // every 10 frames: the Link map follows fades and new rooms
            if (!Gb.inGame()) return;
            int area = areaKey();
            // One border theme per area (and time of day): sample the first few seconds in an area, lock in the most
            // frequent pick and reuse it whenever the player returns, so the border doesn't flicker between screens.
            BezelTheme locked = areaThemes.get(area);
            if (locked != null) { showTheme(locked); return; }
            if (area != lastArea) { lastArea = area; tally.clear(); candidates.clear(); themeSamples = 0; }
            BezelTheme t = BezelTheme.build(video, area);
            if (t == null) return;
            Integer n = tally.get(t.key);
            tally.put(t.key, n == null ? 1 : n + 1);
            if (!candidates.containsKey(t.key)) candidates.put(t.key, t);
            BezelTheme cur = game.theme;
            if (cur == null || cur.area != area) showTheme(t);
            if (++themeSamples >= 12) {
                int bestKey = t.key, bestN = -1;
                for (java.util.Map.Entry<Integer, Integer> e : tally.entrySet())
                    if (e.getValue() > bestN) { bestN = e.getValue(); bestKey = e.getKey(); }
                BezelTheme best = candidates.get(bestKey);
                areaThemes.put(area, best);
                showTheme(best);
            }
        }

        private void showTheme(BezelTheme t) {
            if (game.theme == t) return;
            game.theme = t;
            game.postInvalidate();
        }
    }

    // ------------------------------------------------------------------ key bindings

    /** keycode -> button index (Gb.BUTTON_NAMES). Setting a key that's already used swaps the two. */
    static final class Binds {
        final android.util.SparseIntArray map = new android.util.SparseIntArray();

        void defaults() {
            map.clear();
            map.put(KeyEvent.KEYCODE_DPAD_UP, 0); map.put(KeyEvent.KEYCODE_DPAD_DOWN, 1);
            map.put(KeyEvent.KEYCODE_DPAD_LEFT, 2); map.put(KeyEvent.KEYCODE_DPAD_RIGHT, 3);
            map.put(KeyEvent.KEYCODE_BUTTON_A, 4); map.put(KeyEvent.KEYCODE_BUTTON_B, 5);
            map.put(KeyEvent.KEYCODE_BUTTON_X, 8); map.put(KeyEvent.KEYCODE_BUTTON_Y, 9);
            map.put(KeyEvent.KEYCODE_BUTTON_SELECT, 6); map.put(KeyEvent.KEYCODE_BUTTON_START, 7);
            map.put(KeyEvent.KEYCODE_BUTTON_MODE, 10); map.put(KeyEvent.KEYCODE_BUTTON_R1, 11);
            map.put(KeyEvent.KEYCODE_BUTTON_L2, 12); map.put(KeyEvent.KEYCODE_BUTTON_R2, 13);
            map.put(KeyEvent.KEYCODE_BUTTON_L1, 14);
            map.put(KeyEvent.KEYCODE_Z, 4); map.put(KeyEvent.KEYCODE_X, 5);
            map.put(KeyEvent.KEYCODE_SHIFT_RIGHT, 6); map.put(KeyEvent.KEYCODE_ENTER, 7);
            map.put(KeyEvent.KEYCODE_ESCAPE, 10); map.put(KeyEvent.KEYCODE_TAB, 11);
            map.put(KeyEvent.KEYCODE_F5, 12); map.put(KeyEvent.KEYCODE_F7, 13);
        }

        void load(String json) {
            defaults();
            if (json == null || json.isEmpty()) return;
            try {
                JSONObject o = new JSONObject(json);
                map.clear();
                Iterator<String> it = o.keys();
                while (it.hasNext()) { String k = it.next(); map.put(Integer.parseInt(k), o.getInt(k)); }
                // saved before LINK PANEL existed (0.42): give it L1 if that's free
                if (map.indexOfValue(14) < 0 && map.get(KeyEvent.KEYCODE_BUTTON_L1, -1) < 0) map.put(KeyEvent.KEYCODE_BUTTON_L1, 14);
            } catch (Exception e) { defaults(); }
        }

        String save() {
            try {
                JSONObject o = new JSONObject();
                for (int i = 0; i < map.size(); i++) o.put(String.valueOf(map.keyAt(i)), map.valueAt(i));
                return o.toString();
            } catch (Exception e) { return ""; }
        }

        int button(int code) { return map.get(code, -1); }

        void assign(int code, int idx) {
            int prev = map.get(code, -1);
            if (prev == idx) return;
            List<Integer> old = new ArrayList<Integer>();
            for (int i = 0; i < map.size(); i++) if (map.valueAt(i) == idx) old.add(map.keyAt(i));
            if (prev >= 0 && !old.isEmpty()) {
                map.put(old.get(0), prev);          // swap
            } else {
                for (int k : old) {
                    // keep the other keyboard/pad entries for this button only if they are a different device class
                    if (isPadKey(k) == isPadKey(code)) map.delete(k);
                }
            }
            map.put(code, idx);
        }

        static boolean isPadKey(int k) { return KeyEvent.isGamepadButton(k) || (k >= KeyEvent.KEYCODE_DPAD_UP && k <= KeyEvent.KEYCODE_DPAD_CENTER); }

        String describe() {
            try {
                JSONArray a = new JSONArray();
                for (int b = 0; b < Gb.BUTTON_NAMES.length; b++) {
                    JSONObject o = new JSONObject();
                    o.put("name", Gb.BUTTON_NAMES[b]);
                    JSONArray keys = new JSONArray();
                    for (int i = 0; i < map.size(); i++) if (map.valueAt(i) == b)
                        keys.put(KeyEvent.keyCodeToString(map.keyAt(i)).replace("KEYCODE_", "").replace("BUTTON_", "").replace("_", " "));
                    o.put("keys", keys);
                    a.put(o);
                }
                return a.toString();
            } catch (Exception e) { return "[]"; }
        }
    }

    static String md5(byte[] b) {
        try {
            MessageDigest d = MessageDigest.getInstance("MD5");
            StringBuilder sb = new StringBuilder();
            for (byte x : d.digest(b)) sb.append(String.format("%02x", x & 255));
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

    Rect hingeRect() { return root.hinge; }

    // ------------------------------------------------------------------ battery save (the game's own saves)

    /** Runs on the emulation thread. */
    void saveSram(boolean force) { if (started || force) Native.sramSave(sramFile.getAbsolutePath(), force); }

    // ------------------------------------------------------------------ first-start asset extraction

    /** What the extracted title theme depends on: the ROM. */
    String assetKey() {
        long crc = 0;
        if (gfx.rom != null) { CRC32 c = new CRC32(); c.update(gfx.rom, 0, gfx.rom.length); crc = c.getValue(); }
        return ASSET_VERSION + ":" + Long.toHexString(crc);
    }

    boolean assetsReady() {
        return romFile.exists() && new File(assetDir, "title.wav").exists() && assetKey().equals(prefs.getString("assetKey", ""));
    }

    /** Powers the game on with no one watching (native/extract.c) and records the title theme for the launcher.
     *  Nothing from the game ships in the APK; this is the player's own ROM, run once. Never touches the player's
     *  save RAM. 0.28: the menu-art snapshots (0.2-0.27) are no longer taken. */
    void ensureAssets() {
        if (extracting || started || !romFile.exists() || gfx.rom == null || assetsReady()) return;
        if (!Gb.isShantae(gfx.rom)) return;
        extracting = true;
        final String key = assetKey();
        evalMenu("window.refresh&&refresh()");
        emu.call(new Runnable() { public void run() {
            int r = -1;
            try {
                for (File f : assetDir.listFiles()) f.delete();
                applyCoreOptions();
                Native.setOverclock(false);                     // the route's timings are for the original speed
                if (Native.load(romFile.getAbsolutePath()) == 0) {
                    r = Native.extract(assetDir.getAbsolutePath());
                    Native.unload();
                }
            } finally {
                Native.setOverclock(prefs.getBoolean("overclock", true));
                if (r == 0) prefs.edit().putString("assetKey", key).apply();
                extracting = false;
                final boolean ok = r == 0;
                ui.post(new Runnable() { public void run() {
                    evalMenu("window.onAssets&&onAssets(" + ok + ")");
                    evalLink("window.onAssets&&onAssets()");
                } });
            }
        } }, 0);
        ui.postDelayed(new Runnable() { public void run() {
            if (!extracting) return;
            evalMenu("window.onExtract&&onExtract(" + Native.extractProgress() + ")");
            ui.postDelayed(this, 150);
        } }, 150);
    }

    /** The game's own title theme (extracted), on the launcher only. Ends, pauses 2 s, starts again. */
    void playTitleMusic(boolean on) {
        titleMusicWanted = on;
        if (!on) { if (titleMusic != null) { try { titleMusic.pause(); } catch (Exception ignored) {} } return; }
        File wav = new File(assetDir, "title.wav");
        if (!wav.exists() || extracting) return;
        try {
            if (titleMusic == null) {
                titleMusic = new android.media.MediaPlayer();
                titleMusic.setDataSource(wav.getAbsolutePath());
                titleMusic.setVolume(0.6f, 0.6f);
                titleMusic.prepare();
                titleMusic.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() {
                    public void onCompletion(final android.media.MediaPlayer mp) {
                        ui.postDelayed(new Runnable() { public void run() {
                            if (titleMusicWanted && titleMusic == mp && !started) { mp.seekTo(0); mp.start(); }
                        } }, 2000);
                    }
                });
            }
            if (!titleMusic.isPlaying()) titleMusic.start();
        } catch (Exception e) { if (titleMusic != null) titleMusic.release(); titleMusic = null; }
    }

    /** Key for border themes: map/area plus day/night. */
    int areaKey() { return Gb.area() * 2 + (Gb.night() ? 1 : 0); }
    String areaName() { return Gb.areaName(); }
    String clockText() { return Gb.clockText(); }
}
