import { describe, expect, test } from 'vitest';
import { Game } from '@/sim';
import { briefingOf } from './briefing';

describe('briefing', () => {
  test('the facts come from the mission: clock, targets, and the squad with their roles', () => {
    const s = new Game(1).state;
    const b = briefingOf(s);
    expect(b.targets).toBe(s.launchers.length);
    expect(b.time).toBe(`${Math.floor(s.timeLeft / 60)}:${String(Math.floor(s.timeLeft % 60)).padStart(2, '0')}`);
    expect(b.squad.map((u) => u.name)).toEqual(s.squad.map((u) => u.name));
    expect(b.squad.every((u) => u.role && u.does)).toBe(true);
  });
});
