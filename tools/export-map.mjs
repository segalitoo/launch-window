// Writes the mission map (maps/night-lantern.tmj, as the sim reads it) as JSON, so tools outside the game
// (the Blender render script) build from the same data as the sim.
// Usage: node tools/export-map.mjs [out.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'assets/raw/blockout/map.json';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildMission, NIGHT_LANTERN } = await server.ssrLoadModule('/src/sim/index.ts');
  const s = buildMission();
  const data = {
    cols: s.grid.cols,
    rows: s.grid.rows,
    cells: s.grid.cells.join(''),
    deco: Array.from(s.grid.deco),
    buildings: s.buildings,
    doors: s.doors,
    generator: s.generator,
    towers: s.towers.map(({ x, y }) => ({ x, y })),
    launchers: s.launchers,
    guards: NIGHT_LANTERN.guards,
    squad: s.squad.map(({ id, name, x, y }) => ({ id, name, x, y })),
    hides: s.hides,
    lz: s.lz,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data));
  console.log(`wrote ${out}`);
} finally {
  await server.close();
}
