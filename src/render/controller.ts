// Player intent: selection, throw mode, pause, and turning taps and keys into
// sim commands. Ported from handleTap() and the key handler in the prototype.
// The view owns this state; it changes the sim only through sim commands.

import {
  clearOrder,
  dropBody,
  fireGun,
  type Game,
  type Guard,
  type InteractTarget,
  objectAt,
  orderGrab,
  orderInteract,
  orderMove,
  orderTakedown,
  orderTie,
  orderBinoculars,
  orderUniform,
  throwDecoy,
  throwSmoke,
  toggleSilencer,
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

/** A tool waiting for its target tap: Noa's decoy, smoke or binoculars, Yoav's tie, or
 *  anyone's gun. */
export type ToolMode = 'throw' | 'smoke' | 'bino' | 'tie' | 'fire' | null;

export class Controller {
  selected = 0;
  mode: ToolMode = null;
  paused = false;

  get throwMode(): boolean {
    return this.mode === 'throw';
  }
  set throwMode(v: boolean) {
    if (v) this.mode = 'throw';
    else if (this.mode === 'throw') this.mode = null;
  }

  constructor(public game: Game) {}

  get sel(): Unit {
    return this.game.state.squad[this.selected]!;
  }

  select(i: number): void {
    const u = this.game.state.squad[i];
    if (!u || !u.alive) return;
    if (this.selected !== i) this.mode = null;
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
    if (this.mode === 'smoke' && sel.id === 'lure' && sel.alive) {
      const r = throwSmoke(s, sel, x, y);
      if (r !== 'range') this.mode = null;
      return;
    }
    if (this.mode === 'bino' && sel.id === 'lure' && sel.alive) {
      if (hit.guard) orderBinoculars(s, sel, hit.guard);
      this.mode = null;
      return;
    }
    if (this.mode === 'tie' && sel.id === 'shadow' && sel.alive) {
      // the next tap picks the body; anywhere else cancels
      if (hit.body) orderTie(s, sel, hit.body);
      this.mode = null;
      return;
    }
    if (this.mode === 'fire' && sel.alive) {
      if (!hit.guard) {
        this.mode = null;
        return;
      }
      const r = fireGun(s, sel, hit.guard);
      if (r !== 'range' && r !== 'blocked') this.mode = null; // out of reach: pick another
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

  /** Selects operator `id` and toggles a tool mode for him. */
  private pick(id: Unit['id'], want: ToolMode): void {
    const i = this.game.state.squad.findIndex((u) => u.id === id);
    if (this.selected !== i) this.select(i);
    if (!this.sel.alive) return;
    if (want === 'smoke' && this.sel.smokes <= 0) return;
    this.mode = this.mode === want ? null : want;
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
    } else if (k === 'g') {
      // Yoav's tie: select him and wait for the body tap
      this.pick('shadow', 'tie');
    } else if (k === 'v' || k === 'b') {
      this.pick('lure', k === 'v' ? 'smoke' : 'bino');
    } else if (k === 'u') {
      const i = s.squad.findIndex((u) => u.id === 'lure');
      if (this.selected !== i) this.select(i);
      orderUniform(s, this.sel);
    } else if (k === 'f') {
      // the selected operator's gun
      if (this.sel.alive) this.mode = this.mode === 'fire' ? null : 'fire';
    } else if (k === 'h') toggleSilencer(s, this.sel); else if (k === ' ') this.paused = !this.paused;
    else if (k === 'escape') this.mode = null;
    else if (k === 's') clearOrder(this.sel);
    else return false;
    return true;
  }
}
