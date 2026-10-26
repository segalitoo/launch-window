import { describe, expect, test } from 'vitest';
import { Game } from '@/sim';
import { squadOf } from './squad';

describe('squad rail', () => {
  test('one card per operator, in squad order, with the key that selects it', () => {
    const s = new Game(1).state;
    const cards = squadOf(s, s.squad[1]!.id);
    expect(cards.map((c) => c.key)).toEqual(['1', '2', '3']);
    expect(cards.map((c) => c.name)).toEqual(s.squad.map((u) => u.name));
    expect(cards.filter((c) => c.selected).map((c) => c.id)).toEqual([s.squad[1]!.id]);
  });

  test('health and down state follow the unit', () => {
    const s = new Game(1).state;
    const u = s.squad[2]!;
    u.hp = 1;
    u.alive = false;
    const c = squadOf(s, s.squad[0]!.id)[2]!;
    expect([c.hp, c.maxHp, c.alive]).toEqual([1, u.maxHp, false]);
  });
});
