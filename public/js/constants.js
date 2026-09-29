// Client-only tuning. Game rules shared with the server live in /shared/config.js.

export const BASE_FOV = Math.PI / 3, SCOPE_FOV = Math.PI / 14;
// aiming down sights (right mouse) with these guns zooms the view to this much of the normal FOV
export const ADS_ZOOM = { wand: 0.8, pistol: 0.8, deagle: 0.75, revolver: 0.72, smg: 0.75, uzi: 0.78, rifle: 0.65, burst: 0.65, carbine: 0.68, lmg: 0.7, crossbow: 0.7, beam: 0.55 };
export const SENS = 0.0025; // mouse sensitivity (radians per pixel)

// Quake-style movement, scaled so 320 qu/s = 3 map units/s
export { MOVE_SPEED as MAX_SPEED, MOVE_GRAVITY as GRAVITY, MOVE_JUMP_V as JUMP_V, MOVE_SPEED_LIMIT as SPEED_LIMIT } from '/shared/config.js';
export const ACCEL = 18, AIR_ACCEL = 12, AIR_CAP = 0.28, FRICTION = 5, STOP_SPEED = 1.0, STEP = 0.3;
// callouts for kill streaks (kills without dying) and multi-kills (see MULTI_KILL_MS)
export const STREAK_NAMES = { 3: 'KILLING SPREE', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'GODLIKE', 15: 'LEGENDARY' };
export const MULTI_NAMES = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'MASSACRE' };
// stored spells: bar color and a one-letter rune for the HUD
export const SPELL_LOOK = { heal: { col: [120, 230, 120], rune: '+' }, haste: { col: [255, 210, 80], rune: '»' }, ward: { col: [120, 190, 255], rune: '◈' },
  broom: { col: [230, 170, 90], rune: '≫' }, blink: { col: [150, 220, 255], rune: '⌁' }, invis: { col: [200, 200, 230], rune: '◌' }, curse: { col: [200, 90, 255], rune: '☠' } };
export const ALLY_OUTLINE_COLOR = [122, 80, 136], ENEMY_OUTLINE_COLOR = [168, 64, 64];

export const GUN_COLOR = {
  pistol: [200, 200, 210], deagle: [255, 200, 80], revolver: [220, 160, 90],
  rifle: [255, 140, 40], burst: [255, 100, 160], carbine: [255, 170, 60],
  sniper: [255, 80, 60], crossbow: [140, 220, 100], beam: [255, 60, 220], shotgun: [255, 200, 60], wand: [150, 255, 140],
  smg: [80, 220, 255], uzi: [100, 255, 200], lmg: [180, 100, 255],
  health: [200, 140, 60], ammo: [140, 90, 180], nade: [140, 80, 180], scroll: [200, 150, 255],
};
