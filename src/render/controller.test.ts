import { describe, expect, test } from 'vitest';
import { Game } from '@/sim';
import { Controller, type TapHit } from './controller';

const none: TapHit = { unit: null, guard: null, body: null, object: null };

describe('Controller (tap rules from the prototype)', () => {
  test('tapping a unit selects it; tapping ground moves the selected unit', () => {
    const c = new Controller(new Game());
    c.tap(0, 0, { ...none, unit: 2 });
    expect(c.selected).toBe(2);
    c.tap(8.5, 26.5, none);
    expect(c.sel.path.length).toBeGreaterThan(0);
    expect(c.game.state.squad[0]!.path).toHaveLength(0);
  });

  test('tapping a guard orders a takedown for Yoav only', () => {
    const c = new Controller(new Game());
    const g = c.game.state.guards[0]!;
    c.tap(g.x, g.y, { ...none, guard: g });
    expect(c.sel.order?.type).toBe('takedown');
    c.select(1);
    c.tap(g.x, g.y, { ...none, guard: g });
    expect(c.sel.order).toBeNull();
  });

  test('a tap on a door block sends Itai to breach it, even off its ground tile', () => {
    const c = new Controller(new Game());
    c.select(2);
    const door = c.game.state.doors[0]!;
    c.tap(15.2, 26.2, { ...none, object: { kind: 'door', o: door } });
    expect(c.sel.order?.type).toBe('interact');
  });

  test('throw mode throws a decoy at the tap and then turns off', () => {
    const c = new Controller(new Game());
    expect(c.key('t')).toBe(true);
    expect(c.sel.id).toBe('lure');
    expect(c.throwMode).toBe(true);
    c.tap(c.sel.x + 3, c.sel.y, none);
    expect(c.throwMode).toBe(false);
    expect(c.game.state.projectiles).toHaveLength(1);
  });

  test('space pauses, keys 1 to 3 select', () => {
    const c = new Controller(new Game());
    c.key(' ');
    expect(c.paused).toBe(true);
    c.key('3');
    expect(c.selected).toBe(2);
  });
});
