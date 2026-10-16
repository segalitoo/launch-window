// The test maps (Phase 3, Ran): one small puzzle per tool, built by tools/test_maps.py into
// maps/tests/. The game opens one with ?map=<id>; tests.html lists them.

import { type MissionMap, parseTiledMap } from '@/sim';
import order from '../maps/tests/order.json';

const raw = import.meta.glob('../maps/tests/*.tmj', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface TestMap {
  id: string;
  name: string;
  brief: string;
  /** The operator it is for. */
  who: string;
  map: MissionMap;
}

export const TEST_MAPS: readonly TestMap[] = (order as string[]).map((id) => {
  const text = raw[`../maps/tests/${id}.tmj`];
  if (!text) throw new Error(`maps/tests/${id}.tmj is missing (run python3 tools/test_maps.py)`);
  const json = JSON.parse(text) as { properties?: { name: string; value: unknown }[] };
  const who = json.properties?.find((p) => p.name === 'who')?.value;
  const map = parseTiledMap(json);
  return { id, name: map.name, brief: map.brief, who: typeof who === 'string' ? who : '', map };
});

export const testMap = (id: string | null): TestMap | undefined => TEST_MAPS.find((t) => t.id === id);
