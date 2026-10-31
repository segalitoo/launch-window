// The mission briefing (Phase 6): shown once over the paused game before the first move.
// A (default): a map case, the painted map with the targets marked beside the orders, the squad
// and the controls. C (?brief=C): the same card without the map. The facts come from the game
// state (timer, launchers, squad and their kit), so the text never drifts from the rules.

import type { GameState } from '@/sim';
import { toScreen } from '@/render/iso';
import type { MinimapSource } from './minimap';

export type BriefingLook = 'A' | 'C';

const ROLES: Record<string, { role: string; does: string }> = {
  shadow: { role: 'Shadow', does: 'Knife takedowns from behind, ties guards up, drags bodies out of sight.' },
  lure: { role: 'Lure', does: 'Throws decoys and smoke, scouts routes with binoculars, wears a captured uniform.' },
  sapper: { role: 'Sapper', does: 'Opens doors, cuts fences and the power, sets tripwires, rigs the launchers.' },
};

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The briefing's text content, from the state (pure, tested). */
export function briefingOf(s: GameState): { time: string; targets: number; squad: { id: string; name: string; color: string; role: string; does: string }[] } {
  return {
    time: clock(s.timeLeft),
    targets: s.launchers.length,
    squad: s.squad.map((u) => ({ id: u.id, name: u.name, color: u.color, ...(ROLES[u.id] ?? { role: '', does: '' }) })),
  };
}

export class Briefing {
  readonly el: HTMLElement;
  private drawn = false;

  constructor(
    parent: HTMLElement,
    s: GameState,
    readonly look: BriefingLook,
    private readonly source: MinimapSource,
    onStart: () => void,
  ) {
    const b = briefingOf(s);
    const touch = matchMedia('(pointer: coarse)').matches;
    this.el = document.createElement('div');
    this.el.className = 'briefing';
    this.el.dataset.look = look;
    this.el.innerHTML = `<div class="bf-case">
      ${look === 'A' ? '<div class="bf-map"><canvas></canvas></div>' : ''}
      <div class="bf-text">
        <h1>Operation Night Lantern</h1>
        <p class="bf-orders">Rig all ${b.targets} missile launchers before the launch countdown ends, then bring the whole squad back to the landing zone. <b>${b.time}</b> on the clock. An alarm makes it run twice as fast. Lose one operator and the mission fails.</p>
        <ul class="bf-squad">${b.squad
          .map(
            (u) =>
              `<li style="--who:${u.color}"><img src="/portraits/${u.id}.jpg" alt=""><span><b>${esc(u.name)}</b> · ${esc(u.role)}<br>${esc(u.does)}</span></li>`,
          )
          .join('')}</ul>
        <p class="bf-controls">${
          touch
            ? 'Tap an operator card, then tap the map to move. Tap a guard to attack. Tools are on the rucksack, orders beside it. Drag to pan, pinch to zoom, tap the small map to jump.'
            : 'Click a card or press 1 2 3 to pick an operator; click the map to move, a guard to attack. Every order and tool shows its key. Drag to pan, scroll to zoom, click the small map to jump. Space pauses.'
        }</p>
        <button type="button" class="bf-start">Start the mission</button>
      </div>
    </div>`;
    parent.appendChild(this.el);
    const start = this.el.querySelector<HTMLButtonElement>('.bf-start')!;
    const go = (): void => {
      removeEventListener('keydown', key);
      this.el.remove();
      onStart();
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    };
    start.addEventListener('click', go);
    addEventListener('keydown', key);
    start.focus({ preventScroll: true });
  }

  /** Paints the map once the paintings are graded (called every frame until it has). */
  update(s: GameState): void {
    if (this.drawn || this.look !== 'A' || !this.source.minimapReady()) return;
    const cv = this.el.querySelector<HTMLCanvasElement>('.bf-map canvas');
    if (!cv || !cv.clientWidth) return;
    const r = this.source.mapRect();
    cv.width = Math.round(cv.clientWidth * devicePixelRatio);
    cv.height = Math.round((cv.width * r.h) / r.w);
    const ctx = cv.getContext('2d')!;
    ctx.filter = 'brightness(1.45) contrast(1.08)';
    this.source.drawMinimapGround(ctx, r);
    ctx.filter = 'none';
    const k = cv.width / r.w;
    const dpr = cv.width / cv.clientWidth;
    const at = (x: number, y: number): [number, number] => {
      const p = toScreen(x, y);
      return [(p.x - r.x) * k, (p.y - r.y) * k];
    };
    const label = (text: string, x: number, y: number, color: string): void => {
      ctx.font = `700 ${11 * dpr}px "Barlow Condensed", sans-serif`;
      const w = ctx.measureText(text).width + 8 * dpr;
      ctx.fillStyle = 'rgba(20, 21, 15, 0.85)';
      ctx.fillRect(x - w / 2, y, w, 15 * dpr);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 7.5 * dpr);
    };
    // landing zone
    const lz = s.lz;
    const [lx, ly] = at((lz.x0 + lz.x1 + 1) / 2, (lz.y0 + lz.y1 + 1) / 2);
    ctx.strokeStyle = '#8ef0d0';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.ellipse(lx, ly, 16 * dpr, 8 * dpr, 0, 0, Math.PI * 2);
    ctx.stroke();
    label('LZ', lx, ly + 10 * dpr, '#8ef0d0');
    // launchers, numbered
    s.launchers.forEach((l, i) => {
      const [x, y] = at(l.x + l.w / 2, l.y + l.h / 2);
      const d = 7 * dpr;
      ctx.fillStyle = '#e0a43a';
      ctx.strokeStyle = '#15160f';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      label(`TEL-${i + 1}`, x, y + 10 * dpr, '#f0c46a');
    });
    // the generator: cutting it kills the lights and searchlights
    const gen = s.generator;
    const [gx, gy] = at(gen.x + gen.w / 2, gen.y + gen.h / 2);
    label('POWER', gx, gy - 7 * dpr, '#cdbf94');
    this.drawn = true;
  }
}
