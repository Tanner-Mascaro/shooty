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
export const SPELL_LOOK = { heal: { col: [230, 60, 70], rune: '+' }, haste: { col: [255, 210, 60], rune: '»' }, ward: { col: [70, 110, 255], rune: '◈' },
  broom: { col: [255, 140, 40], rune: '≫' }, blink: { col: [60, 230, 220], rune: '⌁' }, invis: { col: [200, 200, 230], rune: '◌' }, curse: { col: [190, 70, 255], rune: '☠' },
  frost: { col: [190, 235, 255], rune: '❄' }, totem: { col: [40, 190, 90], rune: '♣' }, well: { col: [110, 60, 200], rune: '◉' }, decoy: { col: [255, 120, 190], rune: '☺' } };
// what each spell potion is called
export const SPELL_NAME = { heal: 'Healing', haste: 'Haste', ward: 'Warding', broom: 'Broom Dash', blink: 'Blink', invis: 'Invisibility', curse: 'Curse',
  frost: 'Frost Nova', totem: 'Healing Totem', well: 'Gravity Well', decoy: 'Decoy' };
// power-ups, monster drops and elixirs: colors for glows, minimap dots and banners
export const POWER_COLOR = { fury: [255, 70, 60], shield: [110, 180, 255], feather: [230, 240, 255], cloak: [170, 150, 220],
  maxammo: [240, 200, 90], double: [255, 215, 60], insta: [255, 60, 90], nuke: [255, 140, 40], troll: [120, 220, 110], swift: [110, 200, 255], quick: [255, 170, 80] };
// what an emote says in the bubble over your head
export const EMOTE_LOOK = { cackle: '🧙‍♀️', curtsy: '🎀', hex: '🔮', brew: '🧪', broom: '🧹', bats: '🦇', howl: '🌕', hiss: '🐈‍⬛' };
// sparks that fly while emoting: color, and how they move ('rise' up from you, 'ring' around you, 'swarm' out and away)
export const EMOTE_FX = { hex: [[190, 110, 255], 'ring'], brew: [[110, 240, 120], 'rise'], bats: [[40, 30, 50], 'swarm'], broom: [[230, 170, 90], 'rise'], cackle: [[150, 255, 140], 'rise'] };
export const TEAM_RGB = { 1: [230, 60, 70], 2: [140, 110, 255] };
export const ALLY_OUTLINE_COLOR = [122, 80, 136], ENEMY_OUTLINE_COLOR = [168, 64, 64];

export const GUN_COLOR = {
  pistol: [200, 200, 210], deagle: [255, 200, 80], revolver: [220, 160, 90],
  rifle: [255, 140, 40], burst: [255, 100, 160], carbine: [255, 170, 60],
  sniper: [255, 80, 60], crossbow: [140, 220, 100], beam: [255, 60, 220], shotgun: [255, 200, 60], wand: [150, 255, 140],
  smg: [80, 220, 255], uzi: [100, 255, 200], lmg: [180, 100, 255],
  derringer: [230, 180, 200], flintlock: [200, 140, 70], autopistol: [160, 220, 255], assault: [210, 120, 60], dmr: [120, 200, 160],
  marksman: [255, 120, 90], dragon: [255, 60, 30], doublebarrel: [230, 170, 90], autoshotgun: [255, 230, 90], blunderbuss: [190, 150, 80],
  gatling: [255, 90, 200], reaper: [120, 255, 120], swarm: [255, 240, 120], tommy: [200, 120, 80], staff: [140, 170, 255], bow: [235, 225, 200],
  health: [200, 140, 60], ammo: [140, 90, 180], nade: [140, 80, 180], scroll: [200, 150, 255],
};
