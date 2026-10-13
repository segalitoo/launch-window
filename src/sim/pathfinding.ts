// 8-direction A* on the tile grid, no corner cutting, then greedy smoothing
// with a clearance check. Ported from the prototype.

import { EPS_MOVE, NEAREST_WALKABLE_RADIUS, PATH_CLEARANCE, PATH_GOAL_MARGIN, PATH_SAMPLE_STEP } from './constants';
import { walkable } from './grid';
import { center, clamp, tileOf } from './math';
import type { Grid, Vec } from './types';

interface TilePos {
  x: number;
  y: number;
}

/** Closest walkable tile in growing square rings around (tx, ty), up to 4 rings out.
 *  With `from`, "closest" is measured from that world point; otherwise from the tile. */
export function nearestWalkable(g: Grid, tx: number, ty: number, from?: Vec): TilePos | null {
  for (let r = 1; r <= NEAREST_WALKABLE_RADIUS; r++) {
    let best: TilePos | null = null;
    let bd = Infinity;
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r || !walkable(g, x, y)) continue;
        const c = center(x, y);
        const d = from ? Math.hypot(c.x - from.x, c.y - from.y) : Math.hypot(x - tx, y - ty);
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Binary min-heap keyed by f. Ties keep the prototype's sift order. */
class Heap {
  private items: [number, number][] = [];
  get size(): number {
    return this.items.length;
  }
  push(f: number, i: number): void {
    const h = this.items;
    h.push([f, i]);
    let k = h.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (h[p]![0] <= h[k]![0]) break;
      [h[p], h[k]] = [h[k]!, h[p]!];
      k = p;
    }
  }
  pop(): [number, number] {
    const h = this.items;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < h.length && h[l]![0] < h[m]![0]) m = l;
        if (r < h.length && h[r]![0] < h[m]![0]) m = r;
        if (m === k) break;
        [h[m], h[k]] = [h[k]!, h[m]!];
        k = m;
      }
    }
    return top;
  }
}

/** Tile path from start to goal, excluding the start tile.
 *  Returns null when unreachable, [] when start equals goal. */
export function findPath(g: Grid, sx: number, sy: number, gx: number, gy: number): TilePos[] | null {
  if (sx === gx && sy === gy) return [];
  const cols = g.cols;
  const n = cols * g.rows;
  // Float32 like the prototype, so tie-breaking between equal routes matches.
  const gs = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new Heap();
  const h = (x: number, y: number): number => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const s = sy * cols + sx;
  gs[s] = 0;
  heap.push(h(sx, sy), s);
  const goal = gy * cols + gx;
  while (heap.size) {
    const [, cur] = heap.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!walkable(g, nx, ny)) continue;
        if (dx && dy && (!walkable(g, cx + dx, cy) || !walkable(g, cx, cy + dy))) continue;
        const ni = ny * cols + nx;
        if (closed[ni]) continue;
        const ng = gs[cur]! + (dx && dy ? Math.SQRT2 : 1);
        if (ng < gs[ni]!) {
          gs[ni] = ng;
          came[ni] = cur;
          heap.push(ng + h(nx, ny), ni);
        }
      }
    }
  }
  if (came[goal] === -1) return null;
  const out: TilePos[] = [];
  let k = goal;
  while (k !== s) {
    out.push({ x: k % cols, y: (k / cols) | 0 });
    k = came[k]!;
  }
  return out.reverse();
}

const CORNERS: readonly [number, number][] = [
  [-PATH_CLEARANCE, -PATH_CLEARANCE],
  [PATH_CLEARANCE, -PATH_CLEARANCE],
  [-PATH_CLEARANCE, PATH_CLEARANCE],
  [PATH_CLEARANCE, PATH_CLEARANCE],
];

/** True when a body with the path clearance can walk straight from a to b. */
export function clearWalk(g: Grid, a: Vec, b: Vec): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / PATH_SAMPLE_STEP));
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    for (const [ox, oy] of CORNERS) if (!walkable(g, tileOf(x + ox), tileOf(y + oy))) return false;
  }
  return true;
}

/** Greedy smoothing: from the current point, jump to the farthest point in clear reach. */
export function smooth(g: Grid, from: Vec, pts: Vec[]): Vec[] {
  const out: Vec[] = [];
  let cur = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearWalk(g, cur, pts[j]!)) j--;
    out.push(pts[j]!);
    cur = pts[j]!;
    i = j + 1;
  }
  return out;
}

/** World-space path for an entity at `e` to the point (wx, wy).
 *  Returns null when unreachable, [] when already there.
 *  A goal on a blocked tile goes to the nearest walkable tile instead. */
export function pathTo(g: Grid, e: Vec, wx: number, wy: number): Vec[] | null {
  let sx = tileOf(e.x);
  let sy = tileOf(e.y);
  if (!walkable(g, sx, sy)) {
    const n = nearestWalkable(g, sx, sy);
    if (!n) return null;
    sx = n.x;
    sy = n.y;
  }
  let gx = tileOf(wx);
  let gy = tileOf(wy);
  let exact = true;
  if (!walkable(g, gx, gy)) {
    const n = nearestWalkable(g, gx, gy, e);
    if (!n) return null;
    gx = n.x;
    gy = n.y;
    exact = false;
  }
  const tiles = findPath(g, sx, sy, gx, gy);
  if (tiles === null) return null;
  const pts = tiles.map((t) => center(t.x, t.y));
  if (exact) {
    const m = PATH_GOAL_MARGIN;
    const p = { x: clamp(wx, gx + 0.5 - m, gx + 0.5 + m), y: clamp(wy, gy + 0.5 - m, gy + 0.5 + m) };
    if (pts.length) pts[pts.length - 1] = p;
    else pts.push(p);
  } else if (!pts.length) pts.push(center(gx, gy));
  return smooth(g, e, pts);
}

/** Moves `e` along its path by speed * dt. Returns the heading of the last
 *  segment walked, or null if it did not move. */
export function moveAlong(e: Vec & { path: Vec[] }, dt: number, speed: number): number | null {
  let rem = speed * dt;
  let ang: number | null = null;
  while (rem > 0 && e.path.length) {
    const p = e.path[0]!;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > EPS_MOVE) ang = Math.atan2(dy, dx);
    if (d <= rem) {
      e.x = p.x;
      e.y = p.y;
      rem -= d;
      e.path.shift();
    } else {
      e.x += (dx / d) * rem;
      e.y += (dy / d) * rem;
      rem = 0;
    }
  }
  return ang;
}
