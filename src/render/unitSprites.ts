// Rendered unit art (Phase 2). Each unit with art has a multi-atlas built by
// tools/blender/render_unit.py and tools/pack_unit.py: idle, run, drag, crawl,
// takedown, grab, death and hit, in 8 directions. Units without art keep the placeholder marker.

import Phaser from 'phaser';
import type { SimEvent, Unit, UnitId } from '@/sim';
import { depthOf, toScreen, type Point } from './iso';
import { frameName } from './unitAnim';

/** Units that have rendered art: unit id → atlas name in assets/build/units/. */
export const UNIT_ART: Partial<Record<UnitId, string>> = { shadow: 'yoav' };

/** Heights (px at 100% zoom) sampled for the hidden-unit test: boots, belt, helmet.
 *  Prone, everything is close to the ground. */
const SAMPLE_HEIGHTS = { standing: [3, 22, 40], prone: [2, 5, 8] };

interface UnitMeta {
  anchor: [number, number];
  frame: [number, number];
  supersample: number;
  anims: Record<string, number>;
  dirs: number;
}

interface Entry {
  /** The sim unit this entry tracks; a new game brings new units and resets the entry. */
  unit: Unit;
  img: Phaser.GameObjects.Image;
  ghost: Phaser.GameObjects.Image;
  meta: UnitMeta;
  walked: number;
  last: { x: number; y: number };
  diedAt: number | null;
  takedownAt: number | null;
  grabAt: number | null;
  carrying: boolean;
}

export class UnitSprites {
  private entries = new Map<UnitId, Entry>();
  /** Takedowns from sim events, waiting for the next draw of that unit. */
  private takedowns = new Map<UnitId, number>();

  static preload(scene: Phaser.Scene): void {
    for (const name of new Set(Object.values(UNIT_ART))) {
      scene.load.multiatlas(name, `units/${name}.json`, 'units/');
      scene.load.json(`${name}_meta`, `units/${name}.json`);
    }
  }

  /** `tint` is the unit night grade; `ghostDepth` draws above every structure. */
  constructor(
    private scene: Phaser.Scene,
    private tint: number,
    private ghostDepth: number,
  ) {}

  /** True when this unit is drawn by its art. */
  covers(u: Unit): boolean {
    return !!UNIT_ART[u.id];
  }

  /** Screen points to test against occluders. */
  samples(u: Unit): Point[] {
    return SAMPLE_HEIGHTS[u.crawl ? 'prone' : 'standing'].map((h) => toScreen(u.x, u.y, h));
  }

  /** Sim events that start one-shot animations. `t` is the sim time. */
  onEvents(events: readonly SimEvent[], t: number): void {
    for (const ev of events) if (ev.type === 'takedown') this.takedowns.set(ev.unit, t);
  }

  /** Draws the unit at sim time `t`. `hidden` shows the squad-colour silhouette above
   *  the structure that hides it. */
  draw(u: Unit, t: number, hidden: boolean, colour: number): void {
    const e = this.entry(u);
    if (!e) return;
    const moved = Math.hypot(u.x - e.last.x, u.y - e.last.y);
    e.last = { x: u.x, y: u.y };
    if (moved < 1) e.walked += moved; // a jump (test placement) is not a step
    if (!u.alive && e.diedAt === null) e.diedAt = t;
    if (u.carrying && !e.carrying) e.grabAt = t;
    e.carrying = !!u.carrying;
    const td = this.takedowns.get(u.id);
    if (td !== undefined) {
      e.takedownAt = td;
      this.takedowns.delete(u.id);
    }

    const frame = frameName(
      {
        ang: u.ang,
        alive: u.alive,
        crawl: u.crawl,
        moving: u.path.length > 0 && u.busy <= 0,
        carrying: e.carrying,
        walked: e.walked,
        t,
        diedAt: e.diedAt,
        takedownAt: e.takedownAt,
        grabAt: e.grabAt,
        hitT: u.alive ? u.hitT : 0,
      },
      e.meta.anims,
    );
    const p = toScreen(u.x, u.y);
    // lying down (prone or dead) sorts with low ground props, not with standing figures
    e.img.setFrame(frame).setPosition(p.x, p.y).setDepth(depthOf(u.x, u.y, u.alive && !u.crawl ? 13 : 2));
    e.ghost.setVisible(hidden && u.alive);
    if (hidden) e.ghost.setFrame(frame).setPosition(p.x, p.y).setTint(colour).setTintFill();
  }

  private entry(u: Unit): Entry | null {
    const name = UNIT_ART[u.id];
    if (!name) return null;
    let e = this.entries.get(u.id);
    if (e && e.unit !== u) {
      // new game: same art, fresh state
      Object.assign(e, {
        unit: u,
        walked: 0,
        last: { x: u.x, y: u.y },
        diedAt: null,
        takedownAt: null,
        grabAt: null,
        carrying: false,
      });
      this.takedowns.delete(u.id);
    }
    if (!e) {
      const raw = this.scene.cache.json.get(`${name}_meta`) as { meta: { unit: UnitMeta } };
      const meta = raw.meta.unit;
      // frames are trimmed; the origin is set on the full frame, which Phaser restores
      const origin = [meta.anchor[0] / meta.frame[0], meta.anchor[1] / meta.frame[1]] as const;
      const make = (): Phaser.GameObjects.Image =>
        this.scene.add.image(0, 0, name, 'idle_d0_f0').setOrigin(...origin).setScale(1 / meta.supersample);
      e = {
        unit: u,
        img: make().setTint(this.tint),
        ghost: make().setAlpha(0.55).setDepth(this.ghostDepth),
        meta,
        walked: 0,
        last: { x: u.x, y: u.y },
        diedAt: null,
        takedownAt: null,
        grabAt: null,
        carrying: false,
      };
      this.entries.set(u.id, e);
    }
    return e;
  }
}
