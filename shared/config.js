// Game rules shared by the server and the browser. Tweak balance here.

export const TICK = 1000 / 30;   // server state broadcast interval (ms)
export const RES = 12;           // heightmap samples per map unit (higher = smoother shapes)
export const MAX_HP = 100;
export const WIN_SCORE = 10;       // free-for-all: first player to this many kills
export const TEAM_WIN_SCORE = 20;  // teams: first team to this many kills
export const MAX_PLAYERS = 8;      // per room
export const TEAMS = { 1: 'RED', 2: 'BLUE' }; // team 0 = free-for-all
export const PLAYER_SKINS = ['demon', 'robot', 'witch', 'cowboy', 'nun', 'knight', 'bodybuilder', 'ghost', 'goose', 'construction', 'superhero', 'ninja', 'werewolf', 'zombie', 'astronaut', 'mummy', 'vampire', 'slime'];
export const MAX_DEPTH = 40;     // max view / bullet distance
export const PIT_DPS = 40;       // damage per second standing in lava / acid / bog
export const PICKUP_RESPAWN = 15000;
export const HEAL = 50;
export const HEAL_RESPAWN = 20000;
export const EYE = 0.62;         // eye height above a player's feet
export const BODY_H = 0.8;       // hitbox height; the top 0.2 is the head
// sliding: a burst of speed and low friction for `time` ms, eyes `drop` lower and the hitbox
// `crouch` of its height; needs at least `minSpeed`, and `cooldown` ms before the next one
export const SLIDE = { time: 850, boost: 2.0, friction: 0.05, cooldown: 600, minSpeed: 1.5, drop: 0.25, crouch: 0.65 };

// mag: rounds per magazine, reload: ms to reload it
export const WEAPONS = {
  pistol:  { dmg: 24,  head: 2,   cd: 200,  spread: 0.012, scopedSpread: 0.006, airSpread: 0.045, mag: 12, reload: 1300 },
  rifle:   { dmg: 20,  head: 2,   cd: 120,  spread: 0.015, scopedSpread: 0.006, airSpread: 0.05, auto: true, mag: 30, reload: 1600 },
  sniper:  { dmg: 100, head: 1.5, cd: 1400, spread: 0.12,  scopedSpread: 0,     airSpread: 0.08, mag: 4, reload: 2400 },
  shotgun: { dmg: 12,  head: 1.5, cd: 850,  spread: 0.07,  pellets: 8, falloff: 12, mag: 6, reload: 2200 },
  smg:     { dmg: 11,  head: 1.8, cd: 75,   spread: 0.03,  scopedSpread: 0.018, airSpread: 0.07, auto: true, mag: 35, reload: 1500 },
  blade:   { dmg: 55,  backstab: 150, cd: 450, range: 1.4, melee: true },
};
// Every gun's ammo runs out; only the blade needs none. A gun you've emptied completely is gone.
export const START_GUN = 'pistol';
// spare rounds a gun comes with on top of a full mag (the pistol when you spawn, the rest from pads)
export const AMMO = { pistol: 24, rifle: 60, sniper: 4, shotgun: 6, smg: 55 };
export const MAX_SPARE = w => WEAPONS[w].mag * 3; // spare rounds you can carry per gun
export const PAD_GUNS = ['rifle', 'sniper', 'shotgun', 'smg']; // a gun pad rolls one of these each time it respawns
export const AMMO_CRATES = 18;   // small ammo crates scattered at random spots each match: walk over for a mag per gun
export const AMMO_RESPAWN = 12000;
export const GUN_SLOTS = 2;      // guns you can carry, plus the blade
export const USE_RANGE = 1.2;    // how close you must be to pick up a gun or loot a box
export const BOX_TIME = 30000;   // loot boxes vanish after this long
