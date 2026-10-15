"""生成社交分享卡片 assets/og-card.png(1200x630)。

沿用首页 hero 的视觉语言:深海底渐变 + 低透明度水波,白色贴纸卡(圆角、偏移硬阴影、
珊瑚/雾蓝胶带)里嵌鲸鱼娘立绘,左侧是站名、副标题和域名。

站名/副标题是烧进图片里的,改文案后要重新跑一次:
    python scripts/make_og_card.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets" / "deepseek_whale.png"
OUT = ROOT / "assets" / "og-card.png"

W, H = 1200, 630
SS = 2  # 图形部分按 2 倍绘制再缩小,波浪和圆角边缘更干净

# 站点配色,取自 styles.css 的 :root
INK = (22, 33, 61)
DEEP = (32, 45, 82)
BLUE = (96, 122, 169)
MIST = (223, 232, 245)
PAPER = (247, 248, 251)
CORAL = (241, 199, 197)
STICKER_SHADOW = (24, 37, 68)
CARD_BG = (253, 253, 253)  # 与立绘底色一致,卡片和图片之间不留缝

FONT_CANDIDATES = {
    "bold": [
        "C:/Windows/Fonts/msyhbd.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ],
    "regular": [
        "C:/Windows/Fonts/msyh.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ],
}


def load_font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES[kind]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit(f"找不到{kind}中文字体,请补一个可用路径:{FONT_CANDIDATES[kind]}")


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def vertical_gradient(size, top, bottom) -> Image.Image:
    strip = Image.new("RGB", (1, size[1]))
    px = strip.load()
    for y in range(size[1]):
        px[0, y] = lerp(top, bottom, y / max(1, size[1] - 1))
    return strip.resize(size, Image.BILINEAR).convert("RGBA")


def radial_glow(size, center, radius, color, strength) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(radius * 0.42))
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.paste(Image.new("RGBA", size, color + (strength,)), (0, 0), mask)
    return layer


def wave_line(size, base_y, amp, wavelength, phase, width, color, alpha) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    points = [
        (
            x,
            base_y + amp * math.sin(x / wavelength * 2 * math.pi + phase),
        )
        for x in range(-8, size[0] + 9, 4)
    ]
    draw.line(points, fill=alpha, width=width, joint="curve")
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.paste(Image.new("RGBA", size, color + (255,)), (0, 0), mask)
    return layer


def make_tape(size, color, stripe=115, radius=3) -> Image.Image:
    """一块手账胶带:圆角矩形 + 115deg 的斜向白条纹,和 CSS 里的 repeating-linear-gradient 对应。"""
    w, h = size
    shape_mask = Image.new("L", size, 0)
    ImageDraw.Draw(shape_mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)

    tape = Image.new("RGBA", size, color + (0,))
    tape.putalpha(shape_mask.point(lambda v: round(v * 237 / 255)))

    stripe_alpha = Image.new("L", size, 0)
    draw = ImageDraw.Draw(stripe_alpha)
    period = 11 * SS
    band = 5 * SS
    for x0 in range(-2 * h, w + 2 * h, period):
        draw.polygon(
            [
                (x0, h + 1),
                (x0 + band, h + 1),
                (x0 + band + h, -1),
                (x0 + h, -1),
            ],
            fill=stripe,
        )
    stripe_alpha = ImageChops.multiply(stripe_alpha, shape_mask)
    stripes = Image.new("RGBA", size, (255, 255, 255, 0))
    stripes.putalpha(stripe_alpha)

    return Image.alpha_composite(tape, stripes)


def build_card(inner_height: int, pad: int, tape_overhang: int) -> Image.Image:
    """白色贴纸卡 + 立绘 + 两条胶带,返回尚未旋转的 RGBA 卡片。

    胶带要超出卡片边界一半才像"贴上去"的,所以画布在四周留出 tape_overhang,
    贴完胶带后再按卡片范围裁回来;卡片自身仍保持圆角白底。
    """
    source = Image.open(ART)
    inner_w = round(inner_height * source.width / source.height)
    art = source.resize((inner_w, inner_height), Image.LANCZOS)

    card_w = inner_w + pad * 2
    card_h = inner_height + pad * 2
    canvas_w = card_w + tape_overhang * 2
    canvas_h = card_h + tape_overhang * 2

    card = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    mask = Image.new("L", (canvas_w, canvas_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [
            tape_overhang,
            tape_overhang,
            tape_overhang + card_w - 1,
            tape_overhang + card_h - 1,
        ],
        radius=34 * SS,
        fill=255,
    )
    white = Image.new("RGBA", (canvas_w, canvas_h), CARD_BG + (255,))
    white.putalpha(mask)
    card.alpha_composite(white)
    card.paste(art, (tape_overhang + pad, tape_overhang + pad))

    tape_w, tape_h = 164 * SS, 34 * SS
    left = make_tape((tape_w, tape_h), CORAL).rotate(-7, expand=True, resample=Image.BICUBIC)
    right = make_tape((round(tape_w * 0.78), tape_h), MIST).rotate(6, expand=True, resample=Image.BICUBIC)
    # 胶带中线压在卡片上边缘,一半露出卡片外
    tape_y = tape_overhang - left.height // 2 + 6 * SS
    card.alpha_composite(left, (tape_overhang + round(card_w * 0.10) - left.width // 2, tape_y))
    card.alpha_composite(
        right,
        (tape_overhang + round(card_w * 0.70) - right.width // 2, tape_y + 4 * SS),
    )
    return card.crop(
        (tape_overhang, tape_overhang, tape_overhang + card_w, tape_overhang + card_h)
    )


def drop_shadow(alpha: Image.Image, color, opacity, blur=0) -> Image.Image:
    shadow = Image.new("RGBA", alpha.size, color + (0,))
    shadow.putalpha(alpha.point(lambda v: round(v * opacity / 255)))
    if blur:
        shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    return shadow


def tracked_text(draw, xy, text, font, fill, tracking=0):
    """逐字绘制并加字距,近似 CSS 的 letter-spacing。"""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + tracking


def main() -> None:
    canvas_size = (W * SS, H * SS)
    base = vertical_gradient(canvas_size, INK, DEEP)
    base.alpha_composite(radial_glow(canvas_size, (1500, 380), 780, BLUE, 40))

    for base_y, amp, wavelength, phase, width, color, alpha in [
        (500, 26, 460, 0.4, 3 * SS, BLUE, 46),
        (536, 30, 620, 2.1, 3 * SS, MIST, 34),
        (572, 34, 380, 4.3, 4 * SS, CORAL, 48),
    ]:
        base.alpha_composite(
            wave_line(canvas_size, base_y * SS, amp * SS, wavelength * SS, phase, width, color, alpha)
        )

    card = build_card(inner_height=440 * SS, pad=18 * SS, tape_overhang=26 * SS).rotate(
        2, expand=True, resample=Image.BICUBIC
    )
    card_x = round(918 * SS - card.width / 2)
    card_y = round(315 * SS - card.height / 2)
    base.alpha_composite(drop_shadow(card.getchannel("A"), STICKER_SHADOW, 90, blur=26 * SS), (card_x, card_y + 26 * SS))
    base.alpha_composite(drop_shadow(card.getchannel("A"), STICKER_SHADOW, 235), (card_x + 10 * SS, card_y + 12 * SS))
    base.alpha_composite(card, (card_x, card_y))

    image = base.resize((W, H), Image.LANCZOS)

    # 标题下的珊瑚色波浪短线,呼应首页 hero-wave
    squiggle = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sq_draw = ImageDraw.Draw(squiggle)
    sq_draw.line(
        [(92 + i, 408 + 5 * math.sin(i / 26)) for i in range(0, 200)],
        fill=CORAL + (230,),
        width=4,
        joint="curve",
    )
    sq_draw.line(
        [(292 + i, 408 + 5 * math.sin(i / 26 + 2.4)) for i in range(0, 56)],
        fill=BLUE + (200,),
        width=4,
        joint="curve",
    )
    image.alpha_composite(squiggle)

    draw = ImageDraw.Draw(image)
    tracked_text(draw, (92, 132), "鲸鱼娘 DEEPSEEK", load_font("bold", 26), CORAL, tracking=6)
    draw.text((92, 172), "蓝色大肥鱼", font=load_font("bold", 96), fill=PAPER)
    draw.text((92, 278), "档案馆", font=load_font("bold", 96), fill=PAPER)
    draw.text((92, 432), "同人表情包收藏 · 原图下载", font=load_font("regular", 34), fill=MIST)
    draw.text((92, 522), "fisharchive.cc", font=load_font("regular", 24), fill=(138, 158, 196))

    image.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"{OUT.relative_to(ROOT)}  {image.width}x{image.height}  {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
