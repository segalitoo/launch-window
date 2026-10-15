// Tuning values ported from prototype/launch-window.html.
// The sim works in tile units. The prototype used 24 px tiles, so every
// pixel value is divided by PROTO_TILE_PX. The original px value is kept
// in a comment next to each one so the port can be checked line by line.

export const PROTO_TILE_PX = 24;
const px = (v: number): number => v / PROTO_TILE_PX;
const deg = (v: number): number => (v * Math.PI) / 180;

/** Movement pace against the prototype. At the art scale (1 tile = 1.6 m, figures 44 px
 *  tall) the prototype's speeds were about twice real running and walking. Ran, Phase 2:
 *  60% looks right in the motion library. Every walking and running speed, squad and
 *  guards alike, is the prototype value times PACE, so patrols and the squad keep the
 *  same timing against each other. Not a prototype value. */
export const PACE = 0.6;
const move = (v: number): number => px(v) * PACE;
/** Guard rhythm follows the same pace, so a patrol turns, waits and sweeps at the same
 *  points of the squad's approach as in the prototype and every verified scenario holds:
 *  turn, sweep and suspicion rates are times PACE, waits and searches divided by it, so
 *  crossing a cone at the slower pace builds the same suspicion. Combat and work timings
 *  (shots, alarm, Itai's work, the throw) stay in real seconds. */
const rate = (v: number): number => v * PACE;
const wait = (v: number): number => v / PACE;

// World
export const COLS = 46;
export const ROWS = 30;
/** 480 s in the prototype; the mission is mostly walking, so it stretches with PACE. */
export const TIME_LIMIT = wait(480);
export const FIXED_DT = 1 / 60;

// Guard sight
export const FOV = deg(70);
export const CONE_LEN = 6.5; // 6.5 * T
export const NEAR_FRACTION = 0.5;
export const ALARM_CONE_SCALE = 1.15;
export const CONE_MIN_DIST = px(10); // inside this, the facing angle is ignored
export const SUSP_NEAR = rate(3.2); // per second
export const SUSP_FAR = rate(1.1); // per second
export const SUSP_DECAY = rate(0.45); // per second
export const ALARM_RATE = 99; // "instant" during an alarm

// Searchlights
export const TOWER_LEN = 9; // 9 * T
export const TOWER_FOV = deg(20);
export const TOWER_SUSP = rate(1.6); // per second
export const TOWER_DECAY = rate(0.6); // per second

// Alarm
export const ALARM_TIME = 18; // seconds without contact before it clears
export const ALARM_RADIUS = 13; // 13 * T, guards that join the alarm
export const ALARM_TIME_SCALE = 2;

// Decoy
export const DECOY_RANGE = 8; // 8 * T
export const DECOY_HEAR = 7; // 7 * T
export const DECOY_CHARGES = 4;
export const THROW_BUSY = 0.35;
export const THROW_FLIGHT = 0.6;
export const INVESTIGATE_MAX_PATH = 30; // 30 * T
export const SEARCH_TIME = wait(3.5);
export const SEARCH_SWEEP = 0.85; // rad
export const SEARCH_SWEEP_RATE = rate(1.8);

// Squad
export const SPEED_SHADOW = move(84); // 84 px/s in the prototype
export const SPEED_LURE = move(72); // 72 px/s in the prototype
export const SPEED_SAPPER = move(60); // 60 px/s in the prototype
export const CRAWL_MULT = 0.45;
export const DRAG_MULT = 0.55;
export const UNIT_HP = 3;
export const TAKEDOWN_RANGE = 1.15; // T * 1.15
/** Where a takedown leaves the guard, in tiles: ahead of the attacker and half a step to
 *  his left (0.60 m and 0.30 m), where the takedown animation is built for him to be, so
 *  the attacker works from the guard's back-right. Not a prototype value. */
export const TAKEDOWN_REACH = 0.375;
export const TAKEDOWN_SIDE = 0.1875;
export const TAKEDOWN_REPATH = 0.25;
export const GRAB_RANGE = 0.95; // T * 0.95
export const CARRY_OFFSET = px(13);
export const INTERACT_REACH = px(6);
export const DUR_DOOR = 2;
export const DUR_GENERATOR = 2.5;
export const DUR_LAUNCHER = 3.5;
export const UNIT_START_ANG = -Math.PI / 4;
export const HIT_FLASH = 0.3;

// Yoav's tools (Phase 3, decided with Ran). Not prototype values.
/** A guard taken down with the knife wakes after this and raises the alarm, unless tied. The
 *  plan's 60 s, stretched with the guard rhythm (PACE). */
export const WAKE_TIME = wait(60);
/** Kneeling to tie a downed guard, real seconds (work, like Itai's). */
export const TIE_DUR = 2;

// Guns (Phase 3, Ran): every operator can shoot, unlimited ammo, every shot that leaves hits.
// Yoav and Noa carry carbines, Itai a shotgun (short, never misses). A loud shot raises the
// alarm. A silencer can be fitted or taken off at any time: quiet (heard SILENCED_HEAR tiles
// away), but half the range and a long aim standing still, so guards often see you first.
export const CARBINE_RANGE = 8;
export const SHOTGUN_RANGE = 3;
export const SILENCED_RANGE = 0.5; // times the gun's range
export const GUN_AIM = 0.5; // real seconds
export const SILENCED_AIM = 2;
export const SILENCED_HEAR = 2;

// Noa's tools (Phase 3, decided with Ran). Not prototype values.
/** Looking through the binoculars at a guard: real seconds; his route stays shown after. */
export const BINO_TIME = 1;
/** Smoke grenades: thrown like the decoy (DECOY_RANGE, THROW_FLIGHT). The cloud blocks all
 *  sight through it, guards and searchlights. 8 s in the plan, stretched by PACE. */
export const SMOKE_CHARGES = 2;
export const SMOKE_RADIUS = 2;
export const SMOKE_TIME = wait(8);
/** Captured uniform: putting it on or off, real seconds; guards see through it within this
 *  many tiles, or when she crawls, drags a body, or during an alarm. */
export const UNIFORM_TIME = 2;
export const UNIFORM_CLOSE = 1;

// Itai's tools (Phase 3). Not prototype values; work times are real seconds, like his others.
/** Cutting a hole in the outer fence. */
export const DUR_FENCE = 2;
/** Tripwires: the next guard who walks through is knocked out (wakes like a knife takedown). */
export const WIRE_CHARGES = 2;
export const WIRE_TIME = 2;
/** Remote charge: planted at his feet, set off from anywhere. A diversion: guards within
 *  BLAST_HEAR tiles come to look, anyone within BLAST_KILL is caught in it. No alarm. */
export const REMOTE_CHARGES = 1;
export const PLANT_TIME = 2;
export const BLAST_HEAR = 10;
export const BLAST_KILL = 1.5;
/** Hit points an operator loses in his own blast. */
export const BLAST_HURT = 2;

// Enemies (Phase 3, decided with Ran). Not prototype values.
/** The officer walks his route slower than a guard. He sees through Noa's uniform. */
export const OFFICER_PACE = 0.75;
/** The dog smells an operator within this many tiles, walls block it; hiding, crawling, smoke
 *  and the uniform do not. It barks (BARK_EVERY) and guards within BARK_HEAR of it, always
 *  its handler, come to look. It reacts after DOG_REACT. A decoy within DECOY_HEAR keeps it
 *  sniffing there for DOG_DISTRACT, real seconds. */
export const DOG_SMELL = 3;
export const DOG_REACT = 0.5;
export const BARK_EVERY = 3;
export const BARK_HEAR = 5;
export const DOG_DISTRACT = 5;
/** How close the dog keeps to its handler, and how often it re-plans the way to him. */
export const DOG_HEEL = 1;
export const DOG_REPATH = 0.5;
/** Cameras: a short cone that sweeps like a searchlight and runs on the generator. One second
 *  in view raises the alarm (real seconds, like combat). */
export const CAM_LEN = 5;
export const CAM_FOV = deg(50);
export const CAM_SUSP_TIME = 1;
export const CAM_DECAY = 1;

// Guards
export const SPEED_PATROL = move(40); // 40 px/s in the prototype
export const SPEED_INVESTIGATE = move(62); // 62 px/s in the prototype
export const SPEED_RETURN = move(46); // 46 px/s in the prototype
export const SPEED_COMBAT = move(74); // 74 px/s in the prototype
export const PATROL_WAIT = wait(1.1);
export const WAYPOINT_REACH = px(2);
export const LAST_KNOWN_REACH = 0.8; // T * 0.8
export const POST_SWEEP_RATE = rate(0.55);
export const SPIN_RATE = rate(0.7);
export const TURN_STARE = rate(3.5);
export const TURN_POST = rate(2.2);
export const TURN_WALK = rate(6);
export const TURN_COMBAT = rate(7);
export const COMBAT_SPIN = rate(2.2);
export const SUSP_STARE_MIN = 0.05;
export const SHOT_FIRST = 0.9;
export const SHOT_FIRST_ALERTED = 0.7;
export const SHOT_INTERVAL = 1.25;
export const GUARD_PHASE_STEP = 1.7;

// Pathfinding
export const PATH_CLEARANCE = px(7);
export const PATH_SAMPLE_STEP = px(4);
export const PATH_GOAL_MARGIN = px(24 / 2 - 7); // T / 2 - 7
export const NEAREST_WALKABLE_RADIUS = 4;

// Tiny distances from the prototype's px math
export const EPS_MOVE = px(0.01);
export const EPS_LOS_MIN = px(1);
export const EPS_LOS = px(0.01);
export const RAY_MAX_STEPS = 200;
