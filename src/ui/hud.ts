// Minimal DOM HUD over the canvas for the Phase 0 placeholder:
// a status line, toasts from sim events, a key hint, the touch bar and the end message.
// The real squad panel, inventory and minimap come in Phase 6.

import type { GameState, SimEvent } from '@/sim';
import type { Controller } from '@/render/controller';

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const END_TEXT = {
  win: 'Launch aborted. Mission complete.',
  launch: 'Missiles launched. Mission failed.',
  down: 'Operator down. Mission failed.',
} as const;

/** Touch bar buttons: label and the key they press. */
const BAR = [
  ['crawl', 'c', 'Crawl'],
  ['decoy', 't', 'Decoy'],
  ['tie', 'g', 'Tie'],
  ['pistol', 'f', 'Pistol'],
  ['drop', 'x', 'Drop'],
  ['stop', 's', 'Stop'],
  ['pause', ' ', 'Pause'],
] as const;

export class Hud {
  private status: HTMLElement;
  private toasts: HTMLElement;
  private end: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private last = '';

  /** `press` sends a key to the scene, the same path as the keyboard. */
  constructor(root: HTMLElement, press: (key: string) => void) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hud">
        <div class="status" id="status"></div>
        <div class="toasts" id="toasts" aria-live="polite"></div>
        <p class="hint">Tap a unit to select (1 2 3). Tap the map to move. Tap a guard: Yoav takes him down.
        <span class="keys">C crawl · T decoy · G tie · F pistol · X drop body · S stop · Space pause · drag to pan, scroll or pinch to zoom.</span>
        <span class="touch-keys">Drag to pan, pinch to zoom.</span></p>
        <nav class="bar" aria-label="Orders">${BAR.map(([id, , label]) => `<button type="button" data-id="${id}">${label}</button>`).join('')}</nav>
        <button type="button" class="end" id="end" hidden></button>
      </div>`,
    );
    this.status = root.querySelector('#status')!;
    this.toasts = root.querySelector('#toasts')!;
    this.end = root.querySelector('#end')!;
    this.end.addEventListener('click', () => press('r'));
    for (const [id, key] of BAR) {
      const b = root.querySelector<HTMLButtonElement>(`.bar [data-id="${id}"]`)!;
      // pointerdown, not click: no 300 ms wait, and the canvas never sees the tap
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        press(key);
      });
      this.buttons.set(id, b);
    }
  }

  onEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'message') this.toast(e.msg, e.kind);
      else if (e.type === 'noise') this.toast(e.heard ? `${e.heard} guard${e.heard > 1 ? 's' : ''} heard it` : 'Nobody heard it', '');
    }
  }

  onFrame(s: GameState, c: Controller): void {
    const sel = c.sel;
    const rigged = s.launchers.filter((l) => l.done).length;
    const parts = [
      s.aborted ? 'LAUNCH ABORTED' : `T-${fmt(s.timeLeft)}`,
      s.alarm.active ? 'ALARM ×2' : 'quiet',
      `launchers ${rigged}/3`,
      `power ${s.generator.on ? 'on' : 'cut'}`,
      `${sel.name}${sel.crawl ? ' (crawl)' : ''}${sel.carrying ? ' (dragging)' : ''}${sel.id === 'lure' ? ` · decoys ${sel.charges}` : ''}${sel.id === 'shadow' ? ` · rounds ${sel.rounds}` : ''}`,
      c.throwMode ? 'THROW: tap a spot' : '',
      c.mode === 'tie' ? 'TIE: tap a body' : '',
      c.mode === 'pistol' ? 'PISTOL: tap a guard' : '',
      c.paused ? 'PAUSED' : '',
    ].filter(Boolean);
    const text = parts.join('  ·  ');
    if (text !== this.last) {
      this.status.textContent = text;
      this.status.classList.toggle('alarm', s.alarm.active);
      this.last = text;
    }
    const on = (id: string, v: boolean): void => {
      this.buttons.get(id)!.classList.toggle('on', v);
    };
    on('crawl', sel.crawl);
    on('decoy', c.throwMode);
    on('tie', c.mode === 'tie');
    on('pistol', c.mode === 'pistol');
    const yoav = s.squad.find((u) => u.id === 'shadow')!;
    this.buttons.get('pistol')!.disabled = !yoav.alive || yoav.rounds <= 0;
    on('pause', c.paused);
    this.buttons.get('drop')!.disabled = !sel.carrying;
    const over = s.over;
    this.end.hidden = !over;
    if (over) this.end.textContent = `${END_TEXT[over]}  Tap or press R to restart.`;
  }

  private toast(msg: string, kind: string): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => el.remove(), 3400);
  }
}
