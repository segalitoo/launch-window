// The minimap (Phase 6, Ran: the painted map, shrunk): the ground as the player sees it, copied
// once from the graded paintings, with flat marks on top (art rule 6): the squad in their
// colours, guards, the launchers, and the camera's view. Tap or drag on it to move the camera.
// Three looks to compare in the game (?mm=A|B|C, docs/ui-language.md).

import type { GameState, UnitId } from '@/sim';
import { toScreen } from '@/render/iso';

export type MinimapLook = 'A' | 'B' | 'C';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the minimap needs from the map scene (src/render/MapScene.ts). */
export interface MinimapSource {
  minimapReady(): boolean;
  mapRect(): Rect;
  /** The map's four ground corners (world px): back, right, front, left. */
  mapCorners(): { x: number; y: number }[];
  drawMinimapGround(ctx: CanvasRenderingContext2D, r: Rect): void;
  viewRect(): Rect;
  jumpTo(x: number, y: number): void;
}

export interface Mark {
  kind: 'squad' | 'guard' | 'alert' | 'target' | 'done';
  /** tile coordinates */
  x: number;
  y: number;
  color?: string;
  selected?: boolean;
}

/** The marks for one frame. Guards who are down are left off; a guard hunting the squad
 *  (searching, in combat) is an alert. */
export function minimapMarks(s: GameState, sel: UnitId): Mark[] {
  const out: Mark[] = [];
  for (const l of s.launchers) out.push({ kind: l.done ? 'done' : 'target', x: l.x + l.w / 2, y: l.y + l.h / 2 });
  for (const g of s.guards) {
    if (g.state === 'down') continue;
    out.push({ kind: g.state === 'search' || g.state === 'combat' ? 'alert' : 'guard', x: g.x, y: g.y });
  }
  for (const u of s.squad) {
    if (!u.alive) continue;
    out.push({ kind: 'squad', x: u.x, y: u.y, color: u.color, selected: u.id === sel });
  }
  return out;
}

const GUARD = '#d8cfae';
const ALERT = '#ff5148';
const TARGET = '#e0a43a';
const DONE = '#7d7a6a';

export class Minimap {
  readonly el: HTMLElement;
  private readonly ground: HTMLCanvasElement;
  private readonly marks: HTMLCanvasElement;
  private baked = false;
  private rect: Rect | null = null;
  /** C: the map is folded away until the player opens it. */
  private open: boolean;

  constructor(
    parent: HTMLElement,
    readonly look: MinimapLook,
    private readonly source: MinimapSource,
    /** C only: opening the map pauses the game, closing it resumes. */
    private readonly onOpen: (open: boolean) => void,
  ) {
    this.open = look !== 'C';
    this.el = document.createElement('div');
    this.el.className = 'mm';
    this.el.dataset.look = look;
    this.el.innerHTML = `<div class="mm-frame"><canvas class="mm-ground"></canvas><canvas class="mm-marks"></canvas></div>`;
    this.ground = this.el.querySelector('.mm-ground')!;
    this.marks = this.el.querySelector('.mm-marks')!;
    parent.appendChild(this.el);
    const frame = this.el.querySelector<HTMLElement>('.mm-frame')!;
    frame.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      frame.setPointerCapture(e.pointerId);
      this.jump(e);
    });
    frame.addEventListener('pointermove', (e) => {
      if (e.buttons && this.look !== 'C') this.jump(e);
    });
    if (look === 'C') {
      this.el.hidden = true;
      frame.addEventListener('pointerup', () => this.setOpen(false));
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (this.look !== 'C' || open === this.open) return;
    this.open = open;
    this.el.hidden = !open;
    this.onOpen(open);
  }

  /** Called every frame. */
  update(s: GameState, sel: UnitId): void {
    if (!this.open || !this.source.minimapReady()) return;
    if (!this.baked || this.sizeChanged()) this.bake();
    const r = this.rect!;
    const ctx = this.marks.getContext('2d')!;
    const k = this.marks.width / r.w;
    const px = (x: number, y: number): [number, number] => {
      const p = toScreen(x, y);
      return [(p.x - r.x) * k, (p.y - r.y) * k];
    };
    // marks are sized for a corner map about 150 px wide and grow on a big one (C)
    const dpr = (this.marks.width / Math.max(1, this.marks.clientWidth)) * Math.min(2.5, Math.max(1, this.marks.clientWidth / 150));
    ctx.clearRect(0, 0, this.marks.width, this.marks.height);
    // the camera's view
    const v = this.source.viewRect();
    ctx.strokeStyle = 'rgba(232, 226, 205, 0.85)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect((v.x - r.x) * k, (v.y - r.y) * k, v.w * k, v.h * k);
    for (const m of minimapMarks(s, sel)) {
      const [x, y] = px(m.x, m.y);
      if (m.kind === 'target' || m.kind === 'done') {
        const d = 3.5 * dpr;
        ctx.fillStyle = m.kind === 'target' ? TARGET : DONE;
        ctx.strokeStyle = '#15160f';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, y - d);
        ctx.lineTo(x + d, y);
        ctx.lineTo(x, y + d);
        ctx.lineTo(x - d, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (m.kind === 'squad') {
        ctx.fillStyle = m.color!;
        ctx.strokeStyle = '#0b0c08';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, (m.selected ? 3.2 : 2.4) * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (m.selected) {
          ctx.strokeStyle = m.color!;
          ctx.beginPath();
          ctx.arc(x, y, 5.5 * dpr, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = m.kind === 'alert' ? ALERT : GUARD;
        ctx.beginPath();
        ctx.arc(x, y, 1.7 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private sizeChanged(): boolean {
    const w = Math.round(this.ground.clientWidth * devicePixelRatio);
    return w > 0 && w !== this.ground.width;
  }

  /** Copies the graded ground once (and again when the minimap changes size). */
  private bake(): void {
    const r = this.source.mapRect();
    this.rect = r;
    const w = Math.max(1, Math.round(this.ground.clientWidth * devicePixelRatio));
    const h = Math.round((w * r.h) / r.w);
    for (const c of [this.ground, this.marks]) {
      c.width = w;
      c.height = h;
    }
    if (this.look === 'A') {
      // clip to the map's diamond: its four ground corners, as % of the rectangle
      const s = this.source.mapCorners();
      const pct = s.map((p) => `${(((p.x - r.x) / r.w) * 100).toFixed(2)}% ${(((p.y - r.y) / r.h) * 100).toFixed(2)}%`);
      this.el.querySelector<HTMLElement>('.mm-frame')!.style.clipPath = `polygon(${pct.join(', ')})`;
    }
    const ctx = this.ground.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    // brighter than the scene: a map is for reading, and at this size the night grade hid the base
    ctx.filter = 'brightness(1.45) contrast(1.08)';
    this.source.drawMinimapGround(ctx, r);
    ctx.filter = 'none';
    this.baked = true;
  }

  private jump(e: PointerEvent): void {
    const r = this.rect;
    if (!r) return;
    const b = this.marks.getBoundingClientRect();
    this.source.jumpTo(r.x + ((e.clientX - b.left) / b.width) * r.w, r.y + ((e.clientY - b.top) / b.height) * r.h);
  }
}
