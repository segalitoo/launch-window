// Itai's Phase 3 tools: wire cutters (fence), tripwires, remote charge.

import { describe, expect, test } from 'vitest';
import { BLAST_HEAR, BLAST_HURT, DUR_FENCE, PLANT_TIME, REMOTE_CHARGES, WAKE_TIME, WIRE_CHARGES, WIRE_TIME } from './constants';
import { blocksSight, tileAt, walkable } from './grid';
import { detonate, objectAt, orderInteract, orderPlant, orderWire } from './squad';
import { Script } from './testkit';

describe('wire cutters', () => {
  test('the outer fence blocks walking but not sight', () => {
    const k = new Script();
    expect(tileAt(k.s.grid, 30, 27)).toBe('F');
    expect(walkable(k.s.grid, 30, 27)).toBe(false);
    expect(blocksSight(k.s.grid, 30, 27)).toBe(false);
  });

  test('Itai cuts a hole in DUR_FENCE; only Itai can', () => {
    const k = new Script();
    const t = objectAt(k.s, 30, 27);
    expect(t?.kind).toBe('fence');
    expect(orderInteract(k.s, k.unit('shadow'), t!)).toBe(false);
    k.place('sapper', 30, 28); // just outside
    expect(orderInteract(k.s, k.unit('sapper'), t!)).toBe(true);
    k.game.run(0.3);
    k.game.run(DUR_FENCE - 0.4);
    expect(walkable(k.s.grid, 30, 27)).toBe(false);
    k.game.run(0.4);
    expect(walkable(k.s.grid, 30, 27)).toBe(true);
  });
});

describe('tripwire', () => {
  test('set in WIRE_TIME; the next guard through it is knocked out and wakes later', () => {
    const k = new Script();
    const itai = k.place('sapper', 30, 24); // on the south patrol's line (y 24)
    expect(orderWire(k.s, itai)).toBe(true);
    k.game.run(WIRE_TIME + 0.1);
    expect(k.s.wires).toEqual([{ x: 30, y: 24 }]);
    expect(itai.wires).toBe(WIRE_CHARGES - 1);
    k.place('sapper', 2, 2); // out of the way
    const g = k.guard(8);
    g.x = 30.5;
    g.y = 24.5;
    k.game.run(0.05);
    expect(g.state).toBe('down');
    expect(g.dead).toBe(false);
    expect(g.ko).toBeGreaterThan(WAKE_TIME - 1);
    expect(k.s.wires).toHaveLength(0);
  });

  test('operators step over it; out of wires after WIRE_CHARGES', () => {
    const k = new Script();
    k.s.wires.push({ x: 5, y: 5 });
    k.place('shadow', 5, 5);
    k.game.run(0.1);
    expect(k.s.wires).toHaveLength(1);
    const itai = k.unit('sapper');
    itai.wires = 0;
    expect(orderWire(k.s, itai)).toBe(false);
  });
});

describe('remote charge', () => {
  test('planted in PLANT_TIME, set off from anywhere: close guards are caught, far ones come to look, no alarm', () => {
    const k = new Script();
    const g = k.guard(1); // post at (12, 12)
    const itai = k.place('sapper', 12, 13);
    expect(orderPlant(k.s, itai)).toBe(true);
    k.game.run(PLANT_TIME + 0.1);
    expect(itai.remote).not.toBe(null);
    expect(itai.remotes).toBe(REMOTE_CHARGES - 1);
    k.place('sapper', 2, 2);
    const near = k.guard(2); // post at (12, 15): within earshot, outside the blast
    expect(Math.hypot(near.x - 12.5, near.y - 13.5)).toBeLessThan(BLAST_HEAR);
    expect(detonate(k.s, itai)).toBe(true);
    expect(g.dead).toBe(true);
    expect(near.state).not.toBe('down');
    expect(['investigate', 'search']).toContain(near.state);
    expect(k.s.alarm.active).toBe(false);
    expect(detonate(k.s, itai)).toBe(false); // nothing planted any more
  });

  test('an operator caught in his own blast is hurt', () => {
    const k = new Script();
    const itai = k.place('sapper', 2, 2);
    itai.remote = { x: 2.5, y: 2.5 };
    const hp = itai.hp;
    detonate(k.s, itai);
    expect(itai.hp).toBe(hp - BLAST_HURT);
  });
});
