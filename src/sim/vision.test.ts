import { describe, expect, test } from 'vitest';
import { CONE_LEN, FOV } from './constants';
import { createGrid, fillRect } from './grid';
import { buildMission } from './map';
import type { GameState, Unit } from './types';
import { castRay, coneLength, detects, losClear, zoneOf } from './vision';

const viewer = { x: 5.5, y: 5.5, ang: 0 }; // facing east (+x)

function stateWithOpenGrid(): GameState {
  const s = buildMission();
  s.grid = createGrid(30, 30);
  return s;
}

describe('ray cast and line of sight', () => {
  test('a ray stops at the first sight-blocking tile', () => {
    const g = createGrid(20, 20);
    g.cells[5 * 20 + 9] = '#';
    expect(castRay(g, 5.5, 5.5, 0, 10)).toBeCloseTo(3.5);
  });

  test('a ray with nothing in the way returns maxLen', () => {
    expect(castRay(createGrid(20, 20), 5.5, 5.5, 0, 4)).toBe(4);
  });

  test('walls block line of sight, open doors do not', () => {
    const g = createGrid(20, 20);
    fillRect(g, 8, 0, 8, 19, '#');
    expect(losClear(g, 5.5, 5.5, 11.5, 5.5)).toBe(false);
    g.cells[5 * 20 + 8] = 'd';
    expect(losClear(g, 5.5, 5.5, 11.5, 5.5)).toBe(true);
    g.cells[5 * 20 + 8] = 'D';
    expect(losClear(g, 5.5, 5.5, 11.5, 5.5)).toBe(false);
  });

  test('crates block sight', () => {
    const g = createGrid(20, 20);
    g.cells[5 * 20 + 7] = 'c';
    expect(losClear(g, 5.5, 5.5, 9.5, 5.5)).toBe(false);
  });
});

describe('guard cone', () => {
  const s = stateWithOpenGrid();
  const at = (dx: number, dy: number) => ({ x: viewer.x + dx, y: viewer.y + dy });

  test('near zone is the inner half, far zone the rest', () => {
    expect(zoneOf(s, viewer, at(CONE_LEN * 0.5 - 0.01, 0))).toBe('near');
    expect(zoneOf(s, viewer, at(CONE_LEN * 0.5 + 0.01, 0))).toBe('far');
    expect(zoneOf(s, viewer, at(CONE_LEN + 0.01, 0))).toBeNull();
  });

  test('the cone is 70 degrees wide', () => {
    const inside = FOV / 2 - 0.01;
    const outside = FOV / 2 + 0.01;
    expect(zoneOf(s, viewer, at(Math.cos(inside) * 2, Math.sin(inside) * 2))).toBe('near');
    expect(zoneOf(s, viewer, at(Math.cos(outside) * 2, Math.sin(outside) * 2))).toBeNull();
  });

  test('a guard senses anyone right next to him, even behind', () => {
    expect(zoneOf(s, viewer, at(-0.3, 0))).toBe('near');
    expect(zoneOf(s, viewer, at(-0.5, 0))).toBeNull();
  });

  test('crawling hides a unit in the far zone only', () => {
    const u = { ...at(5, 0), crawl: true } as Unit;
    expect(detects(s, viewer, u)).toBeNull();
    u.x = viewer.x + 2;
    expect(detects(s, viewer, u)).toBe('near');
  });

  test('the cone is 15% longer during an alarm', () => {
    expect(coneLength(s)).toBe(CONE_LEN);
    const alarmed = stateWithOpenGrid();
    alarmed.alarm.active = true;
    expect(coneLength(alarmed)).toBeCloseTo(CONE_LEN * 1.15);
    expect(zoneOf(alarmed, viewer, at(CONE_LEN + 0.5, 0))).toBe('far');
  });
});
