import { describe, expect, test } from 'vitest';
import { mulberry32, random } from './rng';

describe('seeded RNG', () => {
  test('same seed, same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  test('different seeds differ', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  test('values stay in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('state lives on the holder, so a saved state resumes the sequence', () => {
    const h = { rngState: 99 };
    random(h);
    const saved = { ...h };
    expect(random(h)).toBe(random(saved));
  });
});
