import com.jack.shantaelink.RetroArch;

/** The transport's pacing, measured: the blocks the Link page wants on the map tab, at each pace ra.js uses.
 *  java -cp out/ratest RaPace PORT  (env RA_HOST for a real RetroArch; read only). One line per pace. */
public class RaPace {
    static long num(String json, String key) {
        int i = json.indexOf("\"" + key + "\":") + key.length() + 3, e = i;
        while (e < json.length() && Character.isDigit(json.charAt(e))) e++;
        return Long.parseLong(json.substring(i, e));
    }
    public static void main(String[] a) throws Exception {
        RetroArch ra = new RetroArch();
        String host = System.getenv("RA_HOST");
        ra.setTarget(host != null ? host : "127.0.0.1", Integer.parseInt(a[0]));
        StringBuilder csv = new StringBuilder("c300:256,c400:256,c900:256,ca00:256,cb00:256,fe00:32,ff00:128,ff80:127");
        for (int p = 0; p < 32; p++) csv.append(',').append(Integer.toHexString(0x8000 + p * 0x100)).append(":256");   // VRAM tiles sample
        for (int p = 0; p < 8; p++) csv.append(',').append(Integer.toHexString(0xD000 + p * 0x100)).append(":256");
        ra.setHot("c300,c900,cb00,ff80");
        ra.start();
        int[][] paces = { { 80, 80 }, { 50, 250 }, { 100, 200 }, { 100, 300 } };
        String[] names = { "before (all, 80 ms)", "map, moving", "map, still", "other tabs" };
        for (int i = 0; i < paces.length; i++) {
            ra.setPace(paces[i][0], paces[i][1]);
            ra.read(csv.toString()); Thread.sleep(300);
            String s0 = ra.status(); long t0 = System.currentTimeMillis();
            while (System.currentTimeMillis() - t0 < 3000) { ra.read(csv.toString()); Thread.sleep(50); }
            String s1 = ra.status(); double sec = (System.currentTimeMillis() - t0) / 1000.0;
            System.out.printf("%-22s hot %3d ms, full %3d ms: %5.1f rounds/s, %6.1f reads/s, linked %s%n", names[i], paces[i][0], paces[i][1],
                (num(s1, "rounds") - num(s0, "rounds")) / sec, (num(s1, "reads") - num(s0, "reads")) / sec, s1.contains("\"linked\":true"));
        }
        ra.stop();
    }
}
