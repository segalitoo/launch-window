// Rendered unit art (Phase 2). Each unit with art has a multi-atlas built by
// tools/blender/render_unit.py and tools/pack_unit.py: idle, run, drag, crawl,
// takedown, grab, death and hit, in 8 directions. Units without art keep the placeholder marker.

import Phaser from 'phaser';
import type { Guard, GuardRole, SimEvent, Unit, UnitId } from '@/sim';
import { depthOf, toScreen, type Point } from './iso';
import { DOG_RUN, dirOf, dogFrameName, draggedFrameName, frameName, guardFrameName } from './unitAnim';

/** Units that have rendered art: unit id → atlas name in assets/build/units/. */
export const UNIT_ART: Partial<Record<UnitId, string>> = { shadow: 'yoav', lure: 'noa', sapper: 'itai' };
/** Noa in the captured uniform (Phase 3): the same animations, guard clothes. */
export const DISGUISE_ART: Partial<Record<UnitId, string>> = { lure: 'noa_uniform' };

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
    for (const name of new Set([...Object.values(UNIT_ART), ...Object.values(DISGUISE_ART)])) {
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
    for (const ev of events) {
      if (ev.type === 'takedown') this.takedowns.set(ev.unit, t);
      else if (ev.type === 'fired') this.shots.set(ev.unit, t);
    }
  }
  /** Shots fired, waiting for that unit's next draw (the kick frame). */
  private shots = new Map<UnitId, number>();

  /** Draws the unit at sim time `t`. `hidden` shows the squad-colour silhouette above
   *  the structure that hides it; `inCover` draws him see-through in a hiding spot. */
  draw(u: Unit, t: number, hidden: boolean, colour: number, inCover = false): void {
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
        workT:
          u.order?.type === 'interact' && u.order.started
            ? u.order.t
            : u.order?.type === 'wire' || u.order?.type === 'plant'
              ? u.order.t
              : null,
        tieT: u.order?.type === 'tie' && u.order.started ? u.order.t : null,
        aimT: u.order?.type === 'shoot' ? u.order.t : null,
        firedAt: this.shots.get(u.id) ?? null,
      },
      e.meta.anims,
    );
    const p = toScreen(u.x, u.y);
    // lying down (prone or dead) sorts with low ground props, not with standing figures
    // the captured uniform swaps the atlas; frame names are the same
    const art = (u.disguised && DISGUISE_ART[u.id]) || UNIT_ART[u.id]!;
    if (e.img.texture.key !== art) {
      e.img.setTexture(art, frame);
      e.ghost.setTexture(art, frame);
    }
    // in a hiding spot he shows see-through: the player knows he is hidden
    e.img.setFrame(frame).setPosition(p.x, p.y).setDepth(depthOf(u.x, u.y, u.alive && !u.crawl ? 13 : 2)).setAlpha(inCover && u.alive ? 0.55 : 1);
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

/** Atlas per guard role: the guard (option A, picked by Ran in Phase 2), the officer (maroon
 *  beret, OFFICER-01 look A) and the dog (DOG-01 coat A), Phase 3. */
export const GUARD_ART: Readonly<Record<GuardRole, string>> = { guard: 'guard', officer: 'officer', dog: 'dog' };

interface GuardEntry {
  guard: Guard;
  img: Phaser.GameObjects.Image;
  walked: number;
  last: { x: number; y: number };
  lastT: number;
  moving: boolean;
  /** Tiles per second over the last drawn frame (the dog runs above DOG_RUN). */
  speed: number;
  downAt: number | null;
  carrierLast?: { x: number; y: number };
  koAt: number | null;
  onBack: boolean;
  wokeAt: number | null;
  barkAt: number | null;
}

/** Rendered guards: idle, walk, run, death (shot), knockout (struck from behind) and
 *  dragged, in 8 directions; the officer the same in his own atlas; the dog its own set
 *  (dogFrameName). */
export class GuardSprites {
  private entries: GuardEntry[] = [];
  /** Takedowns from sim events by guard index, waiting for that guard's next draw. */
  private takedowns = new Map<number, number>();
  /** Barks by dog index, waiting for its next draw. */
  private barks = new Map<number, number>();

  /** Sim events that start one-shots. `t` is the sim time. */
  onEvents(events: readonly SimEvent[], t: number): void {
    for (const ev of events) {
      if (ev.type === 'takedown' || ev.type === 'tripped') this.takedowns.set(ev.guard, t);
      else if (ev.type === 'woke') this.wakes.set(ev.guard, t);
      else if (ev.type === 'bark') this.barks.set(ev.guard, t);
    }
  }
  /** Guards who woke up, waiting for their next draw. */
  private wakes = new Map<number, number>();
  private metas: Partial<Record<GuardRole, UnitMeta>> = {};

  static preload(scene: Phaser.Scene): void {
    for (const art of Object.values(GUARD_ART)) {
      scene.load.multiatlas(art, `units/${art}.json`, 'units/');
      scene.load.json(`${art}_meta`, `units/${art}.json`);
    }
  }

  /** `tint` is the unit night grade. */
  constructor(
    private scene: Phaser.Scene,
    private tint: number,
  ) {
    for (const [role, art] of Object.entries(GUARD_ART) as [GuardRole, string][]) {
      const raw = scene.cache.json.get(`${art}_meta`) as { meta: { unit: UnitMeta } } | undefined;
      if (raw) this.metas[role] = raw.meta.unit;
    }
  }

  get ready(): boolean {
    return !!this.metas.guard && !!this.metas.officer && !!this.metas.dog;
  }

  private meta(g: Guard): UnitMeta {
    return this.metas[g.role]!;
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
    const woke = this.wakes.get(g.i);
    if (woke !== undefined) {
      // he gets up from where he lay: the next knockout starts fresh
      Object.assign(e, { wokeAt: woke, downAt: null, koAt: null, onBack: false });
      this.wakes.delete(g.i);
    }
    const moved = Math.hypot(g.x - e.last.x, g.y - e.last.y);
    e.last = { x: g.x, y: g.y };
    // paused: keep the pose; otherwise moving means he moved since the last frame
    if (t !== e.lastT) {
      e.moving = moved > 1e-5 && moved < 1;
      e.speed = e.moving ? moved / (t - e.lastT) : 0;
    }
    e.lastT = t;
    if (e.moving) e.walked += moved;
    const down = g.state === 'down';
    if (down && e.downAt === null) e.downAt = t;
    const bark = this.barks.get(g.i);
    if (bark !== undefined) {
      e.barkAt = bark;
      this.barks.delete(g.i);
    }
    const frame = g.role === 'dog'
      ? dogFrameName(
        {
          ang: g.ang,
          down,
          downAt: e.downAt,
          moving: e.moving,
          running: e.speed > DOG_RUN,
          walked: e.walked,
          t,
          alert: !!g.seeing,
          barkAt: e.barkAt,
          sniffing: g.distract > 0,
        },
        this.meta(g).anims,
      )
      : guardFrameName(
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
        wokeAt: e.wokeAt,
      },
      this.meta(g).anims,
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
    const anims = this.meta(g).anims;
    // the dog has no dragged pose: it lies on its side, pulled by the harness, legs away
    const frame = g.role === 'dog'
      ? `death_d${dirOf(Math.atan2(dy, dx) + Math.PI / 2)}_f${(anims['death'] ?? 1) - 1}`
      : draggedFrameName(Math.atan2(-dy, -dx), e.walked, anims);
    const p = toScreen(grip.x, grip.y);
    // sort by the middle of the body, half a body length beyond the grip
    const mid = { x: grip.x + (dx / len) * 0.5, y: grip.y + (dy / len) * 0.5 };
    e.img.setFrame(frame).setPosition(p.x, p.y).setDepth(depthOf(mid.x, mid.y, 2));
  }

  private entry(g: Guard, t: number): GuardEntry {
    let e = this.entries[g.i];
    const fresh = {
      guard: g, walked: 0, last: { x: g.x, y: g.y }, lastT: t, moving: false, speed: 0, downAt: null,
      carrierLast: undefined, koAt: null, onBack: false, wokeAt: null, barkAt: null,
    };
    if (e && e.guard !== g) {
      // new game: the same index may be another role on another map
      Object.assign(e, fresh);
      e.img.setTexture(GUARD_ART[g.role], 'idle_d0_f0');
    }
    if (!e) {
      const m = this.meta(g);
      const img = this.scene.add
        .image(0, 0, GUARD_ART[g.role], 'idle_d0_f0')
        .setOrigin(m.anchor[0] / m.frame[0], m.anchor[1] / m.frame[1])
        .setScale(1 / m.supersample)
        .setTint(this.tint);
      e = { ...fresh, img };
      this.entries[g.i] = e;
    }
    return e;
  }
}
