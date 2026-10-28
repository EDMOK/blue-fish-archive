"""Generate or validate the static sticker manifest and crawlable indexes.

站长自作的表情列在 stickers/self-made.json(文件名数组),这些条目会带上
selfMade: true,前端据此显示「自作」徽章。清单里的文件名必须在 media/ 里存在。

已有条目的 alt / tags 会在重新生成时按 original 路径保留,便于手工维护;
新文件先使用通用 alt,之后可再补充。

除了 stickers/manifest.json,还会生成两个不依赖 JavaScript 的公开入口:
- stickers/index.json: 带绝对 URL 的完整图片清单,供脚本和 agent 直接读取
- gallery.html: 服务端输出的静态画廊,每张图都有可抓取的链接和 alt
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from html import escape
from pathlib import Path
from urllib.parse import quote

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "media"
PREVIEW_DIR = ROOT / "previews"
LARGE_DIR = ROOT / "large"
MANIFEST_PATH = ROOT / "stickers" / "manifest.json"
INDEX_PATH = ROOT / "stickers" / "index.json"
GALLERY_PATH = ROOT / "gallery.html"
SELF_MADE_PATH = ROOT / "stickers" / "self-made.json"
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".apng"}
DEFAULT_ALT = "鲸鱼娘同人表情包"
SITE_URL = "https://fisharchive.cc"
SITE_NAME = "蓝色大肥鱼档案馆"
SITE_DESCRIPTION = "鲸鱼娘 DeepSeek 非官方同人表情包收藏站，可在线预览、复制和下载原图。"
LICENSE_NAME = "CC BY-NC-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/"
LICENSE_NOTE = "角色二次设计依 CC BY-NC-SA 4.0；单张作品的相关权利归各自创作者。"


def _image_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        with Image.open(path) as image:
            return image.size
    except OSError:
        return None


def load_self_made() -> list[str]:
    """站长自作的表情文件名,按清单里写的样子返回。"""
    if not SELF_MADE_PATH.is_file():
        raise FileNotFoundError(f"自作图清单不存在:{SELF_MADE_PATH}")
    try:
        names = json.loads(SELF_MADE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{SELF_MADE_PATH.name} 不是合法 JSON:{error}") from error
    if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
        raise ValueError(f"{SELF_MADE_PATH.name} 应该是文件名组成的数组")
    return names


def load_existing_metadata() -> dict[str, dict[str, object]]:
    """按 original 路径保留清单里已有的 alt / tags,避免重新生成时丢标注。"""
    if not MANIFEST_PATH.is_file():
        return {}
    try:
        raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, list):
        return {}

    metadata: dict[str, dict[str, object]] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        original = item.get("original")
        if not isinstance(original, str):
            continue
        preserved: dict[str, object] = {}
        alt = item.get("alt")
        if isinstance(alt, str) and alt.strip():
            preserved["alt"] = alt
        tags = item.get("tags")
        if isinstance(tags, list) and all(isinstance(tag, str) for tag in tags):
            valid_tags = [tag for tag in tags if tag.strip()]
            if valid_tags:
                preserved["tags"] = valid_tags
        metadata[original.casefold()] = preserved
    return metadata


def build_manifest() -> list[dict[str, object]]:
    if not SOURCE_DIR.is_dir():
        raise FileNotFoundError(f"Sticker source directory not found: {SOURCE_DIR}")

    existing = load_existing_metadata()

    files = sorted(
        (
            path
            for path in SOURCE_DIR.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ),
        key=lambda path: path.name.casefold(),
    )

    self_made_names = load_self_made()
    self_made = {name.casefold() for name in self_made_names}
    media_names = {path.name.casefold() for path in files}
    # 名字写错(或图被删了)时直接失败,否则徽章会静默消失
    unknown = [name for name in self_made_names if name.casefold() not in media_names]
    if unknown:
        raise ValueError(
            f"{SELF_MADE_PATH.name} 里的这些文件在 media/ 里找不到:" + "、".join(unknown)
        )

    manifest: list[dict[str, object]] = []
    seen_paths: set[str] = set()
    for path in files:
        original = path.relative_to(ROOT).as_posix()
        normalized = original.casefold()
        if normalized in seen_paths:
            raise ValueError(f"Duplicate sticker path detected: {original}")
        seen_paths.add(normalized)

        previous = existing.get(normalized, {})
        entry: dict[str, object] = {
            "original": original,
            "filename": path.name,
            "alt": previous.get("alt", DEFAULT_ALT),
        }
        if "tags" in previous:
            entry["tags"] = previous["tags"]
        if path.name.casefold() in self_made:
            entry["selfMade"] = True
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


def manifest_text(manifest: list[dict[str, object]]) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def _absolute_url(relative: str) -> str:
    return f"{SITE_URL}/{quote(relative, safe='/')}"


def _href(relative: str) -> str:
    return escape(quote(relative, safe="/"), quote=True)


def index_text(manifest: list[dict[str, object]]) -> str:
    """供脚本直接读取的公开清单：绝对 URL、无时间戳，重复生成结果稳定。"""
    stickers: list[dict[str, object]] = []
    for entry in manifest:
        item: dict[str, object] = {
            "alt": entry["alt"],
            "tags": entry.get("tags", []),
        }
        if entry.get("selfMade"):
            item["selfMade"] = True
        for key in ("width", "height"):
            if key in entry:
                item[key] = entry[key]
        item["original"] = _absolute_url(str(entry["original"]))
        for key in ("preview", "large"):
            if key in entry:
                item[key] = _absolute_url(str(entry[key]))
        stickers.append(item)

    payload = {
        "site": f"{SITE_URL}/",
        "name": SITE_NAME,
        "description": SITE_DESCRIPTION,
        "license": {"name": LICENSE_NAME, "url": LICENSE_URL, "note": LICENSE_NOTE},
        "count": len(stickers),
        "stickers": stickers,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def _gallery_card(entry: dict[str, object]) -> str:
    original = str(entry["original"])
    preview = str(entry.get("preview", original))
    alt = escape(str(entry["alt"]))
    size = ""
    width, height = entry.get("width"), entry.get("height")
    if isinstance(width, int) and isinstance(height, int):
        size = f' width="{width}" height="{height}"'
    badge = '<span class="badge">自作</span>' if entry.get("selfMade") else ""
    tags = "".join(
        f'<span class="tag">{escape(str(tag))}</span>'
        for tag in entry.get("tags", [])
    )
    links = []
    if "large" in entry:
        links.append(f'<a href="{_href(str(entry["large"]))}">大图</a>')
    links.append(f'<a href="{_href(original)}">原图</a>')

    return (
        "      <figure>\n"
        f'        <a href="{_href(original)}">'
        f'<img src="{_href(preview)}" alt="{alt}"{size} loading="lazy" decoding="async" /></a>\n'
        f'        <figcaption>{badge}<span class="tags">{tags}</span>'
        f'<span class="links">{" · ".join(links)}</span></figcaption>\n'
        "      </figure>"
    )


GALLERY_STYLE = """
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  background: #182340;
  color: #eaf2ff;
}
a { color: #8fd3ff; }
header, main, footer { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
header { padding-top: 40px; }
.eyebrow { margin: 0 0 8px; color: #8fd3ff; font-size: 13px; letter-spacing: 0.12em; }
h1 { margin: 0 0 12px; font-size: clamp(24px, 4vw, 36px); }
header p { margin: 0 0 10px; line-height: 1.7; color: #c7d6ef; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  padding: 28px 0 40px;
}
figure { margin: 0; background: #22304f; border-radius: 12px; overflow: hidden; }
figure img { display: block; width: 100%; height: auto; background: #1b2742; }
figcaption { padding: 8px 10px 10px; font-size: 12px; line-height: 1.8; }
.badge {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f2c94c;
  color: #182340;
  font-weight: 600;
}
.tag {
  display: inline-block;
  margin-right: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #2f4066;
  color: #dbe8ff;
}
.links { display: block; margin-top: 4px; }
footer { padding-bottom: 40px; color: #9fb2d3; font-size: 13px; line-height: 1.8; }
"""


def gallery_text(manifest: list[dict[str, object]]) -> str:
    """不依赖 JavaScript 的静态画廊,让抓取工具直接看到每张图的 URL。"""
    cards = "\n".join(_gallery_card(entry) for entry in manifest)
    return (
        "<!doctype html>\n"
        '<html lang="zh-CN">\n'
        "  <head>\n"
        '    <meta charset="UTF-8" />\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
        '    <meta name="theme-color" content="#182340" />\n'
        f'    <meta name="description" content="{escape(SITE_DESCRIPTION)}" />\n'
        f"    <title>全部表情 · {escape(SITE_NAME)}</title>\n"
        f'    <link rel="canonical" href="{SITE_URL}/gallery" />\n'
        f"    <style>{GALLERY_STYLE}</style>\n"
        "  </head>\n"
        "  <body>\n"
        "    <header>\n"
        '      <p class="eyebrow">静态索引</p>\n'
        f"      <h1>{escape(SITE_NAME)} · 全部表情</h1>\n"
        f"      <p>{len(manifest)} 张表情的纯静态列表，不依赖 JavaScript。"
        "每张图都可以直接打开原图或大图。</p>\n"
        '      <p class="links"><a href="/">返回首页</a> · '
        '<a href="/characters">角色立绘</a> · '
        '<a href="stickers/index.json">JSON 数据</a> · '
        '<a href="https://fisharchive.cc/sitemap.xml">站点地图</a></p>\n'
        "    </header>\n"
        "    <main>\n"
        '      <div class="grid">\n'
        f"{cards}\n"
        "      </div>\n"
        "    </main>\n"
        "    <footer>\n"
        f"      <p>{escape(LICENSE_NOTE)}</p>\n"
        f'      <p><a href="{SITE_URL}/">{escape(SITE_NAME)}</a></p>\n'
        "    </footer>\n"
        "  </body>\n"
        "</html>\n"
    )


def _write_text(path: Path, text: str) -> None:
    """先写临时文件再替换;newline='\\n' 保证 Windows 上生成的 blob 与 CI 一致。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail when manifest.json, index.json or gallery.html is out of date.",
    )
    args = parser.parse_args()

    try:
        manifest = build_manifest()
        outputs = {
            MANIFEST_PATH: manifest_text(manifest),
            INDEX_PATH: index_text(manifest),
            GALLERY_PATH: gallery_text(manifest),
        }
    except (FileNotFoundError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1

    if args.check:
        stale = []
        for path, expected in outputs.items():
            actual = path.read_text(encoding="utf-8") if path.is_file() else ""
            if actual != expected:
                stale.append(path.relative_to(ROOT).as_posix())
        if stale:
            print(
                f"{'、'.join(stale)} out of date; run python scripts/sync_stickers.py",
                file=sys.stderr,
            )
            return 1
        print("Sticker manifest and public indexes are synchronized.")
        return 0

    for path, text in outputs.items():
        _write_text(path, text)
    print(
        f"Generated {len(manifest)} sticker entries "
        "(manifest.json, index.json, gallery.html)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
