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

export const WEAPONS = {
  rifle:   { dmg: 20,  head: 2,   cd: 120,  spread: 0.015, scopedSpread: 0.015, airSpread: 0.05, auto: true },
  sniper:  { dmg: 100, head: 1.5, cd: 1400, spread: 0.12,  scopedSpread: 0,     airSpread: 0.08 },
  shotgun: { dmg: 12,  head: 1.5, cd: 850,  spread: 0.07,  pellets: 8, falloff: 12 },
  smg:     { dmg: 11,  head: 1.8, cd: 75,   spread: 0.03,  scopedSpread: 0.03,  airSpread: 0.07, auto: true },
  blade:   { dmg: 55,  backstab: 150, cd: 450, range: 1.4, melee: true },
};
// pickup weapons and the ammo a pickup gives; rifle and blade are unlimited
export const AMMO = { sniper: 8, shotgun: 12, smg: 90 };
// weapon slots, keys 1-5
export const WEAPON_ORDER = ['rifle', 'sniper', 'shotgun', 'smg', 'blade'];
