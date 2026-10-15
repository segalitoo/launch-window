// Shared sim types. All positions are in tile units on the top-down grid.
// A tile (tx, ty) covers [tx, tx + 1) x [ty, ty + 1); its center is tx + 0.5.

export interface Vec {
  x: number;
  y: number;
}

/** `#` wall, `B` building, `c` crate, `D` locked door, `d` open door, `F` fence (blocks
 *  walking, not sight; Itai cuts it), `G` generator, `L` launcher, `T` searchlight tower,
 *  `.` ground. */
export type TileCode = '#' | 'B' | 'c' | 'D' | 'd' | 'F' | 'G' | 'L' | 'T' | '.';

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

/** A bush or dark corner. An operator standing still or crawling inside is seen only by a
 *  guard very close (the near zone), never by a searchlight. Inclusive tile bounds. */
export interface HideSpot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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

/** A security camera on a wall. Sweeps like a searchlight with a short cone and runs on the
 *  generator. Seeing an operator for CAM_SUSP_TIME raises the alarm. */
export interface Camera {
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
/** guard: the usual. officer: sees through Noa's uniform, walks slower. dog: follows its
 *  handler, has no cone, smells operators close by and barks; only a gun or a blast stops it. */
export type GuardRole = 'guard' | 'officer' | 'dog';
export type GuardState = 'patrol' | 'investigate' | 'search' | 'return' | 'combat' | 'down';

export interface Guard extends Vec {
  i: number;
  kind: GuardKind;
  role: GuardRole;
  /** Dogs: index of the guard it walks with (-1 = none). */
  handler: number;
  /** Dogs: seconds left sniffing at a decoy (nothing else is smelled meanwhile). */
  distract: number;
  /** Dogs: seconds until the next bark while it smells someone. */
  barkCD: number;
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
  /** Seconds until a knocked-out guard wakes (0 = not knocked out). */
  ko: number;
  /** Tied up by Yoav: never wakes. */
  tied: boolean;
  /** Shot with the pistol: down for good. */
  dead: boolean;
  /** Seen through Noa's binoculars: his route stays shown on the map. */
  revealed: boolean;
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

export type InteractKind = 'door' | 'generator' | 'launcher' | 'fence';

export type InteractTarget =
  | { kind: 'door'; o: Door }
  | { kind: 'fence'; o: Vec }
  | { kind: 'generator'; o: Generator }
  | { kind: 'launcher'; o: Launcher };

export type Order =
  | { type: 'takedown'; guard: Guard; repath: number }
  | { type: 'grab'; body: Guard }
  | { type: 'tie'; body: Guard; started: boolean; t: number }
  | { type: 'shoot'; guard: Guard; t: number; dur: number; loud: boolean }
  | { type: 'binoculars'; guard: Guard; t: number }
  | { type: 'uniform'; t: number }
  | { type: 'wire'; t: number }
  | { type: 'plant'; t: number }
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
  /** Silencer fitted on the gun: quiet, but half range and a long aim. */
  silenced: boolean;
  /** Smoke grenades (Noa). */
  smokes: number;
  /** Wearing the captured uniform (Noa). */
  disguised: boolean;
  /** Tripwires left to set, remote charges left to plant, and the one planted (Itai). */
  wires: number;
  remotes: number;
  remote: Vec | null;
}

export interface Projectile {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  /** What lands: a decoy makes a noise, a smoke grenade a cloud. */
  kind: 'decoy' | 'smoke';
}

/** A smoke cloud: blocks all sight through it until `left` runs out. */
export interface Smoke {
  x: number;
  y: number;
  left: number;
}

/** spotted: an alarm on a strict map (a test map, where any alarm fails the run). */
export type GameResult = 'win' | 'launch' | 'down' | 'spotted';

export type MessageKind = '' | 'alarm' | 'ok' | 'warn';

/** Things that happened during a step. The view drains these for toasts and effects. */
export type SimEvent =
  | { type: 'message'; msg: string; kind: MessageKind }
  | { type: 'alarmRaised'; x: number; y: number; first: boolean; reason: string }
  | { type: 'alarmCleared' }
  | { type: 'takedown'; unit: UnitId; guard: number }
  | { type: 'shot'; guard: number; unit: UnitId }
  | { type: 'fired'; unit: UnitId; guard: number; loud: boolean }
  | { type: 'tied'; unit: UnitId; guard: number }
  | { type: 'woke'; guard: number }
  | { type: 'revealed'; guard: number }
  | { type: 'smoke'; x: number; y: number }
  | { type: 'disguise'; unit: UnitId; on: boolean }
  | { type: 'tripped'; guard: number }
  | { type: 'bark'; guard: number; x: number; y: number }
  | { type: 'blast'; x: number; y: number }
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
  cameras: Camera[];
  launchers: Launcher[];
  /** Landing zone, inclusive tile bounds. */
  lz: { x0: number; y0: number; x1: number; y1: number };
  /** mission: rig every launcher, then everyone back to the LZ. exit: every operator in the
   *  exit zone (test maps, Phase 3). */
  goal: 'mission' | 'exit';
  exit: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Any alarm ends the run (test maps). */
  strict: boolean;
  /** Hiding spots (bushes, dark corners), inclusive tile bounds. */
  hides: HideSpot[];
  guards: Guard[];
  squad: Unit[];
  projectiles: Projectile[];
  smokes: Smoke[];
  /** Tripwires Itai has set, by tile. */
  wires: Vec[];
  alarm: { active: boolean; timer: number };
  stats: { takedowns: number; alarms: number };
  events: SimEvent[];
  /** Bumps whenever a door opens or the power goes off, so the view can redraw static layers. */
  staticVersion: number;
  rngState: number;
}
