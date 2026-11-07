#!/usr/bin/env python3
"""Copy every photograph from the shared store into data/media as JPEG."""

import json
import sys
from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

SOURCE = Path("/cursor/stores/self/media/photos")
ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "data" / "media"
SEED = ROOT / "data" / "seed.json"
MAX_EDGE = 2400

# Narrative order. Every file in SOURCE must appear here or the script fails.
ORDER = [
    "f31a37de-bc81-490a-b013-5fb9bdf1ece1.jpg",
    "ebd1ee1f-62e6-47c4-9c61-39a0313a5261.jpg",
    "6afaf377-4782-47fd-8877-15f846c65278.jpg",
    "39e1fd09-91bd-4e61-9ea8-481543d66601.jpg",
    "6001f8a6-8530-4660-a9a8-79ae1eada337.jpg",
    "e8d0085a-4132-40fe-ae64-38f1a487a400.jpg",
    "72e079fc-f4fd-4c91-abc6-393e0e9cc341.jpg",
    "1E404D18-21CF-4859-91AC-A2691B1E7A5A_1_201_a_f41d.heic",
    "b69d67c3-782a-4ceb-bf4e-7541cd5e1140.jpg",
    "FDFFC774-F2AD-4568-968D-13899F5DBC66_1_201_a_9ba8.heic",
    "D07CFDA5-066B-403C-A846-60093143F36E_1_201_a_057b.heic",
    "f8a8acff-b946-4304-9ece-e9f885a52ca4.jpg",
    "22b38328-2751-4d13-bda7-a54e56347faa.jpg",
    "3d941243-a4ac-4a00-b119-99194e1952cc.jpg",
    "ac1a8481-2e01-40dd-a648-3a1008e7513d.jpg",
    "c18fd269-5bfd-45f4-a0ec-7b4e4e77134c.jpg",
    "73ba648f-9a5a-4c8f-8d7d-1978923fa2f1.jpg",
    "65af6600-656c-4794-aeb0-032df9600487.jpg",
    "63e42b4f-ad26-419b-8a6e-22ce1f0a25a1.jpg",
    "5b1d0518-e4d2-4e74-96dd-04e7f4f5b38a.jpg",
]

CAPTIONS = {
    "f31a37de-bc81-490a-b013-5fb9bdf1ece1.jpg": "A heart across the table.",
    "ebd1ee1f-62e6-47c4-9c61-39a0313a5261.jpg": "Leaning in at dinner.",
    "6afaf377-4782-47fd-8877-15f846c65278.jpg": "Close, on an ordinary day.",
    "39e1fd09-91bd-4e61-9ea8-481543d66601.jpg": "A quiet morning.",
    "6001f8a6-8530-4660-a9a8-79ae1eada337.jpg": "Warm light, and a kiss.",
    "e8d0085a-4132-40fe-ae64-38f1a487a400.jpg": "Home for the afternoon.",
    "72e079fc-f4fd-4c91-abc6-393e0e9cc341.jpg": "After the flowers arrived.",
    "1E404D18-21CF-4859-91AC-A2691B1E7A5A_1_201_a_f41d.heic": "One more, before we stood up.",
    "b69d67c3-782a-4ceb-bf4e-7541cd5e1140.jpg": "Desert light on the way somewhere.",
    "FDFFC774-F2AD-4568-968D-13899F5DBC66_1_201_a_9ba8.heic": "The passenger seat, again.",
    "D07CFDA5-066B-403C-A846-60093143F36E_1_201_a_057b.heic": "A table for two, the night just opening.",
    "f8a8acff-b946-4304-9ece-e9f885a52ca4.jpg": "Neon blossoms.",
    "22b38328-2751-4d13-bda7-a54e56347faa.jpg": "A room made of stars.",
    "3d941243-a4ac-4a00-b119-99194e1952cc.jpg": "Under a painted sky.",
    "ac1a8481-2e01-40dd-a648-3a1008e7513d.jpg": "Green light, shoulder to shoulder.",
    "c18fd269-5bfd-45f4-a0ec-7b4e4e77134c.jpg": "Back to back, among the spheres.",
    "73ba648f-9a5a-4c8f-8d7d-1978923fa2f1.jpg": "Lifted, on a gold evening.",
    "65af6600-656c-4794-aeb0-032df9600487.jpg": "The lamps coming on.",
    "63e42b4f-ad26-419b-8a6e-22ce1f0a25a1.jpg": "The city behind us.",
    "5b1d0518-e4d2-4e74-96dd-04e7f4f5b38a.jpg": "Under a long row of lights.",
}


def stem_id(name: str) -> str:
    stem = Path(name).stem
    if not stem or not all(c.isalnum() or c in "_-" for c in stem):
        raise SystemExit(f"unsafe filename: {name}")
    return stem


def convert(src: Path, dest: Path) -> tuple[int, int]:
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert("RGB")
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "JPEG", quality=86, optimize=True, progressive=True)
        return im.width, im.height


def main() -> None:
    if not SOURCE.is_dir():
        raise SystemExit(f"missing photo folder: {SOURCE}")
    found = sorted(p.name for p in SOURCE.iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".heic", ".heif"})
    expected = set(ORDER)
    extra = [n for n in found if n not in expected]
    missing = [n for n in ORDER if n not in set(found)]
    if extra or missing:
        raise SystemExit(f"photo list mismatch\nextra={extra}\nmissing={missing}\nfound={found}")
    photos = []
    for index, name in enumerate(ORDER, start=1):
        src = SOURCE / name
        if src.stat().st_size < 32:
            raise SystemExit(f"photo is empty: {name}")
        image_id = stem_id(name)
        filename = f"{image_id}.jpg"
        width, height = convert(src, MEDIA / filename)
        photos.append(
            {
                "id": image_id,
                "filename": filename,
                "caption": CAPTIONS[name],
                "width": width,
                "height": height,
                "sortOrder": index,
                "source": name,
            }
        )
        print(f"{index:02d} {name} -> {filename} {width}x{height}")
    SEED.write_text(json.dumps({"photos": photos}, indent=2) + "\n")
    print(f"wrote {len(photos)} photographs to {SEED}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"prepare failed: {exc}", file=sys.stderr)
        raise
