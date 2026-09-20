#!/usr/bin/env python3
"""Analyze each pose cell: does the character's own art extend past the
current inset crop on any edge? Uses connected components on a probe crop
(inset 0.015) so neighbor bleed (separate blobs) doesn't count as character.

For each edge, reports:
  char_px: pixels of the LARGEST component in the strip between the current
           crop edge and the probe edge  -> >0 means the current crop cuts art
  bleed_px: pixels of OTHER components in the strip between the probe edge
           and the current crop edge     -> what we'd newly include (risk)

Usage: python3 tools/analyze-crops.py
"""
from PIL import Image
import numpy as np
import os
import importlib.util
from collections import deque

_specloc = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'slice-sprites.py')
_spec = importlib.util.spec_from_file_location('slice_sprites', _specloc)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
remove_white_bg = _mod.remove_white_bg
BORDER_FILL_SAFE = _mod.BORDER_FILL_SAFE
# Always analyze against the slicer's live settings, not a copy.
INSET_OVERRIDES = _mod.INSET_OVERRIDES
CUR = _mod.DEFAULT_INSET

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'public', 'assets', 'source')

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
PROBE = 0.005   # probe inset: how far we look past the current crop
CUT_THRESH = 40  # px of character art in strip -> counts as "cut"


def largest_component(mask):
    """4-connected components; return boolean mask of the largest."""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    best = None
    best_n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                q = deque([(y, x)])
                seen[y, x] = True
                cells = []
                while q:
                    cy, cx = q.popleft()
                    cells.append((cy, cx))
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
                if len(cells) > best_n:
                    best_n = len(cells)
                    best = cells
    out = np.zeros((h, w), dtype=bool)
    if best:
        ys, xs = zip(*best)
        out[ys, xs] = True
    return out, best_n


def analyze(char_id, pose, idx):
    im = Image.open(os.path.join(SRC, f'{char_id}.jpg')).convert('RGBA')
    w, h = im.size
    cw, ch = w / 4, h / 3
    r, c = divmod(idx, 4)
    x0, y0 = c * cw, r * ch
    # probe crop (slightly inside the cell)
    px0, py0 = int(x0 + cw * PROBE), int(y0 + ch * PROBE)
    px1, py1 = int(x0 + cw * (1 - PROBE)), int(y0 + ch * (1 - PROBE))
    probe = im.crop((px0, py0, px1, py1))
    # Same background removal the slicer applies, so the mask = art only.
    probe = remove_white_bg(probe, from_borders=(char_id in BORDER_FILL_SAFE))
    pw, ph = probe.size
    alpha = np.array(probe.split()[3])
    char_mask, char_n = largest_component(alpha > 16)
    other_mask = (alpha > 16) & ~char_mask

    l, t, ri, b = INSET_OVERRIDES.get((char_id, pose), (CUR, CUR, CUR, CUR))
    # current crop edges expressed in probe-crop coordinates
    cl = int(cw * (l - PROBE)); ct = int(ch * (t - PROBE))
    cr = pw - int(cw * (ri - PROBE)); cb = ph - int(ch * (b - PROBE))
    strips = {
        'LEFT': (slice(0, ph), slice(0, cl)),
        'TOP': (slice(0, ct), slice(0, pw)),
        'RIGHT': (slice(0, ph), slice(cr, pw)),
        'BOTTOM': (slice(cb, ph), slice(0, pw)),
    }
    res = {}
    for edge, (ys, xs) in strips.items():
        if ys.stop <= ys.start or xs.stop <= xs.start:
            res[edge] = (0, 0)
            continue
        char_px = int(char_mask[ys, xs].sum())
        bleed_px = int(other_mask[ys, xs].sum())
        res[edge] = (char_px, bleed_px)
    return res, char_n


def main():
    print(f'{"pose":22s} ' + ' '.join(f'{e:>22s}' for e in ('LEFT', 'TOP', 'RIGHT', 'BOTTOM')))
    for char_id, poses in POSES.items():
        for i, pose in enumerate(poses):
            res, n = analyze(char_id, pose, i)
            flags = []
            for e in ('LEFT', 'TOP', 'RIGHT', 'BOTTOM'):
                char_px, bleed_px = res[e]
                mark = 'CUT!' if char_px > CUT_THRESH else ('bleed' if bleed_px > CUT_THRESH else 'ok')
                flags.append(f'{mark} c={char_px} b={bleed_px}')
            tag = ' <-- CUT' if any(res[e][0] > CUT_THRESH for e in res) else ''
            print(f'{char_id}/{pose:16s} ' + ' '.join(f'{f:>22s}' for f in flags) + tag)


if __name__ == '__main__':
    main()
