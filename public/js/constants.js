// Client-only tuning. Game rules shared with the server live in /shared/config.js.

export const BASE_FOV = Math.PI / 3, SCOPE_FOV = Math.PI / 14;
export const SENS = 0.0025; // mouse sensitivity (radians per pixel)

// Quake-style movement, scaled so 320 qu/s = 3 map units/s
export { MOVE_SPEED as MAX_SPEED, MOVE_GRAVITY as GRAVITY, MOVE_JUMP_V as JUMP_V, MOVE_SPEED_LIMIT as SPEED_LIMIT } from '/shared/config.js';
export const ACCEL = 10, AIR_ACCEL = 12, AIR_CAP = 0.28, FRICTION = 5, STOP_SPEED = 1.0, STEP = 0.3;

export const GUN_COLOR = { sniper: [255, 80, 60], shotgun: [255, 200, 60], smg: [80, 220, 255], health: [255, 255, 255] };
