import { describe, expect, test } from 'vitest';
import { LAMPS_OUT, lampLevel } from './lamps';

describe('lamps on the generator', () => {
  test('full while the power is on', () => {
    expect(lampLevel(null)).toBe(1);
  });
  test('stutter right after the cut: dim, back on, dim', () => {
    expect(lampLevel(0.02)).toBeLessThan(0.3);
    expect(lampLevel(0.1)).toBe(1);
    expect(lampLevel(0.2)).toBeLessThan(0.3);
  });
  test('then fade to dark and stay dark', () => {
    expect(lampLevel(0.5)).toBeGreaterThan(0);
    expect(lampLevel(0.5)).toBeLessThan(0.75);
    expect(lampLevel(LAMPS_OUT)).toBe(0);
    expect(lampLevel(30)).toBe(0);
  });
});
