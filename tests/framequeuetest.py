"""framequeuetest.py - FrameQueue (how pictures reach GameView) on a desktop JVM. It has no Android parts, so it can run here; the screen itself can't.
Simulates the emulator and UI thread swapping order from refresh to refresh, and counts double steps and holds on screen."""
import os, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with tempfile.TemporaryDirectory() as d:
    subprocess.run(['javac', '-d', d, ROOT + '/app/src/com/jack/shantaedual/FrameQueue.java', ROOT + '/tests/FrameQueueTest.java'], check=True)
    sys.exit(subprocess.run(['java', '-cp', d, 'com.jack.shantaedual.FrameQueueTest']).returncode)
