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


# Default crop inset: fraction of cell size trimmed from each edge to cut
# neighbor bleed. Tightened per pose/edge below wherever the character's own
# art runs past the default crop (feet, hat tops, outstretched limbs).
DEFAULT_INSET = 0.055
# Per-pose crop overrides: (left, top, right, bottom) as fractions of cell size.
# Derived with tools/analyze-crops.py, which finds character art (largest
# connected component) crossing the default crop edge while ignoring
# disconnected neighbor bleed. One judgment call: ('bholu','dig') right edge
# uses 0.03 -- the dirt mound runs past 0.055 but the wave pose's hand starts
# intruding past 0.03 (checked visually).
INSET_OVERRIDES = {
    ('betu', 'stand'): (0.217, 0.045, 0.045, -0.182),
    ('betu', 'walk'): (-0.045, 0.054, 0.03, -0.161),
    ('betu', 'run'): (-0.03, 0.069, -0.018, -0.109),
    ('betu', 'jump'): (0.018, 0.051, 0.136, -0.093),
    ('betu', 'sit-forward'): (0.112, 0.182, -0.108, -0.215),
    ('betu', 'sit-cross'): (0.108, 0.161, 0.035, -0.173),
    ('betu', 'sit-side'): (-0.035, 0.109, -0.129, -0.106),
    ('betu', 'kneel'): (0.129, 0.093, 0.214, 0.012),
    ('betu', 'lie-back'): (0.078, 0.215, -0.052, 0.15),
    ('betu', 'lie-tummy'): (0.052, 0.173, -0.035, 0.087),
    ('betu', 'crawl'): (0.035, 0.106, -0.073, 0.04),
    ('betu', 'wave'): (0.073, -0.012, 0.156, 0.047),
    ('bholu', 'stand'): (0.15, 0.076, 0.048, -0.098),
    ('bholu', 'hop'): (-0.048, 0.103, 0.04, -0.066),
    ('bholu', 'run'): (-0.04, 0.167, -0.021, -0.069),
    ('bholu', 'jump'): (0.021, 0.047, 0.062, -0.273),
    ('bholu', 'sit'): (0.143, 0.098, 0.018, -0.131),
    ('bholu', 'eat'): (-0.018, 0.066, 0.028, -0.1),
    ('bholu', 'drink'): (-0.028, 0.069, 0.098, -0.092),
    ('bholu', 'sploot'): (-0.098, 0.273, 0.092, 0.032),
    ('bholu', 'lie-back'): (0.065, 0.131, -0.011, 0.103),
    ('bholu', 'slide'): (0.011, 0.1, -0.036, 0.156),
    ('bholu', 'dig'): (0.036, 0.092, -0.104, 0.065),
    ('bholu', 'wave'): (0.104, -0.032, 0.103, 0.049),
    ('topiwala', 'stand'): (0.204, 0.026, 0.042, -0.081),
    ('topiwala', 'walk'): (-0.042, 0.035, 0.039, -0.026),
    ('topiwala', 'run'): (-0.039, 0.081, -0.018, 0.006),
    ('topiwala', 'jump'): (0.018, 0.072, 0.129, -0.002),
    ('topiwala', 'sit-cross'): (0.149, 0.081, -0.019, -0.04),
    ('topiwala', 'hold-hats'): (0.019, 0.026, 0.011, -0.073),
    ('topiwala', 'tip-hat'): (-0.011, -0.006, 0.022, -0.291),
    ('topiwala', 'wave'): (-0.022, 0.002, 0.182, -0.052),
    ('topiwala', 'eat'): (0.182, 0.04, 0.02, 0.041),
    ('topiwala', 'drink'): (-0.02, 0.073, 0.157, 0.037),
    ('topiwala', 'sleep'): (-0.157, 0.291, -0.146, 0.146),
    ('topiwala', 'confused'): (0.146, 0.052, 0.23, 0.028),
    ('monkey', 'stand'): (0.217, 0.04, 0.028, -0.057),
    ('monkey', 'walk'): (-0.028, 0.058, 0.055, -0.007),
    ('monkey', 'run'): (-0.055, 0.096, 0.0, 0.006),
    ('monkey', 'jump'): (0.0, 0.031, 0.096, -0.087),
    ('monkey', 'sit'): (0.219, 0.057, -0.011, 0.022),
    ('monkey', 'climb'): (0.011, 0.007, -0.016, -0.038),
    ('monkey', 'arms-up'): (0.016, -0.006, 0.078, -0.032),
    ('monkey', 'throw'): (-0.078, 0.087, 0.087, 0.029),
    ('monkey', 'catch'): (0.058, -0.022, -0.044, 0.065),
    ('monkey', 'eat'): (0.044, 0.038, -0.052, 0.076),
    ('monkey', 'drink'): (0.052, 0.032, 0.02, 0.031),
    ('monkey', 'wave'): (-0.02, -0.029, 0.087, 0.042),
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


def slice_grid(path, cols, rows, names, char_id='', inset=DEFAULT_INSET):
    """inset: fraction of cell size trimmed from each edge to cut neighbor bleed.
    Per-pose INSET_OVERRIDES may be negative (seam pushed past the nominal grid
    line); the crop box is clamped to the sheet bounds."""
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    cw, ch = w / cols, h / rows
    cells = []
    for i, name in enumerate(names):
        r, c = divmod(i, cols)
        x0, y0 = c * cw, r * ch
        l, t, ri, b = INSET_OVERRIDES.get((char_id, name), (inset, inset, inset, inset))
        box = (int(x0 + cw * l), int(y0 + ch * t),
               int(x0 + cw * (1 - ri)), int(y0 + ch * (1 - b)))
        box = (max(0, box[0]), max(0, box[1]), min(w, box[2]), min(h, box[3]))
        cells.append((name, im.crop(box)))
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

    # NOTE: backgrounds are user-provided paintings in public/assets/backgrounds/
    # (Sep 18 2026) -- the old scene.jpg -> jungle.jpg step was removed because
    # it would clobber the user's character-free jungle painting with the
    # legacy character-filled scene.

    print(f'Done. {count} sprites written.')


if __name__ == '__main__':
    main()
