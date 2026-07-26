from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

try:
    import qrcode
except ImportError as exc:  # pragma: no cover - setup guard
    raise SystemExit("Install the QR encoder first: python -m pip install qrcode[pil]") from exc


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "brand"
SITE_URL = "https://spindexmy.vercel.app/en"

W, H = 2480, 3508  # A4 at 300 DPI.
BLEED_SAFE = 120

FONT_DISPLAY = Path("C:/Windows/Fonts/bahnschrift.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")
FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def centered_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: str,
    stroke_width: int = 0,
    stroke_fill: str | None = None,
) -> None:
    x, y = xy
    tw, th = text_size(draw, text, fnt)
    draw.text(
        (x - tw // 2, y - th // 2),
        text,
        font=fnt,
        fill=fill,
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: str,
    outline: str | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font_path: Path,
    max_width: int,
    start_size: int,
    min_size: int = 36,
) -> ImageFont.FreeTypeFont:
    for size in range(start_size, min_size - 1, -2):
        fnt = font(font_path, size)
        if text_size(draw, text, fnt)[0] <= max_width:
            return fnt
    return font(font_path, min_size)


def paste_alpha(base: Image.Image, overlay: Image.Image, xy: tuple[int, int]) -> None:
    if overlay.mode != "RGBA":
        overlay = overlay.convert("RGBA")
    base.alpha_composite(overlay, dest=xy)


def make_background() -> Image.Image:
    img = Image.new("RGBA", (W, H), "#061012")
    draw = ImageDraw.Draw(img, "RGBA")

    for y in range(H):
        t = y / H
        r = int(7 + 9 * t)
        g = int(16 + 12 * t)
        b = int(18 + 18 * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    accent = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(accent, "RGBA")
    ad.polygon([(-180, 360), (W + 120, 1180), (W + 120, 1450), (-180, 630)], fill=(0, 229, 143, 40))
    ad.polygon([(-220, 1010), (W + 220, 2460), (W + 220, 2690), (-220, 1240)], fill=(20, 174, 255, 38))
    ad.polygon([(W - 620, -120), (W + 80, -120), (W + 80, 1180), (W - 1020, 680)], fill=(255, 91, 50, 34))
    accent = accent.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(accent)

    for offset, color, width in [
        (-170, (0, 229, 143, 130), 10),
        (-105, (50, 211, 255, 110), 7),
        (-38, (255, 91, 50, 120), 7),
        (980, (0, 229, 143, 80), 4),
    ]:
        draw.line([(offset, 0), (offset + W, H)], fill=color, width=width)

    for i in range(46):
        x = int((i * 431) % W)
        y = int((i * 701) % H)
        alpha = 34 if i % 3 else 58
        draw.line([(x - 80, y), (x + 80, y)], fill=(255, 255, 255, alpha), width=2)

    return img


def make_qr() -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=24,
        border=4,
    )
    qr.add_data(SITE_URL)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    return qr_img.resize((690, 690), Image.Resampling.NEAREST)


def load_part(path: str, size: int, angle: float, alpha: int = 255) -> Image.Image:
    part = Image.open(ROOT / path).convert("RGBA")
    part.thumbnail((size, size), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(part, ((size - part.width) // 2, (size - part.height) // 2))
    canvas = canvas.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)
    if alpha < 255:
        a = canvas.getchannel("A").point(lambda p: p * alpha // 255)
        canvas.putalpha(a)
    return canvas


def add_part_cluster(img: Image.Image) -> None:
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow, "RGBA")
    for cx, cy, radius, color in [
        (1240, 1540, 820, (0, 229, 143, 35)),
        (1320, 1720, 650, (50, 211, 255, 28)),
        (1640, 1330, 500, (255, 91, 50, 24)),
    ]:
        gd.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    img.alpha_composite(glow)

    draw = ImageDraw.Draw(img, "RGBA")
    center = (1320, 1560)
    for radius, color, width in [
        (650, (255, 255, 255, 44), 6),
        (520, (0, 229, 143, 80), 8),
        (380, (50, 211, 255, 70), 5),
    ]:
        box = (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius)
        draw.arc(box, 198, 522, fill=color, width=width)

    parts = [
        ("public/parts/blade/e09d7dc6.png", 760, 10, (920, 1050), 255),
        ("public/parts/blade/0f22fde0.png", 590, -20, (1355, 1275), 235),
        ("public/parts/blade/58c0f794.png", 500, 35, (570, 1500), 210),
        ("public/parts/blade/a28e30ce.png", 470, -38, (1520, 880), 205),
        ("public/parts/bit/bit-f.png", 260, 16, (650, 2070), 230),
        ("public/parts/bit/bit-r.png", 240, -20, (1690, 2020), 220),
        ("public/parts/ratchet/ratchet-3-60.png", 320, 24, (1030, 2060), 220),
    ]

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for path, size, angle, pos, alpha in parts:
        part = load_part(path, size, angle, alpha)
        s = part.copy()
        s_alpha = s.getchannel("A").point(lambda p: int(p * 0.48))
        s.putalpha(s_alpha)
        s = ImageEnhance.Brightness(s).enhance(0)
        shadow.alpha_composite(s.filter(ImageFilter.GaussianBlur(28)), dest=(pos[0] + 28, pos[1] + 38))
    img.alpha_composite(shadow)

    for path, size, angle, pos, alpha in parts:
        paste_alpha(img, load_part(path, size, angle, alpha), pos)


def add_feature_chip(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, fill: str) -> None:
    fnt = font(FONT_BOLD, 42)
    tw, th = text_size(draw, label, fnt)
    pad_x, pad_y = 34, 20
    rounded_rect(
        draw,
        (x, y, x + tw + pad_x * 2, y + th + pad_y * 2),
        16,
        fill,
        outline=(255, 255, 255, 70),
        width=2,
    )
    draw.text((x + pad_x, y + pad_y - 2), label, font=fnt, fill="#f7fbff")


def load_wordmark(height: int) -> Image.Image:
    wm = Image.open(ROOT / "public/brand/spindex-wordmark.png").convert("RGBA")
    ratio = height / wm.height
    return wm.resize((round(wm.width * ratio), height), Image.Resampling.LANCZOS)


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    xy: tuple[int, int],
    fnt: ImageFont.FreeTypeFont,
    fill: str,
    max_width: int,
    line_gap: int,
) -> int:
    x, y = xy
    words = text.split()
    line = ""
    for word in words:
        trial = f"{line} {word}".strip()
        if text_size(draw, trial, fnt)[0] <= max_width:
            line = trial
            continue
        draw.text((x, y), line, font=fnt, fill=fill)
        y += text_size(draw, line, fnt)[1] + line_gap
        line = word
    if line:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += text_size(draw, line, fnt)[1] + line_gap
    return y


def build_poster() -> Image.Image:
    img = make_background()
    add_part_cluster(img)

    draw = ImageDraw.Draw(img, "RGBA")

    brand_y = 132
    paste_alpha(img, load_wordmark(150), (BLEED_SAFE, brand_y))

    kicker = "EXTREME GEAR SPORTS"
    draw.text((BLEED_SAFE + 8, 356), kicker, font=font(FONT_BOLD, 44), fill="#00e58f")

    headline_lines = ["BUILD YOUR", "ULTIMATE COMBO"]
    y = 474
    for i, line in enumerate(headline_lines):
        fnt = fit_text(draw, line, FONT_DISPLAY, 1380, 184 if i == 0 else 172)
        draw.text(
            (BLEED_SAFE, y),
            line,
            font=fnt,
            fill="#f7fbff",
            stroke_width=3,
            stroke_fill=(0, 229, 143, 80),
        )
        y += text_size(draw, line, fnt)[1] + 32

    body_font = font(FONT_REGULAR, 56)
    copy = "Parts catalog, combo builder, rankings, tournaments and battle scoreboard in one fast Beyblade X app."
    words = copy.split()
    lines: list[str] = []
    line = ""
    for word in words:
        trial = f"{line} {word}".strip()
        if text_size(draw, trial, body_font)[0] <= 1180:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    yy = 896
    for line in lines:
        draw.text((BLEED_SAFE, yy), line, font=body_font, fill="#d6e3e6")
        yy += 74

    chip_y = 2504
    add_feature_chip(draw, BLEED_SAFE, chip_y, "CATALOG", "#102d31")
    add_feature_chip(draw, BLEED_SAFE + 358, chip_y, "BUILDER", "#1c2735")
    add_feature_chip(draw, BLEED_SAFE, chip_y + 142, "RANKINGS", "#2b2028")
    add_feature_chip(draw, BLEED_SAFE + 416, chip_y + 142, "SCOREBOARD", "#12312a")

    qr = make_qr()
    panel_x, panel_y = W - BLEED_SAFE - 860, H - BLEED_SAFE - 1010
    rounded_rect(draw, (panel_x, panel_y, panel_x + 860, panel_y + 1010), 34, "#f8fbfc", outline="#00e58f", width=8)
    rounded_rect(draw, (panel_x + 52, panel_y + 52, panel_x + 808, panel_y + 808), 22, "#ffffff")
    paste_alpha(img, qr, (panel_x + 85, panel_y + 85))

    centered_text(draw, (panel_x + 430, panel_y + 855), "SCAN TO OPEN", font(FONT_BOLD, 58), "#071013")
    centered_text(draw, (panel_x + 430, panel_y + 922), "spindexmy.vercel.app/en", font(FONT_REGULAR, 38), "#26393d")

    draw.line((BLEED_SAFE, H - 274, panel_x - 62, H - 274), fill=(255, 255, 255, 60), width=2)
    footer = "Unofficial fan project. Beyblade X trademarks and product images belong to Takara Tomy / Hasbro."
    footer_y = draw_wrapped(
        draw,
        footer,
        (BLEED_SAFE, H - 226),
        font(FONT_REGULAR, 34),
        "#a8b6ba",
        panel_x - BLEED_SAFE - 100,
        8,
    )
    draw.text((BLEED_SAFE, footer_y + 4), SITE_URL, font=font(FONT_BOLD, 34), fill="#32d3ff")

    return img.convert("RGB")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    poster = build_poster()
    png = OUT_DIR / "spindex-promotion-poster.png"
    pdf = OUT_DIR / "spindex-promotion-poster.pdf"
    poster.save(png, dpi=(300, 300), optimize=True)
    poster.save(pdf, "PDF", resolution=300)
    print(f"Wrote {png}")
    print(f"Wrote {pdf}")
    print(f"QR target: {SITE_URL}")


if __name__ == "__main__":
    main()
