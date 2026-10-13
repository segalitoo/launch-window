import { describe, expect, test } from 'vitest';
import { ALARM_TIME, FIXED_DT, TIME_LIMIT } from './constants';
import { Game } from './game';
import { raiseAlarm } from './mission';
import { orderInteract, objectAt, orderMove, throwDecoy } from './squad';
import { Script } from './testkit';

describe('timer and alarm', () => {
  test('the countdown starts at 8:00 and runs at real speed', () => {
    const k = new Script();
    expect(k.s.timeLeft).toBe(TIME_LIMIT);
    k.run(10);
    expect(k.s.timeLeft).toBeCloseTo(TIME_LIMIT - 10, 6);
  });

  test('during an alarm the countdown runs at double speed', () => {
    const k = new Script();
    raiseAlarm(k.s, 0.5, 0.5, null, 'test');
    k.run(5);
    expect(k.s.alarm.active).toBe(true);
    expect(k.s.timeLeft).toBeCloseTo(TIME_LIMIT - 10, 6);
  });

  test('the alarm clears 18 s after nobody sees an operator, and guards go home', () => {
    const k = new Script();
    raiseAlarm(k.s, 12.5, 12.5, null, 'test');
    const g = k.guard(1);
    expect(g.state).toBe('combat');
    k.run(ALARM_TIME - 0.5);
    expect(k.s.alarm.active).toBe(true);
    k.until('clears', (s) => !s.alarm.active, 1);
    expect(['return', 'patrol']).toContain(g.state);
  });

  test('a guard who sees a body raises the alarm once per body', () => {
    const k = new Script();
    const body = k.guard(2);
    body.state = 'down';
    body.x = 11.5;
    body.y = 12.5; // in front of guard 1
    k.run(0.1);
    expect(k.s.stats.alarms).toBe(1);
    expect(body.found).toBe(true);
  });

  test('all three launchers rigged stops the countdown', () => {
    const k = new Script();
    for (const l of k.s.launchers) l.done = true;
    k.s.aborted = true;
    k.place('sapper', 8, 26);
    const before = k.s.timeLeft;
    k.run(2);
    expect(k.s.timeLeft).toBe(before);
  });

  test('losing an operator fails the mission', () => {
    const k = new Script();
    k.place('shadow', 11, 12);
    k.until('over', (s) => s.over !== null, 10);
    expect(k.s.over).toBe('down');
  });

  test('cutting the generator turns the searchlights off', () => {
    const k = new Script();
    k.s.generator.on = false;
    k.place('shadow', 24, 12); // under searchlight 1
    k.run(10);
    expect(k.s.towers.every((t) => t.susp === 0)).toBe(true);
  });
});

describe('orders', () => {
  test('only Itai can interact; others get a message', () => {
    const k = new Script();
    const t = objectAt(k.s, 16, 27)!;
    expect(orderInteract(k.s, k.unit('shadow'), t)).toBe(false);
    expect(orderInteract(k.s, k.unit('sapper'), t)).toBe(true);
  });

  test('a decoy needs range and charges', () => {
    const k = new Script();
    const noa = k.unit('lure');
    expect(throwDecoy(k.s, noa, noa.x + 9, noa.y)).toBe('range');
    for (let i = 0; i < 4; i++) {
      expect(throwDecoy(k.s, noa, noa.x + 1, noa.y)).toBe('thrown');
      k.run(0.5);
    }
    expect(throwDecoy(k.s, noa, noa.x + 1, noa.y)).toBe('empty');
  });

  test('a move to an unreachable spot is refused', () => {
    const k = new Script();
    expect(orderMove(k.s, k.unit('shadow'), 15.5, 23.5)).toBe(true); // generator: goes to nearest walkable
    const g = k.s.grid;
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === '.') g.cells[i] = '#';
    expect(orderMove(k.s, k.unit('shadow'), 30.5, 3.5)).toBe(false);
  });
});

describe('determinism', () => {
  test('same seed and same orders give the same state', () => {
    const play = (): string => {
      const game = new Game(5);
      const s = game.state;
      orderMove(s, s.squad[0]!, 12.5, 28.5);
      game.run(30);
      return JSON.stringify({ t: s.t, squad: s.squad.map((u) => [u.x, u.y]), guards: s.guards.map((g) => [g.x, g.y, g.ang, g.state]) });
    };
    expect(play()).toBe(play());
  });

  test('advance() with uneven frame times matches fixed ticks', () => {
    const a = new Game();
    const b = new Game();
    const frames = [0.016, 0.017, 0.033, 0.008, 0.02];
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const f = frames[i % frames.length]!;
      a.advance(f);
      total += f;
    }
    const n = Math.floor(total / FIXED_DT + 1e-9);
    for (let i = 0; i < n; i++) b.tick();
    expect(a.state.t).toBeCloseTo(b.state.t, 9);
    expect(a.state.guards.map((g) => g.x)).toEqual(b.state.guards.map((g) => g.x));
  });
});
