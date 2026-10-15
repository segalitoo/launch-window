// Guns (Phase 3, Ran): every operator shoots, unlimited ammo. Loud raises the alarm; the
// silencer is quiet but half range and a long aim. Itai's shotgun is short.

import { describe, expect, test } from 'vitest';
import { CARBINE_RANGE, GUN_AIM, SHOTGUN_RANGE, SILENCED_AIM, SILENCED_RANGE, WAKE_TIME } from './constants';
import { fireGun, gunRange, toggleSilencer } from './squad';
import { Script } from './testkit';

const POST_WEST = 1; // post guard at (12, 12); a wall west of him after 1 tile

/** Guard 1 looking away (east), the shooter `dx` tiles west of him on his row. */
function setup(id: 'shadow' | 'lure' | 'sapper', dx = 1) {
  const k = new Script();
  const g = k.guard(POST_WEST);
  g.ang = 0;
  const u = k.unit(id);
  u.x = g.x - dx;
  u.y = g.y;
  u.path = [];
  return { k, g, u };
}

describe('guns', () => {
  test('silenced (the start): a long aim, then he drops for good, no alarm', () => {
    const { k, g, u } = setup('shadow');
    expect(u.silenced).toBe(true);
    expect(fireGun(k.s, u, g)).toBe('aiming');
    k.game.run(SILENCED_AIM - 0.1);
    expect(g.state).not.toBe('down');
    k.game.run(0.2);
    expect(g.dead).toBe(true);
    expect(k.s.alarm.active).toBe(false);
    k.place('shadow', 2, 2);
    k.game.run(WAKE_TIME * 2);
    expect(g.state).toBe('down'); // the dead never wake
  });

  test('loud: a quick shot that raises the alarm', () => {
    const { k, g, u } = setup('lure');
    toggleSilencer(k.s, u);
    expect(u.silenced).toBe(false);
    fireGun(k.s, u, g);
    k.game.run(GUN_AIM + 0.05);
    expect(g.dead).toBe(true);
    expect(k.s.alarm.active).toBe(true);
  });

  test('ranges: carbine 8, shotgun 3; the silencer halves them', () => {
    const k = new Script();
    const yoav = k.unit('shadow');
    const itai = k.unit('sapper');
    expect(gunRange(yoav)).toBe(CARBINE_RANGE * SILENCED_RANGE);
    expect(gunRange(itai)).toBe(SHOTGUN_RANGE * SILENCED_RANGE);
    yoav.silenced = itai.silenced = false;
    expect(gunRange(yoav)).toBe(CARBINE_RANGE);
    expect(gunRange(itai)).toBe(SHOTGUN_RANGE);
  });

  test('out of range or no clear line: no shot', () => {
    const near = setup('sapper', 2); // silenced shotgun reaches 1.5
    expect(fireGun(near.k.s, near.u, near.g)).toBe('range');
    near.u.silenced = false;
    expect(fireGun(near.k.s, near.u, near.g)).toBe('aiming');
    const far = setup('shadow', 3); // a wall between (x 10)
    far.u.silenced = false;
    expect(fireGun(far.k.s, far.u, far.g)).toBe('blocked');
  });

  test('a silenced shot is heard close by: a guard within earshot investigates', () => {
    const { k, g, u } = setup('shadow');
    const other = k.guard(2);
    other.x = g.x + 1.5;
    other.y = g.y;
    other.path = [];
    other.state = 'patrol';
    other.ang = 0; // looking away, so he only hears it
    fireGun(k.s, u, g);
    k.game.run(SILENCED_AIM + 0.05);
    expect(g.dead).toBe(true);
    expect(['investigate', 'search', 'combat']).toContain(other.state);
  });
});
