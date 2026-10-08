"""Separate the inspected salatiq.png artwork for motion, without redrawing it.

Requires Pillow. Run from the repository: python scripts/prepare-startup-branding.py
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / "salatiq.png"
image = Image.open(source).convert("RGB")
expected_hash = "9dbcfd9a0988089d0c8040c0db3100cc3adf522e7aab68d5454a5990cbe54fae"
assert hashlib.sha256(source.read_bytes()).hexdigest() == expected_hash, "Inspect new source artwork before changing crop bounds"
assert image.size == (1254, 1254)
destination = root / "assets/startup"
destination.mkdir(parents=True, exist_ok=True)

# Bounds include antialiased edges and padding. The original has a clear gap
# between Arabic calligraphy (the logo) and the Latin Salatiq wordmark.
bounds = {"mark": (126, 305, 1128, 791), "name": (328, 820, 924, 968)}
assets = {}
for name, box in bounds.items():
    crop = image.crop(box).convert("RGBA")
    pixels = []
    for r, g, b, _ in crop.getdata():
        # Remove only the pale paper backdrop. Preserve original RGB values;
        # feather pale edge pixels rather than thresholding away antialiasing.
        alpha = max(0, min(255, round((220 - min(r, g, b)) * 255 / 30)))
        pixels.append((r, g, b, alpha))
    crop.putdata(pixels)
    crop.save(destination / f"{name}.png")
    assets[name] = {"crop": list(box), "size": list(crop.size)}

(destination / "provenance.json").write_text(json.dumps({
    "source": "salatiq.png",
    "sha256": expected_hash,
    "backgroundColor": "#FDFAEC",
    "processing": "Crop original artwork, retain RGB, remove pale background with feathered alpha; no redraw or replacement typeface",
    "assets": assets,
}, indent=2) + "\n")
print("Prepared exact-source startup mark/name in assets/startup/")
