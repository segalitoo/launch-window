// Phase 3 enemies: the officer, the dog, the gate cameras.

import { describe, expect, test } from 'vitest';
import { BARK_HEAR, CAM_SUSP_TIME, DOG_DISTRACT, DOG_SMELL, SPEED_PATROL, THROW_FLIGHT, WAKE_TIME } from './constants';
import { dist } from './math';
import { raiseAlarm } from './mission';
import { fireGun, orderBinoculars, orderTakedown, throwDecoy } from './squad';
import { Script } from './testkit';
import { detects, smells } from './vision';

const HANDLER = 4; // the east patrol the dog walks with
const OFFICER = 10;
const DOG = 11;

/** Only the given guards stay up; the searchlights are switched off. Test setup only. */
function only(k: Script, ...keep: number[]): void {
  for (const g of k.s.guards) if (!keep.includes(g.i)) {
    g.state = 'down';
    g.dead = true;
    g.found = true;
  }
  k.s.towers = [];
}

describe('officer', () => {
  test('sees through the uniform where a guard would not', () => {
    const k = new Script();
    const o = k.guard(OFFICER);
    const g = k.guard(HANDLER);
    const noa = k.place('lure', 33, 11);
    noa.disguised = true;
    for (const e of [o, g]) {
      e.x = 30.5;
      e.y = 11.5;
      e.ang = 0;
    }
    expect(detects(k.s, g, noa)).toBe(null);
    expect(detects(k.s, o, noa)).toBe('near');
  });

  test('walks his route slower than a guard', () => {
    const k = new Script();
    only(k, OFFICER);
    const o = k.guard(OFFICER);
    const x0 = o.x;
    k.game.run(3);
    expect(o.x - x0).toBeGreaterThan(SPEED_PATROL * 3 * 0.6);
    expect(o.x - x0).toBeLessThan(SPEED_PATROL * 3 * 0.8);
  });

  test('can be knocked out and tied like a guard', () => {
    const k = new Script();
    const o = k.guard(OFFICER);
    k.place('shadow', Math.floor(o.x) - 1, Math.floor(o.y));
    expect(orderTakedown(k.s, k.unit('shadow'), o)).toBe(true);
  });
});

describe('dog', () => {
  test('heels at its handler through his patrol', () => {
    const k = new Script();
    only(k, HANDLER, DOG);
    const h = k.guard(HANDLER);
    const d = k.guard(DOG);
    for (let i = 0; i < 20; i++) {
      k.game.run(1);
      expect(dist(d, h)).toBeLessThan(2.5);
    }
  });

  test('smells a crawling operator in a hiding spot behind it, barks, and its handler comes', () => {
    const k = new Script();
    only(k, HANDLER, DOG);
    const h = k.guard(HANDLER);
    const d = k.guard(DOG);
    d.x = 22.5;
    d.y = 14.5;
    d.ang = -Math.PI / 2; // facing north
    h.x = 24.5;
    h.y = 19.5;
    const u = k.place('shadow', 22, 16); // behind it, 2 tiles
    u.crawl = true;
    k.s.hides.push({ x0: 21, y0: 15, x1: 23, y1: 17 });
    expect(detects(k.s, d, u)).toBe(null); // no cone
    expect(smells(k.s, d)).toBe(u);
    k.game.run(1);
    const ev = k.game.drainEvents();
    expect(ev.some((e) => e.type === 'bark' && e.guard === DOG)).toBe(true);
    expect(['investigate', 'search']).toContain(h.state);
    expect(k.s.alarm.active).toBe(false);
  });

  test('walls stop the smell', () => {
    const k = new Script();
    const d = k.guard(DOG);
    d.x = 26.5; // the compound's west wall is x 27
    d.y = 10.5;
    const u = k.place('shadow', 28, 10);
    expect(dist(u, d)).toBeLessThan(DOG_SMELL);
    expect(smells(k.s, d)).toBe(null);
    k.place('shadow', 25, 12);
    expect(smells(k.s, d)).toBe(u);
  });

  test('a guard in earshot of the bark comes too, one farther away does not', () => {
    const k = new Script();
    only(k, HANDLER, DOG, 1, 2);
    const d = k.guard(DOG);
    d.x = 15.5;
    d.y = 13.5;
    d.ang = 0;
    const near = k.guard(1); // post at (12, 12)
    const far = k.guard(2); // post at (12, 15)
    near.x = 12.5;
    near.y = 12.5;
    far.x = 12.5;
    far.y = 19.5;
    expect(dist(near, d)).toBeLessThan(BARK_HEAR);
    expect(dist(far, d)).toBeGreaterThan(BARK_HEAR);
    k.place('shadow', 17, 13);
    k.game.run(1);
    expect(near.state).not.toBe('patrol');
    expect(far.state).toBe('patrol');
  });

  test('a decoy keeps it sniffing there for DOG_DISTRACT, smelling nothing', () => {
    const k = new Script();
    only(k, HANDLER, DOG);
    const d = k.guard(DOG);
    const noa = k.place('lure', Math.floor(d.x) - 1, Math.floor(d.y));
    throwDecoy(k.s, noa, d.x + 3, d.y);
    k.game.run(THROW_FLIGHT + 0.05);
    expect(d.distract).toBeGreaterThan(DOG_DISTRACT - 0.2);
    k.game.drainEvents();
    k.place('lure', Math.floor(d.x), Math.floor(d.y) + 1);
    k.game.run(DOG_DISTRACT - 1);
    expect(k.game.drainEvents().some((e) => e.type === 'bark')).toBe(false);
    expect(d.distract).toBeGreaterThan(0);
    k.game.run(1.2);
    k.place('lure', Math.floor(d.x), Math.floor(d.y) + 1);
    k.game.run(1);
    expect(k.game.drainEvents().some((e) => e.type === 'bark')).toBe(true);
  });

  test('not the knife, not the binoculars; a shot stops it; it never joins the alarm', () => {
    const k = new Script();
    const d = k.guard(DOG);
    const yoav = k.place('shadow', Math.floor(d.x) + 1, Math.floor(d.y));
    expect(orderTakedown(k.s, yoav, d)).toBe(false);
    expect(orderBinoculars(k.s, k.place('lure', Math.floor(d.x) + 2, Math.floor(d.y)), d)).toBe(false);
    raiseAlarm(k.s, d.x, d.y, null, 'test');
    expect(d.state).not.toBe('combat');
    yoav.silenced = false;
    expect(fireGun(k.s, yoav, d)).toBe('aiming');
    k.game.run(1);
    expect(d.state).toBe('down');
    expect(d.dead).toBe(true);
    k.game.run(WAKE_TIME + 1);
    expect(d.state).toBe('down');
  });

  test('steps over a tripwire', () => {
    const k = new Script();
    const d = k.guard(DOG);
    k.s.wires.push({ x: Math.floor(d.x), y: Math.floor(d.y) });
    k.game.run(0.1);
    expect(d.state).not.toBe('down');
    expect(k.s.wires).toHaveLength(1);
  });
});

describe('cameras', () => {
  /** The outer gate camera held still, looking south down the approach. */
  function setup() {
    const k = new Script();
    only(k);
    expect(k.s.cameras).toHaveLength(2);
    const c = k.s.cameras[0]!;
    c.a0 = c.a1 = Math.PI / 2;
    return { k, c };
  }

  test('an operator in view for CAM_SUSP_TIME raises the alarm', () => {
    const { k } = setup();
    k.place('shadow', 34, 25);
    k.game.run(CAM_SUSP_TIME - 0.2);
    expect(k.s.alarm.active).toBe(false);
    k.game.run(0.4);
    expect(k.s.alarm.active).toBe(true);
  });

  test('blind with the power off, to a hiding spot and to the uniform', () => {
    const { k } = setup();
    k.s.generator.on = false;
    k.place('shadow', 34, 25);
    k.game.run(2);
    expect(k.s.alarm.active).toBe(false);
    k.s.generator.on = true;
    k.s.hides.push({ x0: 34, y0: 25, x1: 34, y1: 25 });
    k.game.run(2);
    expect(k.s.alarm.active).toBe(false);
    k.place('shadow', 2, 2);
    const noa = k.place('lure', 34, 24);
    noa.disguised = true;
    k.game.run(2);
    expect(k.s.alarm.active).toBe(false);
  });
});
