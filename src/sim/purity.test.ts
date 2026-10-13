// src/sim must run in Node: no Phaser, no DOM, no window.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const dir = __dirname;
const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

test.each(files)('%s has no Phaser, DOM or window', (f) => {
  // strip comments so prose like "launch-window.html" does not trip the check
  const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  expect(src).not.toMatch(/from ['"]phaser/i);
  expect(src).not.toMatch(/\b(window|document|requestAnimationFrame|localStorage)\b/);
  expect(src).not.toMatch(/Math\.random/);
  expect(src).not.toMatch(/from ['"]\.\.\/(render|ui)/);
});
