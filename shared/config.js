// Game rules shared by the server and the browser. Tweak balance here.

export const TICK = 1000 / 30;   // server state broadcast interval (ms)
export const RES = 12;           // heightmap samples per map unit (higher = smoother shapes)
export const MAX_HP = 100;
export const WIN_SCORE = 10;       // free-for-all: first player to this many kills
export const TEAM_WIN_SCORE = 20;  // teams: first team to this many kills
export const MAX_PLAYERS = 8;      // per room
export const TEAMS = { 1: 'RED', 2: 'BLUE' }; // team 0 = free-for-all
export const MAX_DEPTH = 40;     // max view / bullet distance
export const PIT_DPS = 40;       // damage per second standing in lava / acid / bog
export const PICKUP_RESPAWN = 15000;
export const HEAL = 50;
export const HEAL_RESPAWN = 20000;
export const EYE = 0.62;         // eye height above a player's feet
export const BODY_H = 0.8;       // hitbox height; the top 0.2 is the head

// mag: rounds per magazine, reload: ms to reload it
export const WEAPONS = {
  rifle:   { dmg: 20,  head: 2,   cd: 120,  spread: 0.015, scopedSpread: 0.015, airSpread: 0.05, auto: true, mag: 30, reload: 1600 },
  sniper:  { dmg: 100, head: 1.5, cd: 1400, spread: 0.12,  scopedSpread: 0,     airSpread: 0.08, mag: 4, reload: 2400 },
  shotgun: { dmg: 12,  head: 1.5, cd: 850,  spread: 0.07,  pellets: 8, falloff: 12, mag: 6, reload: 2200 },
  smg:     { dmg: 11,  head: 1.8, cd: 75,   spread: 0.03,  scopedSpread: 0.03,  airSpread: 0.07, auto: true, mag: 35, reload: 1500 },
  blade:   { dmg: 55,  backstab: 150, cd: 450, range: 1.4, melee: true },
};
// spare rounds a pad gun comes with on top of a full mag; the rifle has unlimited spares,
// the blade needs no ammo
export const AMMO = { sniper: 4, shotgun: 6, smg: 55 };
export const PAD_GUNS = ['sniper', 'shotgun', 'smg']; // a gun pad rolls one of these each time it respawns
export const GUN_SLOTS = 2;      // guns you can carry, plus the blade
export const USE_RANGE = 1.2;    // how close you must be to pick up a gun or loot a box
export const BOX_TIME = 30000;   // loot boxes vanish after this long
// weapon slots, keys 1-5
export const WEAPON_ORDER = ['rifle', 'sniper', 'shotgun', 'smg', 'blade'];
