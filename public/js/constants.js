// Client-only tuning. Game rules shared with the server live in /shared/config.js.

export const BASE_FOV = Math.PI / 3, SCOPE_FOV = Math.PI / 14;
// aiming down sights (right mouse) with these guns zooms the view to this much of the normal FOV
export const ADS_ZOOM = { pistol: 0.8, deagle: 0.75, revolver: 0.72, smg: 0.75, uzi: 0.78, rifle: 0.65, burst: 0.65, carbine: 0.68, lmg: 0.7, crossbow: 0.7 };
export const SENS = 0.0025; // mouse sensitivity (radians per pixel)

// Quake-style movement, scaled so 320 qu/s = 3 map units/s
export const MAX_SPEED = 3.0, ACCEL = 18, AIR_ACCEL = 12, AIR_CAP = 0.28, FRICTION = 5, STOP_SPEED = 1.0;
export const GRAVITY = 7.5, JUMP_V = 2.55, SPEED_LIMIT = 10, STEP = 0.3;

export const GUN_COLOR = {
  pistol: [200, 200, 210], deagle: [255, 200, 80], revolver: [220, 160, 90],
  rifle: [255, 140, 40], burst: [255, 100, 160], carbine: [255, 170, 60],
  sniper: [255, 80, 60], crossbow: [140, 220, 100], shotgun: [255, 200, 60],
  smg: [80, 220, 255], uzi: [100, 255, 200], lmg: [180, 100, 255],
  health: [255, 255, 255], ammo: [230, 210, 120], nade: [80, 200, 90],
};
