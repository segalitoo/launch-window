// Which frame a rendered unit shows. Pure, no Phaser, so it is tested in Node.

/** Ground covered by one cycle (two steps), in tiles. Matches the strides in
 *  tools/blender/render_unit.py, so the feet do not slide. The sim's normal move is a
 *  run (Yoav 3.5 tiles/s); dragging a body is a walk. */
export const CYCLE_TILES = { run: 1.6, walk: 0.85 } as const;

/** Direction index 0..7 for a sim angle: d * 45 degrees, 0 = sim +x. */
export const dirOf = (ang: number): number => ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;

/** Frame name for a unit that has `walked` tiles in total and is (or is not) moving. */
export function frameName(
  ang: number,
  moving: boolean,
  carrying: boolean,
  walked: number,
  anims: Readonly<Record<string, number>>,
): string {
  const d = dirOf(ang);
  if (!moving) return `idle_d${d}_f0`;
  const anim = carrying ? 'walk' : 'run';
  const n = anims[anim] ?? 1;
  return `${anim}_d${d}_f${Math.floor((walked / CYCLE_TILES[anim]) * n) % n}`;
}
