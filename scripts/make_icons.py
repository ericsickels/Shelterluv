#!/usr/bin/env python3
"""Make the field guide's home screen icons from our logo.

Downloads the logo (hosted on Squarespace), centres it on a square white tile and writes
  fieldguide-icon-180.png  - iPhone/iPad "Add to Home Screen"
  fieldguide-icon-192.png  - Android
  fieldguide-icon-512.png  - Android (large)
into the output directory. Needs Pillow.

Usage:
    python3 scripts/make_icons.py public
"""

import io
import os
import sys
import urllib.request

from PIL import Image

LOGO_URL = os.environ.get(
    "LOGO_URL",
    "https://images.squarespace-cdn.com/content/v1/5a25b56b51a5845bb4efad79/"
    "2b8394b7-51a2-4040-9d5f-2ceebdb5059a/2+color.png?format=1000w",
)
SIZES = (180, 192, 512)
MARGIN = 0.12  # space around the logo, as a share of the icon (phones round the corners)
BACKGROUND = (255, 255, 255)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "public"
    req = urllib.request.Request(LOGO_URL, headers={"User-Agent": "Mozilla/5.0 (field guide icon)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        logo = Image.open(io.BytesIO(resp.read())).convert("RGBA")
    bbox = logo.getbbox()  # trim transparent edges so the logo fills the tile
    if bbox:
        logo = logo.crop(bbox)

    for size in SIZES:
        inner = round(size * (1 - 2 * MARGIN))
        scale = min(inner / logo.width, inner / logo.height)
        fitted = logo.resize((max(1, round(logo.width * scale)), max(1, round(logo.height * scale))), Image.LANCZOS)
        tile = Image.new("RGBA", (size, size), BACKGROUND + (255,))
        tile.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
        path = os.path.join(out_dir, "fieldguide-icon-%d.png" % size)
        tile.convert("RGB").save(path, optimize=True)
        print("Wrote", path)


if __name__ == "__main__":
    main()
