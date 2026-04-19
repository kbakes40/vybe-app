#!/usr/bin/env python3
"""
Generate the premium Vybe iOS app icon (1024×1024).

OLED black, machined cyan wave with brushed metallic read, #00B0FF outer glow,
neon magenta segment on the leading leg, 1px #00E5FF square border.

  python3 mobile/scripts/generate-app-icon.py
"""
from __future__ import annotations

import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
SEGMENTS_UV = (
    ((10, 50), (25, 20), (40, 50)),
    ((40, 50), (55, 80), (70, 50)),
    ((70, 50), (85, 20), (100, 50)),
)

BLACK = (0, 0, 0)
CYAN = (0, 229, 255)
GLOW = (0, 176, 255)
MAGENTA = (255, 0, 212, 255)


def quad_bezier(p0, p1, p2, n: int) -> list[tuple[float, float]]:
    pts = []
    for i in range(n + 1):
        t = i / n
        o = 1 - t
        x = o * o * p0[0] + 2 * o * t * p1[0] + t * t * p2[0]
        y = o * o * p0[1] + 2 * o * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def wave_points_uv(per_seg: int = 72) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for i, s in enumerate(SEGMENTS_UV):
        chunk = quad_bezier(s[0], s[1], s[2], per_seg)
        if i > 0:
            chunk = chunk[1:]
        out.extend(chunk)
    return out


def to_px(
    pts: list[tuple[float, float]], scale: float, ox: float, oy: float
) -> list[tuple[float, float]]:
    return [(ox + p[0] * scale, oy + p[1] * scale) for p in pts]


def draw_polyline_rgba(
    layer: Image.Image, pts: list[tuple[float, float]], width: int, rgba: tuple[int, ...]
) -> None:
    dr = ImageDraw.Draw(layer)
    for i in range(len(pts) - 1):
        dr.line([pts[i], pts[i + 1]], fill=rgba, width=width)


def brushed_rgb(i: int, n: int) -> tuple[int, int, int]:
    t = i / max(1, n - 1)
    h = 0.35 + 0.65 * (math.sin(t * math.pi) ** 0.7)
    if t < 0.33:
        h = min(1.0, h + 0.22 * (1 - t / 0.33))
    r = int(110 + 90 * h)
    g = int(200 + 55 * h)
    b = int(220 + 35 * h)
    r = int(r * (1 - 0.35 * t))
    g = int(g * (1 - 0.35 * t) + 229 * (0.35 * t))
    b = int(b * (1 - 0.35 * t) + 255 * (0.35 * t))
    return (r, g, b)


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    mobile = os.path.dirname(here)
    out_path = os.path.join(
        mobile,
        "ios/vibecode/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png",
    )

    uv = wave_points_uv(72)
    pad = 130
    inner = SIZE - 2 * pad
    scale = inner / 100.0
    ox = pad + (inner - 100 * scale) / 2
    oy = pad + (inner - 100 * scale) / 2
    pts = to_px(uv, scale, ox, oy)

    img = Image.new("RGB", (SIZE, SIZE), BLACK)

    # Outer glow — spec: #00B0FF, strong bloom (maps to ~GaussianBlur 10–14 at 1024)
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_polyline_rgba(glow, pts, width=40, rgba=(*GLOW, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=16))
    glow2 = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_polyline_rgba(glow2, pts, width=20, rgba=(*GLOW, 235))
    glow2 = glow2.filter(ImageFilter.GaussianBlur(radius=9))
    comp = img.convert("RGBA")
    comp = Image.alpha_composite(comp, glow)
    comp = Image.alpha_composite(comp, glow2)
    img = comp.convert("RGB")
    dr = ImageDraw.Draw(img)

    # Brushed titanium (stacked widths along path)
    nseg = len(pts) - 1
    for w in (8, 5, 3):
        a = 0.12 + (10 - w) * 0.04
        for i in range(nseg):
            r, g, b = brushed_rgb(i, nseg)
            r = int(r * a + BLACK[0] * (1 - a))
            g = int(g * a + BLACK[1] * (1 - a))
            b = int(b * a + BLACK[2] * (1 - a))
            dr.line([pts[i], pts[i + 1]], fill=(r, g, b), width=w)

    # Primary machined outline (~3px @1024 ≈ 1pt hairline on device)
    for i in range(nseg):
        dr.line([pts[i], pts[i + 1]], fill=CYAN, width=3)

    # Magenta "online" trace — leading ~30% of path, on top
    cut = max(4, int(len(pts) * 0.30))
    mag = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_polyline_rgba(mag, pts[:cut], width=2, rgba=MAGENTA)
    mag = mag.filter(ImageFilter.GaussianBlur(radius=1))
    img = Image.alpha_composite(img.convert("RGBA"), mag).convert("RGB")
    dr = ImageDraw.Draw(img)
    # Sharp hairline magenta (minimal) on leading leg only
    for i in range(min(nseg, cut - 1)):
        dr.line([pts[i], pts[i + 1]], fill=(255, 0, 212), width=1)

    # Icon border seal
    dr.rectangle([0, 0, SIZE - 1, SIZE - 1], outline=CYAN, width=1)

    img.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
