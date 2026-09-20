#!/usr/bin/env python3
"""Find optimal per-pose crop insets for 4x3 character sheets.

For each grid boundary, searches a wide band (+-0.45 cell) for the widest
near-empty interval (gap) with substantial art on both sides, and places the
seam in its middle. Falls back to min-cut (thinnest art row) when the poses
touch with no clean gap. Outer sheet edges use the art extent directly.

Outputs a Python INSET_OVERRIDES dict {(char, pose): (left, top, right, bottom)}
with insets as fractions of cell size. May be negative (seam past the nominal
grid line, into the neighbour's nominal cell); slice-sprites.py clamps the
final crop box to the sheet bounds.
"""
import os, sys, math, importlib.util
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'assets', 'source')

spec = importlib.util.spec_from_file_location(
    'slice_sprites', os.path.join(ROOT, 'tools', 'slice-sprites.py'))
ss = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ss)

SHEETS = {
    'betu':     ('betu.jpg',     True,  ['stand','walk','run','jump','sit-forward','sit-cross','sit-side','kneel','lie-back','lie-tummy','crawl','wave']),
    'bholu':    ('bholu.jpg',    False, ['stand','hop','run','jump','sit','eat','drink','sploot','lie-back','slide','dig','wave']),
    'topiwala': ('topiwala.jpg', True,  ['stand','walk','run','jump','sit-cross','hold-hats','tip-hat','wave','eat','drink','sleep','confused']),
    'monkey':   ('monkey.jpg',   True,  ['stand','walk','run','jump','sit','climb','arms-up','throw','catch','eat','drink','wave']),
}

EMPTY_PX = 12        # a row/col with fewer art px than this counts as empty
MIN_SIDE_FRAC = 0.01 # each side of a gap must hold at least this frac of band art
HALF_BAND = 0.45     # search band half-width, in cell units


def gap_seam(prof, nominal, total):
    """prof: 1D art-pixel counts over the band. Returns seam index (band-rel)
    at the centre of the widest near-empty interval that has substantial art
    on both sides, closest to nominal on ties; None if no such interval."""
    n = len(prof)
    empty = prof < EMPTY_PX
    best, best_w = None, -1
    i = 0
    cands = []
    while i < n:
        if empty[i]:
            j = i
            while j + 1 < n and empty[j + 1]:
                j += 1
            w_int = j - i + 1
            above = prof[:i].sum()
            below = prof[j + 1:].sum()
            if above > MIN_SIDE_FRAC * total and below > MIN_SIDE_FRAC * total:
                cands.append((w_int, abs((i + j) / 2 - nominal), (i + j) / 2))
            i = j + 1
        else:
            i += 1
    if not cands:
        return None
    cands.sort(key=lambda c: (-c[0], c[1]))
    return cands[0][2]


def mincut_seam(prof, nominal, lam=0.02):
    """Fallback: row/col cutting the fewest art px, penalised by distance."""
    n = len(prof)
    idx = np.arange(n)
    cost = prof.astype(float) + lam * np.abs(idx - nominal) * (prof.max() or 1)
    return float(np.argmin(cost))


def h_boundary(art, y_nom, x0, x1, ch):
    lo = max(0, int(y_nom - HALF_BAND * ch))
    hi = min(art.shape[0], int(y_nom + HALF_BAND * ch))
    prof = art[lo:hi, x0:x1].sum(axis=1)
    total = prof.sum()
    nom = y_nom - lo
    if total == 0:
        return y_nom
    g = gap_seam(prof, nom, total)
    if g is not None:
        return lo + g
    return lo + mincut_seam(prof, nom)


def v_boundary(art, x_nom, y0, y1, cw):
    lo = max(0, int(x_nom - HALF_BAND * cw))
    hi = min(art.shape[1], int(x_nom + HALF_BAND * cw))
    prof = art[y0:y1, lo:hi].sum(axis=0)
    total = prof.sum()
    nom = x_nom - lo
    if total == 0:
        return x_nom
    g = gap_seam(prof, nom, total)
    if g is not None:
        return lo + g
    return lo + mincut_seam(prof, nom)


def main():
    out = {}
    for char, (fn, borders, poses) in SHEETS.items():
        im = Image.open(os.path.join(SRC, fn)).convert('RGBA')
        im = ss.remove_white_bg(im, from_borders=borders)
        w, h = im.size
        art = np.array(im.split()[3]) > 16
        cw, ch = w / 4, h / 3
        for idx, pose in enumerate(poses):
            r, c = divmod(idx, 4)
            x0, x1 = int(c * cw), int((c + 1) * cw)
            y0, y1 = int(r * ch), int((r + 1) * ch)
            if r == 0:
                ys = np.nonzero(art[0:int(HALF_BAND * ch), x0:x1])[0]
                top = float(ys.min()) if len(ys) else 0.0
            else:
                top = h_boundary(art, r * ch, x0, x1, ch)
            if r == 2:
                lo = int(h - HALF_BAND * ch)
                ys = np.nonzero(art[lo:h, x0:x1])[0]
                bot = float(ys.max() + lo) if len(ys) else float(h)
            else:
                bot = h_boundary(art, (r + 1) * ch, x0, x1, ch)
            if c == 0:
                xs = np.nonzero(art[y0:y1, 0:int(HALF_BAND * cw)])[1]
                left = float(xs.min()) if len(xs) else 0.0
            else:
                left = v_boundary(art, c * cw, y0, y1, cw)
            if c == 3:
                lo = int(w - HALF_BAND * cw)
                xs = np.nonzero(art[y0:y1, lo:w])[1]
                right = float(xs.max() + lo) if len(xs) else float(w)
            else:
                right = v_boundary(art, (c + 1) * cw, y0, y1, cw)
            out[(char, pose)] = (
                round((left - c * cw) / cw, 3),
                round((top - r * ch) / ch, 3),
                round(((c + 1) * cw - right) / cw, 3),
                round(((r + 1) * ch - bot) / ch, 3),
            )
    print('INSET_OVERRIDES = {')
    for (char, pose), v in out.items():
        print(f'    ({char!r}, {pose!r}): {v},')
    print('}')


if __name__ == '__main__':
    main()
