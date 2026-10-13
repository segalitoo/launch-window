// The sim's public face: a game that advances in fixed steps and hands out events.

import { FIXED_DT } from './constants';
import { buildMission } from './map';
import { step } from './step';
import type { GameState, SimEvent } from './types';

const MAX_STEPS_PER_ADVANCE = 5;

export class Game {
  state: GameState;
  private acc = 0;

  constructor(seed = 1) {
    this.state = buildMission(seed);
  }

  /** Runs exactly one fixed step. */
  tick(): void {
    step(this.state, FIXED_DT);
  }

  /** Runs `seconds` of game time in fixed steps. For tests and scripts. */
  run(seconds: number): void {
    const n = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < n && !this.state.over; i++) this.tick();
  }

  /** Runs fixed steps until `done` returns true or `maxSeconds` pass. Returns whether `done` was met. */
  runUntil(done: (s: GameState) => boolean, maxSeconds: number): boolean {
    const n = Math.round(maxSeconds / FIXED_DT);
    for (let i = 0; i < n; i++) {
      if (done(this.state)) return true;
      if (this.state.over) return false;
      this.tick();
    }
    return done(this.state);
  }

  /** Feeds real frame time. Leftover time carries to the next call.
   *  A long frame (tab in the background) is capped, like the prototype's 50 ms cap. */
  advance(realDt: number): void {
    this.acc += realDt;
    let n = 0;
    while (this.acc >= FIXED_DT && n < MAX_STEPS_PER_ADVANCE) {
      this.tick();
      this.acc -= FIXED_DT;
      n++;
    }
    if (n === MAX_STEPS_PER_ADVANCE) this.acc = 0;
  }

  /** Returns and clears the events since the last call. */
  drainEvents(): SimEvent[] {
    const e = this.state.events;
    this.state.events = [];
    return e;
  }
}
