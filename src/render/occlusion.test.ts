import { describe, expect, test } from 'vitest';
import { depthOf, toScreen } from './iso';
import { blockOccluder, isHidden, maskOccluder } from './occlusion';

const WALL_H = 30;
const unitSamples = (x: number, y: number) => [toScreen(x, y, 4), toScreen(x, y, 13), toScreen(x, y, 22)];

describe('hidden unit test', () => {
  const wall = blockOccluder(10, 10, 0, WALL_H);

  test('a unit just behind (north of) a wall is hidden', () => {
    expect(isHidden(unitSamples(10.5, 9.5), depthOf(10.5, 9.5, 13), [wall])).toBe(true);
  });

  test('a unit just behind (west of) a wall is hidden', () => {
    expect(isHidden(unitSamples(9.5, 10.5), depthOf(9.5, 10.5, 13), [wall])).toBe(true);
  });

  test('a unit in front (south or east) is never hidden by it', () => {
    expect(isHidden(unitSamples(10.5, 11.5), depthOf(10.5, 11.5, 13), [wall])).toBe(false);
    expect(isHidden(unitSamples(11.5, 10.5), depthOf(11.5, 10.5, 13), [wall])).toBe(false);
  });

  test('the case the old front-corner rule got wrong: south of the wall, near its left corner', () => {
    // centre-sum depth puts the unit in front, so the wall does not hide it
    expect(isHidden(unitSamples(10.05, 11.3), depthOf(10.05, 11.3, 13), [wall])).toBe(false);
  });

  test('a unit far from the wall is not hidden', () => {
    expect(isHidden(unitSamples(4.5, 4.5), depthOf(4.5, 4.5, 13), [wall])).toBe(false);
  });

  test('mask occluders test the alpha at the sample point', () => {
    // a 10 x 10 world-px mask, 2 source px per world px, opaque only in its left half
    const occ = maskOccluder(5, 5, 0, 100, 100, 20, 20, 2, (sx) => (sx < 10 ? 255 : 0));
    const d = occ.depth - 1;
    expect(isHidden([{ x: 102, y: 105 }], d, [occ])).toBe(true);
    expect(isHidden([{ x: 108, y: 105 }], d, [occ])).toBe(false);
    expect(isHidden([{ x: 102, y: 105 }], occ.depth + 1, [occ])).toBe(false);
  });
});
