// Tuning values ported from prototype/launch-window.html.
// The sim works in tile units. The prototype used 24 px tiles, so every
// pixel value is divided by PROTO_TILE_PX. The original px value is kept
// in a comment next to each one so the port can be checked line by line.

export const PROTO_TILE_PX = 24;
const px = (v: number): number => v / PROTO_TILE_PX;
const deg = (v: number): number => (v * Math.PI) / 180;

// World
export const COLS = 46;
export const ROWS = 30;
export const TIME_LIMIT = 480; // seconds
export const FIXED_DT = 1 / 60;

// Guard sight
export const FOV = deg(70);
export const CONE_LEN = 6.5; // 6.5 * T
export const NEAR_FRACTION = 0.5;
export const ALARM_CONE_SCALE = 1.15;
export const CONE_MIN_DIST = px(10); // inside this, the facing angle is ignored
export const SUSP_NEAR = 3.2; // per second
export const SUSP_FAR = 1.1; // per second
export const SUSP_DECAY = 0.45; // per second
export const ALARM_RATE = 99; // "instant" during an alarm

// Searchlights
export const TOWER_LEN = 9; // 9 * T
export const TOWER_FOV = deg(20);
export const TOWER_SUSP = 1.6; // per second
export const TOWER_DECAY = 0.6; // per second

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
export const SEARCH_TIME = 3.5;
export const SEARCH_SWEEP = 0.85; // rad
export const SEARCH_SWEEP_RATE = 1.8;

// Squad
export const SPEED_SHADOW = px(84);
export const SPEED_LURE = px(72);
export const SPEED_SAPPER = px(60);
export const CRAWL_MULT = 0.45;
export const DRAG_MULT = 0.55;
export const UNIT_HP = 3;
export const TAKEDOWN_RANGE = 1.15; // T * 1.15
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
export const SPEED_PATROL = px(40);
export const SPEED_INVESTIGATE = px(62);
export const SPEED_RETURN = px(46);
export const SPEED_COMBAT = px(74);
export const PATROL_WAIT = 1.1;
export const WAYPOINT_REACH = px(2);
export const LAST_KNOWN_REACH = 0.8; // T * 0.8
export const POST_SWEEP_RATE = 0.55;
export const SPIN_RATE = 0.7;
export const TURN_STARE = 3.5;
export const TURN_POST = 2.2;
export const TURN_WALK = 6;
export const TURN_COMBAT = 7;
export const COMBAT_SPIN = 2.2;
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

// Landing zone, inclusive tile bounds
export const LZ = { x0: 1, y0: 23, x1: 6, y1: 28 } as const;
