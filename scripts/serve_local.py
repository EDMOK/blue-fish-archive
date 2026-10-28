"""Serve the site locally with Cloudflare Pages-style URL rewriting.

Pages serves /about from about.html and /gallery from gallery.html without
redirecting. Python's stock http.server does not, so clicking a site nav link
during local preview hits a 404 that does not exist in production. This server
resolves the same extensionless paths and refuses to list directories.

Usage::

    python scripts/serve_local.py            # http://localhost:8765/
    python scripts/serve_local.py --port 8080
"""

from __future__ import annotations

import argparse
import posixpath
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PagesRequestHandler(SimpleHTTPRequestHandler):
    # Windows 的 mimetypes 表里不一定有 webp，补上让本地预览和线上响应头一致。
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webp": "image/webp"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _resolve(self) -> tuple[str | None, str | None]:
        """返回 (要内部改写到的路径, 要 308 重定向到的路径)。"""
        parsed = urllib.parse.urlsplit(self.path)
        # normpath 会吃掉尾斜杠，先记住原始形态再归一化。
        raw = urllib.parse.unquote(parsed.path)
        candidate = posixpath.normpath(raw)
        if candidate == ".":
            candidate = "/"
        query = f"?{parsed.query}" if parsed.query else ""
        relative = candidate.lstrip("/")

        if candidate == "/":
            return None, None

        if raw.endswith("/"):
            page = f"{relative}.html"
            # 目录里没有 index.html 时，/foo/ 回到 /foo，避免相对资源路径解析错位。
            if not (ROOT / relative / "index.html").is_file() and (ROOT / page).is_file():
                return None, f"/{relative}{query}"
            return None, None

        if not posixpath.splitext(candidate)[1]:
            if (ROOT / f"{relative}.html").is_file():
                return f"/{relative}.html{query}", None
            if (ROOT / relative / "index.html").is_file():
                return f"/{relative}/{query}", None

        return None, None

    def _deny_directory_listing(self) -> bool:
        parsed = urllib.parse.urlsplit(self.path)
        target = ROOT / urllib.parse.unquote(parsed.path).lstrip("/")
        if target.is_dir() and not (target / "index.html").is_file():
            self.send_error(404, "File not found")
            return True
        return False

    def _handle(self, head_only: bool) -> None:
        resolved, redirect = self._resolve()
        if redirect is not None:
            self.send_response(308)
            self.send_header("Location", redirect)
            self.end_headers()
            return
        if resolved is not None:
            self.path = resolved
        if self._deny_directory_listing():
            return
        (super().do_HEAD() if head_only else super().do_GET())

    def do_GET(self) -> None:
        self._handle(head_only=False)

    def do_HEAD(self) -> None:
        self._handle(head_only=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), PagesRequestHandler)
    print(f"Serving {ROOT} at http://localhost:{args.port}/ (Pages-style extensionless URLs)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
