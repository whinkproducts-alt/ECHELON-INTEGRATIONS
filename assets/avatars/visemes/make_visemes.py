"""Build a six shape viseme set for WHINK and MAMBA from the three existing mouth frames.

Sources (512 x 512 face crops from avatar_svg/src):
  <p>_face.png   closed mouth (base art)
  <p>_comp1.png  parted
  <p>_comp2.png  open
Output per character: six full face crops, six transparent mouth sprites, a manifest and a contact sheet.
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "/mnt/user-data/uploads/SVG_Files_Request/avatar_svg/src"
OUT = "/home/claude/visemes/out"
os.makedirs(OUT, exist_ok=True)

# Mouth ellipse in the 512 crop, and where that crop sits in the 2168 x 2896 upscaled master (from mouth.py)
CFG = {
    "WHINK": dict(p="w", ell=(165, 195, 395, 370), off=(826, 978)),
    "MAMBA": dict(p="m", ell=(120, 215, 395, 385), off=(806, 954)),
}

# viseme: (source frame, horizontal scale, vertical scale)
# viseme: (source, sx, sy, mask grow, pivot y as fraction of mouth half height, negative = above centre)
VISEMES = {
    "rest": ("face", 1.00, 1.00, 1.05, 0.0),   # silence
    "mbp":  ("face", 1.03, 0.90, 0.95, 0.0),   # lips pressed: M B P
    "aa":   ("comp2", 1.00, 1.00, 1.05, 0.0),  # open: A, I, ah
    "ee":   ("comp1", 1.10, 0.86, 0.95, 0.0),  # wide: E, S, T, D
    "oo":   ("comp2", 0.84, 1.04, 0.82, 0.0),  # round: O, U, W
    "fv":   ("comp1", 1.00, 0.78, 0.86, -0.55), # teeth on lip: F V, top lip stays put
}


def load(p, name):
    return np.asarray(Image.open(f"{SRC}/{p}_{name}.png").convert("RGB")).astype(float)


def scaled_about(img, cx, cy, sx, sy):
    """Scale the whole crop about (cx, cy); the mask later keeps only the mouth."""
    if sx == 1 and sy == 1:
        return img
    im = Image.fromarray(img.astype(np.uint8))
    # inverse affine for PIL: x_src = (x - cx)/sx + cx
    a, e = 1 / sx, 1 / sy
    c, f = cx - cx / sx, cy - cy / sy
    out = im.transform(im.size, Image.AFFINE, (a, 0, c, 0, e, f), resample=Image.BICUBIC)
    return np.asarray(out).astype(float)


def mask_for(ell, grow=1.0, blur=16):
    x0, y0, x1, y1 = ell
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = (x1 - x0) / 2 * grow, (y1 - y0) / 2 * grow
    m = Image.new("L", (512, 512), 0)
    ImageDraw.Draw(m).ellipse((cx - w, cy - h, cx + w, cy + h), fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(blur))) / 255.0


manifest = {}
sheet_rows = []
for name, c in CFG.items():
    p, ell = c["p"], c["ell"]
    cx, cy = (ell[0] + ell[2]) / 2, (ell[1] + ell[3]) / 2
    base = load(p, "face")
    frames = {"face": base, "comp1": load(p, "comp1"), "comp2": load(p, "comp2")}
    half_h = (ell[3] - ell[1]) / 2
    # sprite box: ellipse plus padding, clipped to crop
    pad = 30
    bx = (max(0, ell[0] - pad), max(0, ell[1] - pad), min(512, ell[2] + pad), min(512, ell[3] + pad))
    entry = {"sprite_box_in_crop": bx,
             "crop_offset_in_master_2168x2896": c["off"],
             "sprite_origin_in_master_2168x2896": (c["off"][0] + bx[0], c["off"][1] + bx[1]),
             "visemes": {}}
    row = []
    for v, (src, sx, sy, grow, piv) in VISEMES.items():
        m = mask_for(ell, grow=grow, blur=14)
        warped = scaled_about(frames[src], cx, cy + piv * half_h, sx, sy)
        full = warped * m[..., None] + base * (1 - m[..., None])
        full_img = Image.fromarray(np.clip(full, 0, 255).astype(np.uint8))
        full_img.save(f"{OUT}/{name}_{v}_face.png")
        # transparent sprite: warped pixels, alpha from mask, cropped to box
        rgba = np.dstack([np.clip(warped, 0, 255), m * 255]).astype(np.uint8)
        sprite = Image.fromarray(rgba, "RGBA").crop(bx)
        sprite.save(f"{OUT}/{name}_{v}.png", optimize=True)
        entry["visemes"][v] = f"{name}_{v}.png"
        # contact sheet tile: zoom on the mouth
        tile = full_img.crop((int(cx - 150), int(cy - 110), int(cx + 150), int(cy + 110))).resize((300, 220))
        d = ImageDraw.Draw(tile)
        d.rectangle((0, 0, 62, 20), fill=(7, 11, 18))
        d.text((6, 4), v.upper(), fill=(255, 255, 255))
        row.append(tile)
    manifest[name] = entry
    sheet_rows.append(row)

sheet = Image.new("RGB", (300 * 6, 220 * 2), (7, 11, 18))
for r, row in enumerate(sheet_rows):
    for i, t in enumerate(row):
        sheet.paste(t, (i * 300, r * 220))
sheet.save(f"{OUT}/VISEME_SHEET.jpg", quality=88)

manifest["_notes"] = {
    "phoneme_map": {
        "rest": "silence",
        "mbp": "M B P",
        "aa": "A I and open vowels",
        "ee": "E S T D N K G Y and most consonants",
        "oo": "O U W Q",
        "fv": "F V",
    },
    "source": "Derived from existing closed, parted and open frames by scaling within a feathered mouth mask.",
}
json.dump(manifest, open(f"{OUT}/visemes.json", "w"), indent=2)
print("done", sorted(os.listdir(OUT)))
