"""Prepare launcher assets ONLY from the exact user-supplied PNG.

Usage: python scripts/prepare-launcher-icon.py salatiq.png
Requires Pillow. Afterward run npm run android:prepare.
"""
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys

from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]).resolve()
if source.suffix.lower() != ".png":
    raise SystemExit("Supply the exact attached PNG image, without converting or substituting a logo.")
destination = root / "assets/launcher"
destination.mkdir(parents=True, exist_ok=True)
image = ImageOps.exif_transpose(Image.open(source)).convert("RGBA")
background = image.getpixel((0, 0))[:3] + (255,)
# Keep the entire image and its aspect ratio. No artwork reconstruction/cropping.
icon = Image.new("RGBA", (1024, 1024), background)
contained = ImageOps.contain(image, (1024, 1024), Image.Resampling.LANCZOS)
icon.alpha_composite(contained, ((1024 - contained.width) // 2, (1024 - contained.height) // 2))
foreground = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
# Fit the whole image inside the central 66/108 adaptive safe circle, including
# its corners. This prevents launcher masks from trimming supplied artwork.
scale = 624 / math.hypot(image.width, image.height)
safe = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.Resampling.LANCZOS)
foreground.alpha_composite(safe, ((1024 - safe.width) // 2, (1024 - safe.height) // 2))
if source != destination / "source.png":
    shutil.copyfile(source, destination / "source.png")
icon.save(destination / "icon.png")
foreground.save(destination / "adaptive-foreground.png")
(destination / "provenance.json").write_text(json.dumps({
    "source": source.name,
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "size": list(image.size),
    "backgroundColor": "#" + "".join(f"{channel:02X}" for channel in background[:3]),
}, indent=2) + "\n")
print("Prepared exact-image launcher source and derived assets. Run npm run android:prepare.")
