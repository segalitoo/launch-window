// Isometric projection for 2:1 tiles (64 x 32 px). Pure math, no Phaser,
// so it can be unit-tested. The sim's top-down tile grid is the source of
// truth; this file only maps it to the screen and back.

export const TILE_W = 64;
export const TILE_H = 32;
const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

export interface Point {
  x: number;
  y: number;
}

/** Tile-space (x, y) at height z (screen px above the ground) to iso screen px. */
export function toScreen(x: number, y: number, z = 0): Point {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H - z };
}

/** Iso screen px on the ground plane back to tile space. */
export function toTile(sx: number, sy: number): Point {
  return { x: sy / TILE_H + sx / TILE_W, y: sy / TILE_H - sx / TILE_W };
}

/** Draw order key. Larger draws later (in front). Objects at the same key sort by height. */
export const depthOf = (x: number, y: number, height = 0): number => (x + y) * 1000 + height;

/** Screen bounds of a map of cols x rows tiles, with optional extra height at the top. */
export function mapBounds(cols: number, rows: number, top = 0): { x: number; y: number; w: number; h: number } {
  const left = toScreen(0, rows).x;
  const right = toScreen(cols, 0).x;
  const bottom = toScreen(cols, rows).y;
  return { x: left, y: -top, w: right - left, h: bottom + top };
}

/** The four ground corners of a tile rectangle, in screen order: back, right, front, left. */
export function footprint(x: number, y: number, w = 1, h = 1, z = 0): [Point, Point, Point, Point] {
  return [toScreen(x, y, z), toScreen(x + w, y, z), toScreen(x + w, y + h, z), toScreen(x, y + h, z)];
}
