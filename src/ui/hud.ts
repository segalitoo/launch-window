// DOM HUD over the canvas. Phase 6 layout (Ran: landscape on phones, split edges): the status
// line and pause along the top, the squad rail down the left edge, the selected operator's
// backpack and the orders down the right edge, the map clear in the middle. A phone held
// upright gets a "turn your phone" screen and the game pauses. Portraits, the minimap and the
// final art come next in Phase 6.

import type { GameState, SimEvent, Unit, UnitId } from '@/sim';
import type { Controller } from '@/render/controller';
import { packOf } from './backpack';
import { squadOf } from './squad';
import { ORDER_ICONS } from './kitIcons';
import { PlayLog } from './playlog';

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const END_TEXT = {
  win: 'Launch aborted. Mission complete.',
  launch: 'Missiles launched. Mission failed.',
  down: 'Operator down. Mission failed.',
  spotted: 'Spotted. An alarm fails this test.',
} as const;
/** Test maps (Phase 3): reach the exit, no alarm. */
const TEST_END_TEXT = { ...END_TEXT, win: 'Through, no alarm. Test passed.', launch: 'Out of time. Test failed.' } as const;

/** Touch bar, the orders every operator has: [id, key it presses, label]. Each operator's own
 *  tools are in the backpack above it (src/ui/backpack.ts). */
const BAR: readonly (readonly [string, string, string])[] = [
  ['crawl', 'c', 'Crawl'],
  ['fire', 'f', 'Fire'],
  ['silencer', 'h', 'Silent'],
  ['drop', 'x', 'Drop'],
  ['stop', 's', 'Stop'],
];

/** Phones only, held upright: the game asks to turn the phone and pauses. */
const PORTRAIT = '(pointer: coarse) and (orientation: portrait)';

export class Hud {
  private status: HTMLElement;
  private toasts: HTMLElement;
  private end: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private pack: HTMLElement;
  /** Whose backpack is shown, and its item buttons by id. */
  private packOwner: UnitId | null = null;
  private packButtons = new Map<string, { b: HTMLButtonElement; count: HTMLElement }>();
  private last = '';

  /** `press` sends a key to the scene, the same path as the keyboard. */
  constructor(root: HTMLElement, press: (key: string) => void, test?: { name: string; brief: string; who: string }) {
    const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hud" data-look="kit">
        <div class="top">
          <div class="status" id="status"></div>
          <button type="button" class="pause" aria-label="Pause (Space)">Pause</button>
        </div>
        <nav class="squad" aria-label="Squad"></nav>
        ${test ? `<div class="brief"><b>Test · ${esc(test.who)}: ${esc(test.name)}.</b> ${esc(test.brief)} Reach the exit, no alarm. <a href="tests.html">All tests</a></div>` : ''}
        <div class="toasts" id="toasts" aria-live="polite"></div>
        <p class="hint">Tap a unit to select (1 2 3). Tap the map to move. Tap a guard: Yoav takes him down.
        <span class="keys">C crawl · F fire · H silencer · X drop body · S stop · Space pause · tools in the backpack below, with their keys · Itai: tap the fence to cut it · drag to pan, scroll or pinch to zoom.</span>
        <span class="touch-keys">Drag to pan, pinch to zoom.</span></p>
        <div class="right">
          <nav class="pack" aria-label="Backpack"></nav>
          <nav class="bar" aria-label="Orders">${BAR.map(([id, , label]) => `<button type="button" data-id="${id}">${ORDER_ICONS[id] ?? ''}<span class="label">${label}</span></button>`).join('')}</nav>
        </div>
        <div class="rotate" role="alert"><div><b>Turn your phone sideways</b>Launch Window plays in landscape. The game is paused.</div></div>
        <div class="end" id="end" hidden>
          <button type="button" class="restart"></button>
          <div class="log-actions">
            <button type="button" class="copy-one">Copy play log</button>
            <button type="button" class="copy-all"></button>
          </div>
        </div>
      </div>`,
    );
    this.status = root.querySelector('#status')!;
    this.toasts = root.querySelector('#toasts')!;
    this.end = root.querySelector('#end')!;
    this.restart = this.end.querySelector('.restart')!;
    this.restart.addEventListener('click', () => press('r'));
    this.log = new PlayLog(test?.name ?? 'Operation Night Lantern');
    const copy = (btn: HTMLButtonElement, text: () => string): void => {
      btn.addEventListener('click', () => {
        const label = btn.textContent;
        navigator.clipboard
          .writeText(text())
          .then(() => (btn.textContent = 'Copied'))
          .catch(() => (btn.textContent = 'Copy failed'))
          .finally(() => setTimeout(() => (btn.textContent = label), 1500));
      });
    };
    copy(this.end.querySelector('.copy-one')!, () => this.log.last ?? '');
    this.copyAll = this.end.querySelector('.copy-all')!;
    copy(this.copyAll, () => PlayLog.all().join('\n\n'));
    this.pack = root.querySelector('.pack')!;
    this.press = press;
    for (const [id, key] of BAR) {
      const b = root.querySelector<HTMLButtonElement>(`.bar [data-id="${id}"]`)!;
      // pointerdown, not click: no 300 ms wait, and the canvas never sees the tap
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        press(key);
      });
      this.buttons.set(id, b);
    }
    this.pauseBtn = root.querySelector('.top .pause')!;
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      press(' ');
    });
    this.squad = root.querySelector('.squad')!;
    // held upright: pause, and resume on turning back only if this paused it
    const portrait = matchMedia(PORTRAIT);
    const turn = (): void => {
      if (portrait.matches && !this.paused) {
        press(' ');
        this.pausedForPortrait = true;
      } else if (!portrait.matches && this.pausedForPortrait) {
        if (this.paused) press(' ');
        this.pausedForPortrait = false;
      }
    };
    portrait.addEventListener('change', turn);
    this.checkPortrait = turn;
  }

  private pauseBtn: HTMLButtonElement;
  private squad: HTMLElement;
  private squadButtons = new Map<string, { b: HTMLButtonElement; hp: HTMLElement }>();
  private paused = false;
  private pausedForPortrait = false;
  /** Runs once the first frame has told the HUD whether the game is paused. */
  private checkPortrait: (() => void) | null;

  /** One card per operator; built once, its state updated every frame. */
  private buildSquad(s: GameState, sel: UnitId): void {
    const cards = squadOf(s, sel);
    this.squad.innerHTML = cards
      .map(
        (c) => `<button type="button" class="card" data-id="${c.id}" style="--who:${c.color}" title="${c.name} (${c.key})">
          <span class="key">${c.key}</span><span class="name">${c.name}</span><span class="hp"></span></button>`,
      )
      .join('');
    for (const c of cards) {
      const b = this.squad.querySelector<HTMLButtonElement>(`[data-id="${c.id}"]`)!;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.press(c.key);
      });
      this.squadButtons.set(c.id, { b, hp: b.querySelector('.hp')! });
    }
  }

  private press: (key: string) => void;
  private restart: HTMLButtonElement;
  private copyAll: HTMLButtonElement;
  private log: PlayLog;

  /** Builds the backpack of the selected operator (on selection). Its state updates every frame. */
  private buildPack(sel: Unit, c: Controller): void {
    this.packOwner = sel.id;
    this.packButtons.clear();
    const items = packOf(sel, { mode: c.mode });
    // the operator's own rucksack, the tools strapped on its front (Phase 6, Ran)
    this.pack.style.setProperty('--who', sel.color);
    this.pack.style.setProperty('--pack', `url(/kit/pack_${sel.id}.png)`);
    this.pack.dataset.who = sel.id;
    this.pack.dataset.n = String(items.length);
    this.pack.innerHTML = `<span class="who">${sel.name}</span>${items
      .map(
        (i) => `<button type="button" class="item" data-id="${i.id}" title="${i.label} (${i.key.toUpperCase()})" aria-label="${i.label}">
          <img src="/kit/${i.id}.png" alt="" draggable="false"><span class="label">${i.label}</span><span class="key">${i.key.toUpperCase()}</span><span class="count"></span></button>`,
      )
      .join('')}`;
    for (const i of items) {
      const b = this.pack.querySelector<HTMLButtonElement>(`[data-id="${i.id}"]`)!;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.press(i.key);
      });
      this.packButtons.set(i.id, { b, count: b.querySelector('.count')! });
    }
  }

  onEvents(events: SimEvent[], s: GameState): void {
    this.log.onEvents(events, s);
    for (const e of events) {
      if (e.type === 'message') this.toast(e.msg, e.kind);
      else if (e.type === 'noise') this.toast(e.heard ? `${e.heard} guard${e.heard > 1 ? 's' : ''} heard it` : 'Nobody heard it', '');
    }
  }

  onFrame(s: GameState, c: Controller): void {
    this.log.onFrame(s);
    const sel = c.sel;
    const rigged = s.launchers.filter((l) => l.done).length;
    const parts = [
      s.aborted ? 'LAUNCH ABORTED' : `T-${fmt(s.timeLeft)}`,
      s.alarm.active ? 'ALARM ×2' : 'quiet',
      s.goal === 'exit' ? 'goal: everyone to the exit' : `launchers ${rigged}/${s.launchers.length}`,
      `power ${s.generator.on ? 'on' : 'cut'}`,
      `${sel.name}${sel.crawl ? ' (crawl)' : ''}${sel.carrying ? ' (dragging)' : ''}${sel.disguised ? ' · in uniform' : ''}${sel.remote ? ' · charge planted' : ''} · ${sel.silenced ? 'silenced' : 'LOUD'}`,
      c.throwMode ? 'THROW: tap a spot' : '',
      c.mode === 'tie' ? 'TIE: tap a body' : '',
      c.mode === 'fire' ? `FIRE${sel.silenced ? '' : ' (LOUD)'}: tap a guard` : '',
      c.mode === 'smoke' ? 'SMOKE: tap a spot' : '',
      c.mode === 'bino' ? 'BINOCULARS: tap a guard' : '',
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
    on('fire', c.mode === 'fire');
    on('silencer', sel.silenced);
    // the backpack: rebuilt on a new selection, its counts and states every frame
    if (sel.id !== this.packOwner) this.buildPack(sel, c);
    for (const i of packOf(sel, { mode: c.mode })) {
      const p = this.packButtons.get(i.id);
      if (!p) continue;
      p.b.disabled = i.disabled || !sel.alive;
      // used up (count 0) goes dark; unavailable for now (no charge planted yet) is only dimmed
      p.b.classList.toggle('spent', i.count === 0);
      p.b.classList.toggle('on', i.on);
      const n = i.count === null ? '' : String(i.count);
      if (p.count.textContent !== n) p.count.textContent = n;
    }
    this.paused = c.paused;
    if (this.checkPortrait) {
      this.checkPortrait();
      this.checkPortrait = null;
    }
    this.pauseBtn.classList.toggle('on', c.paused);
    this.pauseBtn.textContent = c.paused ? 'Resume' : 'Pause';
    if (this.squadButtons.size !== s.squad.length) this.buildSquad(s, sel.id);
    for (const card of squadOf(s, sel.id)) {
      const q = this.squadButtons.get(card.id);
      if (!q) continue;
      q.b.classList.toggle('on', card.selected);
      q.b.classList.toggle('down', !card.alive);
      const hp = '●'.repeat(Math.max(0, card.hp)) + '○'.repeat(Math.max(0, card.maxHp - card.hp));
      if (q.hp.textContent !== hp) q.hp.textContent = hp;
    }
    this.buttons.get('drop')!.disabled = !sel.carrying;
    const over = s.over;
    if (this.end.hidden === !over) return;
    this.end.hidden = !over;
    if (over) {
      this.restart.textContent = `${(s.goal === 'exit' ? TEST_END_TEXT : END_TEXT)[over]}  Tap or press R to restart.`;
      this.copyAll.textContent = `Copy all runs (${PlayLog.all().length})`;
    }
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
