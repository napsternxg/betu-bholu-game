#!/usr/bin/env python3
"""
Slice the 12-pose character sheets (4 cols x 3 rows, row-major) and the
5-hat sheet (3 cols x 2 rows) into game-ready PNGs.

Usage: npm run slice   (or: python3 tools/slice-sprites.py)

Reads:  public/assets/source/{betu,bholu,topiwala,monkey,hats}.jpg
Writes: public/assets/characters/<id>/<pose>.png
        public/assets/hats/<color>.png  (incl. hat-white.png master)
"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public', 'assets', 'source')
OUT_CHAR = os.path.join(ROOT, 'public', 'assets', 'characters')
OUT_HATS = os.path.join(ROOT, 'public', 'assets', 'hats')
OUT_BG = os.path.join(ROOT, 'public', 'assets', 'backgrounds')

# Row-major pose order matches src/core/types.ts POSES
POSES = {
    'betu': ['stand', 'walk', 'run', 'jump',
             'sit-forward', 'sit-cross', 'sit-side', 'kneel',
             'lie-back', 'lie-tummy', 'crawl', 'wave'],
    'bholu': ['stand', 'hop', 'run', 'jump',
              'sit', 'eat', 'drink', 'sploot',
              'lie-back', 'slide', 'dig', 'wave'],
    'topiwala': ['stand', 'walk', 'run', 'jump',
                 'sit-cross', 'hold-hats', 'tip-hat', 'wave',
                 'eat', 'drink', 'sleep', 'confused'],
    'monkey': ['stand', 'walk', 'run', 'jump',
               'sit', 'climb', 'arms-up', 'throw',
               'catch', 'eat', 'drink', 'wave'],
}
HAT_ORDER = ['blue', 'yellow', 'green', 'red', 'white']  # 3 cols x 2 rows


# Per-pose crop overrides: (left, top, right, bottom) as fractions of cell size.
# Use when a neighbor's art intrudes deeper than the default inset handles.
INSET_OVERRIDES = {
    ('topiwala', 'sleep'): (0.055, 0.18, 0.055, 0.055),
}


def remove_white_bg(cell, thresh=30, from_borders=False):
    """Flood-fill near-white background to transparent.
    from_borders: also seed from every border pixel, which clears background
    trapped between limbs (e.g. between legs). Only safe when the art has no
    near-white costume parts touching the border -- NOT Bholu's white fur,
    NOT the white hat master.
    """
    im = cell.convert('RGBA')
    w, h = im.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if from_borders:
        seeds += [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
        seeds += [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for seed in seeds:
        r, g, b = im.getpixel(seed)[:3]
        if r > 255 - thresh and g > 255 - thresh and b > 255 - thresh:
            ImageDraw.floodfill(im, seed, (255, 255, 255, 0), thresh=thresh)
    return im


# Characters with no near-white costume parts: border seeding is safe.
BORDER_FILL_SAFE = {'topiwala', 'betu', 'monkey'}


def slice_grid(path, cols, rows, names, char_id='', inset=0.055):
    """inset: fraction of cell size trimmed from each edge to cut neighbor bleed."""
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    cw, ch = w / cols, h / rows
    cells = []
    for i, name in enumerate(names):
        r, c = divmod(i, cols)
        x0, y0 = c * cw, r * ch
        l, t, ri, b = INSET_OVERRIDES.get((char_id, name), (inset, inset, inset, inset))
        cells.append((name, im.crop((int(x0 + cw * l), int(y0 + ch * t),
                                    int(x0 + cw * (1 - ri)), int(y0 + ch * (1 - b))))))
    return cells


def main():
    count = 0
    for char_id, poses in POSES.items():
        outdir = os.path.join(OUT_CHAR, char_id)
        os.makedirs(outdir, exist_ok=True)
        for name, cell in slice_grid(os.path.join(SRC, f'{char_id}.jpg'), 4, 3, poses, char_id=char_id):
            cell = remove_white_bg(cell, from_borders=(char_id in BORDER_FILL_SAFE))
            cell.save(os.path.join(outdir, f'{name}.png'))
            count += 1
        print(f'{char_id}: {len(poses)} poses')

    os.makedirs(OUT_HATS, exist_ok=True)
    for name, cell in slice_grid(os.path.join(SRC, 'hats.jpg'), 3, 2, HAT_ORDER):
        fname = 'hat-white.png' if name == 'white' else f'{name}.png'
        cell = remove_white_bg(cell)
        cell.save(os.path.join(OUT_HATS, fname))
        count += 1
    print('hats: 5 colors (+white master)')

    os.makedirs(OUT_BG, exist_ok=True)
    scene = os.path.join(SRC, 'scene.jpg')
    if os.path.exists(scene):
        Image.open(scene).save(os.path.join(OUT_BG, 'jungle.jpg'))
        print('background: jungle.jpg')

    print(f'Done. {count} sprites written.')


if __name__ == '__main__':
    main()
