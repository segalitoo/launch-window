// Rendered unit art (Phase 2). Each unit with art has a multi-atlas built by
// tools/blender/render_unit.py and tools/pack_unit.py: idle, run, drag, crawl,
// takedown, grab, death and hit, in 8 directions. Units without art keep the placeholder marker.

import Phaser from 'phaser';
import type { Guard, SimEvent, Unit, UnitId } from '@/sim';
import { depthOf, toScreen, type Point } from './iso';
import { draggedFrameName, frameName, guardFrameName } from './unitAnim';

/** Units that have rendered art: unit id → atlas name in assets/build/units/. */
/** Phase 2 look test (Ran): `?look=a` in the address swaps Yoav and the guards for the
 *  test-look atlases (yoav_a, guard_a), to judge a drawn look in play. Now holding D3
 *  (tools/blender/looks.py, outline_pop); look A (cel_black) was rejected: no detail. */
const LOOK_A = typeof location !== 'undefined' && new URLSearchParams(location.search).get('look') === 'a';

export const UNIT_ART: Partial<Record<UnitId, string>> = { shadow: LOOK_A ? 'yoav_a' : 'yoav', lure: 'noa', sapper: 'itai' };

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
        busy: u.busy,
        workT: u.order?.type === 'interact' && u.order.started ? u.order.t : null,
      },
      e.meta.anims,
    );
    const p = toScreen(u.x, u.y);
    // lying down (prone or dead) sorts with low ground props, not with standing figures
    e.img.setFrame(frame).setPosition(p.x, p.y).setDepth(depthOf(u.x, u.y, u.alive && !u.crawl ? 13 : 2));
    e.ghost.setVisible(hidden && u.alive);
    if (hidden) e.ghost.setFrame(frame).setPosition(p.x, p.y).setTint(colour).setTintMode(Phaser.TintModes.FILL);
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

/** How far in front of the dragger his hands hold the collar, in tiles. */
const GRIP_REACH = 0.25;

/** Atlas for every guard (option A, picked by Ran in Phase 2). */
export const GUARD_ART = LOOK_A ? 'guard_a' : 'guard';

interface GuardEntry {
  guard: Guard;
  img: Phaser.GameObjects.Image;
  walked: number;
  last: { x: number; y: number };
  lastT: number;
  moving: boolean;
  downAt: number | null;
  carrierLast?: { x: number; y: number };
  koAt: number | null;
  onBack: boolean;
}

/** Rendered guards: idle, walk, run, death (shot), knockout (struck from behind) and
 *  dragged, in 8 directions. */
export class GuardSprites {
  private entries: GuardEntry[] = [];
  /** Takedowns from sim events by guard index, waiting for that guard's next draw. */
  private takedowns = new Map<number, number>();

  /** Sim events that start one-shots. `t` is the sim time. */
  onEvents(events: readonly SimEvent[], t: number): void {
    for (const ev of events) if (ev.type === 'takedown') this.takedowns.set(ev.guard, t);
  }
  private meta!: UnitMeta;

  static preload(scene: Phaser.Scene): void {
    scene.load.multiatlas(GUARD_ART, `units/${GUARD_ART}.json`, 'units/');
    scene.load.json(`${GUARD_ART}_meta`, `units/${GUARD_ART}.json`);
  }

  /** `tint` is the unit night grade. */
  constructor(
    private scene: Phaser.Scene,
    private tint: number,
  ) {
    const raw = scene.cache.json.get(`${GUARD_ART}_meta`) as { meta: { unit: UnitMeta } } | undefined;
    if (raw) this.meta = raw.meta.unit;
  }

  get ready(): boolean {
    return !!this.meta;
  }

  /** Draws guard `g` at sim time `t`. `carrier` is the unit dragging him, if any. */
  draw(g: Guard, t: number, carrier?: Unit): void {
    const e = this.entry(g, t);
    if (g.carried && carrier) {
      e.last = { x: g.x, y: g.y };
      e.onBack = true;
      this.drawDragged(e, g, carrier);
      return;
    }
    const ko = this.takedowns.get(g.i);
    if (ko !== undefined) {
      e.koAt = ko;
      this.takedowns.delete(g.i);
    }
    const moved = Math.hypot(g.x - e.last.x, g.y - e.last.y);
    e.last = { x: g.x, y: g.y };
    // paused: keep the pose; otherwise moving means he moved since the last frame
    if (t !== e.lastT) e.moving = moved > 1e-5 && moved < 1;
    e.lastT = t;
    if (e.moving) e.walked += moved;
    const down = g.state === 'down';
    if (down && e.downAt === null) e.downAt = t;
    const frame = guardFrameName(
      {
        ang: g.ang,
        down,
        moving: e.moving,
        running: g.state === 'investigate' || g.state === 'combat',
        walked: e.walked,
        t,
        downAt: e.downAt,
        koAt: e.koAt,
        onBack: e.onBack,
      },
      this.meta.anims,
    );
    const p = toScreen(g.x, g.y);
    e.img.setFrame(frame).setPosition(p.x, p.y).setDepth(depthOf(g.x, g.y, down ? 2 : 13));
  }

  /** A dragged body: neck at the dragger's hands, body stretched away from him. */
  private drawDragged(e: GuardEntry, g: Guard, c: Unit): void {
    const dx = g.x - c.x;
    const dy = g.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const grip = { x: c.x + (dx / len) * GRIP_REACH, y: c.y + (dy / len) * GRIP_REACH };
    e.walked += Math.hypot(c.x - (e.carrierLast?.x ?? c.x), c.y - (e.carrierLast?.y ?? c.y));
    e.carrierLast = { x: c.x, y: c.y };
    const frame = draggedFrameName(Math.atan2(-dy, -dx), e.walked, this.meta.anims);
    const p = toScreen(grip.x, grip.y);
    // sort by the middle of the body, half a body length beyond the grip
    const mid = { x: grip.x + (dx / len) * 0.5, y: grip.y + (dy / len) * 0.5 };
    e.img.setFrame(frame).setPosition(p.x, p.y).setDepth(depthOf(mid.x, mid.y, 2));
  }

  private entry(g: Guard, t: number): GuardEntry {
    let e = this.entries[g.i];
    const fresh = {
      guard: g, walked: 0, last: { x: g.x, y: g.y }, lastT: t, moving: false, downAt: null,
      carrierLast: undefined, koAt: null, onBack: false,
    };
    if (e && e.guard !== g) Object.assign(e, fresh); // new game
    if (!e) {
      const m = this.meta;
      const img = this.scene.add
        .image(0, 0, GUARD_ART, 'idle_d0_f0')
        .setOrigin(m.anchor[0] / m.frame[0], m.anchor[1] / m.frame[1])
        .setScale(1 / m.supersample)
        .setTint(this.tint);
      e = { ...fresh, img };
      this.entries[g.i] = e;
    }
    return e;
  }
}
