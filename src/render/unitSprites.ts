// Rendered unit art (Phase 2). Each unit with art has an atlas built by
// tools/blender/render_unit.py and tools/pack_unit.py: idle, walk and run in 8 directions.
// Units without art, or in a state without art yet (crawl), keep the placeholder marker.

import Phaser from 'phaser';
import type { Unit, UnitId } from '@/sim';
import { depthOf, toScreen, type Point } from './iso';
import { frameName } from './unitAnim';

/** Units that have rendered art: unit id → atlas name in assets/build/units/. */
export const UNIT_ART: Partial<Record<UnitId, string>> = { shadow: 'yoav' };

/** Heights (px at 100% zoom) sampled for the hidden-unit test: boots, belt, helmet. */
const SAMPLE_HEIGHTS = [3, 22, 40];

interface UnitMeta {
  anchor: [number, number];
  supersample: number;
  anims: Record<string, number>;
  dirs: number;
}

interface Entry {
  img: Phaser.GameObjects.Image;
  ghost: Phaser.GameObjects.Image;
  meta: UnitMeta;
  walked: number;
  last: { x: number; y: number };
}

export class UnitSprites {
  private entries = new Map<UnitId, Entry>();

  static preload(scene: Phaser.Scene): void {
    for (const name of new Set(Object.values(UNIT_ART))) {
      scene.load.atlas(name, `units/${name}.png`, `units/${name}.json`);
      scene.load.json(`${name}_meta`, `units/${name}.json`);
    }
  }

  /** `tint` is the unit night grade; `ghostDepth` draws above every structure. */
  constructor(
    private scene: Phaser.Scene,
    private tint: number,
    private ghostDepth: number,
  ) {}

  /** True when this unit is drawn by its art in its current state. */
  covers(u: Unit): boolean {
    return !!UNIT_ART[u.id] && u.alive && !u.crawl;
  }

  /** Screen points to test against occluders. */
  samples(u: Unit): Point[] {
    return SAMPLE_HEIGHTS.map((h) => toScreen(u.x, u.y, h));
  }

  /** Draws the unit, or hides its art when `covers` is false. `hidden` shows the
   *  squad-colour silhouette above the structure that hides it. */
  draw(u: Unit, hidden: boolean, colour: number): void {
    const e = this.entry(u);
    if (!e) return;
    const show = this.covers(u);
    e.img.setVisible(show);
    e.ghost.setVisible(show && hidden);
    const moved = Math.hypot(u.x - e.last.x, u.y - e.last.y);
    e.last = { x: u.x, y: u.y };
    if (!show) return;

    // moving = following a path, so a paused game freezes him mid-stride instead of snapping to idle
    const moving = u.path.length > 0 && u.busy <= 0;
    if (moved < 1) e.walked += moved; // a jump (restart, test placement) is not a step
    const frame = frameName(u.ang, moving, !!u.carrying, e.walked, e.meta.anims);
    const p = toScreen(u.x, u.y);
    e.img.setFrame(frame).setPosition(p.x, p.y).setDepth(depthOf(u.x, u.y, 13));
    if (hidden) e.ghost.setFrame(frame).setPosition(p.x, p.y).setTint(colour).setTintFill();
  }

  private entry(u: Unit): Entry | null {
    const name = UNIT_ART[u.id];
    if (!name) return null;
    let e = this.entries.get(u.id);
    if (!e) {
      const raw = this.scene.cache.json.get(`${name}_meta`) as { meta: { unit: UnitMeta } };
      const meta = raw.meta.unit;
      const [fw, fh] = [
        this.scene.textures.getFrame(name, 'idle_d0_f0').width / meta.supersample,
        this.scene.textures.getFrame(name, 'idle_d0_f0').height / meta.supersample,
      ];
      const origin = [meta.anchor[0] / fw, meta.anchor[1] / fh] as const;
      const make = (): Phaser.GameObjects.Image =>
        this.scene.add.image(0, 0, name, 'idle_d0_f0').setOrigin(...origin).setScale(1 / meta.supersample);
      e = {
        img: make().setTint(this.tint),
        ghost: make().setAlpha(0.55).setDepth(this.ghostDepth),
        meta,
        walked: 0,
        last: { x: u.x, y: u.y },
      };
      this.entries.set(u.id, e);
    }
    return e;
  }
}
