// Flat isometric placeholder view of the sim. Reads sim state every frame and
// sends commands through the Controller. Never writes sim state itself.

import Phaser from 'phaser';
import {
  BINO_TIME,
  type MissionMap,
  CAM_FOV,
  CAM_LEN,
  castRay,
  DOG_SMELL,
  coneLength,
  FOV,
  Game,
  type GameState,
  type Guard,
  hidden,
  type InteractTarget,
  NEAR_FRACTION,
  gunRange,
  type SimEvent,
  sightRay,
  SMOKE_RADIUS,
  SMOKE_TIME,
  UNIFORM_TIME,
  tileAt,
  type TileCode,
  TIE_DUR,
  TOWER_FOV,
  TOWER_LEN,
  type Unit,
  type Vec,
  WAKE_TIME,
} from '@/sim';
import { Controller, type TapHit } from './controller';
import { depthOf, footprint, mapBounds, type Point, toScreen, toTile } from './iso';
import { blockOccluder, insideConvex, isHidden, type Occluder } from './occlusion';
import { lampLevel } from './lamps';
import { PaintedArea, toTintHex } from './paintedArea';
import { GuardSprites, UnitSprites } from './unitSprites';
import {
  ALARM_COLOR,
  BLOCKS,
  CONE_COLOR,
  GROUND,
  GUARD_COLOR,
  GUARD_DOWN_COLOR,
  hex,
  BEAM_COLOR,
  LZ_COLOR,
  shade,
  UNIT_LIFT,
  UNIT_RADIUS,
} from './placeholder';

const CONE_RAYS = 28;
const TAP_SLOP = 8; // px a pointer may move before a tap becomes a pan
const MAX_ZOOM = 2.5;
const OVERLAY_DEPTH = 1e9;
/** Tie marks and the tie bar: a pale rope colour, apart from the squad and alarm colours. */
const ROPE_COLOR = 0xd8c9a3;
/** How long a pistol tracer stays on screen, sim seconds. */
const TRACER_TIME = 0.15;
/** How long a blast's flash and ring stay on screen, sim seconds. */
const BLAST_FX = 0.6;
/** A bark: two arcs off the dog's head, sim seconds. */
const BARK_FX = 0.5;
/** Gate cameras: the cone shares the guards' amber; the body sits on the wall top. */
const CAM_BODY = 0x2a2c2e;
const CAM_HEIGHT = 30;
/** Night grade for units, lighter than the environment's (visual language 6b). */
const UNIT_GRADE = [0.62, 0.68, 0.82] as const;
const MAP_TOP_MARGIN = 80; // room for tall blocks on the back row
const PAINTED_AREAS = ['yard'];
/** A test map's exit zone: pale, apart from the green landing zone and the amber threats. */
const EXIT_COLOR = 0xece4d3;

/** Placeholder colours get the same night tint as the painted art (docs/visual-language.md, 6). */
const NIGHT = [0.36, 0.43, 0.6] as const;
const night = (c: number): number =>
  (Math.round(((c >> 16) & 0xff) * NIGHT[0]) << 16) |
  (Math.round(((c >> 8) & 0xff) * NIGHT[1]) << 8) |
  Math.round((c & 0xff) * NIGHT[2]);

// Phaser's types ask for Vector2[], but fillPoints and strokePoints only read x and y.
const poly = (p: readonly Point[]): Phaser.Math.Vector2[] => p as unknown as Phaser.Math.Vector2[];

export interface SceneHooks {
  onEvents(events: SimEvent[], s: GameState, c: Controller): void;
  onFrame(s: GameState, c: Controller): void;
}

interface Gesture {
  type: 'tap' | 'pan' | 'pinch';
  x0: number;
  y0: number;
  sx0: number;
  sy0: number;
  d0: number;
  z0: number;
  mid: Point; // world point under the pinch midpoint
}

export class MapScene extends Phaser.Scene {
  game$!: Game;
  ctl!: Controller;
  private hooks: SceneHooks;
  private ground!: Phaser.GameObjects.Graphics;
  private blocks: Phaser.GameObjects.Graphics[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  /** Hiding spots (Phase 3 placeholder until the Phase 4 map art): over the painting, under the units. */
  private hideGfx!: Phaser.GameObjects.Graphics;
  /** Pistol shots on screen: a short tracer, sim time. */
  private tracers: { x0: number; y0: number; x1: number; y1: number; t: number; loud: boolean }[] = [];
  /** Blasts on screen: a flash and a ring, sim time. */
  private blasts: { x: number; y: number; t: number }[] = [];
  private barks: { guard: number; t: number }[] = [];
  /** Smoke clouds: above the units and the art, under the overlay. */
  private smokeGfx!: Phaser.GameObjects.Graphics;
  /** Searchlight light: added over the art (and the units in it), under the overlay. */
  private beams!: Phaser.GameObjects.Graphics;
  private bodies = new Map<object, Phaser.GameObjects.Graphics>();
  private staticVersion = -1;
  private gesture: Gesture | null = null;
  private pointers = new Map<number, Point>();
  private minZoom = 0.3;
  /** Until the player pans or zooms, every resize refits the whole map. */
  private userMoved = false;
  private painted: PaintedArea[] = [];
  /** Sim time the generator went off (null = power on), for the lamps' stutter. */
  private powerCutAt: number | null = null;
  private occluders: Occluder[] = [];
  private unitArt!: UnitSprites;
  private guardArt!: GuardSprites;
  /** Soft contact shadows under rendered units, above the ground, below every structure. */
  private shadows!: Phaser.GameObjects.Graphics;

  /** A test map (Phase 3), or null for the mission. The painted art is the mission's only. */
  private map: MissionMap | null;
  private areas: readonly string[];

  constructor(hooks: SceneHooks, map: MissionMap | null = null) {
    super('map');
    this.hooks = hooks;
    this.map = map;
    this.areas = map ? [] : PAINTED_AREAS;
  }

  preload(): void {
    for (const name of this.areas) PaintedArea.preload(this, name);
    UnitSprites.preload(this);
    GuardSprites.preload(this);
  }

  create(): void {
    this.newGame();
    this.ground = this.add.graphics().setDepth(-OVERLAY_DEPTH);
    const { cols, rows } = this.game$.state.grid;
    this.painted = this.areas.map((name) => new PaintedArea(this, name, -OVERLAY_DEPTH + 1, cols, rows));
    this.overlay = this.add.graphics().setDepth(OVERLAY_DEPTH);
    this.beams = this.add.graphics().setDepth(OVERLAY_DEPTH - 2).setBlendMode(Phaser.BlendModes.ADD);
    this.unitArt = new UnitSprites(this, toTintHex(UNIT_GRADE), OVERLAY_DEPTH - 1);
    this.guardArt = new GuardSprites(this, toTintHex(UNIT_GRADE));
    this.shadows = this.add.graphics().setDepth(-OVERLAY_DEPTH + 2);
    this.hideGfx = this.add.graphics().setDepth(-OVERLAY_DEPTH + 1.8);
    this.smokeGfx = this.add.graphics().setDepth(OVERLAY_DEPTH - 3);
    this.input.addPointer(1);
    this.setupInput();
    this.scale.on('resize', () => this.fitCamera(!this.userMoved));
    this.fitCamera(true);
  }

  private newGame(): void {
    this.game$ = new Game(1, this.map ?? undefined);
    this.ctl = new Controller(this.game$);
    this.staticVersion = -1;
    this.powerCutAt = null;
    for (const g of this.bodies.values()) g.destroy();
    this.bodies.clear();
  }

  // ---------- camera ----------

  private fitCamera(center: boolean): void {
    const s = this.game$.state;
    const cam = this.cameras.main;
    const b = mapBounds(s.grid.cols, s.grid.rows, MAP_TOP_MARGIN);
    const fit = Math.min(cam.width / b.w, cam.height / b.h);
    this.minZoom = Math.max(0.15, fit * 0.9);
    // Pan limits: the map plus a margin, but never smaller than the widest
    // possible view, or Phaser clamps the scroll and the map sticks to an edge.
    const bw = Math.max(b.w * 1.5, cam.width / this.minZoom);
    const bh = Math.max(b.h * 1.5, cam.height / this.minZoom);
    cam.setBounds(b.x + b.w / 2 - bw / 2, b.y + b.h / 2 - bh / 2, bw, bh);
    if (center) {
      cam.setZoom(Math.max(this.minZoom, fit));
      cam.centerOn(b.x + b.w / 2, b.y + b.h / 2);
    } else cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.minZoom, MAX_ZOOM));
  }

  private zoomAt(z: number, sx: number, sy: number): void {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(Phaser.Math.Clamp(z, this.minZoom, MAX_ZOOM));
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  // ---------- input ----------

  private setupInput(): void {
    const cam = this.cameras.main;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointers.set(p.id, { x: p.x, y: p.y });
      if (p.rightButtonDown()) {
        this.ctl.mode = null;
        return;
      }
      if (this.pointers.size === 1) {
        this.gesture = { type: 'tap', x0: p.x, y0: p.y, sx0: cam.scrollX, sy0: cam.scrollY, d0: 0, z0: cam.zoom, mid: { x: 0, y: 0 } };
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [Point, Point];
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const w = cam.getWorldPoint(m.x, m.y);
        this.gesture = { type: 'pinch', x0: m.x, y0: m.y, sx0: 0, sy0: 0, d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.zoom, mid: { x: w.x, y: w.y } };
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.pointers.has(p.id)) return;
      this.pointers.set(p.id, { x: p.x, y: p.y });
      const g = this.gesture;
      if (!g) return;
      if (g.type === 'tap' && Math.hypot(p.x - g.x0, p.y - g.y0) > TAP_SLOP) g.type = 'pan';
      if (g.type !== 'tap') this.userMoved = true;
      if (g.type === 'pan') {
        cam.scrollX = g.sx0 - (p.x - g.x0) / cam.zoom;
        cam.scrollY = g.sy0 - (p.y - g.y0) / cam.zoom;
      } else if (g.type === 'pinch' && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [Point, Point];
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        cam.setZoom(Phaser.Math.Clamp((g.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.d0), this.minZoom, MAX_ZOOM));
        cam.preRender();
        const w = cam.getWorldPoint(m.x, m.y);
        cam.scrollX += g.mid.x - w.x;
        cam.scrollY += g.mid.y - w.y;
      }
    });
    const end = (p: Phaser.Input.Pointer, released: boolean): void => {
      const had = this.pointers.has(p.id);
      this.pointers.delete(p.id);
      const g = this.gesture;
      if (!g || !had) return;
      if (g.type === 'tap' && released) this.handleTap(p.x, p.y);
      if (this.pointers.size === 1) {
        const q = [...this.pointers.values()][0]!;
        this.gesture = { type: 'pan', x0: q.x, y0: q.y, sx0: cam.scrollX, sy0: cam.scrollY, d0: 0, z0: cam.zoom, mid: { x: 0, y: 0 } };
      } else if (!this.pointers.size) this.gesture = null;
    };
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => end(p, true));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => end(p, false));
    this.input.on('gameout', () => {
      this.pointers.clear();
      this.gesture = null;
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.userMoved = true;
      this.zoomAt(cam.zoom * Math.exp(-dy * 0.0015), p.x, p.y);
    });
    this.input.mouse?.disableContextMenu();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.press(e.key.toLowerCase()) && e.key === ' ') e.preventDefault();
    });
  }

  /** A key press from the keyboard or the touch bar. Returns true when it was used. */
  press(k: string): boolean {
    if (k === 'r' && this.game$.state.over) {
      this.newGame();
      return true;
    }
    return this.ctl.key(k);
  }

  /** Screen point of a unit marker (raised off the ground). */
  private markerOf(e: Vec, lift = UNIT_LIFT): Point {
    return toScreen(e.x, e.y, lift);
  }

  private handleTap(sx: number, sy: number): void {
    const cam = this.cameras.main;
    const w = cam.getWorldPoint(sx, sy);
    const s = this.game$.state;
    // hit radius in world px; grows when zoomed out so small targets stay tappable
    const r = Math.max(UNIT_RADIUS + 6, 18 / cam.zoom);
    const near = (e: Vec, lift: number): number => {
      const m = this.markerOf(e, lift);
      return Math.hypot(m.x - w.x, m.y - w.y);
    };
    const hit: TapHit = { unit: null, guard: null, body: null, object: null };
    let best = r;
    s.squad.forEach((u, i) => {
      if (!u.alive) return;
      const d = near(u, UNIT_LIFT);
      if (d < best) {
        best = d;
        hit.unit = i;
      }
    });
    if (hit.unit === null) {
      let bg = r;
      let bb = r;
      for (const g of s.guards) {
        if (g.carried) continue;
        const down = g.state === 'down';
        const d = near(g, down ? 2 : UNIT_LIFT);
        if (!down && d < bg) {
          bg = d;
          hit.guard = g;
        } else if (down && d < bb) {
          bb = d;
          hit.body = g;
        }
      }
      if (hit.guard) hit.body = null;
    }
    if (hit.unit === null && !hit.guard && !hit.body) hit.object = this.objectUnder(s, w.x, w.y);
    const t = toTile(w.x, w.y);
    this.ctl.tap(t.x, t.y, hit);
  }

  /** The front-most interactable whose raised block covers screen point (wx, wy).
   *  A click on a block's top face lands on a ground tile behind it, so tiles alone miss. */
  private objectUnder(s: GameState, wx: number, wy: number): InteractTarget | null {
    const cands: { t: InteractTarget; x: number; y: number; w: number; h: number; code: TileCode }[] = [];
    for (const d of s.doors) if (!d.open) cands.push({ t: { kind: 'door', o: d }, x: d.x, y: d.y, w: 1, h: 1, code: 'D' });
    const g = s.generator;
    cands.push({ t: { kind: 'generator', o: g }, x: g.x, y: g.y, w: g.w, h: g.h, code: 'G' });
    for (const l of s.launchers) cands.push({ t: { kind: 'launcher', o: l }, x: l.x, y: l.y, w: l.w, h: l.h, code: 'L' });
    let best: InteractTarget | null = null;
    let bestDepth = -Infinity;
    for (const c of cands) {
      const height = BLOCKS[c.code]?.height ?? 0;
      const [back, right, front, left] = footprint(c.x, c.y, c.w, c.h);
      const lift = (p: Point): Point => ({ x: p.x, y: p.y - height });
      // outline of the extruded box, clockwise on screen
      const hull = [lift(back), lift(right), right, front, left, lift(left)];
      const depth = c.x + c.w + c.y + c.h;
      if (insideConvex(hull, wx, wy) && depth > bestDepth) {
        best = c.t;
        bestDepth = depth;
      }
    }
    return best;
  }

  // ---------- frame ----------

  override update(_time: number, delta: number): void {
    const s0 = this.game$.state;
    if (!this.ctl.paused && !s0.over) this.game$.advance(Math.min(delta, 100) / 1000);
    const s = this.game$.state;
    const events = this.game$.drainEvents();
    if (events.length) {
      this.unitArt.onEvents(events, s.t);
      this.guardArt.onEvents(events, s.t);
      this.hooks.onEvents(events, s, this.ctl);
      for (const e of events) {
        if (e.type === 'blast') this.blasts.push({ x: e.x, y: e.y, t: s.t });
        if (e.type === 'bark') this.barks.push({ guard: e.guard, t: s.t });
        if (e.type !== 'fired') continue;
        const u = s.squad.find((q) => q.id === e.unit)!;
        const g = s.guards[e.guard]!;
        this.tracers.push({ x0: u.x, y0: u.y, x1: g.x, y1: g.y, t: s.t, loud: e.loud });
      }
    }
    if (s.staticVersion !== this.staticVersion) this.drawStatic(s);
    this.drawDynamic(s);
    this.hooks.onFrame(s, this.ctl);
  }

  // ---------- static: ground and blocks ----------

  private drawStatic(s: GameState): void {
    this.staticVersion = s.staticVersion;
    this.drawHides(s);
    const g = this.ground.clear();
    const { cols, rows, deco } = s.grid;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const pair = GROUND[deco[y * cols + x]!] ?? GROUND[0]!;
        g.fillStyle(night(pair[(x + y) & 1]!), 1);
        g.fillPoints(poly(footprint(x, y)), true);
      }
    }
    // landing zone
    const z = this.game$.state.lz;
    const lz = footprint(z.x0, z.y0, z.x1 - z.x0 + 1, z.y1 - z.y0 + 1);
    g.fillStyle(LZ_COLOR, 0.12);
    g.fillPoints(poly(lz), true);
    g.lineStyle(2, LZ_COLOR, 0.8);
    g.strokePoints(poly(lz), true);
    // a test map's exit
    const e = this.game$.state.exit;
    if (e) {
      const ex = footprint(e.x0, e.y0, e.x1 - e.x0 + 1, e.y1 - e.y0 + 1);
      g.fillStyle(EXIT_COLOR, 0.16);
      g.fillPoints(poly(ex), true);
      g.lineStyle(2, EXIT_COLOR, 0.9);
      g.strokePoints(poly(ex), true);
    }

    for (const b of this.blocks) b.destroy();
    this.blocks = [];
    for (const p of this.painted) p.syncDoors((x, y) => s.doors.some((d) => d.x === x && d.y === y && d.open));
    this.occluders = this.painted.flatMap((p) => p.occluders);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const code = tileAt(s.grid, x, y);
        if (code === 'F') {
          this.blocks.push(this.drawFence(s, x, y));
          continue;
        }
        let style = BLOCKS[code];
        if (!style) continue;
        // the painting already shows this structure; its occluder sprite stands in for the block
        if (this.painted.some((p) => p.paintedTiles.has(`${x},${y}`) || p.coversTile(x, y))) continue;
        if (code === 'G' && !s.generator.on) style = { ...style, color: shade(style.color, 0.6) };
        if (code === 'L') {
          const l = s.launchers.find((l) => x >= l.x && x < l.x + l.w && y === l.y);
          if (l?.done) style = { ...style, color: 0x5d8a62 };
        }
        const gr = this.add.graphics();
        this.drawBlock(gr, x + style.inset, y + style.inset, 1 - 2 * style.inset, 1 - 2 * style.inset, style.height, night(style.color));
        gr.setDepth(depthOf(x + 0.5, y + 0.5, style.height));
        this.blocks.push(gr);
        this.occluders.push(blockOccluder(x, y, style.inset, style.height));
      }
    }
  }

  /** Chain-link fence (Phase 3): a see-through panel along the run, posts at the ends. No
   *  occluder: you see through it, and it only blocks walking until Itai cuts it. */
  private drawFence(s: GameState, x: number, y: number): Phaser.GameObjects.Graphics {
    const solid = (tx: number, ty: number): boolean => ['F', '#'].includes(tileAt(s.grid, tx, ty));
    const alongX = solid(x - 1, y) || solid(x + 1, y) || !(solid(x, y - 1) || solid(x, y + 1));
    const a = alongX ? { x, y: y + 0.5 } : { x: x + 0.5, y };
    const b = alongX ? { x: x + 1, y: y + 0.5 } : { x: x + 0.5, y: y + 1 };
    const H = 26;
    const g = this.add.graphics().setDepth(depthOf(x + 0.5, y + 0.5, 1));
    const p = (q: Vec, h: number): Point => toScreen(q.x, q.y, h);
    g.fillStyle(night(0x8a969a), 0.22);
    g.fillPoints(poly([p(a, 0), p(b, 0), p(b, H), p(a, H)]), true);
    // the mesh: two sets of diagonals, clipped to the panel
    g.lineStyle(1, night(0xaab4b8), 0.45);
    const at = (t: number, h: number): Point => p({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, h);
    for (let k = -1; k < 1; k += 0.25) {
      for (const up of [true, false]) {
        // along the line h = (t - k) H (up) or (k + 1 - t) H (down), kept inside 0..1
        const t0 = Math.max(0, k);
        const t1 = Math.min(1, k + 1);
        if (t1 <= t0) continue;
        const h = (t: number): number => (up ? t - k : k + 1 - t) * H;
        const q0 = at(t0, h(t0));
        const q1 = at(t1, h(t1));
        g.lineBetween(q0.x, q0.y, q1.x, q1.y);
      }
    }
    g.lineStyle(2, night(0x5a6266), 1);
    for (const q of [a, b]) {
      const lo = p(q, 0);
      const hi = p(q, H + 3);
      g.lineBetween(lo.x, lo.y, hi.x, hi.y);
    }
    g.lineStyle(1.5, night(0x6d777b), 1);
    const ta = p(a, H);
    const tb = p(b, H);
    g.lineBetween(ta.x, ta.y, tb.x, tb.y);
    return g;
  }

  private drawBlock(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, height: number, color: number): void {
    const [, right, front, left] = footprint(x, y, w, h);
    const top = footprint(x, y, w, h, height);
    // left face (south side, lit), right face (east side, shadow)
    g.fillStyle(shade(color, 0.78), 1);
    g.fillPoints(poly([left, front, top[2], top[3]]), true);
    g.fillStyle(shade(color, 0.58), 1);
    g.fillPoints(poly([front, right, top[1], top[2]]), true);
    g.fillStyle(color, 1);
    g.fillPoints(poly(top), true);
    g.lineStyle(1, shade(color, 1.15), 0.6);
    g.strokePoints(poly(top), true);
  }

  // ---------- dynamic: units, guards, cones ----------

  private bodyGfx(key: object): Phaser.GameObjects.Graphics {
    let g = this.bodies.get(key);
    if (!g) {
      g = this.add.graphics();
      this.bodies.set(key, g);
    }
    return g.clear();
  }

  private drawDynamic(s: GameState): void {
    // lamps run on the generator: on sim time, so a pause freezes the stutter
    if (s.generator.on) this.powerCutAt = null;
    else this.powerCutAt ??= s.t;
    const lamps = lampLevel(this.powerCutAt === null ? null : s.t - this.powerCutAt);
    for (const p of this.painted) p.setLamps(lamps);

    const o = this.overlay.clear();
    this.shadows.clear();
    const sel = this.ctl.sel;

    // searchlights: on the generator too, so they die with the lamps
    this.beams.clear();
    if (lamps > 0) {
      for (const t of s.towers) this.drawBeam(o, s, { x: t.x + 0.5, y: t.y + 0.5 }, t.ang, lamps, t.susp);
    }
    // gate cameras: on the generator, a short amber cone like a guard's
    for (const c of s.cameras) {
      const at = { x: c.x + 0.5, y: c.y + 0.5 };
      const color = s.alarm.active ? ALARM_COLOR : CONE_COLOR;
      if (lamps > 0) {
        this.drawCone(o, s, at, c.ang, CAM_FOV, CAM_LEN, null, color, (0.14 + c.susp * 0.3) * lamps);
        // two thin lines from the lens to the cone's edges: the cone hangs from the camera
        const lens = toScreen(at.x + Math.cos(c.ang) * 0.35, at.y + Math.sin(c.ang) * 0.35, CAM_HEIGHT + 2);
        o.lineStyle(1, color, 0.6 * lamps);
        for (const side of [-1, 1]) {
          const a = c.ang + (side * CAM_FOV) / 2;
          const d = sightRay(s, at.x, at.y, a, CAM_LEN);
          const e = toScreen(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
          o.lineBetween(lens.x, lens.y, e.x, e.y);
        }
      }
      this.drawCamera(o, at, c.ang, lamps > 0 && Math.sin(s.t * 5) > 0);
    }
    // guard cones; the dog smells all round instead
    for (const g of s.guards) {
      if (g.state === 'down') continue;
      if (g.role === 'dog') {
        if (g.distract <= 0) this.drawSmell(o, s, g, !!g.seeing);
        continue;
      }
      const color = s.alarm.active || g.state === 'combat' ? ALARM_COLOR : CONE_COLOR;
      const len = coneLength(s);
      this.drawCone(o, s, g, g.ang, FOV, len, len * NEAR_FRACTION, color, 0.2 + g.susp * 0.25);
    }
    // selected unit path and ring
    if (sel.alive) {
      const col = hex(sel.color);
      const art = this.unitArt.covers(sel);
      if (sel.path.length) {
        // with art the path lies on the ground, under the figure; the destination stays on top
        const g = art ? this.shadows : o;
        g.lineStyle(2, col, 0.7);
        const pts = [sel, ...sel.path].map((p) => toScreen(p.x, p.y));
        for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y);
        const end = pts.at(-1)!;
        o.lineStyle(2, col, 0.7);
        o.strokeEllipse(end.x, end.y, 14, 7);
      }
      const p = toScreen(sel.x, sel.y);
      o.lineStyle(2, col, 1);
      if (!art) o.strokeEllipse(p.x, p.y, 34, 17); // art units get their ring on the ground (drawArtUnit)
      if (sel.order?.type === 'takedown') {
        const gp = toScreen(sel.order.guard.x, sel.order.guard.y);
        o.strokeEllipse(gp.x, gp.y, 30, 15);
      }
      if (this.ctl.throwMode) {
        o.lineStyle(1.5, 0x8ef0d0, 0.7);
        o.strokeEllipse(p.x, p.y, 8 * 64, 8 * 32); // decoy range, 8 tiles
      }
    }
    // knocked-out guards: a ring that empties until he wakes; tied ones get a rope mark
    for (const g of s.guards) {
      if (g.state !== 'down' || g.dead || g.carried) continue;
      const p = toScreen(g.x, g.y, 6);
      if (g.tied) {
        o.lineStyle(2, ROPE_COLOR, 0.95);
        o.lineBetween(p.x - 4, p.y - 3, p.x + 4, p.y + 3);
        o.lineBetween(p.x - 4, p.y + 3, p.x + 4, p.y - 3);
      } else if (g.ko > 0) {
        const k = g.ko / WAKE_TIME;
        o.fillStyle(0x000000, 0.55);
        o.fillCircle(p.x, p.y, 6);
        o.lineStyle(2, k < 0.25 ? ALARM_COLOR : CONE_COLOR, 1);
        o.beginPath();
        o.arc(p.x, p.y, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false);
        o.strokePath();
      }
    }
    // tool modes: the gun's reach (red when the shot will be loud), the bodies Yoav can tie
    if (this.ctl.mode === 'fire' && sel.alive) {
      const p = toScreen(sel.x, sel.y);
      const r = gunRange(sel);
      o.lineStyle(1.5, sel.silenced ? 0xd8e4f0 : ALARM_COLOR, 0.75);
      o.strokeEllipse(p.x, p.y, r * 2 * 32 * Math.SQRT2, r * 2 * 16 * Math.SQRT2);
    }
    if (this.ctl.mode === 'smoke' && sel.alive) {
      const p = toScreen(sel.x, sel.y);
      o.lineStyle(1.5, 0xc8ccd0, 0.7);
      o.strokeEllipse(p.x, p.y, 8 * 64, 8 * 32); // throw range, 8 tiles like the decoy
    }
    // routes Noa has seen through the binoculars
    for (const g of s.guards) {
      if (!g.revealed || g.state === 'down') continue;
      this.drawRoute(o, g);
    }
    if (this.ctl.mode === 'tie') {
      o.lineStyle(1.5, ROPE_COLOR, 0.9);
      for (const g of s.guards) {
        if (g.state !== 'down' || g.dead || g.tied || g.carried) continue;
        const p = toScreen(g.x, g.y);
        o.strokeEllipse(p.x, p.y, 30, 15);
      }
    }
    // pistol tracers
    this.tracers = this.tracers.filter((tr) => s.t - tr.t < TRACER_TIME);
    for (const tr of this.tracers) {
      const a = toScreen(tr.x0, tr.y0, 12);
      const b = toScreen(tr.x1, tr.y1, 10);
      const k = 1 - (s.t - tr.t) / TRACER_TIME;
      o.lineStyle(tr.loud ? 2.5 : 1.5, 0xfff2b0, k);
      o.lineBetween(a.x, a.y, b.x, b.y);
      if (tr.loud) {
        // a muzzle flash: a loud shot should look loud
        o.fillStyle(0xffd27a, k);
        o.fillCircle(a.x, a.y, 4);
      }
    }
    this.drawSmoke(s);
    // Itai's tripwires and planted charge: for the player's eyes only
    o.lineStyle(1.5, ROPE_COLOR, 0.9);
    for (const w of s.wires) {
      const l = toScreen(w.x + 0.15, w.y + 0.5, 3);
      const r = toScreen(w.x + 0.85, w.y + 0.5, 3);
      o.lineBetween(l.x, l.y, r.x, r.y);
      o.fillStyle(ROPE_COLOR, 1);
      o.fillCircle(l.x, l.y, 1.5);
      o.fillCircle(r.x, r.y, 1.5);
    }
    const itai = s.squad.find((u) => u.id === 'sapper');
    if (itai?.remote) {
      const c = toScreen(itai.remote.x, itai.remote.y, 2);
      o.fillStyle(0x30302a, 1);
      o.fillRect(c.x - 4, c.y - 3, 8, 5);
      o.fillStyle(ALARM_COLOR, Math.sin(s.t * 8) > 0 ? 1 : 0.25); // a blinking light
      o.fillCircle(c.x + 2, c.y - 3, 1.5);
    }
    // barks: two arcs off the dog's head, in the alarm colour
    this.barks = this.barks.filter((b) => s.t - b.t < BARK_FX);
    for (const b of this.barks) {
      const g = s.guards[b.guard];
      if (!g) continue;
      const k = (s.t - b.t) / BARK_FX;
      const c = toScreen(g.x + Math.cos(g.ang) * 0.35, g.y + Math.sin(g.ang) * 0.35, 18);
      o.lineStyle(2, ALARM_COLOR, 1 - k);
      for (const r of [5 + 10 * k, 10 + 14 * k]) {
        o.beginPath();
        o.arc(c.x, c.y, r, -Math.PI * 0.85, -Math.PI * 0.15, false);
        o.strokePath();
      }
    }
    // blasts: a flash and a ring that widens and fades
    this.blasts = this.blasts.filter((b) => s.t - b.t < BLAST_FX);
    for (const b of this.blasts) {
      const k = (s.t - b.t) / BLAST_FX;
      const c = toScreen(b.x, b.y);
      o.fillStyle(0xffe2a0, Math.max(0, 0.9 - k * 3));
      o.fillEllipse(c.x, c.y - 10, 70 * (0.4 + k), 46 * (0.4 + k));
      o.lineStyle(3, 0xffc070, 1 - k);
      o.strokeEllipse(c.x, c.y, 160 * k + 20, 80 * k + 10);
    }
    // interaction progress
    for (const u of s.squad) {
      const bar = (k: number, col: number): void => {
        const m = this.markerOf(u, UNIT_LIFT + 18);
        o.fillStyle(0x000000, 0.6);
        o.fillRect(m.x - 14, m.y - 3, 28, 6);
        o.fillStyle(col, 1);
        o.fillRect(m.x - 13, m.y - 2, 26 * Math.min(1, k), 4);
      };
      if (u.order?.type === 'tie' && u.order.started) bar(u.order.t / TIE_DUR, ROPE_COLOR);
      if (u.order?.type === 'binoculars') bar(u.order.t / BINO_TIME, CONE_COLOR);
      if (u.order?.type === 'uniform') bar(u.order.t / UNIFORM_TIME, 0x8ef0d0);
      if (u.order?.type === 'shoot' && !u.order.loud) bar(u.order.t / u.order.dur, 0xd8e4f0);
      if (u.order?.type === 'interact' && u.order.started) {
        const m = this.markerOf(u, UNIT_LIFT + 18);
        o.fillStyle(0x000000, 0.6);
        o.fillRect(m.x - 14, m.y - 3, 28, 6);
        o.fillStyle(0x7fdc95, 1);
        o.fillRect(m.x - 13, m.y - 2, 26 * (u.order.t / u.order.dur), 4);
      }
    }
    // decoys in flight
    for (const pr of s.projectiles) {
      const k = pr.t / pr.dur;
      const x = pr.x0 + (pr.x1 - pr.x0) * k;
      const y = pr.y0 + (pr.y1 - pr.y0) * k;
      const m = toScreen(x, y, Math.sin(k * Math.PI) * 40);
      o.fillStyle(0x8ef0d0, 1);
      o.fillCircle(m.x, m.y, 4);
    }

    for (const g of s.guards) this.drawGuard(g, s.t, s.squad.find((u) => u.carrying === g));
    s.squad.forEach((u) => this.drawUnit(u, u === sel, s.t));
  }

  /** A guard's route as Noa saw it: patrols get their path with waypoint dots, posts the arc
   *  they sweep (or a full circle when they spin). */
  private drawRoute(o: Phaser.GameObjects.Graphics, g: Guard): void {
    o.lineStyle(1.5, CONE_COLOR, 0.8);
    if (g.kind === 'patrol') {
      const pts = g.route.map((p) => toScreen(p.x, p.y));
      for (let i = 1; i < pts.length; i++) this.dashed(o, pts[i - 1]!, pts[i]!);
      if (g.loop && pts.length > 2) this.dashed(o, pts.at(-1)!, pts[0]!);
      o.fillStyle(CONE_COLOR, 0.9);
      for (const p of pts) o.fillCircle(p.x, p.y, 2.5);
    } else if (g.post) {
      const c = toScreen(g.post.x, g.post.y);
      const r = 2.2;
      const span = g.spin ? Math.PI * 2 : Math.max(g.sweep * 2, 0.3);
      const steps = 24;
      for (let i = 0; i <= steps; i += 2) {
        const a0 = g.face - span / 2 + (span * i) / steps;
        const a1 = g.face - span / 2 + (span * Math.min(steps, i + 1)) / steps;
        const p0 = toScreen(g.post.x + Math.cos(a0) * r, g.post.y + Math.sin(a0) * r);
        const p1 = toScreen(g.post.x + Math.cos(a1) * r, g.post.y + Math.sin(a1) * r);
        o.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
      o.fillStyle(CONE_COLOR, 0.9);
      o.fillCircle(c.x, c.y, 2.5);
    }
  }

  private dashed(o: Phaser.GameObjects.Graphics, a: Point, b: Point): void {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.floor(len / 8));
    for (let i = 0; i < n; i += 2) {
      const k0 = i / n;
      const k1 = Math.min(1, (i + 1) / n);
      o.lineBetween(a.x + (b.x - a.x) * k0, a.y + (b.y - a.y) * k0, a.x + (b.x - a.x) * k1, a.y + (b.y - a.y) * k1);
    }
  }

  /** Smoke clouds: soft grey puffs that drift and thin out at the end. Visual only; the sim
   *  decides what the cloud blocks (SMOKE_RADIUS). */
  private drawSmoke(s: GameState): void {
    const g = this.smokeGfx.clear();
    for (const c of s.smokes) {
      const age = SMOKE_TIME - c.left;
      const fade = Math.min(1, age / 0.6) * Math.min(1, c.left / 2);
      for (let i = 0; i < 9; i++) {
        // puffs on a fixed pattern per cloud, slowly drifting
        const a = i * 2.4 + c.x * 1.7;
        const r = (i % 3) * 0.55 + 0.35;
        const x = c.x + Math.cos(a + age * 0.15) * r * (SMOKE_RADIUS / 2);
        const y = c.y + Math.sin(a + age * 0.15) * r * (SMOKE_RADIUS / 2);
        const p = toScreen(x, y, 14 + (i % 4) * 6);
        g.fillStyle(0x8a9298, 0.32 * fade);
        g.fillEllipse(p.x, p.y, 58, 40);
        g.fillStyle(0xb4bbc0, 0.18 * fade);
        g.fillEllipse(p.x - 4, p.y - 5, 34, 22);
      }
    }
  }

  /** A searchlight: light, not a flat shape. Haze near the tower, a bright pool where it
   *  hits the ground, a brighter core down the middle; clipped by walls like a cone. A thin
   *  edge on the overlay keeps the area it sees exact (art rule 6). */
  private drawBeam(o: Phaser.GameObjects.Graphics, s: GameState, at: Vec, ang: number, level: number, susp: number): void {
    const rays: number[] = [];
    const dirs: number[] = [];
    for (let i = 0; i <= CONE_RAYS; i++) {
      const a = ang - TOWER_FOV / 2 + (TOWER_FOV * i) / CONE_RAYS;
      dirs.push(a);
      rays.push(sightRay(s, at.x, at.y, a, TOWER_LEN));
    }
    const pt = (a: number, d: number): Point => toScreen(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
    // brightness at a point: along the beam, faint haze rising to the pool near the far end
    // and easing off at the very end; across it, a brighter core. Set per corner, so the
    // GPU blends it smoothly between them (no bands).
    const along = (r: number): number => {
      const k = r / TOWER_LEN;
      const pool = Math.exp(-(((k - 0.8) / 0.22) ** 2));
      return 0.13 + 0.34 * pool;
    };
    const across = (i: number): number => 0.45 + 0.55 * Math.sin((Math.PI * i) / CONE_RAYS);
    const amp = level * (1 + susp);
    const BANDS = 16;
    const g = this.beams;
    for (let i = 0; i < CONE_RAYS; i++) {
      for (let b = 0; b < BANDS; b++) {
        const r0 = (b / BANDS) * TOWER_LEN;
        const r1 = ((b + 1) / BANDS) * TOWER_LEN;
        if (rays[i]! <= r0 && rays[i + 1]! <= r0) continue;
        // corners: ray i and i+1, at the band's near and far radius, cut by walls
        const c = [
          [i, Math.min(rays[i]!, r0)],
          [i + 1, Math.min(rays[i + 1]!, r0)],
          [i, Math.min(rays[i]!, r1)],
          [i + 1, Math.min(rays[i + 1]!, r1)],
        ] as const;
        const p = c.map(([j, r]) => pt(dirs[j]!, r));
        const al = c.map(([j, r]) => along(r) * across(j) * amp);
        g.fillGradientStyle(BEAM_COLOR, BEAM_COLOR, BEAM_COLOR, BEAM_COLOR, al[0], al[1], al[2], al[2]);
        g.fillTriangle(p[0]!.x, p[0]!.y, p[1]!.x, p[1]!.y, p[2]!.x, p[2]!.y);
        g.fillGradientStyle(BEAM_COLOR, BEAM_COLOR, BEAM_COLOR, BEAM_COLOR, al[1], al[3], al[2], al[2]);
        g.fillTriangle(p[1]!.x, p[1]!.y, p[3]!.x, p[3]!.y, p[2]!.x, p[2]!.y);
      }
    }
    const edge = [pt(ang, 0), ...dirs.map((a, i) => pt(a, rays[i]!))];
    o.lineStyle(1, BEAM_COLOR, (0.45 + susp * 0.4) * level);
    o.strokePoints(poly(edge), true);
  }

  /** The dog's nose: everything within DOG_SMELL that walls do not hide, all round. Dashed,
   *  so it reads apart from a sight cone; brighter while it smells someone. */
  private drawSmell(o: Phaser.GameObjects.Graphics, s: GameState, g: Guard, alert: boolean): void {
    const n = 48;
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const d = castRay(s.grid, g.x, g.y, a, DOG_SMELL);
      pts.push(toScreen(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d));
    }
    const color = s.alarm.active || alert ? ALARM_COLOR : CONE_COLOR;
    o.fillStyle(color, alert ? 0.22 : 0.1);
    o.fillPoints(poly(pts), true);
    o.lineStyle(1.5, color, 0.85);
    for (let i = 0; i < n; i += 2) o.lineBetween(pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y);
  }

  /** A camera on the wall top: a dark box looking along `ang`, a red light while it records. */
  private drawCamera(o: Phaser.GameObjects.Graphics, at: Vec, ang: number, led: boolean): void {
    const base = toScreen(at.x, at.y, CAM_HEIGHT);
    const lens = toScreen(at.x + Math.cos(ang) * 0.35, at.y + Math.sin(ang) * 0.35, CAM_HEIGHT + 2);
    o.lineStyle(7, CAM_BODY, 1);
    o.lineBetween(base.x, base.y, lens.x, lens.y);
    o.lineStyle(1, 0x8a8e90, 1);
    o.lineBetween(base.x, base.y - 3, lens.x, lens.y - 3);
    o.fillStyle(CAM_BODY, 1);
    o.fillCircle(base.x, base.y + 2, 3);
    if (led) {
      o.fillStyle(ALARM_COLOR, 1);
      o.fillCircle(base.x, base.y - 1, 1.5);
    }
  }

  private drawCone(
    o: Phaser.GameObjects.Graphics,
    s: GameState,
    at: Vec,
    ang: number,
    fov: number,
    len: number,
    near: number | null,
    color: number,
    alpha: number,
  ): void {
    const far: Point[] = [toScreen(at.x, at.y)];
    const inner: Point[] = [toScreen(at.x, at.y)];
    for (let i = 0; i <= CONE_RAYS; i++) {
      const a = ang - fov / 2 + (fov * i) / CONE_RAYS;
      const d = sightRay(s, at.x, at.y, a, len);
      far.push(toScreen(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d));
      if (near !== null) {
        const dn = Math.min(d, near);
        inner.push(toScreen(at.x + Math.cos(a) * dn, at.y + Math.sin(a) * dn));
      }
    }
    o.fillStyle(color, alpha);
    o.fillPoints(poly(far), true);
    if (near !== null) {
      o.fillStyle(color, alpha + 0.12);
      o.fillPoints(poly(inner), true);
    }
    // a crisp edge keeps the cone readable on the dark night ground
    o.lineStyle(1.5, color, 0.85);
    o.strokePoints(poly(far), true);
  }

  private drawGuard(g: Guard, t: number, carrier?: Unit): void {
    const gr = this.bodyGfx(g);
    const p = toScreen(g.x, g.y);
    if (this.guardArt.ready) {
      if (g.state !== 'down') {
        this.shadows.fillStyle(0x000000, 0.22);
        this.shadows.fillEllipse(p.x + 1, p.y + 0.5, 22, 10);
        this.shadows.fillEllipse(p.x + 1, p.y + 0.5, 14, 6);
      }
      this.guardArt.draw(g, t, carrier);
      return;
    }
    if (g.state === 'down') {
      gr.fillStyle(0x000000, 0.3);
      gr.fillEllipse(p.x, p.y, 24, 12);
      gr.fillStyle(GUARD_DOWN_COLOR, 1);
      gr.fillEllipse(p.x, p.y - 2, 20, 9);
      gr.setDepth(depthOf(g.x, g.y, 1));
      return;
    }
    this.drawMarker(gr, g, GUARD_COLOR, 0x2f2420, false);
  }

  private drawUnit(u: Unit, selected: boolean, t: number): void {
    const gr = this.bodyGfx(u);
    const col = hex(u.color);
    if (this.unitArt.covers(u)) {
      this.drawArtUnit(u, selected, t, col);
      return;
    }
    if (!u.alive) {
      const p = toScreen(u.x, u.y);
      gr.fillStyle(0x333333, 1);
      gr.fillEllipse(p.x, p.y, 20, 9);
      gr.setDepth(depthOf(u.x, u.y, 1));
      return;
    }
    this.drawPlaceholderUnit(gr, u, col, selected);
    if (u.hitT > 0) {
      const m = this.markerOf(u);
      gr.lineStyle(3, ALARM_COLOR, Math.min(1, u.hitT * 3));
      gr.strokeCircle(m.x, m.y, UNIT_RADIUS + 5);
    }
  }

  /** Rendered art: a contact shadow, a ring at the feet, the figure, and a
   *  squad-colour silhouette when most of it is covered. */
  private drawArtUnit(u: Unit, selected: boolean, t: number, col: number): void {
    const p = toScreen(u.x, u.y);
    if (u.alive) {
      this.shadows.fillStyle(0x000000, 0.22);
      this.shadows.fillEllipse(p.x + 1, p.y + 0.5, 22, 10);
      this.shadows.fillStyle(0x000000, 0.22);
      this.shadows.fillEllipse(p.x + 1, p.y + 0.5, 14, 6);
      // the ring lies on the ground layer, so the figure always covers it (Ran: never on top of him)
      this.shadows.lineStyle(selected ? 1.5 : 1, col, selected ? 0.85 : 0.45);
      this.shadows.strokeEllipse(p.x, p.y + 1, 34, 17);
    }
    // silhouette only when most of him is covered: a low wall over the boots leaves him readable
    const depth = depthOf(u.x, u.y, u.crawl ? 2 : 13);
    const covered = this.unitArt.samples(u).filter((q) => isHidden([q], depth, this.occluders)).length;
    this.unitArt.draw(u, t, covered >= 2, col, hidden(this.game$.state, u));
  }

  /** Placeholder hiding spots: a dark patch with low scrub, over the painting. Phase 4 paints
   *  the real bushes and corners into the map art. */
  private drawHides(s: GameState): void {
    const g = this.hideGfx.clear();
    for (const h of s.hides) {
      for (let y = h.y0; y <= h.y1; y++) {
        for (let x = h.x0; x <= h.x1; x++) {
          g.fillStyle(0x05080a, 0.35);
          g.fillPoints(poly(footprint(x, y)), true);
          for (const [dx, dy, r] of [[0.3, 0.3, 7], [0.7, 0.4, 6], [0.45, 0.75, 8]] as const) {
            const p = toScreen(x + dx, y + dy);
            g.fillStyle(0x161f17, 0.9);
            g.fillEllipse(p.x, p.y - 2, r * 2, r * 1.3);
            g.fillStyle(0x26332a, 0.9);
            g.fillEllipse(p.x - 1, p.y - 4, r * 1.3, r * 0.8);
          }
        }
      }
    }
  }

  private drawPlaceholderUnit(gr: Phaser.GameObjects.Graphics, u: Unit, col: number, selected: boolean): void {
    this.drawMarker(gr, u, col, selected ? 0xffffff : 0x1e2a26, u.crawl);
    // never lose a unit: behind a structure it shows as an outline in its squad colour
    const lift = u.crawl ? 5 : UNIT_LIFT;
    const samples = [toScreen(u.x, u.y, 2), toScreen(u.x, u.y, lift), toScreen(u.x, u.y, lift + UNIT_RADIUS - 2)];
    if (isHidden(samples, depthOf(u.x, u.y, lift), this.occluders)) {
      const m = this.markerOf(u, lift);
      const p = toScreen(u.x, u.y);
      const o = this.overlay;
      o.lineStyle(2, col, 0.95);
      o.strokeCircle(m.x, m.y, UNIT_RADIUS);
      o.lineBetween(p.x, p.y, m.x, m.y + UNIT_RADIUS);
      o.strokeEllipse(p.x, p.y, 18, 9);
    }
  }

  /** A raised circle with a ground shadow and a facing tick. */
  private drawMarker(gr: Phaser.GameObjects.Graphics, e: Vec & { ang: number }, fill: number, rim: number, low: boolean): void {
    const lift = low ? 5 : UNIT_LIFT;
    const r = low ? UNIT_RADIUS - 1 : UNIT_RADIUS;
    const p = toScreen(e.x, e.y);
    const m = this.markerOf(e, lift);
    // shadow falls to the bottom right
    gr.fillStyle(0x000000, 0.3);
    gr.fillEllipse(p.x + 3, p.y + 1, r * 2.4, r * 1.2);
    if (!low) {
      gr.lineStyle(3, shade(fill, 0.55), 1);
      gr.lineBetween(p.x, p.y, m.x, m.y);
    }
    gr.fillStyle(fill, 1);
    gr.fillCircle(m.x, m.y, r);
    gr.lineStyle(1.5, rim, 1);
    gr.strokeCircle(m.x, m.y, r);
    // facing tick on the ground plane
    const f = toScreen(e.x + Math.cos(e.ang) * 0.42, e.y + Math.sin(e.ang) * 0.42, lift);
    gr.lineStyle(2.5, 0x111111, 1);
    gr.lineBetween(m.x, m.y, f.x, f.y);
    gr.setDepth(depthOf(e.x, e.y, lift));
  }
}
