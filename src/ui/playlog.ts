// Play log (Phase 3, for the rebalance with Ran): what happened in a run, as plain text Ran
// copies from the end screen and sends. Time used, every alarm and where, near misses (a guard
// half-way to the alarm), takedowns and kills, and the tools used. The last runs are kept in
// this browser, so several can be copied at once.

import type { GameState, SimEvent, UnitId } from '@/sim';

const KEY = 'lw.playlog';
const KEEP = 10;
/** Suspicion a guard must reach to count as a near miss, and fall back under to count again. */
const NEAR = 0.5;
const CLEAR = 0.1;

const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const at = (x: number, y: number): string => `(${Math.floor(x)}, ${Math.floor(y)})`;

interface Kit {
  decoys: number;
  smokes: number;
  wires: number;
  charges: number;
}

export class PlayLog {
  private lines: string[] = [];
  private start: Partial<Record<UnitId, Kit>> = {};
  private flagged = new Set<number>();
  private seenBy = new Map<number, string>();
  private counts = { takedowns: 0, ties: 0, silenced: 0, loud: 0, tripped: 0, blasts: 0, binoculars: 0, uniform: 0 };
  private state: GameState | null = null;
  private written = false;

  constructor(private mapName: string) {}

  /** Call on a new game (first frame, or after a restart). */
  begin(s: GameState): void {
    this.state = s;
    this.lines = [];
    this.flagged.clear();
    this.written = false;
    this.last = null;
    for (const k of Object.keys(this.counts) as (keyof typeof this.counts)[]) this.counts[k] = 0;
    for (const u of s.squad) this.start[u.id] = this.kit(u);
  }

  onEvents(events: readonly SimEvent[], s: GameState): void {
    if (s !== this.state) this.begin(s);
    const t = fmt(s.t);
    for (const e of events) {
      switch (e.type) {
        case 'alarmRaised':
          if (e.first) this.lines.push(`${t} ALARM at ${at(e.x, e.y)}: ${e.reason}`);
          break;
        case 'takedown':
          this.counts.takedowns++;
          this.lines.push(`${t} takedown, guard ${e.guard + 1}`);
          break;
        case 'tied':
          this.counts.ties++;
          break;
        case 'fired':
          this.counts[e.loud ? 'loud' : 'silenced']++;
          this.lines.push(`${t} ${e.loud ? 'loud' : 'silenced'} shot, ${s.guards[e.guard]?.role ?? 'guard'} ${e.guard + 1}`);
          break;
        case 'tripped':
          this.counts.tripped++;
          this.lines.push(`${t} guard ${e.guard + 1} tripped a wire`);
          break;
        case 'blast':
          this.counts.blasts++;
          this.lines.push(`${t} charge set off at ${at(e.x, e.y)}`);
          break;
        case 'revealed':
          this.counts.binoculars++;
          break;
        case 'disguise':
          if (e.on) this.counts.uniform++;
          break;
        case 'woke':
          this.lines.push(`${t} guard ${e.guard + 1} woke up`);
          break;
      }
    }
    // after the step's other events: the alarm that ends a strict run comes after its gameOver
    if (events.some((e) => e.type === 'gameOver')) this.finish(s);
  }

  /** Every frame: near misses, a guard half-way to the alarm who then let it go. */
  onFrame(s: GameState): void {
    if (s !== this.state) this.begin(s);
    if (s.alarm.active) return;
    for (const g of s.guards) {
      if (g.susp >= NEAR && !this.flagged.has(g.i)) {
        this.flagged.add(g.i);
        const u = g.seeing;
        this.seenBy.set(g.i, u ? `${u.name} at ${at(u.x, u.y)}` : 'someone');
        this.lines.push(`${fmt(s.t)} near miss: ${g.role} ${g.i + 1} at ${at(g.x, g.y)} half-saw ${this.seenBy.get(g.i)}`);
      } else if (g.susp < CLEAR) this.flagged.delete(g.i);
    }
    for (const [i, tw] of s.towers.entries()) {
      const id = 1000 + i;
      if (tw.susp >= NEAR && !this.flagged.has(id)) {
        this.flagged.add(id);
        this.lines.push(`${fmt(s.t)} near miss: searchlight ${i + 1}`);
      } else if (tw.susp < CLEAR) this.flagged.delete(id);
    }
    for (const [i, c] of s.cameras.entries()) {
      const id = 2000 + i;
      if (c.susp >= NEAR && !this.flagged.has(id)) {
        this.flagged.add(id);
        this.lines.push(`${fmt(s.t)} near miss: camera ${i + 1}`);
      } else if (c.susp < CLEAR) this.flagged.delete(id);
    }
  }

  private kit(u: GameState['squad'][number]): Kit {
    return { decoys: u.charges, smokes: u.smokes, wires: u.wires, charges: u.remotes };
  }

  private finish(s: GameState): void {
    if (this.written) return;
    this.written = true;
    const used: string[] = [];
    for (const u of s.squad) {
      const a = this.start[u.id];
      if (!a) continue;
      const b = this.kit(u);
      for (const k of Object.keys(a) as (keyof Kit)[]) if (a[k] > b[k]) used.push(`${k} ${a[k] - b[k]}`);
    }
    const c = this.counts;
    const head = [
      `Launch Window play log · ${this.mapName} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      `result: ${s.over} · time used ${fmt(s.t)} · left ${fmt(s.timeLeft)} · alarms ${s.stats.alarms}`,
      `squad: ${s.squad.map((u) => `${u.name} ${u.alive ? `${u.hp}/${u.maxHp} hp` : 'down'}`).join(', ')}`,
      `takedowns ${c.takedowns} · tied ${c.ties} · shots silenced ${c.silenced}, loud ${c.loud} · tripped ${c.tripped} · blasts ${c.blasts} · binoculars ${c.binoculars} · uniform ${c.uniform}`,
      `used: ${used.join(', ') || 'nothing from the kits'}`,
      `launchers: ${s.launchers.filter((l) => l.done).length}/${s.launchers.length} · power ${s.generator.on ? 'on' : 'cut'}`,
    ];
    const text = [...head, ...this.lines].join('\n');
    try {
      const runs = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
      runs.push(text);
      localStorage.setItem(KEY, JSON.stringify(runs.slice(-KEEP)));
    } catch {
      // storage blocked: the copy button still has this run
    }
    this.last = text;
  }

  /** The finished run, or null while it is still going. */
  last: string | null = null;

  /** Every kept run, newest last. */
  static all(): string[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  }
}
