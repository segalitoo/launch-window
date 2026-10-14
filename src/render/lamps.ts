// Lamp brightness when the power is cut: a short stutter, then dark. Pure, tested in Node.

/** [seconds after the cut, brightness from then on]. Lamps on a dying generator stutter
 *  for a moment before they go out; the last step fades instead of snapping. */
const STUTTER: readonly (readonly [number, number])[] = [
  [0, 0.15],
  [0.08, 1],
  [0.16, 0.1],
  [0.3, 0.75],
  [0.38, 0.75],
];
/** When the last fade ends, in seconds after the cut. */
export const LAMPS_OUT = 0.65;

/** Brightness 0..1 at `since` seconds after the cut (null = power on). */
export function lampLevel(since: number | null): number {
  if (since === null || since < 0) return 1;
  if (since >= LAMPS_OUT) return 0;
  const last = STUTTER[STUTTER.length - 1]!;
  if (since >= last[0]) return last[1] * (1 - (since - last[0]) / (LAMPS_OUT - last[0]));
  let level = 1;
  for (const [t, v] of STUTTER) if (since >= t) level = v;
  return level;
}
