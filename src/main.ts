import Phaser from 'phaser';
import { MapScene } from '@/render/MapScene';
import { Hud } from '@/ui/hud';
import { testMap } from './testMaps';
import './style.css';

// ?map=<id> opens a test map (Phase 3, tests.html lists them); otherwise the mission
const test = testMap(new URLSearchParams(location.search).get('map'));

const root = document.getElementById('app')!;
const hud = new Hud(root, (key) => scene.press(key), test);

const scene = new MapScene(
  {
    onEvents: (events, s) => hud.onEvents(events, s),
    onFrame: (s, c) => hud.onFrame(s, c),
  },
  test?.map ?? null,
);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  backgroundColor: '#1b1d1c',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  render: { antialias: true },
  scene,
});

// handle for screenshots and debugging in the browser console
(window as unknown as { lw: unknown }).lw = { game, scene };
