// The verified scenarios from prototype/NOTES.md, ported as tests.

import { describe, expect, test } from 'vitest';
import { CARRY_OFFSET, TIME_LIMIT } from './constants';
import { dist } from './math';
import {
  dropBody,
  objectAt,
  orderGrab,
  orderInteract,
  orderMove,
  orderTakedown,
  orderTie,
  setCrawl,
  throwDecoy,
} from './squad';
import { Script, idle } from './testkit';
import type { Guard, InteractTarget } from './types';

const POST_WEST = 1; // post guard at (12, 12), facing west
const YARD = 3; // generator yard post guard at (18, 23)
const NORTH_PATROL = 6; // compound loop patrol
const GATE_POST = 5; // compound west-gate post at (29, 12), facing west
const SPINNER = 7; // spinning post guard at (36, 16)
const SOUTH = 8; // south strip patrol

const target = (k: Script, tx: number, ty: number): InteractTarget => {
  const t = objectAt(k.s, tx, ty);
  if (!t) throw new Error(`nothing to interact with at ${tx},${ty}`);
  return t;
};

/** Yoav ties a downed guard, or he wakes after WAKE_TIME and raises the alarm (Phase 3). */
const tie = (k: Script, g: Guard, label: string): void => {
  expect(orderTie(k.s, k.unit('shadow'), g)).toBe(true);
  k.until(label, () => g.tied, 15);
};

const noAlarm = (k: Script): void => {
  expect(k.s.stats.alarms, k.log.join('\n')).toBe(0);
};

/** Scenario 6 as a reusable script: breach the yard gate, decoy into the yard
 *  corner, take down the yard guard, hide the body, cut power. Starts from the LZ. */
function generatorYardRun(k: Script): void {
  const s = k.s;
  const yoav = k.unit('shadow');
  const noa = k.unit('lure');
  const itai = k.unit('sapper');
  const yard = k.guard(YARD);

  setCrawl(itai, true);
  orderInteract(s, itai, target(k, 16, 27));
  orderMove(s, yoav, 12.5, 28.5);
  orderMove(s, noa, 10.5, 28.5);
  k.until('yard gate breached', () => s.doors[0]!.open, 40);
  k.until('Noa in position', () => idle(noa), 20);

  expect(throwDecoy(s, noa, 14.5, 22.5)).toBe('thrown');
  k.until('yard guard investigates', () => yard.state === 'investigate', 3);
  k.until('yard guard searches the corner', () => yard.state === 'search', 10);

  orderTakedown(s, yoav, yard);
  k.until('yard guard down', () => yard.state === 'down', 10);
  orderGrab(s, yoav, yard);
  k.until('Yoav has the body', () => yoav.carrying === yard, 10);
  orderMove(s, yoav, 12.5, 28.5);
  k.until('body outside the wall', () => idle(yoav), 20);
  dropBody(yoav);
  tie(k, yard, 'yard guard tied');

  setCrawl(itai, false);
  orderInteract(s, itai, target(k, 15, 23));
  k.until('power cut', () => !s.generator.on, 30);
}

/** Scenario 7, continuing from scenario 6: ambush the south patrol from behind
 *  the crates, breach the compound door, decoy the spinning guard, take him down, rig TEL-3. */
function compoundRun(k: Script): void {
  const s = k.s;
  const yoav = k.unit('shadow');
  const noa = k.unit('lure');
  const itai = k.unit('sapper');
  const south = k.guard(SOUTH);
  const spinner = k.guard(SPINNER);

  orderMove(s, yoav, 22.5, 24.5); // west of the crate pair at (23, 23) and (23, 24)
  k.until('Yoav behind the crates', () => idle(yoav), 20);
  setCrawl(yoav, true);
  k.until('south patrol walks east, back turned', () => south.dir === 1 && south.x > 27.5 && south.x < 29, 40);
  setCrawl(yoav, false);
  orderTakedown(s, yoav, south);
  k.until('south patrol down', () => south.state === 'down', 15);
  tie(k, south, 'south patrol tied');

  orderInteract(s, itai, target(k, 35, 22));
  orderMove(s, noa, 43.5, 14.5); // corridor east of the compound wall
  k.until('compound door breached', () => s.doors[1]!.open, 60);
  orderMove(s, itai, 33.5, 24.5);
  k.until('Noa in the east corridor', () => idle(noa), 60);

  expect(throwDecoy(s, noa, 36.5, 13.5)).toBe('thrown');
  k.until('spinning guard investigates', () => spinner.state === 'investigate', 3);
  k.until('spinning guard searches', () => spinner.state === 'search', 10);
  orderTakedown(s, yoav, spinner);
  k.until('spinning guard down', () => spinner.state === 'down', 15);
  tie(k, spinner, 'spinning guard tied');

  orderInteract(s, itai, target(k, 32, 18));
  k.until('TEL-3 rigged', () => s.launchers[2]!.done, 40);
}

/** Continues from scenario 7: ambush the compound loop patrol on the east side,
 *  take down the west-gate post while Itai rigs TEL-2, rig TEL-1, then walk home the
 *  way the squad came in (the main gate road passes two posts). */
function finishRun(k: Script): void {
  const s = k.s;
  const yoav = k.unit('shadow');
  const noa = k.unit('lure');
  const itai = k.unit('sapper');
  const loop = k.guard(NORTH_PATROL);
  const gatePost = k.guard(GATE_POST);

  k.until('loop patrol walks south, back to Yoav', () => loop.y > 15.5 && loop.x > 40, 10);
  orderTakedown(s, yoav, loop);
  k.until('loop patrol down', () => loop.state === 'down', 15);
  tie(k, loop, 'loop patrol tied');

  orderInteract(s, itai, target(k, 37, 12));
  orderTakedown(s, yoav, gatePost); // he faces the west gate, Yoav comes from the east
  k.until('gate post down', () => gatePost.state === 'down', 30);
  tie(k, gatePost, 'gate post tied');
  k.until('TEL-2 rigged', () => s.launchers[1]!.done, 40);
  orderInteract(s, itai, target(k, 30, 9));
  k.until('TEL-1 rigged', () => s.launchers[0]!.done, 40);
  expect(s.aborted).toBe(true);

  const team = [yoav, noa, itai];
  const legs: [string, [number, number][]][] = [
    ['south of the compound door', [[35.5, 24.5], [36.5, 25.5], [34.5, 25.5]]],
    ['inside the yard', [[18.5, 24.5], [18.5, 25.5], [17.5, 25.5]]],
    ['out of the yard gate', [[16.5, 28.5], [15.5, 28.5], [17.5, 28.5]]],
  ];
  for (const [label, pts] of legs) {
    team.forEach((u, i) => orderMove(s, u, pts[i]![0], pts[i]![1]));
    k.until(label, () => team.every(idle), 90);
  }
  team.forEach((u, i) => orderMove(s, u, [4.5, 2.5, 4.5][i]!, [24.5, 26.5, 26.5][i]!));
  k.until('win', () => s.over === 'win', 30);
}

describe('verified scenarios from prototype/NOTES.md', () => {
  test('1. an operator 1 tile in front of a post guard triggers the alarm within 0.6 s', () => {
    const k = new Script();
    k.place('shadow', 11, 12); // guard 1 stands on (12, 12) facing west
    k.until('alarm', (s) => s.alarm.active, 0.6);
    expect(k.s.stats.alarms).toBe(1);
  });

  test('2. Yoav takes down a post guard from behind, no alarm', () => {
    const k = new Script();
    const g = k.guard(POST_WEST);
    k.place('shadow', 14, 12);
    expect(orderTakedown(k.s, k.unit('shadow'), g)).toBe(true);
    k.until('guard down', () => g.state === 'down', 5);
    expect(k.s.stats.takedowns).toBe(1);
    noAlarm(k);
  });

  test('3. Yoav picks up a body and it follows him as he moves', () => {
    const k = new Script();
    const s = k.s;
    const yoav = k.unit('shadow');
    const body = k.guard(POST_WEST);
    k.place('shadow', 14, 12);
    orderTakedown(s, yoav, body);
    k.until('guard down', () => body.state === 'down', 5);
    orderGrab(s, yoav, body);
    k.until('carrying', () => yoav.carrying === body, 5);
    expect(body.carried).toBe(true);

    const start = { x: body.x, y: body.y };
    orderMove(s, yoav, 13.5, 20.5); // south, away from searchlight 1
    let maxGap = 0;
    k.until(
      'arrived',
      () => {
        maxGap = Math.max(maxGap, dist(yoav, body));
        return idle(yoav);
      },
      10,
    );
    expect(dist(start, body)).toBeGreaterThan(6);
    expect(maxGap).toBeLessThanOrEqual(CARRY_OFFSET + 1e-9);
    noAlarm(k);
  });

  test('4. a decoy near the yard guard sends him to investigate, and he returns to his post', () => {
    const k = new Script();
    const s = k.s;
    const g = k.guard(YARD);
    const post = { ...g.post! };
    k.place('lure', 9, 24); // outside the perimeter wall, west of the yard
    expect(throwDecoy(s, k.unit('lure'), 14.5, 25.5)).toBe('thrown');
    k.until('investigate', () => g.state === 'investigate', 2);
    k.until('search', () => g.state === 'search', 10);
    k.until('return', () => g.state === 'return', 5);
    k.until('back on post', () => g.state === 'patrol', 15);
    expect(g.x).toBe(post.x);
    expect(g.y).toBe(post.y);
    noAlarm(k);
  });

  test('5. Itai, crawling, breaches the yard gate from outside without an alarm', () => {
    const k = new Script();
    const s = k.s;
    const itai = k.unit('sapper');
    setCrawl(itai, true);
    expect(orderInteract(s, itai, target(k, 16, 27))).toBe(true);
    k.until('gate breached', () => s.doors[0]!.open, 40);
    expect(itai.crawl).toBe(true);
    expect(itai.y).toBeGreaterThan(28); // worked from the outside
    k.run(3);
    noAlarm(k);
  });

  test('6. scripted run: gate, decoy, takedown, hide body, cut power. Zero alarms', () => {
    const k = new Script();
    generatorYardRun(k);
    expect(k.s.stats.takedowns).toBe(1);
    noAlarm(k);
  });

  test('7. continued: south patrol ambush, compound door, decoy and take down the spinner, rig TEL-3', () => {
    const k = new Script();
    generatorYardRun(k);
    compoundRun(k);
    expect(k.s.stats.takedowns).toBe(3);
    expect(k.s.launchers.map((l) => l.done)).toEqual([false, false, true]);
    expect(k.guard(NORTH_PATROL).state).toBe('patrol');
    noAlarm(k);
  });

  test('8. all launchers rigged with every operator in the LZ is a win', () => {
    const k = new Script();
    for (const l of k.s.launchers) l.done = true;
    k.s.aborted = true;
    k.run(1 / 60);
    expect(k.s.over).toBe('win');
  });

  test('8b. no win while an operator is outside the LZ', () => {
    const k = new Script();
    for (const l of k.s.launchers) l.done = true;
    k.s.aborted = true;
    k.place('sapper', 8, 26);
    k.run(1);
    expect(k.s.over).toBeNull();
    orderMove(k.s, k.unit('sapper'), 5.5, 26.5);
    k.until('win', (s) => s.over === 'win', 5);
  });

  test('10. the whole mission by orders only: every launcher rigged, everyone home, zero alarms', () => {
    const k = new Script();
    generatorYardRun(k);
    compoundRun(k);
    finishRun(k);
    expect(k.s.over).toBe('win');
    expect(k.s.squad.every((u) => u.alive && u.hp === u.maxHp)).toBe(true);
    expect(k.s.stats.takedowns).toBe(5);
    expect(k.s.timeLeft).toBeGreaterThan(300); // about 6:50 of 8:00 left
    noAlarm(k);
  });

  test('9. the timer reaching 0 ends in launch', () => {
    const k = new Script();
    k.until('game over', (s) => s.over !== null, TIME_LIMIT + 1);
    expect(k.s.over).toBe('launch');
    expect(k.s.timeLeft).toBe(0);
  });
});
