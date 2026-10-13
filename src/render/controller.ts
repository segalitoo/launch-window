// Player intent: selection, throw mode, pause, and turning taps and keys into
// sim commands. Ported from handleTap() and the key handler in the prototype.
// The view owns this state; it changes the sim only through sim commands.

import {
  clearOrder,
  dropBody,
  type Game,
  type Guard,
  type InteractTarget,
  objectAt,
  orderGrab,
  orderInteract,
  orderMove,
  orderTakedown,
  throwDecoy,
  tileOf,
  toggleCrawl,
  type Unit,
} from '@/sim';

export interface TapHit {
  unit: number | null; // squad index
  guard: Guard | null; // standing guard
  body: Guard | null; // downed guard
  object: InteractTarget | null; // door, generator or launcher block under the pointer
}

export class Controller {
  selected = 0;
  throwMode = false;
  paused = false;

  constructor(public game: Game) {}

  get sel(): Unit {
    return this.game.state.squad[this.selected]!;
  }

  select(i: number): void {
    const u = this.game.state.squad[i];
    if (!u || !u.alive) return;
    if (this.selected !== i) this.throwMode = false;
    this.selected = i;
  }

  /** A tap on the map at tile-space point (x, y). */
  tap(x: number, y: number, hit: TapHit): void {
    const s = this.game.state;
    if (s.over) return;
    const sel = this.sel;
    if (this.throwMode && sel.id === 'lure' && sel.alive) {
      const r = throwDecoy(s, sel, x, y);
      if (r !== 'range') this.throwMode = false;
      return;
    }
    if (hit.unit !== null) {
      this.select(hit.unit);
      return;
    }
    if (!sel.alive) return;
    if (hit.guard) {
      orderTakedown(s, sel, hit.guard);
      return;
    }
    if (hit.body) {
      orderGrab(s, sel, hit.body);
      return;
    }
    const target = hit.object ?? objectAt(s, tileOf(x), tileOf(y));
    if (target) {
      orderInteract(s, sel, target);
      return;
    }
    orderMove(s, sel, x, y);
  }

  /** Returns true when the key was used. */
  key(k: string): boolean {
    const s = this.game.state;
    if (k === 'r' && s.over) return true; // handled by the scene (restart)
    if (s.over) return false;
    if (k >= '1' && k <= '3') this.select(Number(k) - 1);
    else if (k === 'c') toggleCrawl(this.sel);
    else if (k === 'x') dropBody(this.sel);
    else if (k === 't' || k === 'q') {
      const i = s.squad.findIndex((u) => u.id === 'lure');
      if (this.selected !== i) this.select(i);
      if (this.sel.alive && this.sel.charges > 0) this.throwMode = !this.throwMode;
    } else if (k === ' ') this.paused = !this.paused;
    else if (k === 'escape') this.throwMode = false;
    else if (k === 's') clearOrder(this.sel);
    else return false;
    return true;
  }
}
