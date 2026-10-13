// Seeded RNG (mulberry32), the same generator the prototype carried.
// The state lives in GameState so a game can be saved and replayed exactly.

export interface RngHolder {
  rngState: number;
}

/** Returns a float in [0, 1) and advances the holder's state. */
export function random(h: RngHolder): number {
  h.rngState = (h.rngState + 0x6d2b79f5) | 0;
  let t = h.rngState;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A standalone generator for code that has no GameState. */
export function mulberry32(seed: number): () => number {
  const h: RngHolder = { rngState: seed | 0 };
  return () => random(h);
}
