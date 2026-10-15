import { expect, test } from 'vitest';
import { orderMove } from '@/sim';
import { Script } from '@/sim/testkit';
import { testMap } from '@/testMaps';
import { PlayLog } from './playlog';

test('a caught run: result, the alarm with its place, the near miss before it', () => {
  const k = new Script(1, testMap('decoy')!.map);
  const log = new PlayLog('Decoy');
  const n = k.unit('lure');
  orderMove(k.s, n, 20, 2);
  for (let i = 0; i < 60 * 30 && !k.s.over; i++) {
    k.game.tick();
    log.onEvents(k.game.drainEvents(), k.s);
    log.onFrame(k.s);
  }
  const text = log.last!;
  expect(text).toMatch(/^Launch Window play log · Decoy/);
  expect(text).toContain('result: spotted');
  expect(text).toMatch(/ALARM at \(\d+, \d+\): A guard spotted Noa!/);
  expect(text).toMatch(/near miss: guard 1 at \(10, 5\) half-saw Noa/);
  expect(text).toContain('used: nothing from the kits');
});
