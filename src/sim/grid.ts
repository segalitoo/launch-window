import type { Grid, TileCode } from './types';

const BLOCK_MOVE: ReadonlySet<TileCode> = new Set(['#', 'B', 'c', 'D', 'G', 'L', 'T']);
const BLOCK_SIGHT: ReadonlySet<TileCode> = new Set(['#', 'B', 'c', 'D', 'G', 'L', 'T']);

export function createGrid(cols: number, rows: number): Grid {
  return {
    cols,
    rows,
    cells: new Array<TileCode>(cols * rows).fill('.'),
    deco: new Uint8Array(cols * rows),
  };
}

export const inBounds = (g: Grid, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < g.cols && y < g.rows;

/** Tile code at (x, y). Outside the map counts as wall. */
export function tileAt(g: Grid, x: number, y: number): TileCode {
  if (!inBounds(g, x, y)) return '#';
  return g.cells[y * g.cols + x] as TileCode;
}

export function setTile(g: Grid, x: number, y: number, c: TileCode): void {
  if (inBounds(g, x, y)) g.cells[y * g.cols + x] = c;
}

export function fillRect(g: Grid, x0: number, y0: number, x1: number, y1: number, c: TileCode): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTile(g, x, y, c);
}

export function fillDeco(g: Grid, x0: number, y0: number, x1: number, y1: number, v: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inBounds(g, x, y)) g.deco[y * g.cols + x] = v;
}

export const walkable = (g: Grid, x: number, y: number): boolean => !BLOCK_MOVE.has(tileAt(g, x, y));

export const blocksSight = (g: Grid, x: number, y: number): boolean => BLOCK_SIGHT.has(tileAt(g, x, y));
