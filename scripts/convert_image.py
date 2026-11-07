#!/usr/bin/env python3
"""Normalize one photograph to a progressive JPEG. Prints: width height."""

import sys

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

MAX_EDGE = 2400


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: convert_image.py INPUT OUTPUT", file=sys.stderr)
        sys.exit(2)
    src, dest = sys.argv[1], sys.argv[2]
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert("RGB")
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        im.save(dest, "JPEG", quality=86, optimize=True, progressive=True)
        print(f"{im.width} {im.height}")


if __name__ == "__main__":
    main()
