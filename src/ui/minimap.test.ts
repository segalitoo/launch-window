import { describe, expect, test } from 'vitest';
import { Game } from '@/sim';
import { minimapMarks } from './minimap';

describe('minimap marks', () => {
  test('every launcher, guard and operator, with the selected operator flagged', () => {
    const s = new Game(1).state;
    const marks = minimapMarks(s, s.squad[0]!.id);
    expect(marks.filter((m) => m.kind === 'target')).toHaveLength(s.launchers.length);
    expect(marks.filter((m) => m.kind === 'guard')).toHaveLength(s.guards.length);
    const squad = marks.filter((m) => m.kind === 'squad');
    expect(squad.map((m) => m.color)).toEqual(s.squad.map((u) => u.color));
    expect(squad.filter((m) => m.selected)).toHaveLength(1);
  });

  test('downed guards and lost operators leave the map; hunting guards are alerts; rigged launchers are done', () => {
    const s = new Game(1).state;
    s.guards[0]!.state = 'down';
    s.guards[1]!.state = 'combat';
    s.squad[2]!.alive = false;
    s.launchers[0]!.done = true;
    const marks = minimapMarks(s, s.squad[0]!.id);
    expect(marks.filter((m) => m.kind === 'guard' || m.kind === 'alert')).toHaveLength(s.guards.length - 1);
    expect(marks.filter((m) => m.kind === 'alert')).toHaveLength(1);
    expect(marks.filter((m) => m.kind === 'squad')).toHaveLength(s.squad.length - 1);
    expect(marks.filter((m) => m.kind === 'done')).toHaveLength(1);
  });
});
