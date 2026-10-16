// The test maps (Phase 3): each puzzle is solved here by script, with no alarm, and the naive
// way (everyone straight to the exit) gets caught, so the tool is the way through.

import { describe, expect, test } from 'vitest';
import {
  detonate,
  dropBody,
  fireGun,
  objectAt,
  orderGrab,
  orderInteract,
  orderMove,
  orderPlant,
  orderTakedown,
  orderUniform,
  orderWire,
  setCrawl,
  throwDecoy,
  throwSmoke,
  walkable,
} from '@/sim';
import { Script, idle } from '@/sim/testkit';
import { TEST_MAPS, testMap } from './testMaps';

const load = (id: string): Script => {
  const t = testMap(id);
  if (!t) throw new Error(`no test map ${id}`);
  return new Script(1, t.map);
};

/** Everyone into the middle of the exit, and the run ends in a win. */
function toExit(k: Script, label = 'through the exit'): void {
  const e = k.s.exit!;
  for (const u of k.s.squad) orderMove(k.s, u, (e.x0 + e.x1 + 1) / 2, (e.y0 + e.y1 + 1) / 2);
  k.wait(label, (s) => s.over !== null, 60);
  expect(k.s.over, k.log.join('\n')).toBe('win');
  expect(k.s.stats.alarms).toBe(0);
}

describe('test maps', () => {
  test('nine maps, each strict, with a goal, a brief and its operator', () => {
    expect(TEST_MAPS.map((t) => t.id)).toEqual(['knife', 'hide', 'decoy', 'smoke', 'uniform', 'fence', 'charge', 'dog', 'camera']);
    for (const t of TEST_MAPS) {
      expect(t.map.goal).toBe('exit');
      expect(t.map.strict).toBe(true);
      expect(t.brief.length).toBeGreaterThan(20);
      expect(t.who).toMatch(/^(Yoav|Noa|Itai)$/);
      expect(Object.keys(t.map.spawns)).toHaveLength(1);
    }
  });

  test.each(TEST_MAPS.map((t) => t.id))('%s: the naive way, straight to the exit, is caught', (id) => {
    const k = load(id);
    const e = k.s.exit!;
    for (const u of k.s.squad) orderMove(k.s, u, (e.x0 + e.x1 + 1) / 2, (e.y0 + e.y1 + 1) / 2);
    k.game.runUntil((s) => s.over !== null, 120);
    expect(k.s.over, `${id}: ${k.log.join('\n')}`).toBe('spotted');
  });
});

describe('test map solutions', () => {
  test('knife: sentry from behind, drag him out of sight, then the patrol', () => {
    const k = load('knife');
    const s = k.s;
    const y = k.unit('shadow');
    const [sentry, patrol] = [k.guard(0), k.guard(1)];
    k.wait('patrol walks east', () => Math.cos(patrol.ang) > 0.9 && patrol.x > 12, 40);
    orderTakedown(s, y, sentry);
    k.wait('sentry down', () => sentry.state === 'down', 20);
    orderGrab(s, y, sentry);
    k.wait('Yoav has the body', () => y.carrying === sentry, 10);
    orderMove(s, y, 2.5, 8.5);
    k.wait('body out of the corridor', () => idle(y), 30);
    dropBody(y);
    k.wait('patrol walks east again', () => Math.cos(patrol.ang) > 0.9 && patrol.x > 11.5 && patrol.x < 13, 60);
    orderTakedown(s, y, patrol);
    k.wait('patrol down', () => patrol.state === 'down', 20);
    toExit(k);
  });

  test('hide: into the bush while he is away, out when his back is turned', () => {
    const k = load('hide');
    const s = k.s;
    const y = k.unit('shadow');
    const p = k.guard(0);
    k.wait('patrol along the top, heading east', () => p.y < 1.6 && Math.cos(p.ang) > 0.9 && p.x > 6.5, 60);
    orderMove(s, y, 10.5, 5.5);
    k.wait('in the bush', () => idle(y), 20);
    k.wait('patrol along the bottom, heading west, past the bush', () => p.y > 8.4 && Math.cos(p.ang) < -0.9 && p.x < 12, 80);
    toExit(k);
  });

  test('decoy: thrown behind the sentry, Noa slips through while he searches', () => {
    const k = load('decoy');
    const s = k.s;
    const n = k.unit('lure');
    const g = k.guard(0);
    orderMove(s, n, 3.5, 5.5);
    k.wait('Noa at the edge of his sight', () => idle(n), 10);
    expect(throwDecoy(s, n, 9.5, 9.5)).toBe('thrown');
    k.wait('sentry searches by the decoy', () => g.state === 'search', 20);
    toExit(k);
  });

  test('smoke: a cloud between the two sentries', () => {
    const k = load('smoke');
    const s = k.s;
    const n = k.unit('lure');
    orderMove(s, n, 7.5, 5.5);
    k.wait('Noa outside both cones', () => idle(n), 10);
    expect(throwSmoke(s, n, 11.5, 5.5)).toBe('thrown');
    k.wait('the cloud', () => s.smokes.length > 0, 2);
    toExit(k);
  });

  test('uniform: past the sentries in the uniform, while the officer is out of the corridor', () => {
    const k = load('uniform');
    const s = k.s;
    const n = k.unit('lure');
    const officer = k.guard(2);
    expect(officer.role).toBe('officer');
    orderUniform(s, n);
    k.wait('in uniform', () => n.disguised, 5);
    k.wait('officer walks into the south room', () => officer.y > 9.6 && Math.sin(officer.ang) > 0.9, 60);
    toExit(k);
  });

  test('fence: a tripwire stops the patrol, a hole in the fence avoids the sentry', () => {
    const k = load('fence');
    const s = k.s;
    const i = k.unit('sapper');
    const patrol = k.guard(1);
    k.wait('patrol heads south', () => Math.sin(patrol.ang) > 0.9 && patrol.y > 3, 60);
    orderMove(s, i, 8.5, 3.5);
    k.wait('Itai on the patrol line', () => idle(i), 10);
    expect(orderWire(s, i)).toBe(true);
    k.wait('wire set', () => s.wires.length === 1, 5);
    orderMove(s, i, 3.5, 2.5);
    k.wait('patrol trips', () => patrol.state === 'down', 60);
    // the fence is see-through and the top row grazes the far edge of the sentry's cone:
    // crawling, the far zone does not see him
    setCrawl(i, true);
    orderMove(s, i, 12.5, 1.5);
    k.wait('Itai at the fence, top row', () => idle(i), 15);
    expect(orderInteract(s, i, objectAt(s, 14, 1)!)).toBe(true);
    k.wait('hole cut', () => walkable(s.grid, 14, 1), 30);
    toExit(k);
  });

  test('charge: planted far from the gate, set off from clear, the sentries go to look', () => {
    const k = load('charge');
    const s = k.s;
    const i = k.unit('sapper');
    const [a, b] = [k.guard(0), k.guard(1)];
    orderMove(s, i, 6.5, 9.5);
    k.wait('Itai in the far corner', () => idle(i), 15);
    expect(orderPlant(s, i)).toBe(true);
    k.wait('charge planted', () => i.remote !== null, 5);
    orderMove(s, i, 2.5, 1.5);
    k.wait('Itai clear', () => idle(i), 15);
    expect(detonate(s, i)).toBe(true);
    k.wait('both sentries searching at the blast', () => a.state === 'search' && b.state === 'search', 20);
    toExit(k);
  });

  test('dog: the handler first, then the dog from just out of its reach', () => {
    const k = load('dog');
    const s = k.s;
    const y = k.unit('shadow');
    const [handler, dog] = [k.guard(0), k.guard(2)];
    expect(dog.role).toBe('dog');
    orderMove(s, y, 7.6, 5.5);
    k.wait('Yoav behind the handler', () => idle(y), 10);
    expect(fireGun(s, y, handler)).toBe('aiming');
    k.wait('handler down', () => handler.state === 'down', 5);
    orderMove(s, y, 9.3, 5.5);
    k.wait('Yoav just out of the dog\'s reach', () => idle(y), 5);
    expect(fireGun(s, y, dog)).toBe('aiming');
    k.wait('dog down', () => dog.state === 'down', 5);
    toExit(k);
  });

  test('camera: cut the power, walk through', () => {
    const k = load('camera');
    const s = k.s;
    const i = k.unit('sapper');
    expect(orderInteract(s, i, objectAt(s, 4, 9)!)).toBe(true);
    k.wait('power cut', () => !s.generator.on, 30);
    toExit(k);
  });
});
