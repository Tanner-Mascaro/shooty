// Game rules shared by the server and the browser. Tweak balance here.

export const TICK = 1000 / 30;   // server state broadcast interval (ms)
export const RES = 12;           // heightmap samples per map unit (higher = smoother shapes)
export const MAX_HP = 100;
export const WIN_SCORE = 10;       // free-for-all: first player to this many kills
export const TEAM_WIN_SCORE = 20;  // teams: first team to this many kills
export const MAX_PLAYERS = 8;      // per room
export const TEAMS = { 1: 'RED', 2: 'BLUE' }; // team 0 = free-for-all
export const MODE_NAMES = { ffa: 'Free-for-all', teams: 'Teams', plague: 'Plague', snipers: 'Snipers' };
export const PLAGUE_DURATION = 3 * 60 * 1000; // healthy players win if anyone survives this long
export const PLAGUE_TEAM = 1;
export const HEALTHY_TEAM = 2;
export const PLAGUE_SKIN = 'demon';
export const PLAGUE_SPEED_MULTIPLIER = 2;
export const PLAGUE_MAX_HP = MAX_HP * 3;
export const PLAGUE_JUMPS = 2;
export const PLAGUE_DASH_SPEED = 15; // map units per second during the burst
export const PLAGUE_DASH_DURATION = 200; // ms
export const PLAGUE_DASH_COOLDOWN = 2000; // ms between dash starts
export const MOVE_SPEED = 3, MOVE_SPEED_LIMIT = 10, MOVE_GRAVITY = 7.5, MOVE_JUMP_V = 2.55;
export const PLAGUE_TEAMS = { [PLAGUE_TEAM]: 'PLAGUE', [HEALTHY_TEAM]: 'HEALTHY' };
export const isTeamMode = mode => mode === 'teams' || mode === 'plague';
export const teamName = (mode, team) => (mode === 'plague' ? PLAGUE_TEAMS : TEAMS)[team] || '';
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
  pistol:   { dmg: 24,  head: 2,   cd: 200,  spread: 0.012, scopedSpread: 0.006, airSpread: 0.045, mag: 12, reload: 1300 },
  deagle:   { dmg: 58,  head: 2,   cd: 480,  spread: 0.022, scopedSpread: 0.01,  airSpread: 0.07,  mag: 7,  reload: 1800 },
  revolver: { dmg: 70,  head: 2,   cd: 620,  spread: 0.018, scopedSpread: 0.008, airSpread: 0.06,  mag: 6,  reload: 2200 },
  rifle:    { dmg: 20,  head: 2,   cd: 120,  spread: 0.015, scopedSpread: 0.006, airSpread: 0.05, auto: true, mag: 30, reload: 1600 },
  burst:    { dmg: 17,  head: 2,   cd: 420,  spread: 0.01,  scopedSpread: 0.005, airSpread: 0.04, pellets: 3, mag: 30, reload: 1600 },
  carbine:  { dmg: 18,  head: 2,   cd: 100,  spread: 0.018, scopedSpread: 0.007, airSpread: 0.055, auto: true, mag: 25, reload: 1550 },
  sniper:   { dmg: 100, head: 1.5, cd: 1400, spread: 0.12,  scopedSpread: 0,     airSpread: 0.08, mag: 4, reload: 2400 },
  crossbow: { dmg: 85,  head: 1.8, cd: 1100, spread: 0.02,  scopedSpread: 0.004, airSpread: 0.05, mag: 1, reload: 1600 },
  shotgun:  { dmg: 12,  head: 1.5, cd: 850,  spread: 0.07,  pellets: 8, falloff: 12, mag: 6, reload: 2200 },
  smg:      { dmg: 11,  head: 1.8, cd: 75,   spread: 0.03,  scopedSpread: 0.018, airSpread: 0.07, auto: true, mag: 35, reload: 1500 },
  uzi:      { dmg: 9,   head: 1.8, cd: 55,   spread: 0.04,  scopedSpread: 0.022, airSpread: 0.09, auto: true, mag: 32, reload: 1400 },
  lmg:      { dmg: 15,  head: 1.8, cd: 95,   spread: 0.028, scopedSpread: 0.014, airSpread: 0.065, auto: true, mag: 75, reload: 3200 },
  blade:    { dmg: 55,  backstab: 150, cd: 450, range: 1.4, melee: true },
  claws:   { dmg: MAX_HP / 2, cd: 450, range: 1.4, melee: true, auto: true },
};
// Every gun's ammo runs out; only the blade needs none. A gun you've emptied completely is gone.
export const START_GUN = 'pistol';
// spare rounds a gun comes with on top of a full mag (the pistol when you spawn, the rest from pads)
export const AMMO = { pistol: 24, deagle: 14, revolver: 18, rifle: 60, burst: 60, carbine: 50, sniper: 4, crossbow: 8, shotgun: 6, smg: 55, uzi: 64, lmg: 150 };
export const MAX_SPARE = w => WEAPONS[w].mag * 3; // spare rounds you can carry per gun
export const PAD_GUNS = ['rifle', 'sniper', 'shotgun', 'smg', 'deagle', 'burst', 'lmg', 'revolver', 'carbine', 'crossbow', 'uzi'];
export const SNIPER_GUNS = ['sniper', 'crossbow'];
export const startGun = mode => mode === 'snipers' ? 'sniper' : START_GUN;
export const padGuns = mode => mode === 'snipers' ? SNIPER_GUNS : PAD_GUNS;
export const AMMO_CRATES = 22;   // small ammo crates scattered at random spots each match: walk over for a mag per gun
export const AMMO_RESPAWN = 12000;
export const GUN_CRATES = 14;    // random guns on the ground; walk over to grab if you have a free slot / ammo
export const GUN_CRATE_RESPAWN = 18000;
export const GUN_SLOTS = 2;      // guns you can carry, plus the blade
export const USE_RANGE = 1.2;    // how close you must be to pick up a gun or loot a box
export const BOX_TIME = 30000;   // loot boxes vanish after this long

// grenades: find on pads / crates, throw with the nade key; fuse then AoE
export const NADE = { dmg: 130, radius: 5.8, fuse: 900, speed: 26, bounce: 0.28, gravity: 16, maxCarry: 3 };
export const NADE_CRATES = 10;
export const NADE_RESPAWN = 18000;
