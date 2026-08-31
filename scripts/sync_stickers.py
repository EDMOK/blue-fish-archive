"""Generate or validate the static sticker manifest."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "media"
PREVIEW_DIR = ROOT / "previews"
LARGE_DIR = ROOT / "large"
MANIFEST_PATH = ROOT / "stickers" / "manifest.json"
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".apng"}


def _image_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        with Image.open(path) as image:
            return image.size
    except OSError:
        return None


def build_manifest() -> list[dict[str, str]]:
    if not SOURCE_DIR.is_dir():
        raise FileNotFoundError(f"Sticker source directory not found: {SOURCE_DIR}")

    files = sorted(
        (
            path
            for path in SOURCE_DIR.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ),
        key=lambda path: path.name.casefold(),
    )

    manifest: list[dict[str, str]] = []
    seen_paths: set[str] = set()
    for path in files:
        original = path.relative_to(ROOT).as_posix()
        normalized = original.casefold()
        if normalized in seen_paths:
            raise ValueError(f"Duplicate sticker path detected: {original}")
        seen_paths.add(normalized)
        entry = {
            "original": original,
            "filename": path.name,
            "alt": "鲸鱼娘同人表情包",
        }
        preview = PREVIEW_DIR / f"{path.stem}.webp"
        if preview.is_file():
            entry["preview"] = preview.relative_to(ROOT).as_posix()
        large = LARGE_DIR / f"{path.stem}.webp"
        if large.is_file():
            entry["large"] = large.relative_to(ROOT).as_posix()
        # 网格里实际显示的是 preview(与原图同比例)或原图本体,尺寸必须取自它,
        # 前端据此在图片加载前预留正确宽高,避免瀑布流整墙重排抖动。
        dimensions = _image_dimensions(preview if preview.is_file() else path)
        if dimensions:
            entry["width"], entry["height"] = dimensions
        manifest.append(entry)

    return manifest


def manifest_text(manifest: list[dict[str, str]]) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail when manifest.json is not synchronized with the source folder.",
    )
    args = parser.parse_args()

    try:
        manifest = build_manifest()
        expected = manifest_text(manifest)
    except (FileNotFoundError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1

    if args.check:
        actual = MANIFEST_PATH.read_text(encoding="utf-8") if MANIFEST_PATH.is_file() else ""
        if actual != expected:
            print(
                "stickers/manifest.json is out of date; run "
                "python scripts/sync_stickers.py",
                file=sys.stderr,
            )
            return 1
        print("Sticker manifest is synchronized.")
        return 0

    MANIFEST_PATH.write_text(expected, encoding="utf-8")
    print(f"Generated {len(manifest)} sticker entries.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
