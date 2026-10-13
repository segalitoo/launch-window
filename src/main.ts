import Phaser from 'phaser';
import { MapScene } from '@/render/MapScene';
import { Hud } from '@/ui/hud';
import './style.css';

const root = document.getElementById('app')!;
const hud = new Hud(root);

const scene = new MapScene({
  onEvents: (events) => hud.onEvents(events),
  onFrame: (s, c) => hud.onFrame(s, c),
});

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
