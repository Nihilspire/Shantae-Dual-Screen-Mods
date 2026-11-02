import com.jack.shantaelink.RetroArch;

/** Runs the Link app's RetroArch transport on the desktop against tests/mock_ra.py and prints what it read.
 *  java -cp out/ratest RaCheck PORT addr:len,addr:len,...  ->  one line per block: "addr hex" (or "addr -" when missing),
 *  then the status JSON. tests/ratest.py compares the blocks with the dump. */
public class RaCheck {
    public static void main(String[] a) throws Exception {
        RetroArch ra = new RetroArch();
        String host = System.getenv("RA_HOST");                  // set: a live RetroArch (read only, no commands)
        ra.setTarget(host != null ? host : "127.0.0.1", Integer.parseInt(a[0]));
        ra.start();
        String csv = a[1], r = "";
        for (int i = 0; i < 40; i++) {                           // ask until every block has come back (or 4 s)
            r = ra.read(csv);
            if (!r.contains(",,") && !r.startsWith(",") && !r.endsWith(",") && r.length() > 0) break;
            Thread.sleep(100);
        }
        if (host == null) { ra.send("FAST_FORWARD"); ra.write(0xCA84, "05"); }
        Thread.sleep(400);
        String[] want = csv.split(","), got = r.split(",", -1);
        for (int i = 0; i < want.length; i++) System.out.println(want[i].split(":")[0] + " " + (i < got.length && !got[i].isEmpty() ? got[i] : "-"));
        System.out.println(ra.status());
        ra.stop();
    }
}
