"""Cover + explainer cards for the Forge demo video (1280x720 PNG frames, revealed in steps).

Usage: python cards.py <out_dir> <hero.png>
  hero.png = a frame of the landed hook with the red support footprint (from the cut video).
Writes cover.png, basics_1..4.png (3D printing in one card, revealed panel by panel) and forge_1..4.png
(what Forge does, revealed step by step). make_intro.sh turns them into clips timed to the narration.
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

OUT, HERO = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
W, H = 1280, 720
BG, PANEL, INK, DIM = (22, 25, 31), (34, 38, 47), (236, 238, 242), (150, 158, 172)
AMBER, RED, PART, BED = (245, 200, 107), (255, 75, 75), (214, 220, 230), (90, 98, 112)
F = "/usr/share/fonts/opentype/inter/"
def font(w, s):
    for n in (f"Inter-{w}.otf", f"InterDisplay-{w}.otf", "Inter-Regular.otf"):
        if os.path.exists(F + n):
            return ImageFont.truetype(F + n, s)
    return ImageFont.load_default()

def centered(d, xy, text, f, fill, w=None):
    x, y = xy
    tw = d.textlength(text, font=f)
    d.text((x - tw / 2, y), text, font=f, fill=fill)

def wrap(d, text, f, width):
    lines, cur = [], ""
    for word in text.split():
        t = (cur + " " + word).strip()
        if d.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur); cur = word
    lines.append(cur)
    return lines

def hero(w, h):
    im = Image.open(HERO).convert("RGB").crop((300, 0, 1000, 600))
    im = im.resize((w, int(w * im.height / im.width)), Image.LANCZOS)
    return im.crop((0, 0, w, min(h, im.height)))

# ---------------------------------------------------------------- cover
im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
hi = hero(520, 520)
mask = Image.new("L", hi.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, *hi.size), 24, fill=255)
im.paste(hi, (W - 520 - 70, (H - hi.height) // 2), mask)
d.text((80, 170), "Forge", font=font("Bold", 120), fill=INK)
d.rectangle((84, 318, 84 + 90, 324), fill=AMBER)
for i, line in enumerate(["Say it.", "See it at real size on your desk.", "Print it."]):
    d.text((82, 352 + i * 48), line, font=font("Medium", 36), fill=INK if i != 1 else AMBER)
d.text((82, 530), "A Snap SPECS Lens for 3D printing", font=font("Regular", 26), fill=DIM)
d.text((82, 566), "Built with CLAD in Lens Studio  ·  Derek Soltis, Banksy AI", font=font("Regular", 22), fill=DIM)
im.save(f"{OUT}/cover.png")

# ---------------------------------------------------------------- 3D printing basics
def basics(step):
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    d.text((70, 48), "3D printing in 20 seconds", font=font("Bold", 46), fill=INK)
    d.text((72, 112), "Get two things right before you print: the size, and which side sits down on the bed.",
           font=font("Regular", 24), fill=DIM)
    titles = ["Built in thin layers", "Overhangs sag", "Supports hold it up", "…or turn it over"]
    notes = ["The printer stacks plastic one layer at a time, from a file called an STL.",
             "Any part hanging over empty air has nothing under it, so it droops.",
             "Extra plastic is printed underneath, then snapped off. Slow, wasteful, leaves marks.",
             "Same part, flat side down: nothing hangs, no supports needed."]
    pw, ph, gap, top = 270, 470, 26, 170
    x0 = (W - (4 * pw + 3 * gap)) // 2
    for i in range(4):
        x = x0 + i * (pw + gap)
        on = i < step
        d.rounded_rectangle((x, top, x + pw, top + ph), 18, fill=PANEL if on else (27, 30, 37))
        if not on:
            continue
        d.text((x + 20, top + 18), titles[i], font=font("SemiBold", 25), fill=AMBER if i == 3 else INK)
        # the scene: a bed, a part
        bx, by = x + 30, top + 300
        d.rectangle((bx, by, bx + pw - 60, by + 10), fill=BED)                     # print bed
        cx = bx + (pw - 60) // 2
        L = 12
        if i == 0:      # layers: a stepped block built from stripes
            for k in range(14):
                yk = by - (k + 1) * L
                w_ = 120 - (k // 5) * 25
                d.rectangle((cx - w_ // 2, yk, cx + w_ // 2, yk + L - 3), fill=PART)
        elif i in (1, 2):   # a T: post + arm sticking out over air
            d.rectangle((cx - 60, by - 150, cx - 20, by - 1), fill=PART)            # post
            arm = [(cx - 60, by - 150), (cx + 80, by - 150), (cx + 80, by - 125), (cx - 20, by - 125)]
            if i == 1:
                arm = [(cx - 20, by - 150), (cx + 80, by - 126), (cx + 80, by - 98), (cx - 20, by - 125)]
                d.polygon(arm, fill=RED)
                d.text((cx + 10, by - 92), "sags", font=font("Medium", 20), fill=RED)
            else:
                d.polygon(arm, fill=PART)
                for k in range(5):                                                  # support columns
                    sx = cx - 12 + k * 20
                    d.rectangle((sx, by - 124, sx + 5, by - 1), fill=RED)
                d.text((cx - 14, by - 60), "", font=font("Medium", 18), fill=RED)
        else:           # flipped: the T lies on its long flat side
            d.rectangle((cx - 80, by - 40, cx + 80, by - 1), fill=PART)
            d.rectangle((cx - 80, by - 110, cx - 40, by - 40), fill=PART)
        for j, line in enumerate(wrap(d, notes[i], font("Regular", 20), pw - 40)):
            d.text((x + 20, top + 335 + j * 27), line, font=font("Regular", 20), fill=DIM)
    return im

for s in range(1, 5):
    basics(s).save(f"{OUT}/basics_{s}.png")

# ---------------------------------------------------------------- what Forge does
def forge(step):
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    d.text((70, 48), "What Forge does", font=font("Bold", 46), fill=INK)
    d.text((72, 112), "A Lens for SPECS glasses that checks a part on your real desk before you print it.",
           font=font("Regular", 24), fill=DIM)
    steps = [("1  Ask", "Pinch one of the request chips lying on your desk."),
             ("2  Designed on your own box", "A small local AI model picks a part and sizes it in millimetres; "
                                             "OpenSCAD builds the 3D shape."),
             ("3  See it at 1:1", "It sits on your desk at the exact size it will print. Red on the desk = "
                                  "where supports would go."),
             ("4  Fix it, then print", "Flip, auto-orient, make it bigger or smaller, then export the STL "
                                       "in the orientation you chose.")]
    pw, ph, gap, top = 270, 470, 26, 170
    x0 = (W - (4 * pw + 3 * gap)) // 2
    for i, (t, n) in enumerate(steps):
        x = x0 + i * (pw + gap)
        on = i < step
        d.rounded_rectangle((x, top, x + pw, top + ph), 18, fill=PANEL if on else (27, 30, 37))
        if not on:
            continue
        d.text((x + 20, top + 18), t if len(t) < 18 else t[:2], font=font("SemiBold", 25), fill=AMBER)
        if len(t) >= 18:
            for j, line in enumerate(wrap(d, t[3:], font("SemiBold", 25), pw - 70)):
                d.text((x + 52, top + 18 + j * 32), line, font=font("SemiBold", 25), fill=AMBER)
        cy = top + 95
        if i == 0:          # speech bubble
            d.rounded_rectangle((x + 20, cy + 30, x + pw - 20, cy + 150), 16, fill=(52, 58, 70))
            d.polygon([(x + 50, cy + 150), (x + 80, cy + 150), (x + 44, cy + 178)], fill=(52, 58, 70))
            for j, line in enumerate(wrap(d, "“Headphone hook for my 30 mm desk edge”", font("Medium", 21), pw - 70)):
                d.text((x + 36, cy + 48 + j * 28), line, font=font("Medium", 21), fill=INK)
        elif i == 1:        # box -> part
            d.rounded_rectangle((x + 40, cy + 50, x + 130, cy + 130), 10, fill=(52, 58, 70))
            d.text((x + 56, cy + 76), "AI box", font=font("Medium", 18), fill=INK)
            d.line((x + 140, cy + 90, x + 175, cy + 90), fill=AMBER, width=4)
            d.polygon([(x + 175, cy + 82), (x + 187, cy + 90), (x + 175, cy + 98)], fill=AMBER)
            d.rectangle((x + 200, cy + 50, x + 214, cy + 140), fill=PART)
            d.rectangle((x + 200, cy + 50, x + 244, cy + 62), fill=PART)
            d.rectangle((x + 200, cy + 128, x + 244, cy + 140), fill=PART)
        elif i == 2:        # thumbnail of the real preview
            th = hero(pw - 40, 170)
            im.paste(th, (x + 20, cy + 10))
        else:               # export arrow -> STL file
            d.rounded_rectangle((x + 40, cy + 40, x + 120, cy + 140), 8, fill=(52, 58, 70))
            d.text((x + 58, cy + 76), "STL", font=font("Bold", 24), fill=AMBER)
            d.line((x + 130, cy + 90, x + 175, cy + 90), fill=AMBER, width=4)
            d.polygon([(x + 175, cy + 82), (x + 187, cy + 90), (x + 175, cy + 98)], fill=AMBER)
            d.text((x + 194, cy + 66), "to the\nprinter", font=font("Medium", 20), fill=INK)
        for j, line in enumerate(wrap(d, n, font("Regular", 20), pw - 40)):
            d.text((x + 20, top + 300 + j * 27), line, font=font("Regular", 20), fill=DIM)
    return im

for s in range(1, 5):
    forge(s).save(f"{OUT}/forge_{s}.png")
print("cards written to", OUT)
