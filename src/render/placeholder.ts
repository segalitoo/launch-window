// Placeholder look for Phase 0: flat colors and simple blocks, no art.
// Light comes from the top left, so the left face of a block is lit and the
// right face is in shadow. Muted earth tones, painted in neutral daylight.

import type { TileCode } from '@/sim';

export interface BlockStyle {
  height: number; // px above the ground at 100% zoom
  color: number; // top face; side faces are darker
  inset: number; // tiles trimmed from each side of the footprint (thin props)
}

export const BLOCKS: Partial<Record<TileCode, BlockStyle>> = {
  '#': { height: 30, color: 0xa39780, inset: 0 },
  B: { height: 46, color: 0x857b6a, inset: 0 },
  c: { height: 16, color: 0x9a7448, inset: 0.12 },
  D: { height: 28, color: 0x5f6b77, inset: 0 },
  G: { height: 22, color: 0x6c7d68, inset: 0.04 },
  L: { height: 18, color: 0x66704e, inset: 0.06 },
  T: { height: 64, color: 0x7a7a74, inset: 0.3 },
};

/** Ground color per sim deco value: sand, road, slab, yard. Two shades for a subtle checker. */
export const GROUND: readonly [number, number][] = [
  [0x8f7f5f, 0x8a7a5a],
  [0x6f6b62, 0x6b675e],
  [0x8e8c84, 0x89877f],
  [0x7d7563, 0x78705e],
];

export const LZ_COLOR = 0x7fdc95;
export const GUARD_COLOR = 0xb4553f;
export const GUARD_DOWN_COLOR = 0x6b4a40;
export const CONE_COLOR = 0xffb547;
export const ALARM_COLOR = 0xff5148;
export const LIGHT_COLOR = 0xfff2b0;
/** Searchlight beams: cold white-blue (Ran, Phase 2), so they read apart from the warm
 *  lamps, the only warm light at night (visual language 7). */
export const BEAM_COLOR = 0xd2e4ff;
export const SHADOW_COLOR = 0x000000;

/** Unit marker size at 100% zoom. */
export const UNIT_RADIUS = 8;
export const UNIT_LIFT = 13;

export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

export const hex = (css: string): number => parseInt(css.replace('#', ''), 16);
