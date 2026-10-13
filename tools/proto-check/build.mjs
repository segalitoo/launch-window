// Builds an instrumented copy of the prototype for timing cross-checks.
// The prototype itself stays read-only. Usage:
//   node tools/proto-check/build.mjs <out-dir>
// Then serve <out-dir> and, in the page console, run:
//   eval(await (await fetch('/run.js')).text())
// Compare the log with the same steps in src/sim/scenarios.test.ts.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error('usage: node tools/proto-check/build.mjs <out-dir>');
const src = readFileSync(join(here, '../../prototype/launch-window.html'), 'utf8');
const end = src.lastIndexOf('})();');
const expose =
  'window.__P = { newGame, update, pathTo, orderInteract, objectAt, orderMove, doThrow, clearOrder, get S() { return S; } };\n';
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), src.slice(0, end) + expose + src.slice(end));
copyFileSync(join(here, 'run.js'), join(out, 'run.js'));
console.log(`wrote ${out}`);
