// Ambience (Phase 6, Ran: the desert should feel alive): blowing sand and tumbleweed. Render
// only, never in the sim, and kept out of the base so nothing moving there can be mistaken for
// a guard. Off when the player asks the system for reduced motion.
import Phaser from 'phaser';
import { depthOf, toScreen, toTile } from './iso';

/** The wind blows toward sim +y: screen bottom-left. A tumbleweed rolling that way runs down
 *  the open west strip and past the landing zone, never into the base walls. */
const WIND = (() => {
  const d = toScreen(0, 1);
  const l = Math.hypot(d.x, d.y);
  return { x: d.x / l, y: d.y / l };
})();

// sand streaks
const STREAKS_PER_MPX = 70; // per million screen px of view, at zoom 1 (Ran: 220 was distracting)
const STREAK_MAX = 90;
const STREAK_COLOR = 0xc9d3e8;
const STREAK_ALPHA = 0.18;

// tumbleweed (tools/blender/render_tumbleweed.py): 12 frames, one full turn
export const TUMBLEWEED_KEY = 'tumbleweed';
export const TUMBLEWEED_FILE = 'fx/tumbleweed.png';
const TW_FRAME = 96; // px, rendered at 2x
const TW_FRAMES = 12;
const TW_ANCHOR_Y = 76 / 96; // the ground contact in the frame
const TW_SPEED = 1.3; // tiles a second
const TW_SCALE = 0.85; // Ran: 15% smaller than the 1 m render
const TW_TURN_TILES = 1.96 * TW_SCALE; // one turn: circumference over 1.6 m tiles
const TW_GAP: [number, number] = [18, 36]; // seconds between two
const TW_FIRST = 6; // seconds before the first one

interface Streak {
  x: number;
  y: number;
  speed: number;
  age: number;
  life: number;
  phase: number;
  strength: number;
  /** a few degrees off the wind, so the wisps are not all parallel */
  cos: number;
  sin: number;
  /** [length, gap after it, sideways offset] in px */
  dashes: [number, number, number][];
}

interface Weed {
  sprite: Phaser.GameObjects.Sprite;
  x: number; // tiles
  y: number;
  dist: number; // tiles rolled
  hop: number; // seconds into the current hop
  hopLen: number;
}

export class Ambience {
  private readonly streakGfx: Phaser.GameObjects.Graphics;
  private readonly shadowGfx: Phaser.GameObjects.Graphics;
  private readonly streaks: Streak[] = [];
  private readonly weeds: Weed[] = [];
  private next = TW_FIRST;
  private readonly off: boolean;

  /** `open(x, y)`: a tumbleweed may roll over this tile (outside the base, or off the map). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tint: number,
    private readonly open: (x: number, y: number) => boolean,
    private readonly rows: number,
  ) {
    this.off = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // over the ground paintings, under walls and units (they sort from 0 up): dust moves along
    // the ground. Not just above `groundDepth`: near -1e9 the renderer cannot tell 1.5 apart.
    this.streakGfx = scene.add.graphics().setDepth(-2);
    this.shadowGfx = scene.add.graphics().setDepth(-3);
  }

  static preload(scene: Phaser.Scene): void {
    scene.load.spritesheet(TUMBLEWEED_KEY, TUMBLEWEED_FILE, { frameWidth: TW_FRAME, frameHeight: TW_FRAME });
  }

  update(dt: number): void {
    if (this.off) return;
    const view = this.scene.cameras.main.worldView;
    this.updateStreaks(dt, view);
    this.updateWeeds(dt, view);
  }

  private updateStreaks(dt: number, view: Phaser.Geom.Rectangle): void {
    const zoom = this.scene.cameras.main.zoom;
    const want = Math.min(STREAK_MAX, Math.round(((view.width * view.height * zoom * zoom) / 1e6) * STREAKS_PER_MPX));
    while (this.streaks.length < want) this.streaks.push(this.spawnStreak(view, true));
    if (this.streaks.length > want) this.streaks.length = want;
    const g = this.streakGfx.clear();
    for (let i = 0; i < this.streaks.length; i++) {
      let s = this.streaks[i]!;
      s.age += dt;
      s.x += WIND.x * s.speed * dt;
      s.y += WIND.y * s.speed * dt;
      // a streak the camera left behind comes back mid-life, so panning never blanks the wind
      if (!view.contains(s.x, s.y)) s = this.streaks[i] = this.spawnStreak(view, true);
      else if (s.age >= s.life) s = this.streaks[i] = this.spawnStreak(view, false);
      // fades in and out over its life, and wavers a little across the wind
      const k = Math.sin((Math.PI * s.age) / s.life);
      const wave = Math.sin(s.phase + s.age * 3) * 1.5;
      const x0 = s.x - WIND.y * wave;
      const y0 = s.y + WIND.x * wave;
      // a wisp, not a line: broken dashes with small sideways offsets (long even lines read as rain)
      g.lineStyle(1 / zoom, STREAK_COLOR, STREAK_ALPHA * k * s.strength);
      let at = 0;
      const dx = WIND.x * s.cos - WIND.y * s.sin;
      const dy = WIND.y * s.cos + WIND.x * s.sin;
      for (const [dash, gap, side] of s.dashes) {
        const ox = -dy * side;
        const oy = dx * side;
        g.lineBetween(x0 - dx * at + ox, y0 - dy * at + oy, x0 - dx * (at + dash) + ox, y0 - dy * (at + dash) + oy);
        at += dash + gap;
      }
    }
  }

  /** `midLife`: start somewhere in its life (visible now) rather than fading in from nothing. */
  private spawnStreak(view: Phaser.Geom.Rectangle, midLife: boolean): Streak {
    const life = 1.4 + Math.random() * 1.8;
    return {
      x: view.x + Math.random() * view.width,
      y: view.y + Math.random() * view.height,
      speed: 70 + Math.random() * 90,
      age: midLife ? life * (0.2 + Math.random() * 0.6) : 0,
      life,
      phase: Math.random() * 6.3,
      strength: 0.4 + Math.random() * 0.6,
      ...(() => {
        const a = (Math.random() - 0.5) * 0.25;
        return { cos: Math.cos(a), sin: Math.sin(a) };
      })(),
      dashes: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => [
        3 + Math.random() * 9,
        2 + Math.random() * 6,
        (Math.random() - 0.5) * 3,
      ]),
    };
  }

  private updateWeeds(dt: number, view: Phaser.Geom.Rectangle): void {
    this.next -= dt;
    if (this.next <= 0) {
      this.next = TW_GAP[0] + Math.random() * (TW_GAP[1] - TW_GAP[0]);
      this.spawnWeed(view);
    }
    const sh = this.shadowGfx.clear();
    for (let i = this.weeds.length - 1; i >= 0; i--) {
      const w = this.weeds[i]!;
      const step = TW_SPEED * dt;
      w.y += step;
      w.dist += step;
      w.hop += dt;
      if (w.hop > w.hopLen) {
        w.hop = 0;
        w.hopLen = 0.5 + Math.random() * 1.2;
      }
      if (w.y > this.rows + 10) {
        w.sprite.destroy();
        this.weeds.splice(i, 1);
        continue;
      }
      // small bounces: the wind lifts it off the ground now and then
      const lift = Math.sin((Math.PI * w.hop) / w.hopLen) * (w.hopLen > 1 ? 9 : 4);
      const p = toScreen(w.x, w.y);
      const frame = Math.floor((w.dist / TW_TURN_TILES) * TW_FRAMES) % TW_FRAMES;
      w.sprite.setFrame(frame).setPosition(p.x, p.y - lift).setDepth(depthOf(w.x, w.y, 1));
      sh.fillStyle(0x0a0e18, 0.28 - lift * 0.015);
      sh.fillEllipse(p.x + 2, p.y + 1, (22 - lift * 0.6) * TW_SCALE, (8 - lift * 0.25) * TW_SCALE);
    }
  }

  /** A new tumbleweed upwind of a point the player is looking at, on a lane outside the base. */
  private spawnWeed(view: Phaser.Geom.Rectangle): void {
    const clear = (x: number, y0: number): boolean => {
      for (let y = y0; y < this.rows + 10; y += 0.5) if (!this.open(Math.floor(x), Math.floor(y))) return false;
      return true;
    };
    for (let tries = 0; tries < 24; tries++) {
      const t = toTile(view.x + Math.random() * view.width, view.y + Math.random() * view.height);
      // the last tries fall back to the edge of the map nearest the view (always open)
      const x = tries < 20 ? Math.floor(t.x) + 0.5 : -1.5 - (tries - 20);
      const y0 = t.y - 14;
      if (!clear(x, y0)) continue;
      const sprite = this.scene.add
        .sprite(0, 0, TUMBLEWEED_KEY, 0)
        .setOrigin(0.5, TW_ANCHOR_Y)
        .setScale(0.5 * TW_SCALE)
        .setTint(this.tint);
      this.weeds.push({ sprite, x, y: y0, dist: Math.random() * TW_TURN_TILES, hop: 0, hopLen: 0.8 });
      return;
    }
  }
}
