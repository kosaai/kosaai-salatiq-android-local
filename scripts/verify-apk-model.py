"""Verify the actual APK/AAB contains the exact bundled model and Sahw sound."""
import hashlib
from pathlib import Path
import sys
import zipfile

model = "salatiq_yolo26n_cls_fp16.tflite"
root = Path(__file__).resolve().parent.parent
original = (root / model).read_bytes()
with zipfile.ZipFile(sys.argv[1]) as archive:
    expected = ("base/" if str(sys.argv[1]).endswith(".aab") else "") + "assets/" + model
    entry = archive.getinfo(expected)
    data = archive.read(entry)
    assert data == original, "Packaged model differs from authoritative model"
    if str(sys.argv[1]).endswith(".apk"):
        assert entry.compress_type == zipfile.ZIP_STORED, "APK model must be uncompressed for openFd/mmap"
    print(expected, len(data), "bytes; SHA256", hashlib.sha256(data).hexdigest())
    sound_path = ("base/" if str(sys.argv[1]).endswith(".aab") else "") + "res/raw/subhan_allah.mp3"
    sound = archive.read(sound_path)
    assert sound == (root / "سبحان الله (1).mp3").read_bytes(), "Packaged Sahw sound differs from the supplied MP3"
    print(sound_path, len(sound), "bytes; SHA256", hashlib.sha256(sound).hexdigest())
