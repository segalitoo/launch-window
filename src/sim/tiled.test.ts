import { describe, expect, test } from 'vitest';
import nightLantern from '../../maps/night-lantern.tmj?raw';
import { buildMission } from './map';
import { parseTiledMap } from './tiled';

const raw = (): Record<string, any> => JSON.parse(nightLantern);
const layer = (m: Record<string, any>, name: string) => m.layers.find((l: { name: string }) => l.name === name);

describe('Tiled map loader', () => {
  test('reads the landing zone, spawns and guard routes', () => {
    const m = parseTiledMap(raw());
    expect(m.name).toBe('Operation Night Lantern');
    expect(m.lz).toEqual({ x0: 1, y0: 23, x1: 6, y1: 28 });
    expect(m.spawns.shadow).toEqual([4, 24]);
    expect(m.guards[0]).toEqual({ kind: 'patrol', route: [[7, 4], [7, 17]], loop: false });
    expect(m.guards[4]).toMatchObject({ kind: 'patrol', loop: true }); // polygon
    expect(m.guards[7]).toEqual({ kind: 'post', at: [36, 16], face: 0, spin: true });
  });

  test('a door placed on a wall replaces it', () => {
    const m = parseTiledMap(raw());
    expect(layer(raw(), 'walls').data[27 * 46 + 16]).toBe(0); // exporter left it open
    expect(m.cells[27 * 46 + 16]).toBe('D');
  });

  test('a moved object moves in the game', () => {
    const j = raw();
    const gen = layer(j, 'objects').objects.find((o: { type: string }) => o.type === 'generator');
    gen.x += 24;
    const s = buildMission(1, parseTiledMap(j));
    expect(s.generator.x).toBe(16);
  });

  test('play does not change the parsed map', () => {
    const m = parseTiledMap(raw());
    const s = buildMission(1, m);
    s.doors[0]!.open = true;
    s.grid.cells[0] = 'B';
    expect(m.doors[0]!.open).toBe(false);
    expect(m.cells[0]).not.toBe('B');
  });

  test.each([
    ['an object off the grid', (j: any) => (layer(j, 'objects').objects[0].x += 5), /snap to whole tiles/],
    ['an unknown object type', (j: any) => (layer(j, 'objects').objects[0].type = 'tank'), /unknown object type "tank"/],
    ['a missing unit spawn', (j: any) => layer(j, 'spawns').objects.shift(), /missing spawn for shadow/],
    ['a tower without its angles', (j: any) => {
      const t = layer(j, 'objects').objects.find((o: { type: string }) => o.type === 'tower');
      t.properties = [];
    }, /needs number property "a0"/],
    ['a missing layer', (j: any) => j.layers.splice(3, 1), /missing objectgroup "guards"/],
  ])('rejects %s with a clear message', (_name, edit, msg) => {
    const j = raw();
    edit(j);
    expect(() => parseTiledMap(j)).toThrow(msg);
  });
});
