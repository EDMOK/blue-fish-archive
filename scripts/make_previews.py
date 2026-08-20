"""Generate WebP preview thumbnails for sticker originals.

Previews make the masonry grid load fast (tens of KB instead of several MB
per image) while the original file stays untouched for download/copy.

Only previews that are missing or older than their source are regenerated,
so this is safe to run on every sync. Animated GIF/APNG originals are skipped
so the in-page animation keeps playing from the original file.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "media"
PREVIEW_DIR = ROOT / "previews"
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_DIMENSION = 700
QUALITY = 82


def main() -> int:
    if not SOURCE_DIR.is_dir():
        print(f"Sticker source directory not found: {SOURCE_DIR}", file=sys.stderr)
        return 1

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    skipped = 0
    for path in sorted(SOURCE_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() not in RASTER_EXTENSIONS:
            continue

        preview = PREVIEW_DIR / f"{path.stem}.webp"
        if preview.is_file() and preview.stat().st_mtime >= path.stat().st_mtime:
            skipped += 1
            continue

        with Image.open(path) as image:
            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)
            has_alpha = image.mode in ("RGBA", "LA") or (
                image.mode == "P" and "transparency" in image.info
            )
            image = image.convert("RGBA" if has_alpha else "RGB")
            image.save(preview, "WEBP", quality=QUALITY)

        generated += 1
        print(f"Generated {preview.relative_to(ROOT).as_posix()}")

    print(f"Done. {generated} generated, {skipped} up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
