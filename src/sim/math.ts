import type { Vec } from './types';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Tile index that contains a coordinate. */
export const tileOf = (v: number): number => Math.floor(v);

/** World position of a tile's center. */
export const center = (tx: number, ty: number): Vec => ({ x: tx + 0.5, y: ty + 0.5 });

/** Signed smallest difference a - b, in (-PI, PI]. */
export function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Turns `e.ang` toward `a` at `rate` rad/s. */
export function turnTo(e: { ang: number }, a: number, dt: number, rate: number): void {
  const d = angDiff(a, e.ang);
  const m = rate * dt;
  e.ang += Math.abs(d) <= m ? d : Math.sign(d) * m;
}

export function pathLength(from: Vec, path: readonly Vec[]): number {
  let len = 0;
  let prev = from;
  for (const q of path) {
    len += dist(prev, q);
    prev = q;
  }
  return len;
}
