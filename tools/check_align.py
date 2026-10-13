"""Measures how far a painted image drifted from the blockout it was painted over.

The painting is compared with the plate scaled to the painting's size. Phase
correlation on edge maps gives the overall shift; an overlay with the blockout's
edges in red over the painting shows local drift (moved or reshaped objects).

Usage: python3 tools/check_align.py <plate.png> <painted.jpg> [<painted2> ...]
Writes <painted>_align.png next to each painting.
"""
import sys

import cv2
import numpy as np


def edges(img):
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    m = cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    return cv2.GaussianBlur(m / (m.max() + 1e-6), (9, 9), 0)


def main():
    plate0 = cv2.imread(sys.argv[1])
    for p in sys.argv[2:]:
        paint = cv2.imread(p)
        h, w = paint.shape[:2]
        plate = cv2.resize(plate0, (w, h), interpolation=cv2.INTER_AREA)
        a, b = edges(plate), edges(paint)
        win = cv2.createHanningWindow((w, h), cv2.CV_32F)
        (dx, dy), response = cv2.phaseCorrelate(a, b, win)
        corr = float(np.corrcoef(a.ravel(), b.ravel())[0, 1])
        to_game = (plate0.shape[1] / w) / 2  # plate is 2x the 100% zoom render
        shift = (dx * dx + dy * dy) ** 0.5
        print(
            f"{p.split('/')[-1]}: {w}x{h}, shift {dx:+.1f},{dy:+.1f} px "
            f"({shift * to_game:.1f} px at game scale), edge match {corr:.2f}, confidence {response:.2f}"
        )
        overlay = paint.copy()
        overlay[cv2.Canny(cv2.cvtColor(plate, cv2.COLOR_BGR2GRAY), 40, 120) > 0] = (40, 40, 255)
        cv2.imwrite(p.rsplit('.', 1)[0] + '_align.png', overlay)


main()
