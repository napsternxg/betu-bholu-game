"""Defringe character sprites: remove the whitish anti-aliased halo left around
the dark outlines by the original white-background art.

For each opaque pixel that is whitish (min channel > THRESH) and touches a
transparent pixel, make it transparent. Two iterations catch the 2px fringe.
The characters' dark outlines (< THRESH) always stop the erosion, and interior
fur is never adjacent to transparency, so the art itself is untouched.
Also scrubs the RGB of transparent pixels (lossy webp leaves gray garbage
there) so any pipeline that flattens alpha sees white, not gray smears.

Run: python3 tools/defringe.py
"""
from PIL import Image
import glob
import os

THRESH = 170
ITERATIONS = 2
CHARS = ('bholu', 'betu', 'topiwala', 'monkey')


def defringe(path: str) -> int:
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()
    # 1. scrub transparent-pixel RGB -> white
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 128:
                px[x, y] = (255, 255, 255, 0)
    # 2. erode whitish fringe adjacent to transparency
    removed_total = 0
    for _ in range(ITERATIONS):
        doomed = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 128 or min(r, g, b) <= THRESH:
                    continue
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] < 128:
                        doomed.append((x, y))
                        break
        for x, y in doomed:
            px[x, y] = (255, 255, 255, 0)
        removed_total += len(doomed)
        if not doomed:
            break
    im.save(path)
    return removed_total


if __name__ == '__main__':
    n = 0
    for char in CHARS:
        for p in sorted(glob.glob(f'public/assets/characters/{char}/*.webp')):
            removed = defringe(p)
            n += 1
            print(f'{os.path.basename(char)}/{os.path.basename(p)}: removed {removed} fringe px')
    print(f'done, {n} sprites')
