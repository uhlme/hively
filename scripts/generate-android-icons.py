#!/usr/bin/env python3
"""Generate Android launcher mipmaps from resources/icon.png (1024×1024)."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = ROOT / "resources" / "icon.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# Brand dark field sampled inside the icon (not the rounded-corner anti-alias).
BG_RGB = (26, 27, 27)
BG_HEX = "#1A1B1B"

DENSITIES = {
    "mdpi": 1,
    "hdpi": 1.5,
    "xhdpi": 2,
    "xxhdpi": 3,
    "xxxhdpi": 4,
}


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def make_legacy(src: Image.Image, size: int) -> Image.Image:
    base = Image.new("RGBA", src.size, (*BG_RGB, 255))
    base.alpha_composite(src)
    return resize(base, size)


def make_round(src: Image.Image, size: int) -> Image.Image:
    img = make_legacy(src, size)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0))
    out.putalpha(circle_mask(size))
    return out


def make_foreground(src: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resize(src, size))
    return canvas


def main() -> None:
    if not SRC_PATH.is_file():
        raise SystemExit(f"Missing source icon: {SRC_PATH}")

    src = Image.open(SRC_PATH).convert("RGBA")
    if src.size != (1024, 1024):
        src = resize(src, 1024)

    for name, scale in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        launcher = int(48 * scale)
        foreground = int(108 * scale)
        make_legacy(src, launcher).save(folder / "ic_launcher.png", optimize=True)
        make_round(src, launcher).save(folder / "ic_launcher_round.png", optimize=True)
        make_foreground(src, foreground).save(
            folder / "ic_launcher_foreground.png", optimize=True
        )
        print(f"{name}: launcher={launcher} foreground={foreground}")

    bg_file = RES / "values" / "ic_launcher_background.xml"
    bg_file.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{BG_HEX}</color>\n'
        "</resources>\n"
    )
    print(f"background {BG_HEX} → {bg_file.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
