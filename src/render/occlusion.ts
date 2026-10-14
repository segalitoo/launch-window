// Occlusion tests for the "never lose a unit" rule (CLAUDE.md). Pure math, no Phaser.
// A unit is hidden when a sample point on its sprite is covered by an occluder that
// draws in front of it (larger depth key).

import { depthOf, footprint, type Point } from './iso';

export interface Occluder {
  depth: number;
  /** World-space bounding box, for a cheap first test. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  covers(x: number, y: number): boolean;
}

export function insideConvex(pts: readonly Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}

/** Screen outline of an extruded tile-space box (convex hexagon). */
export function boxHull(x: number, y: number, w: number, h: number, height: number): Point[] {
  const [back, right, front, left] = footprint(x, y, w, h);
  const up = (p: Point): Point => ({ x: p.x, y: p.y - height });
  return [up(back), up(right), right, front, left, up(left)];
}

/** Occluder for a placeholder block standing on tile (tx, ty). */
export function blockOccluder(
  tx: number,
  ty: number,
  inset: number,
  height: number,
): Occluder {
  const hull = boxHull(tx + inset, ty + inset, 1 - 2 * inset, 1 - 2 * inset, height);
  const xs = hull.map((p) => p.x);
  const ys = hull.map((p) => p.y);
  return {
    depth: depthOf(tx + 0.5, ty + 0.5, height),
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
    covers: (px, py) => insideConvex(hull, px, py),
  };
}

/** Occluder backed by an alpha mask (a painted tile piece). The mask is in source
 *  pixels; `scale` source pixels make one world pixel; (wx, wy) is the mask's world top-left. */
export function maskOccluder(
  tx: number,
  ty: number,
  height: number,
  wx: number,
  wy: number,
  w: number,
  h: number,
  scale: number,
  alphaAt: (sx: number, sy: number) => number,
): Occluder {
  return {
    depth: depthOf(tx + 0.5, ty + 0.5, height),
    x0: wx,
    y0: wy,
    x1: wx + w / scale,
    y1: wy + h / scale,
    covers: (px, py) => {
      const sx = Math.floor((px - wx) * scale);
      const sy = Math.floor((py - wy) * scale);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
      return alphaAt(sx, sy) > 127;
    },
  };
}

/** True when any sample point is covered by an occluder drawn in front of `depth`. */
export function isHidden(samples: readonly Point[], depth: number, occluders: readonly Occluder[]): boolean {
  for (const o of occluders) {
    if (o.depth <= depth) continue;
    for (const s of samples) {
      if (s.x < o.x0 || s.x > o.x1 || s.y < o.y0 || s.y > o.y1) continue;
      if (o.covers(s.x, s.y)) return true;
    }
  }
  return false;
}
