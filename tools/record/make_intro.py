"""Put the cover, the two explainer cards and plain-language glossary banners onto the cut demo.

Usage: python make_intro.py <cards_dir> <intro1.wav> <intro2.wav> <demo_cut.mp4> <out.mp4> [skip_s] [font]
  demo_cut.mp4 = output of edit.py; its first narration segment (seg01, the old title line) is dropped by
  starting at skip_s (default 7.06 s = seg01's length + 0.5 s air), because the cover and cards replace it.
Card panels are revealed as the narration reaches the sentence that introduces them (by character position).
"""
import os, subprocess, sys, tempfile
from PIL import ImageFont

cards, w1, w2, demo, out = sys.argv[1:6]
SKIP = float(sys.argv[6]) if len(sys.argv) > 6 else 7.06
FONT = sys.argv[7] if len(sys.argv) > 7 else "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
INTRO1 = ("If you have never 3D printed, here is the short version. A printer builds a plastic part one thin layer "
          "at a time, from a file called an STL. Two things decide whether it comes out right: the size, and which "
          "side sits down on the printer's bed. Anything that hangs out over empty air needs extra plastic "
          "underneath it, called supports, or it sags. Get either one wrong, and you find out an hour into the print.")
INTRO2 = ("Forge moves that check onto your desk. You ask for a part. A small AI model running on my own computer "
          "designs it. The glasses show it on your real desk, at the exact size it will print, with the spots that "
          "need supports painted red. Turn it, resize it, and send a print-ready file to the printer.")
# panel k appears when the narration reaches this phrase
BASICS = ["A printer builds", "Anything that hangs", "extra plastic", "Get either one"]
FORGE = ["You ask", "A small AI", "The glasses", "Turn it"]
# (start s, end s, term, meaning) on the demo after the cut; times follow the narration segments
GLOSSARY = [
    (17.5, 29.0, "OpenSCAD", "free design software that builds a 3D shape from exact measurements"),
    (32.3, 41.6, "Supports", "extra plastic printed under an overhang, snapped off after printing"),
    (42.8, 52.4, "Orientation", "which side of the part sits down on the printer's bed"),
    (60.0, 72.8, "STL", "the 3D file a printer's software slices into layers"),
]
AIR = 0.6

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", p]).decode().strip())

def run(*a):
    subprocess.check_call(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *a])

tmp = tempfile.mkdtemp(prefix="forge-intro-")
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
       "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]

# 1. cover: 4.5 s, fade in from black, silent
run("-loop", "1", "-t", "4.5", "-i", f"{cards}/cover.png", "-f", "lavfi", "-t", "4.5",
    "-i", "anullsrc=r=48000:cl=stereo", "-vf", "fade=in:0:15,fade=out:st=4.1:d=0.4", "-shortest", *ENC,
    f"{tmp}/c0.mp4")

# 2. cards revealed in step with the narration
def card(prefix, phrases, text, wav, name):
    total = dur(wav) + AIR
    times = [max(0.0, total * text.index(p) / len(text) - 0.2) for p in phrases]
    times[0] = 0.0                                   # the first panel is up from the start
    lst = os.path.join(tmp, name + ".txt")
    with open(lst, "w") as f:
        for k, t in enumerate(times):
            end = times[k + 1] if k + 1 < len(times) else total
            f.write(f"file '{cards}/{prefix}_{k + 1}.png'\nduration {end - t:.3f}\n")
        f.write(f"file '{cards}/{prefix}_{len(times)}.png'\n")
    run("-f", "concat", "-safe", "0", "-i", lst, "-i", wav, "-af", f"apad=pad_dur={AIR}",
        "-vf", "fps=30,format=yuv420p", "-t", f"{total:.3f}", *ENC, f"{tmp}/{name}.mp4")
    print(name, f"{total:.1f}s reveals at", [round(t, 1) for t in times])

card("basics", BASICS, INTRO1, w1, "c1")
card("forge", FORGE, INTRO2, w2, "c2")

# 3. the demo without seg01, with glossary banners at the top
def esc(s):
    return s.replace("\\", "\\\\").replace("'", "’").replace(":", r"\:").replace(",", r"\,")
vf = []
tf = ImageFont.truetype(FONT, 28)
for a, b, term, meaning in GLOSSARY:
    en = f"enable='between(t,{a},{b})'"
    vf.append(f"drawbox=x=0:y=0:w=iw:h=64:color=0x16191f@0.88:t=fill:{en}")
    vf.append(f"drawtext=fontfile='{FONT}':text='{esc(term)}':fontcolor=0xf5c86b:fontsize=28:x=40:y=17:{en}")
    vf.append(f"drawtext=fontfile='{FONT}':text='{esc('—  ' + meaning)}':fontcolor=white:fontsize=26:"
              f"x={40 + int(tf.getlength(term)) + 14}:y=19:{en}")
run("-ss", f"{SKIP}", "-i", demo, "-vf", ",".join(vf), *ENC, f"{tmp}/c3.mp4")

# 4. join
lst = os.path.join(tmp, "all.txt")
with open(lst, "w") as f:
    f.writelines(f"file '{tmp}/c{k}.mp4'\n" for k in range(4))
run("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out)
print("wrote", out, f"{dur(out):.1f}s")
