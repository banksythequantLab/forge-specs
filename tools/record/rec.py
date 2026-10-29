"""Screen-record a region at a fixed frame rate with dxcam (Desktop Duplication) -> ffmpeg (libx264).

Usage: python rec.py <seconds> <out.mp4> [x y w h] [fps]
Writes a sidecar <out>.log with achieved fps. Stop early by creating <out>.stop next to the output.
Desktop Duplication only yields a frame when the screen changes, so unchanged frames repeat the last one.
"""
import os, subprocess, sys, time

import dxcam

secs = float(sys.argv[1])
out = sys.argv[2]
region = None
if len(sys.argv) >= 7:
    x, y, w, h = (int(v) for v in sys.argv[3:7])
    region = (x, y, x + w, y + h)
fps = int(sys.argv[7]) if len(sys.argv) >= 8 else 30
stop_file = out + ".stop"
log = open(out + ".log", "w")

cam = dxcam.create(output_idx=0, output_color="BGR")
# First frame: wait up to 10 s for anything to change on screen.
first = None
t_wait = time.time()
while first is None and time.time() - t_wait < 10:
    first = cam.grab(region=region)
    if first is None:
        time.sleep(0.02)
if first is None:
    log.write("no frame within 10 s (screen static?)\n"); log.close(); sys.exit(2)
h_, w_ = first.shape[:2]
ff = subprocess.Popen(
    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
     "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w_}x{h_}", "-r", str(fps), "-i", "-",
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
    stdin=subprocess.PIPE, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
last = first
t0 = time.time()
n = fresh = 0
period = 1.0 / fps
try:
    while time.time() - t0 < secs and not os.path.exists(stop_file):
        target = t0 + n * period
        f = cam.grab(region=region)
        if f is not None:
            last = f
            fresh += 1
        ff.stdin.write(last.tobytes())
        n += 1
        delay = target + period - time.time()
        if delay > 0:
            time.sleep(delay)
finally:
    ff.stdin.close()
    ff.wait()
    dt = time.time() - t0
    log.write(f"frames={n} fresh={fresh} seconds={dt:.1f} fps={n / dt:.1f} size={w_}x{h_}\n")
    log.close()
    if os.path.exists(stop_file):
        os.remove(stop_file)
