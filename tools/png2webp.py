#!/usr/bin/env python3
"""Convert sliced sprite PNGs to the WebP files the game actually loads.

Replaces the previously-manual step documented in the README
(PIL save with quality=90). Converts:
  public/assets/characters/*/*.png  -> same name .webp
  public/assets/hats/hat-white.png   -> hat-white.webp
(the game only uses the white hat master; HatSystem tints it at boot)

Run: python3 tools/png2webp.py   (npm run webp)
"""
import glob
import os

QUALITY = 90

TARGETS = (
    glob.glob('public/assets/characters/*/*.png')
    + ['public/assets/hats/hat-white.png']
)


def main() -> None:
    n = 0
    for p in sorted(TARGETS):
        if not os.path.exists(p):
            continue
        from PIL import Image
        out = os.path.splitext(p)[0] + '.webp'
        Image.open(p).convert('RGBA').save(out, 'WEBP', quality=QUALITY)
        n += 1
        print(f'{out}')
    print(f'done, {n} webp written (quality={QUALITY})')


if __name__ == '__main__':
    main()
