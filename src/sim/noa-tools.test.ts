// Noa's Phase 3 tools: binoculars, smoke grenade, captured uniform.

import { describe, expect, test } from 'vitest';
import { BINO_TIME, SMOKE_CHARGES, SMOKE_TIME, THROW_FLIGHT, UNIFORM_TIME } from './constants';
import { raiseAlarm } from './mission';
import { orderBinoculars, orderUniform, throwSmoke } from './squad';
import { Script } from './testkit';
import { detects, sightRay, smokeBlocks } from './vision';

const EAST_PATROL = 4; // patrol starting at (22, 11), facing east: near zone to x 25, far zone at 26

describe('smoke grenade', () => {
  test('thrown like the decoy; the cloud lands after the flight and lasts SMOKE_TIME', () => {
    const k = new Script();
    const noa = k.unit('lure');
    expect(throwSmoke(k.s, noa, noa.x + 3, noa.y)).toBe('thrown');
    expect(noa.smokes).toBe(SMOKE_CHARGES - 1);
    k.game.run(THROW_FLIGHT + 0.05);
    expect(k.s.smokes).toHaveLength(1);
    k.game.run(SMOKE_TIME);
    expect(k.s.smokes).toHaveLength(0);
  });

  test('the cloud hides an operator a guard would see, and shortens his cone', () => {
    const k = new Script();
    const g = k.guard(EAST_PATROL);
    const u = k.place('shadow', 26, 11);
    expect(detects(k.s, g, u)).toBe('far');
    k.s.smokes.push({ x: 24.5, y: 11.5, left: 5 });
    expect(smokeBlocks(k.s, g.x, g.y, u.x, u.y)).toBe(true);
    expect(detects(k.s, g, u)).toBe(null);
    expect(sightRay(k.s, g.x, g.y, 0, 6)).toBeCloseTo(24.5 - 2 - g.x, 5);
  });

  test('out of smoke after SMOKE_CHARGES throws', () => {
    const k = new Script();
    const noa = k.unit('lure');
    for (let i = 0; i < SMOKE_CHARGES; i++) {
      expect(throwSmoke(k.s, noa, noa.x + 2, noa.y)).toBe('thrown');
      k.game.run(0.5);
    }
    expect(throwSmoke(k.s, noa, noa.x + 2, noa.y)).toBe('empty');
    expect(throwSmoke(k.s, k.unit('shadow'), 1, 1)).toBe('invalid');
  });
});

describe('binoculars', () => {
  test('watching a guard for BINO_TIME reveals his route for good', () => {
    const k = new Script();
    const g = k.guard(EAST_PATROL);
    const noa = k.place('lure', 27, 11);
    expect(orderBinoculars(k.s, noa, g)).toBe(true);
    k.game.run(BINO_TIME - 0.2);
    expect(g.revealed).toBe(false);
    k.game.run(0.4);
    expect(g.revealed).toBe(true);
    expect(noa.order).toBe(null);
  });

  test('no line of sight, no look; only Noa has binoculars', () => {
    const k = new Script();
    const g = k.guard(1); // post at (12, 12) behind walls from the LZ
    expect(orderBinoculars(k.s, k.unit('lure'), g)).toBe(false);
    expect(orderBinoculars(k.s, k.unit('shadow'), k.guard(EAST_PATROL))).toBe(false);
  });
});

describe('captured uniform', () => {
  test('putting it on takes UNIFORM_TIME; then a guard looks past her', () => {
    const k = new Script();
    const g = k.guard(EAST_PATROL);
    const noa = k.place('lure', 24, 11); // near zone
    expect(detects(k.s, g, noa)).toBe('near');
    k.place('lure', 2, 2); // she changes out of sight
    orderUniform(k.s, noa);
    k.game.run(UNIFORM_TIME - 0.2);
    expect(noa.disguised).toBe(false);
    k.game.run(0.4);
    expect(noa.disguised).toBe(true);
    expect(k.s.alarm.active).toBe(false);
    k.place('lure', 24, 11);
    noa.disguised = true;
    g.x = 22.5;
    g.y = 11.5;
    g.ang = 0;
    expect(detects(k.s, g, noa)).toBe(null);
  });

  test('crawling, coming within a tile, or an alarm gives her away', () => {
    const k = new Script();
    const g = k.guard(EAST_PATROL);
    const noa = k.place('lure', 24, 11);
    noa.disguised = true;
    noa.crawl = true;
    expect(detects(k.s, g, noa)).toBe('near');
    noa.crawl = false;
    noa.x = g.x + 0.8;
    noa.y = g.y;
    expect(detects(k.s, g, noa)).toBe('near');
    noa.x = 24.5;
    raiseAlarm(k.s, 1, 1, null, 'test');
    expect(detects(k.s, g, noa)).toBe('near');
  });
});
