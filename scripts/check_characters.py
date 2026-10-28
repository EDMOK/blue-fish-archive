"""Validate the static character reference page and its assets.

The artwork is derived from source files that are not committed, so CI cannot
rebuild it. This check still verifies that every referenced file exists and
matches its declared intrinsic dimensions.

Usage::

    python scripts/check_characters.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "characters.html"
ASSET_PATTERN = re.compile(r"character-art/[^\"'\s]+\.webp")
IMG_PATTERN = re.compile(
    r'<img\s+src="(character-art/[^"]+)"[^>]*?width="(\d+)"[^>]*?height="(\d+)"',
    re.IGNORECASE,
)
SRCSET_PATTERN = re.compile(r'srcset="([^"]+)"')


def main() -> int:
    if not PAGE.is_file():
        print(f"Missing page: {PAGE.relative_to(ROOT)}", file=sys.stderr)
        return 1

    html = PAGE.read_text(encoding="utf-8")
    problems: list[str] = []

    referenced = sorted(set(ASSET_PATTERN.findall(html)))
    if not referenced:
        problems.append("页面没有引用任何 character-art 素材")

    for relative in referenced:
        path = ROOT / relative
        if not path.is_file():
            problems.append(f"引用的素材不存在：{relative}")

    for match in IMG_PATTERN.finditer(html):
        relative, width, height = match.group(1), int(match.group(2)), int(match.group(3))
        path = ROOT / relative
        if not path.is_file():
            continue
        with Image.open(path) as image:
            if image.size != (width, height):
                problems.append(
                    f"{relative} 声明尺寸 {width}x{height}，实际 {image.width}x{image.height}"
                )

    for match in SRCSET_PATTERN.finditer(html):
        for candidate in match.group(1).split(","):
            relative = candidate.strip().split(" ")[0]
            if relative.startswith("character-art/") and not (ROOT / relative).is_file():
                problems.append(f"srcset 里的素材不存在：{relative}")

    for asset in ("characters.js", "styles.css"):
        if not (ROOT / asset).is_file():
            problems.append(f"缺少资源：{asset}")

    if problems:
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1

    print(f"角色立绘页检查通过：{len(referenced)} 个素材引用，尺寸全部匹配。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
