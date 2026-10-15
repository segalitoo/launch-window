// Yoav's Phase 3 tools: tie up (downed guards wake otherwise) and hiding spots. Guns: guns.test.ts.

import { describe, expect, test } from 'vitest';
import { TIE_DUR, WAKE_TIME } from './constants';
import { takedown } from './mission';
import { orderGrab, orderTie } from './squad';
import { Script } from './testkit';
import { detects, hidden } from './vision';

const POST_WEST = 1; // post guard at (12, 12), facing west; a wall blocks his view after 1 tile
const EAST_PATROL = 4; // patrol starting at (22, 11), facing east: near zone to x 25, far zone at 26

/** Knocks guard i out where he stands, Yoav right behind him. */
function knockOut(k: Script, i: number) {
  const g = k.guard(i);
  const u = k.place('shadow', Math.floor(g.x) + 1, Math.floor(g.y));
  takedown(k.s, u, g);
  return { g, u };
}

describe('tie up', () => {
  test('a knocked-out guard wakes after WAKE_TIME and raises the alarm', () => {
    const k = new Script();
    const { g } = knockOut(k, POST_WEST);
    k.place('shadow', 2, 2); // far away, out of everyone's sight
    k.game.run(WAKE_TIME - 1);
    expect(g.state).toBe('down');
    expect(k.s.alarm.active).toBe(false);
    k.game.run(1.5);
    expect(g.state).not.toBe('down');
    expect(k.s.alarm.active).toBe(true);
    expect(k.game.drainEvents().some((e) => e.type === 'woke' && e.guard === g.i)).toBe(true);
  });

  test('a tied guard never wakes', () => {
    const k = new Script();
    const { g, u } = knockOut(k, POST_WEST);
    expect(orderTie(k.s, u, g)).toBe(true);
    k.game.run(TIE_DUR + 0.2);
    expect(g.tied).toBe(true);
    k.place('shadow', 2, 2);
    k.game.run(WAKE_TIME * 2);
    expect(g.state).toBe('down');
    expect(k.s.stats.alarms).toBe(0);
  });

  test('tying takes TIE_DUR and holds Yoav still', () => {
    const k = new Script();
    const { g, u } = knockOut(k, POST_WEST);
    orderTie(k.s, u, g);
    k.game.run(TIE_DUR - 0.3);
    expect(g.tied).toBe(false);
    expect(u.order?.type).toBe('tie');
    k.game.run(0.5);
    expect(g.tied).toBe(true);
    expect(u.order).toBe(null);
  });

  test('only Yoav ties, and not a guard shot dead or one being carried', () => {
    const k = new Script();
    const { g, u } = knockOut(k, POST_WEST);
    expect(orderTie(k.s, k.unit('lure'), g)).toBe(false);
    orderGrab(k.s, u, g);
    k.game.run(0.2);
    expect(g.carried).toBe(true);
    expect(orderTie(k.s, u, g)).toBe(false);
    const dead = k.guard(2);
    dead.state = 'down';
    dead.dead = true;
    expect(orderTie(k.s, u, dead)).toBe(false);
  });

  test('a guard who wakes while dragged slips free', () => {
    const k = new Script();
    const { g, u } = knockOut(k, POST_WEST);
    orderGrab(k.s, u, g);
    k.game.run(0.2);
    expect(u.carrying).toBe(g);
    g.ko = 0.05;
    k.game.run(0.1);
    expect(u.carrying).toBe(null);
    expect(g.carried).toBe(false);
  });
});

describe('hiding spots', () => {
  test('standing still in a hiding spot hides from the far zone, not the near zone', () => {
    const k = new Script();
    const g = k.guard(EAST_PATROL);
    k.s.hides.push({ x0: 26, y0: 10, x1: 26, y1: 12 });
    const u = k.place('shadow', 26, 11); // far zone
    expect(detects(k.s, g, u)).toBe(null);
    expect(hidden(k.s, u)).toBe(true);
    k.s.hides.push({ x0: 24, y0: 10, x1: 24, y1: 12 });
    const near = k.place('shadow', 24, 11); // near zone
    expect(hidden(k.s, near)).toBe(true);
    expect(detects(k.s, g, near)).toBe('near');
  });

  test('walking upright through a hiding spot is not hidden; crawling through it is', () => {
    const k = new Script();
    const g = k.guard(EAST_PATROL);
    k.s.hides.push({ x0: 26, y0: 10, x1: 26, y1: 12 });
    const u = k.place('shadow', 26, 11);
    u.path = [{ x: 26.5, y: 10.5 }];
    expect(hidden(k.s, u)).toBe(false);
    expect(detects(k.s, g, u)).toBe('far');
    u.crawl = true;
    expect(hidden(k.s, u)).toBe(true);
  });

  test('a searchlight does not see an operator hiding under it', () => {
    const k = new Script();
    const t = k.s.towers[0]!;
    // stand in the middle of tower 0's sweep, in a hiding spot
    const mid = (t.a0 + t.a1) / 2;
    const x = Math.floor(t.x + 0.5 + Math.cos(mid) * 5);
    const y = Math.floor(t.y + 0.5 + Math.sin(mid) * 5);
    k.s.hides.push({ x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 });
    for (const g of k.s.guards) g.state = 'down'; // only the light can see him
    k.place('shadow', x, y);
    k.game.run(t.period * 2);
    expect(k.s.stats.alarms).toBe(0);
  });
});
