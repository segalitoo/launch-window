import { describe, expect, test } from 'vitest';
import { COLS, ROWS } from './constants';
import { blocksSight, tileAt, walkable } from './grid';
import { buildMission } from './map';

describe('mission map', () => {
  const s = buildMission();
  const g = s.grid;

  test('is 46 x 30 tiles', () => {
    expect(g.cols).toBe(COLS);
    expect(g.rows).toBe(ROWS);
    expect(g.cells).toHaveLength(46 * 30);
  });

  test('places the objects from the prototype', () => {
    expect(tileAt(g, 16, 27)).toBe('D');
    expect(tileAt(g, 35, 22)).toBe('D');
    expect(tileAt(g, 15, 23)).toBe('G');
    expect(tileAt(g, 16, 24)).toBe('G');
    expect(tileAt(g, 24, 9)).toBe('T');
    expect(tileAt(g, 36, 25)).toBe('T');
    expect(tileAt(g, 30, 9)).toBe('L');
    expect(tileAt(g, 39, 12)).toBe('L');
    expect(tileAt(g, 14, 5)).toBe('B');
    expect(tileAt(g, 23, 15)).toBe('c');
    expect(tileAt(g, 10, 13)).toBe('.'); // main gate gap
    expect(tileAt(g, 20, 24)).toBe('.'); // yard east gap
    expect(tileAt(g, 27, 13)).toBe('.'); // compound west gap
  });

  test('counts match the prototype', () => {
    const count = (c: string): number => g.cells.filter((x) => x === c).length;
    expect(count('c')).toBe(15);
    expect(count('L')).toBe(9);
    expect(s.guards).toHaveLength(10);
    expect(s.squad.map((u) => u.name)).toEqual(['Yoav', 'Noa', 'Itai']);
  });

  test('outside the map is wall', () => {
    expect(tileAt(g, -1, 0)).toBe('#');
    expect(tileAt(g, 46, 0)).toBe('#');
    expect(walkable(g, 0, -1)).toBe(false);
  });

  test('every blocking tile blocks both movement and sight; open doors block neither', () => {
    for (const c of ['#', 'B', 'c', 'D', 'G', 'L', 'T'] as const) {
      const t = buildMission();
      t.grid.cells[0] = c;
      expect(walkable(t.grid, 0, 0)).toBe(false);
      expect(blocksSight(t.grid, 0, 0)).toBe(true);
    }
    const t = buildMission();
    t.grid.cells[0] = 'd';
    expect(walkable(t.grid, 0, 0)).toBe(true);
    expect(blocksSight(t.grid, 0, 0)).toBe(false);
  });

  test('every unit and guard starts on a walkable tile', () => {
    for (const e of [...s.squad, ...s.guards]) expect(walkable(g, Math.floor(e.x), Math.floor(e.y))).toBe(true);
  });
});
