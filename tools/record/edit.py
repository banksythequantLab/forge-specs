"""Cut the Forge demo video: one recorded take + the narration segments -> forge-demo.mp4 (1280x720, 30 fps).

Usage: python edit.py <take.mp4> <vo_dir> <out.mp4> [pinch_s] [beats] [font_path]
  pinch_s = seconds into the take when demo_run's first pinch happens (read it off a 1-s contact sheet: the
            frame where the ring appears; take8: 22.5).
  beats   = the demo_run beat log, seconds after the pinch, as "name=s,name=s,...". Names: landed, flip, flip2,
            auto, bigger, export, clip, clipland, tag, tagland, tagexport. DemoRun prints them ("[Demo] +7.3s -
            hook landed"); read them with RunAndCollectLogsTool mode=tail. Default = take8's.
Each narration segment gets a sub-clip of the take (optionally sped up); clips shorter than the narration are
frozen on their last frame, so every beat is held for as long as its line.
"""
import os, subprocess, sys, tempfile

take, vo_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
D = float(sys.argv[4]) if len(sys.argv) > 4 else 22.5
BEATS = dict(landed=7.3, flip=9.8, flip2=12.1, auto=14.4, bigger=17.6, export=20.2,
             clip=25.0, clipland=28.7, tag=32.7, tagland=38.2, tagexport=41.2)
if len(sys.argv) > 5 and sys.argv[5]:
    for kv in sys.argv[5].split(","):
        k, v = kv.split("=")
        BEATS[k.strip()] = float(v)
font = sys.argv[6] if len(sys.argv) > 6 else "C:/Windows/Fonts/segoeui.ttf"
font_f = font.replace("\\", "/").replace(":", "\\:")   # ffmpeg filter syntax: escape the drive colon
# Crop of the 1096x694 capture: drops the LEAF "[ 0.000s]RUNS: demo_run" banner (top 30 px) and the empty
# room left of the SPECS display rectangle, so the desk, part and readout fill more of the 720p frame.
CROP = (300, 42, 796, 652)  # x, y, w, h
B = {k: D + v for k, v in BEATS.items()}   # beats as take times

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode().strip())

# (narration segment, take start s, take length s (None = narration length), speed, title overlay, push-in)
# push-in = slow zoom over the segment (0.08 = 8 %), for the beats that are held on a frozen frame.
PLAN = [
    ("seg01", 0.0, 6.6, 1.0, "Forge — say it, see it at real size, print it.", 0.0),   # seated, the three chips
    ("seg02", 8.0, 14.0, 1.0, None, 0.08),                                              # lean-in, chips (static line)
    ("seg03", D - 0.5, B["flip"] - 0.3 - (D - 0.5), 1.0, None, 0.0),                     # pinch -> ring -> hook lands at 1:1
    ("seg04", B["landed"] + 0.2, B["flip"] - 0.3 - (B["landed"] + 0.2), 1.0, None, 0.10), # landed hook, red footprint
    ("seg05", B["flip"] - 0.3, B["bigger"] - 0.1 - (B["flip"] - 0.3), 1.0, None, 0.0),   # flip, flip, auto-orient -> 0%
    ("seg06", B["bigger"] - 0.1, B["export"] - 0.1 - (B["bigger"] - 0.1), 1.0, None, 0.06), # bigger x2
    ("seg07", B["export"] - 0.1, B["clip"] - 0.1 - (B["export"] - 0.1), 1.0, None, 0.08),   # export: writing... -> saved, chime
    ("seg08", B["clip"] - 0.1, B["tagland"] + 1.1 - (B["clip"] - 0.1), 2.0, None, 0.0),    # clip then tag, 2x
    ("seg09", B["tagland"] + 1.1, B["tagexport"] + 3.3 - (B["tagland"] + 1.1), 1.0,
     ["Planned with plan-lens · built with CLAD through the Lens Studio MCP", "SIK targets · custom overhang shader · LEAF 8/8 · offline copy fallback"], 0.08),
    ("seg10", B["tagexport"] + 3.3, 1.0, 1.0, "Forge — built with CLAD for SPECS", 0.0),
]
tmp = tempfile.mkdtemp(prefix="forge-edit-", dir=os.path.dirname(os.path.abspath(out)) or None)
parts, audio = [], []
for i, (seg, start, length, speed, title, zoom) in enumerate(PLAN):
    wav = os.path.join(vo_dir, seg + ".wav")
    n = dur(wav) + 0.5                      # half a second of air after each line
    if length is None:
        length = n * speed
    shown = length / speed                  # seconds of output the sub-clip produces
    if shown > n:
        length, shown = n * speed, n
    clip = os.path.join(tmp, f"v{i:02d}.mp4")
    cx, cy, cw, ch = CROP
    vf = f"crop={cw}:{ch}:{cx}:{cy}"
    if speed != 1.0:
        vf += f",setpts={1.0 / speed:.4f}*PTS"
    vf += ",scale=-2:720:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x2b2d31"
    if shown < n - 0.05:
        vf += f",tpad=stop_mode=clone:stop_duration={n - shown:.3f}"
    if zoom:
        vf += (f",scale=w='trunc(1280*(1+{zoom}*t/{n:.3f})/2)*2':h='trunc(720*(1+{zoom}*t/{n:.3f})/2)*2':eval=frame"
               ",crop=1280:720")
    if title:
        lines = title if isinstance(title, list) else [title]
        size = 42 if len(lines) == 1 and len(lines[0]) < 50 else 26
        for k, line in enumerate(lines):
            t = line.replace("\\", "\\\\").replace("'", r"\'").replace(":", r"\:").replace(",", r"\,")
            y = f"h-{80 + (len(lines) - 1 - k) * (size + 18)}"
            vf += f",drawtext=fontfile='{font_f}':text='{t}':fontcolor=white:fontsize={size}:x=(w-text_w)/2:y={y}:box=1:boxcolor=0x000000@0.45:boxborderw=12"
    subprocess.check_call(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", take,
                           "-vf", vf, "-r", "30", "-t", f"{n:.3f}", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", clip])
    parts.append(clip)
    a = os.path.join(tmp, f"a{i:02d}.wav")
    subprocess.check_call(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-af", f"apad=pad_dur=0.5,atrim=0:{n:.3f}", "-ar", "48000", "-ac", "2", a])
    audio.append(a)
    print(f"{seg}: take {start:5.1f}s +{length:4.1f}s x{speed:g} -> {n:5.1f}s", flush=True)

with open(os.path.join(tmp, "v.txt"), "w") as f:
    f.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in parts)
with open(os.path.join(tmp, "a.txt"), "w") as f:
    f.writelines(f"file '{p.replace(os.sep, '/')}'\n" for p in audio)
subprocess.check_call(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(tmp, "v.txt"),
                       "-f", "concat", "-safe", "0", "-i", os.path.join(tmp, "a.txt"), "-map", "0:v", "-map", "1:a",
                       "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out])
print("wrote", out, f"{dur(out):.1f}s")
