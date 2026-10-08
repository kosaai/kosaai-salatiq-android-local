"""Independent Ultralytics/Pillow RGB oracle for Kotlin unit tests.

Requires numpy and Pillow. It intentionally has no access to Kotlin code.
"""
import gzip
from pathlib import Path

import numpy as np
from PIL import Image

destination = Path(__file__).resolve().parent.parent / "modules/local-classification/android/src/test/resources"
destination.mkdir(parents=True, exist_ok=True)
for width, height in [(320, 480), (480, 321), (13, 5), (224, 224)]:
    y, x = np.indices((height, width))
    rgb = np.stack(((x * 7 + y * 3) % 256, np.where((x // 3 + y // 5) % 2 == 0, 255, 0), (x * 2 + y * 11) % 256), axis=-1).astype(np.uint8)
    size = (224, int(224 * height / width)) if width <= height else (int(224 * width / height), 224)
    resized = Image.fromarray(rgb).resize(size, Image.Resampling.BILINEAR)
    left, top = round((size[0] - 224) / 2), round((size[1] - 224) / 2)
    cropped = resized.crop((left, top, left + 224, top + 224))
    (destination / f"pillow-{width}x{height}.rgb.gz").write_bytes(gzip.compress(cropped.tobytes(), mtime=0))
print("Generated independent RGB / Pillow bilinear + center-crop goldens.")
