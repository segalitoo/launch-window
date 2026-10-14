// Shared sim types. All positions are in tile units on the top-down grid.
// A tile (tx, ty) covers [tx, tx + 1) x [ty, ty + 1); its center is tx + 0.5.

export interface Vec {
  x: number;
  y: number;
}

/** `#` wall, `B` building, `c` crate, `D` locked door, `d` open door,
 *  `G` generator, `L` launcher, `T` searchlight tower, `.` ground. */
export type TileCode = '#' | 'B' | 'c' | 'D' | 'd' | 'G' | 'L' | 'T' | '.';

/** Ground decoration, for the view only: 0 sand, 1 road, 2 slab, 3 yard. */
export type Deco = 0 | 1 | 2 | 3;

export interface Grid {
  cols: number;
  rows: number;
  cells: TileCode[];
  deco: Uint8Array;
}

export interface Building {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  label: string;
}

export interface Door {
  x: number;
  y: number;
  open: boolean;
  label: string;
}

export interface Generator {
  x: number;
  y: number;
  w: number;
  h: number;
  on: boolean;
}

export interface Launcher {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  done: boolean;
}

export interface Tower {
  x: number;
  y: number;
  a0: number;
  a1: number;
  period: number;
  phase: number;
  susp: number;
  ang: number;
}

export type GuardKind = 'post' | 'patrol';
export type GuardState = 'patrol' | 'investigate' | 'search' | 'return' | 'combat' | 'down';

export interface Guard extends Vec {
  i: number;
  kind: GuardKind;
  state: GuardState;
  ang: number;
  susp: number;
  suspPt: Vec | null;
  path: Vec[];
  wait: number;
  timer: number;
  searchBase: number;
  shootCD: number;
  seeing: Unit | null;
  lastKnown: Vec | null;
  /** A downed guard whose body was seen. Each body raises the alarm once. */
  found: boolean;
  carried: boolean;
  phase: number;
  // post guards
  post: Vec | null;
  face: number;
  sweep: number;
  spin: boolean;
  // patrol guards
  route: Vec[];
  loop: boolean;
  ri: number;
  dir: 1 | -1;
}

export type UnitId = 'shadow' | 'lure' | 'sapper';

export type InteractKind = 'door' | 'generator' | 'launcher';

export type InteractTarget =
  | { kind: 'door'; o: Door }
  | { kind: 'generator'; o: Generator }
  | { kind: 'launcher'; o: Launcher };

export type Order =
  | { type: 'takedown'; guard: Guard; repath: number }
  | { type: 'grab'; body: Guard }
  | {
      type: 'interact';
      target: InteractTarget;
      spot: Vec;
      started: boolean;
      t: number;
      dur: number;
    };

export interface Unit extends Vec {
  id: UnitId;
  name: string;
  call: string;
  color: string;
  speed: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  crawl: boolean;
  path: Vec[];
  order: Order | null;
  carrying: Guard | null;
  busy: number;
  ang: number;
  hitT: number;
  charges: number;
}

export interface Projectile {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
}

export type GameResult = 'win' | 'launch' | 'down';

export type MessageKind = '' | 'alarm' | 'ok' | 'warn';

/** Things that happened during a step. The view drains these for toasts and effects. */
export type SimEvent =
  | { type: 'message'; msg: string; kind: MessageKind }
  | { type: 'alarmRaised'; x: number; y: number; first: boolean; reason: string }
  | { type: 'alarmCleared' }
  | { type: 'takedown'; unit: UnitId; guard: number }
  | { type: 'shot'; guard: number; unit: UnitId }
  | { type: 'noise'; x: number; y: number; heard: number }
  | { type: 'moveOrdered'; unit: UnitId; x: number; y: number }
  | { type: 'gameOver'; result: GameResult; unit?: UnitId };

export interface GameState {
  t: number;
  timeLeft: number;
  over: GameResult | null;
  aborted: boolean;
  grid: Grid;
  buildings: Building[];
  doors: Door[];
  generator: Generator;
  towers: Tower[];
  launchers: Launcher[];
  /** Landing zone, inclusive tile bounds. */
  lz: { x0: number; y0: number; x1: number; y1: number };
  guards: Guard[];
  squad: Unit[];
  projectiles: Projectile[];
  alarm: { active: boolean; timer: number };
  stats: { takedowns: number; alarms: number };
  events: SimEvent[];
  /** Bumps whenever a door opens or the power goes off, so the view can redraw static layers. */
  staticVersion: number;
  rngState: number;
}
