"""Fail when a content-versioned asset changes without a new ?v= token in the HTML.

styles.css、app.js、about.js、qr-modal.js 的文件名里没有内容哈希，而 Cloudflare 又会把
浏览器缓存拉到 31 天（详见 _headers 注释）。改了文件却不换 URL，老访客就会一直拿旧文件，
表现成「新 HTML + 旧 CSS」的排版错乱。这个脚本守两件事：

1. 结构检查（总是运行）：HTML 里引用的本地 .css / .js 必须带 ?v= 版本号。
2. 变更检查（传 --base 时）：资源内容相对 base 变了，而引用它的页面 ?v= 没跟着变，就报错。

用法：
    python scripts/check_asset_versions.py                  # 只做结构检查
    python scripts/check_asset_versions.py --base HEAD~1    # 顺带对比上一个提交
"""

from __future__ import annotations

import argparse
import posixpath
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONED_SUFFIXES = (".css", ".js")
REFERENCE_PATTERN = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
# 外链、内联数据和页内锚点不需要版本号
EXTERNAL_PREFIXES = ("http://", "https://", "//", "data:", "#")


def git(*args: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, check=False)


def tracked_html_files() -> list[str]:
    result = git("ls-files", "-z", "--", "*.html")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", "replace").strip() or "git ls-files 失败")
    return [name for name in result.stdout.decode("utf-8").split("\0") if name]


def read_at(revision: str, path: str) -> bytes | None:
    result = git("show", f"{revision}:{path}")
    return result.stdout if result.returncode == 0 else None


def content_changed(revision: str, path: str) -> bool:
    """比 blob 哈希而不是字节：Windows 工作区是 CRLF，直接比字节会把所有文件都判成改动。"""
    before = git("rev-parse", f"{revision}:{path}")
    if before.returncode != 0:
        return True  # 以前没有这个文件
    current = git("hash-object", "--", path)
    if current.returncode != 0:
        return True  # 文件被删了
    return before.stdout.strip() != current.stdout.strip()


def references(html: str, page: str) -> list[tuple[str, str | None]]:
    """页面里引用的本地 css/js，返回 (仓库根相对路径, ?v= 的值或 None)。"""
    found: list[tuple[str, str | None]] = []
    page_dir = posixpath.dirname(page)
    for match in REFERENCE_PATTERN.finditer(html):
        url = match.group(1).strip()
        if not url or url.startswith(EXTERNAL_PREFIXES):
            continue
        path, _, query = url.partition("?")
        if not path.lower().endswith(VERSIONED_SUFFIXES):
            continue
        version = None
        for part in query.split("&"):
            key, _, value = part.partition("=")
            if key == "v" and value:
                version = value
        found.append((posixpath.normpath(posixpath.join(page_dir, path)), version))
    return found


def check_structure(pages: list[str], problems: list[str]) -> list[tuple[str, str, str]]:
    versioned: list[tuple[str, str, str]] = []
    for page in pages:
        html = (ROOT / page).read_text(encoding="utf-8")
        # 同页重复引用（例如 preload + script）只算一次，但版本号不同的两条都会留下
        for asset, version in dict.fromkeys(references(html, page)):
            if not version:
                problems.append(
                    f"{page} 引用的 {asset} 没带 ?v= 版本号；该文件名里没有内容哈希，"
                    f"不加版本号会一直命中旧缓存。"
                )
                continue
            versioned.append((page, asset, version))
    return versioned


def check_changes(
    base: str,
    versioned: list[tuple[str, str, str]],
    problems: list[str],
) -> None:
    changed: dict[str, bool] = {}
    base_versions: dict[str, dict[str, str | None] | None] = {}
    for page, asset, version in versioned:
        if page not in base_versions:
            raw = read_at(base, page)
            base_versions[page] = (
                None if raw is None else dict(references(raw.decode("utf-8", "replace"), page))
            )
        page_versions = base_versions[page]
        if page_versions is None:
            continue  # 新页面，老缓存里没有这条 URL
        base_version = page_versions.get(asset)
        if not base_version:
            continue  # 以前没引用过或以前没版本号，URL 本身就变了
        if base_version != version:
            continue  # 版本号换了，老缓存不会再命中
        if asset not in changed:
            changed[asset] = content_changed(base, asset)
        if changed[asset]:
            problems.append(
                f"{asset} 内容已改，但 {page} 里的 ?v={version} 没变；"
                f"不换 URL 浏览器会继续用旧文件（Cloudflare 把 max-age 拉到 31 天）。"
            )


def main() -> int:
    # Windows 下 stdout 被管道接管时默认按 GBK 编码，中文日志会变成乱码，统一改成 UTF-8
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--base", metavar="REV", help="对比用的 git 版本，省略则只做结构检查")
    args = parser.parse_args()

    problems: list[str] = []
    try:
        pages = tracked_html_files()
    except RuntimeError as error:
        print(f"无法列出仓库里的 HTML：{error}", file=sys.stderr)
        return 1

    versioned = check_structure(pages, problems)

    compared = False
    if args.base:
        if git("rev-parse", "--verify", f"{args.base}^{{commit}}").returncode != 0:
            print(f"警告：本地没有版本 {args.base}，跳过变更检查，只报告结构检查结果。")
        else:
            compared = True
            check_changes(args.base, versioned, problems)

    if problems:
        print("静态资源版本号检查未通过：\n")
        for problem in problems:
            print(f"  - {problem}")
        print("\n修法：把 HTML 里对应的 ?v= 换成新值（例如 ?v=20261002），和资源一起提交。")
        return 1

    scope = f"，对比 {args.base}" if compared else ""
    print(f"静态资源版本号检查通过：{len(versioned)} 处引用{scope}。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
