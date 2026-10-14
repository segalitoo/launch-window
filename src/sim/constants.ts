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
