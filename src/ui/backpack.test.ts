import { describe, expect, test } from 'vitest';
import { buildMission } from '@/sim';
import { packOf } from './backpack';

const unit = (id: string) => buildMission().squad.find((u) => u.id === id)!;
const none = { mode: null };

describe('backpack', () => {
  test('each operator carries his own kit, with counts where it runs out', () => {
    expect(packOf(unit('shadow'), none).map((i) => i.id)).toEqual(['tie']);
    const noa = packOf(unit('lure'), none);
    expect(noa.map((i) => [i.id, i.count])).toEqual([['decoy', 4], ['smoke', 2], ['bino', null], ['uniform', null]]);
    const itai = packOf(unit('sapper'), none);
    expect(itai.map((i) => [i.id, i.count, i.disabled])).toEqual([['wire', 2, false], ['charge', 1, false], ['detonate', null, true]]);
    for (const i of [...noa, ...itai]) expect(i.icon).toMatch(/^<svg/);
  });

  test('used up items stay, greyed with 0', () => {
    const noa = unit('lure');
    noa.smokes = 0;
    const smoke = packOf(noa, none).find((i) => i.id === 'smoke')!;
    expect(smoke).toMatchObject({ count: 0, disabled: true });
  });

  test('the active mode and items in use light up; a planted charge wakes the detonator', () => {
    const noa = unit('lure');
    noa.disguised = true;
    const p = packOf(noa, { mode: 'smoke' });
    expect(p.filter((i) => i.on).map((i) => i.id)).toEqual(['smoke', 'uniform']);
    const itai = unit('sapper');
    itai.remotes = 0;
    itai.remote = { x: 1, y: 1 };
    const q = packOf(itai, none);
    expect(q.find((i) => i.id === 'charge')).toMatchObject({ count: 0, disabled: true });
    expect(q.find((i) => i.id === 'detonate')).toMatchObject({ disabled: false, on: true });
  });
});
