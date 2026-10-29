"""Cut the Forge demo video: one recorded take + the narration segments -> forge-demo.mp4 (1280x720, 30 fps).

Usage: python edit.py <take.mp4> <vo_dir> <out.mp4> [font_path]
The PLAN below is written against take4.mp4's measured timeline (pinch at 21.5 s, flips 28.5/30.5, auto 32.5,
bigger 35.5, export 37.5, clip pinch 45, tag pinch 53, tag export ~59). Each narration segment gets a sub-clip of
the take (optionally sped up); clips shorter than the narration are frozen on their last frame.
"""
import os, subprocess, sys, tempfile

take, vo_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
font = sys.argv[4] if len(sys.argv) > 4 else "C:/Windows/Fonts/segoeui.ttf"
font_f = font.replace("\\", "/").replace(":", "\\:")   # ffmpeg filter syntax: escape the drive colon
# Crop of the 1096x694 capture: drops the LEAF "[ 0.000s]RUNS: demo_run" banner (top 30 px) and the empty
# grid left of the SPECS display rectangle, so the desk, part and readout fill more of the 720p frame.
CROP = (300, 42, 796, 652)  # x, y, w, h

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode().strip())

# (narration segment, take start s, take length s (None = narration length), speed, title overlay)
PLAN = [
    ("seg01", 0.0, 6.0, 1.0, "Forge — say it, see it at real size, print it."),
    ("seg02", 0.0, 6.0, 1.0, None),              # chips, seated; frozen for the rest of the line
    ("seg03", 21.0, 6.5, 1.0, None),             # pinch -> ring -> hook lands at 1:1
    ("seg04", 24.8, 3.0, 1.0, None),             # landed hook, red footprint on the desk
    ("seg05", 28.2, 7.0, 1.0, None),             # flip, flip, auto-orient -> 0%
    ("seg06", 35.2, 2.2, 1.0, None),             # bigger x2
    ("seg07", 37.4, 7.2, 1.0, None),             # export: writing... -> saved
    ("seg08", 44.8, 14.4, 2.0, None),            # clip then tag, 2x
    ("seg09", 56.0, 5.0, 1.0, ["Planned with plan-lens · built with CLAD through the Lens Studio MCP", "SIK targets · custom overhang shader · LEAF 8/8 · offline copy fallback"]),
    ("seg10", 60.0, 1.0, 1.0, "Forge — built with CLAD for SPECS"),
]
tmp = tempfile.mkdtemp(prefix="forge-edit-", dir=os.path.dirname(os.path.abspath(out)) or None)
parts, audio = [], []
for i, (seg, start, length, speed, title) in enumerate(PLAN):
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
