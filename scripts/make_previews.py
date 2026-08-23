"""Generate WebP previews for sticker originals, in two tiers.

- Grid tier (previews/, 480px max, q80): the masonry wall shows cards at
  ~210px wide, so 480px comfortably covers 2x displays at a fraction of
  the bytes of the old 700px tier (~half the size).
- Large tier (large/, full size, q85): used by the lightbox, so viewing a
  sticker no longer downloads the multi-hundred-KB original PNG/JPG.
  Download/copy keep using the untouched original file.

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
LARGE_DIR = ROOT / "large"
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
GRID_MAX_DIMENSION = 480
GRID_QUALITY = 80
LARGE_QUALITY = 85


def _needs_update(target: Path, source: Path) -> bool:
    return not target.is_file() or target.stat().st_mtime < source.stat().st_mtime


def _to_webp(path: Path, target: Path, quality: int, max_dimension: int | None) -> None:
    with Image.open(path) as image:
        if max_dimension is not None:
            image.thumbnail((max_dimension, max_dimension), Image.LANCZOS)
        has_alpha = image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        )
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.save(target, "WEBP", quality=quality)
    print(f"Generated {target.relative_to(ROOT).as_posix()}")


def main() -> int:
    if not SOURCE_DIR.is_dir():
        print(f"Sticker source directory not found: {SOURCE_DIR}", file=sys.stderr)
        return 1

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    LARGE_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    skipped = 0
    for path in sorted(SOURCE_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() not in RASTER_EXTENSIONS:
            continue

        preview = PREVIEW_DIR / f"{path.stem}.webp"
        large = LARGE_DIR / f"{path.stem}.webp"

        if not _needs_update(preview, path) and not _needs_update(large, path):
            skipped += 1
            continue

        if _needs_update(preview, path):
            _to_webp(path, preview, GRID_QUALITY, GRID_MAX_DIMENSION)
            generated += 1
        if _needs_update(large, path):
            _to_webp(path, large, LARGE_QUALITY, None)
            generated += 1

    print(f"Done. {generated} generated, {skipped} up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
