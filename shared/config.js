// Game rules shared by the server and the browser. Tweak balance here.

export const TICK = 1000 / 30;   // server state broadcast interval (ms)
export const RES = 12;           // heightmap samples per map unit (higher = smoother shapes)
export const MAX_HP = 100;
export const WIN_SCORE = 10;       // free-for-all default kills to win
export const TEAM_WIN_SCORE = 20;  // teams default kills to win
export const WIN_SCORE_OPTIONS = [5, 10, 15, 20, 25, 30];
export const TEAM_WIN_SCORE_OPTIONS = [10, 20, 30, 40];
export const HARDPOINT_SCORE_LIMIT = 250;
export const HARDPOINT_MATCH_MS = 5 * 60 * 1000;
export const HARDPOINT_ROTATION_MS = 60 * 1000;
export const HARDPOINT_FIRST_MS = 5 * 1000;
export const HARDPOINT_REVEAL_MS = 10 * 1000;
export const HARDPOINT_SITE_COUNT = 5;
export const HARDPOINT_RADIUS = 2.25;
export const MAX_PLAYERS = 10;     // people per room (and seats, counting bots)
export const ROYALE_MAX_PLAYERS = 16; // battle royale has room for this many, the extra seats for bots
export const maxPlayers = mode => mode === 'royale' ? ROYALE_MAX_PLAYERS : MAX_PLAYERS;
export const TEAMS = { 1: 'RED', 2: 'BLUE' }; // team 0 = free-for-all
export const MODE_NAMES = { ffa: 'Free-for-all', teams: 'Teams', hardpoint: 'Hardpoint', plague: 'Plague', snipers: 'Snipers', gungame: 'Gun Game', royale: 'Battle Royale', build: 'Build Battle', ctf: 'Capture the Cauldron' };
// modes where you can raise Earth Ramps (build mode, the ramp slot and the mana bar)
export const canBuildIn = mode => mode === 'build';
export const PLAGUE_DURATION = 3 * 60 * 1000; // healthy players win if anyone survives this long
export const PLAGUE_TEAM = 1;
export const HEALTHY_TEAM = 2;
export const PLAGUE_SKIN = 'plagueWitch';
export const PLAGUE_SPEED_MULTIPLIER = 2;
export const PLAGUE_MAX_HP = MAX_HP * 3;
export const PLAGUE_JUMPS = 2;
export const PLAGUE_DASH_SPEED = 15; // map units per second during the burst
export const PLAGUE_DASH_DURATION = 200; // ms
export const PLAGUE_DASH_COOLDOWN = 2000; // ms between dash starts
export const MOVE_SPEED = 3, MOVE_SPEED_LIMIT = 10, MOVE_GRAVITY = 7.5, MOVE_JUMP_V = 2.55;
export const PLAGUE_TEAMS = { [PLAGUE_TEAM]: 'PLAGUE', [HEALTHY_TEAM]: 'HEALTHY' };
export const isTeamMode = mode => mode === 'teams' || mode === 'hardpoint' || mode === 'plague' || mode === 'ctf';
// red vs blue (plague has its own sides)
export const redBlue = mode => mode === 'teams' || mode === 'hardpoint' || mode === 'ctf';
// Capture the Cauldron: steal the other coven's cauldron and bring it to yours while yours is home.
// Touch range, captures to win, match length, and how long a dropped cauldron waits before going home
export const CTF = { touch: 1.3, caps: 3, ms: 8 * 60 * 1000, returnMs: 20000 };
export const teamName = (mode, team) => (mode === 'plague' ? PLAGUE_TEAMS : TEAMS)[team] || '';
// after dying you watch your killer for a moment before respawning; plague turns you into a
// monster on the spot, and battle royale has no respawns (you spectate until the match ends)
export const RESPAWN_MS = 3000;
export const respawnDelay = mode => mode === 'plague' ? 0 : mode === 'royale' ? Infinity : RESPAWN_MS;

// kill streaks (kills without dying) get callouts on the client; multi-kills are kills within
// MULTI_KILL_MS of each other, and ending a streak this long is a "shut down"
export const MULTI_KILL_MS = 3500;
export const SHUTDOWN_STREAK = 3;

// gun game: every kill moves you to the next gun; a kill with the last one (the blade) wins.
// Getting stabbed knocks you back one gun
export const GUN_GAME_LADDER = ['pistol', 'uzi', 'smg', 'shotgun', 'burst', 'carbine', 'rifle', 'lmg', 'deagle', 'revolver', 'beam', 'wand', 'crossbow', 'sniper', 'blade'];
export const gunGameGun = level => GUN_GAME_LADDER[Math.max(0, Math.min(level, GUN_GAME_LADDER.length - 1))];

// battle royale: no respawns, and a storm closes in. Each stage holds, then shrinks the safe
// circle to r (a fraction of the starting radius) over `shrink` ms; outside it costs dps hp/s
export const ROYALE_ZONE = [
  { hold: 15000, shrink: 20000, r: 0.5, dps: 5 },
  { hold: 12000, shrink: 15000, r: 0.28, dps: 10 },
  { hold: 10000, shrink: 12000, r: 0.12, dps: 18 },
  { hold: 8000, shrink: 15000, r: 0, dps: 30 },
];

// the seven witches are free; the rest unlock with XP levels (shared/progression.js)
export const PLAYER_SKINS = ['witch', 'robotWitch', 'gothicWitch', 'infernalWitch', 'iceWitch', 'ghostWitch', 'plagueWitch',
  'zombie', 'mummy', 'werewolf', 'vampire', 'knight', 'ninja', 'nun', 'demon', 'slime', 'goose',
  'cowboy', 'construction', 'robot', 'ghost', 'bodybuilder', 'astronaut', 'superhero'];

// silly cheat mode: set your display name to one of these (case-insensitive)
export const HACK_NAMES = new Set(['hacker', 'hackerman', 'godmode', 'cheater']);
export const isHackName = name => HACK_NAMES.has(String(name || '').trim().toLowerCase());
export const HACK_HP = 999;
export const HACK_DMG = 5;
export const HACK_SPEED = 2;
export const HACK_FIRE = 0.3; // fire cooldown multiplier
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
  beam:     { dmg: 38,  head: 2,   cd: 260,  spread: 0.014, scopedSpread: 0.002, airSpread: 0.04, mag: 16, reload: 1700 },
  wand:     { dmg: 32,  head: 1.5, cd: 380,  spread: 0.01,  scopedSpread: 0.004, airSpread: 0.035, mag: 10, reload: 1500 }, // Hex Wand: see WAND_CHAIN
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
export const AMMO = { wand: 30, pistol: 24, deagle: 14, revolver: 18, rifle: 60, burst: 60, carbine: 50, sniper: 4, crossbow: 8, beam: 32, shotgun: 6, smg: 55, uzi: 64, lmg: 150 };
export const MAX_SPARE = w => WEAPONS[w].mag * 3; // spare rounds you can carry per gun
export const PAD_GUNS = ['rifle', 'sniper', 'shotgun', 'smg', 'deagle', 'burst', 'lmg', 'revolver', 'carbine', 'crossbow', 'uzi', 'beam', 'wand'];
// the Hex Wand's bolt jumps from whoever it hits to the nearest other enemy within range
export const WAND_CHAIN = { range: 5, dmg: 22 };
export const SNIPER_GUNS = ['sniper', 'crossbow', 'beam'];
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

// spells: the Earth Ramp costs mana (it refills over time); stored spells come on scrolls found
// around the map, up to SPELL_SLOTS at once, and are used up when cast
export const MAX_MANA = 100;
export const MANA_REGEN = 9; // per second
export const BUILDS = {
  ramp: { mana: 35, hp: 200, life: 30000 }, // Earth Ramp: a slope to run up for height
};
// ramps stack this many high (one under the Hexed Manor's ceiling)
export const RAMP_STACK = 3;
export const rampLevels = level => level === 'haunt' ? 1 : RAMP_STACK;
export const SPELL_SLOTS = 3;
export const STORED_SPELLS = ['heal', 'haste', 'ward', 'broom', 'blink', 'invis', 'curse'];
export const HEAL_SPELL = 50;                    // hp, up to your max
export const HASTE = { ms: 5000, speed: 1.5 };  // move this much faster for a while
export const WARD = { ms: 8000, absorb: 60 };   // soaks up this much damage while it lasts
export const BROOM = { ms: 450, speed: 13 };     // Broom Dash: a burst forward at this speed
export const BLINK = { dist: 6 };                // Blink: step this far ahead (short of walls and pits)
export const INVIS = { ms: 6000 };               // Invisibility: all but gone until it ends or you shoot
export const CURSE = { ms: 4000, slow: 0.55, range: 30, cone: 0.22 }; // Curse: slows the enemy you're aiming at
export const SCROLL_CRATES = 8;
export const SCROLL_RESPAWN = 20000;
