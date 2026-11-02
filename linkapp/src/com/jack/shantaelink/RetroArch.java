package com.jack.shantaelink;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * RetroArch network commands (UDP, Settings > Network > Network Commands), as Xenogears Link reads them: every wanted
 * block goes out as READ_CORE_MEMORY first and the replies are collected after, so one round costs about one frame
 * (RetroArch drains all waiting datagrams each frame). A background thread keeps a cache of the blocks the page asked
 * for in the last few seconds; read() answers from the cache at once and never waits on the network.
 * Plain Java (no Android classes) so it can run against tests/mock_ra.py on the desktop.
 */
public final class RetroArch implements Runnable {
    static final long KEEP_MS = 2500;      // a block nobody asked for in this long is no longer polled
    static final long FRESH_MS = 3000;     // a cached block older than this counts as missing
    static final int ROUND_MS = 80;        // pause between rounds

    static final class Block {
        final long addr; final int len;
        volatile byte[] data; volatile long got, wanted; volatile String err = "";
        Block(long a, int n) { addr = a; len = n; }
    }

    private final Map<Long, Block> blocks = new ConcurrentHashMap<Long, Block>();
    private volatile String host = "127.0.0.1";
    private volatile int port = 55355;
    private volatile boolean run;
    private Thread thread;
    private final List<String> outbox = new ArrayList<String>();

    volatile String state = "", system = "", game = "", crc = "", version = "", memErr = "";
    volatile long lastReply, lastStatus;
    volatile int sent, got;

    public void setTarget(String h, int p) { host = h; port = p; lastReply = 0; }
    public String host() { return host; }
    public int port() { return port; }

    public synchronized void start() {
        if (run) return;
        run = true;
        thread = new Thread(this, "retroarch");
        thread.setDaemon(true);
        thread.start();
    }
    public synchronized void stop() { run = false; if (thread != null) thread.interrupt(); thread = null; }

    /** "addr:len,addr:len" (hex address in RetroArch's system address space, decimal length) -> the same list of hex
     *  strings, "" for a block not (yet) read or refused. Asking marks the block as wanted. */
    public String read(String csv) {
        long now = System.currentTimeMillis();
        StringBuilder sb = new StringBuilder();
        String[] parts = csv.split(",");
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append(',');
            int c = parts[i].indexOf(':');
            if (c < 0) continue;
            long a; int n;
            try { a = Long.parseLong(parts[i].substring(0, c), 16); n = Integer.parseInt(parts[i].substring(c + 1)); }
            catch (NumberFormatException e) { continue; }
            if (n <= 0 || n > 1024) continue;
            Block b = blocks.get(a);
            if (b == null || b.len != n) { b = new Block(a, n); blocks.put(a, b); }
            b.wanted = now;
            byte[] d = b.data;
            if (d != null && now - b.got < FRESH_MS) hex(sb, d);
        }
        return sb.toString();
    }

    /** One-off command such as FAST_FORWARD, MENU_TOGGLE or LOAD_STATE_SLOT 2; sent with the next round. */
    public void send(String cmd) { synchronized (outbox) { outbox.add(cmd); } }

    /** Commands sent one at a time, gapMs apart, on their own thread. RetroArch counts hotkey commands that arrive in
     *  the same frame as one press (three STATE_SLOT_PLUS sent together moved the slot by one in 1.22.2). */
    public void sendPaced(final List<String> cmds, final int gapMs) {
        Thread t = new Thread(new Runnable() { public void run() {
            DatagramSocket s = null;
            try {
                s = new DatagramSocket();
                InetAddress to = InetAddress.getByName(host);
                for (String c : cmds) {
                    byte[] d = (c + "\n").getBytes("US-ASCII");
                    s.send(new DatagramPacket(d, d.length, to, port));
                    Thread.sleep(gapMs);
                }
            } catch (Exception e) {
            } finally { if (s != null) s.close(); }
        } }, "retroarch-paced");
        t.setDaemon(true);
        t.start();
    }

    /** WRITE_CORE_MEMORY at a system address; bytes as hex ("0a" or "0a1b"). */
    public void write(long addr, String hexBytes) {
        StringBuilder c = new StringBuilder("WRITE_CORE_MEMORY ").append(Long.toHexString(addr));
        for (int i = 0; i + 1 < hexBytes.length(); i += 2) c.append(' ').append(hexBytes, i, i + 2);
        send(c.toString());
    }

    public boolean linked() { return System.currentTimeMillis() - lastReply < 2000; }

    /** JSON for the page: link state, what RetroArch is running, and the last memory error. */
    public String status() {
        long now = System.currentTimeMillis();
        return "{\"linked\":" + linked() + ",\"state\":\"" + js(state) + "\",\"system\":\"" + js(system) + "\",\"game\":\"" + js(game)
            + "\",\"crc\":\"" + js(crc) + "\",\"version\":\"" + js(version) + "\",\"memErr\":\"" + js(memErr)
            + "\",\"host\":\"" + js(host) + "\",\"port\":" + port + ",\"sent\":" + sent + ",\"got\":" + got
            + ",\"age\":" + (lastReply == 0 ? -1 : now - lastReply) + "}";
    }

    @Override public void run() {
        DatagramSocket s = null;
        byte[] buf = new byte[65536];
        while (run) {
            try {
                if (s == null) { s = new DatagramSocket(); }
                InetAddress to = InetAddress.getByName(host);
                long now = System.currentTimeMillis();
                s.setSoTimeout(1);                                   // drop late replies from the last round
                try { for (int k = 0; k < 500; k++) s.receive(new DatagramPacket(buf, buf.length)); } catch (SocketTimeoutException e) { }
                List<String> cmds = new ArrayList<String>();
                synchronized (outbox) { cmds.addAll(outbox); outbox.clear(); }
                if (now - lastStatus > 1000) { cmds.add("GET_STATUS"); if (version.isEmpty()) cmds.add("VERSION"); lastStatus = now; }
                int want = 0;
                for (Block b : blocks.values()) {
                    if (now - b.wanted > KEEP_MS) { blocks.remove(b.addr); continue; }
                    cmds.add("READ_CORE_MEMORY " + Long.toHexString(b.addr) + " " + b.len); want++;
                }
                for (String c : cmds) {
                    byte[] d = (c + "\n").getBytes("US-ASCII");
                    s.send(new DatagramPacket(d, d.length, to, port));
                }
                sent = want;
                int replies = 0, expect = cmds.size();
                long deadline = System.currentTimeMillis() + 300;
                while (replies < expect) {
                    long left = deadline - System.currentTimeMillis();
                    if (left <= 0) break;
                    s.setSoTimeout((int) left);
                    DatagramPacket r = new DatagramPacket(buf, buf.length);
                    try { s.receive(r); } catch (SocketTimeoutException e) { break; }
                    replies++;
                    lastReply = System.currentTimeMillis();
                    handle(new String(r.getData(), 0, r.getLength(), "US-ASCII").trim());
                }
                got = replies;
                Thread.sleep(ROUND_MS);
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                if (s != null) s.close();
                s = null;
                try { Thread.sleep(500); } catch (InterruptedException x) { break; }
            }
        }
        if (s != null) s.close();
    }

    private void handle(String t) {
        if (t.startsWith("READ_CORE_MEMORY ")) {
            String[] f = t.split("\\s+");
            if (f.length < 3) return;
            long a;
            try { a = Long.parseLong(f[1], 16); } catch (NumberFormatException e) { return; }
            Block b = blocks.get(a);
            if (b == null) return;
            if (f[2].equals("-1")) {                                 // refused: no descriptor, no memory map, ...
                b.err = t.substring(t.indexOf("-1") + 2).trim(); memErr = b.err; return;
            }
            if (f.length - 2 < b.len) { b.err = "short"; return; }
            byte[] d = new byte[b.len];
            for (int i = 0; i < b.len; i++) d[i] = (byte) Integer.parseInt(f[2 + i], 16);
            b.data = d; b.got = System.currentTimeMillis(); b.err = "";
        } else if (t.startsWith("GET_STATUS ")) {
            // GET_STATUS PLAYING game_boy,Shantae (USA),crc32=e994b59b  |  GET_STATUS CONTENTLESS
            String rest = t.substring(11).trim();
            int sp = rest.indexOf(' ');
            state = sp < 0 ? rest : rest.substring(0, sp);
            String info = sp < 0 ? "" : rest.substring(sp + 1);
            int c1 = info.indexOf(','), ci = info.lastIndexOf(",crc32=");
            system = c1 < 0 ? info : info.substring(0, c1);
            game = c1 < 0 ? "" : info.substring(c1 + 1, ci > c1 ? ci : info.length());
            crc = ci < 0 ? "" : info.substring(ci + 7).trim().toLowerCase();
        } else if (t.startsWith("VERSION ")) {
            version = t.substring(8).trim();
        } else if (!t.startsWith("WRITE_CORE_MEMORY") && !t.startsWith("READ_CORE_RAM")) {
            // a bare version number: older builds answered VERSION without the command name
            if (t.matches("[0-9][0-9.]*.*") && version.isEmpty()) version = t;
        }
    }

    private static final char[] HX = "0123456789abcdef".toCharArray();
    private static void hex(StringBuilder sb, byte[] d) { for (byte v : d) { sb.append(HX[(v >> 4) & 15]).append(HX[v & 15]); } }
    private static String js(String s) { return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\""); }
}
