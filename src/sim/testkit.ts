// Helpers for sim tests and scripted runs. Pure, no test runner imports.

import { Game } from './game';
import type { GameState, Guard, Unit, UnitId } from './types';

export class Script {
  readonly game: Game;
  readonly s: GameState;
  readonly log: string[] = [];

  constructor(seed = 1) {
    this.game = new Game(seed);
    this.s = this.game.state;
  }

  unit(id: UnitId): Unit {
    const u = this.s.squad.find((u) => u.id === id);
    if (!u) throw new Error(`no unit ${id}`);
    return u;
  }

  guard(i: number): Guard {
    const g = this.s.guards[i];
    if (!g) throw new Error(`no guard ${i}`);
    return g;
  }

  /** Puts a unit on a tile center. Test setup only. */
  place(id: UnitId, tx: number, ty: number): Unit {
    const u = this.unit(id);
    u.x = tx + 0.5;
    u.y = ty + 0.5;
    u.path = [];
    u.order = null;
    return u;
  }

  run(seconds: number): void {
    this.game.run(seconds);
    this.collect();
  }

  /** Steps until `done`. Throws with a readable reason when it times out. */
  until(label: string, done: (s: GameState) => boolean, maxSeconds: number): void {
    const ok = this.game.runUntil(done, maxSeconds);
    this.collect();
    if (!ok) throw new Error(`timed out: ${label} at t=${this.s.t.toFixed(2)}\n${this.log.slice(-8).join('\n')}`);
    this.log.push(`t=${this.s.t.toFixed(2)} ${label}`);
  }

  private collect(): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'message') this.log.push(`t=${this.s.t.toFixed(2)} ${e.kind || 'info'}: ${e.msg}`);
      else if (e.type !== 'moveOrdered') this.log.push(`t=${this.s.t.toFixed(2)} ${e.type} ${JSON.stringify(e)}`);
    }
  }
}

export const idle = (u: Unit): boolean => !u.path.length && !u.order && u.busy <= 0;
