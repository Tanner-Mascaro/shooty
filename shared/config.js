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
export const MODE_NAMES = { ffa: 'Free-for-all', teams: 'Teams', hardpoint: 'Hardpoint', plague: 'Plague', snipers: 'Snipers', gungame: 'Gun Game', royale: 'Battle Royale', build: 'Build Battle', ctf: 'Capture the Cauldron',
  harvest: 'Soul Harvest', chamber: 'One in the Chamber', survival: 'Wave Survival' };
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
export const isTeamMode = mode => mode === 'teams' || mode === 'hardpoint' || mode === 'plague' || mode === 'ctf' || mode === 'harvest' || mode === 'survival';
// red vs blue (plague has its own sides; survival is everyone against the monsters)
export const redBlue = mode => mode === 'teams' || mode === 'hardpoint' || mode === 'ctf' || mode === 'harvest';
// Capture the Cauldron: steal the other coven's cauldron and bring it to yours while yours is home.
// Touch range, captures to win, match length, and how long a dropped cauldron waits before going home
export const CTF = { touch: 1.3, caps: 3, ms: 8 * 60 * 1000, returnMs: 20000 };
export const teamName = (mode, team) => (mode === 'plague' ? PLAGUE_TEAMS : mode === 'survival' ? { 1: 'SURVIVORS' } : TEAMS)[team] || '';
// after dying you watch your killer for a moment before respawning; plague turns you into a
// monster on the spot, and battle royale has no respawns (you spectate until the match ends).
// One in the Chamber and survival decide for themselves (lives, next wave)
export const RESPAWN_MS = 3000;
export const respawnDelay = mode => mode === 'plague' ? 0 : mode === 'royale' ? Infinity : RESPAWN_MS;

// Soul Harvest: a kill drops the victim's soul. Enemies reap it for a point; the victim's
// team can deny it by grabbing it first. Unclaimed souls fade after `life` ms
export const SOUL = { touch: 0.9, life: 25000, win: 25 };
export const SOUL_WIN_OPTIONS = [15, 25, 40];

// One in the Chamber: a pistol with one round (every hit kills), the blade, and `lives` lives.
// Every kill loads another round. Last one with lives left wins
export const CHAMBER = { lives: 3, gun: 'pistol' };

// Wave Survival (the Crypt, shared/levels.js): you and your friends against endless waves of
// monsters. Kills and hits earn gold; spend it on doors into new sections, guns off the walls,
// the mystery cauldron and elixirs. Fall and you're out until the next wave starts; everyone
// down is game over
export const SURVIVAL = {
  startGold: 500, hitGold: 10, killGold: 60, headGold: 40, meleeGold: 100, waveGold: 100,
  firstWaveMs: 6000, breakMs: 9000, // a breather between waves
  boxCost: 950, boxGuns: ['uzi', 'smg', 'shotgun', 'burst', 'carbine', 'rifle', 'lmg', 'deagle', 'revolver', 'beam', 'wand', 'crossbow', 'sniper',
    'flintlock', 'assault', 'dmr', 'marksman', 'dragon', 'doublebarrel', 'autoshotgun', 'blunderbuss', 'gatling', 'reaper', 'swarm', 'tommy', 'staff', 'bow'],
  refillShare: 0.5, // buying a wall gun you already carry refills it for this share of the price
  maxAlive: w => Math.min(34, 6 + w * 2), // monsters on the map at once
  count: w => Math.min(160, 5 + Math.round(w * 3.2 + w * w * 0.18)), // monsters in the wave
  hpScale: w => 1 + (w - 1) * 0.22 + Math.max(0, w - 10) * 0.12,
  speedScale: w => Math.min(1.6, 1 + (w - 1) * 0.035),
  dropChance: 0.035, dropLife: 25000,
};
// door groups in the Crypt map (digits in shared/levels.js): what each costs and what's behind it
export const DOORS = {
  1: { cost: 750, name: 'Chapel' }, 2: { cost: 750, name: 'Ossuary' }, 3: { cost: 1000, name: 'Catacombs' },
  4: { cost: 1250, name: 'Flooded Tombs' }, 5: { cost: 1500, name: 'Bone Pit' }, 6: { cost: 2000, name: 'Throne of Bones' },
};
// guns on the walls (lowercase letters in the Crypt map)
export const WALL_BUYS = {
  a: { w: 'uzi', cost: 500 }, b: { w: 'carbine', cost: 900 }, c: { w: 'shotgun', cost: 1000 }, d: { w: 'smg', cost: 1100 },
  e: { w: 'rifle', cost: 1400 }, f: { w: 'revolver', cost: 1200 }, g: { w: 'lmg', cost: 2200 }, h: { w: 'sniper', cost: 1800 },
  i: { w: 'beam', cost: 2600 }, j: { w: 'burst', cost: 1300 },
};
// elixirs you drink once per life (capital letters in the Crypt map)
export const ELIXIRS = {
  U: { id: 'troll', name: 'Troll Blood', cost: 2500, text: '+75 max health' },
  V: { id: 'swift', name: 'Swift Tonic', cost: 2000, text: 'Move 15% faster' },
  Y: { id: 'quick', name: 'Quickbrew', cost: 2000, text: 'Reload twice as fast' },
};
export const ELIXIR_HP = 75, ELIXIR_SPEED = 1.15, ELIXIR_RELOAD = 0.5;
// monster drops: walk over them. maxammo refills everyone, double points and insta-kill last
// `ms`, the nuke kills every monster on the map
export const DROPS = { maxammo: { name: 'MAX AMMO' }, double: { name: 'DOUBLE GOLD', ms: 20000 }, insta: { name: 'INSTA-KILL', ms: 20000 }, nuke: { name: 'NUKE' } };
// monster kinds: hp (x the wave's scale), speed, melee damage, cooldown, and when they show up
export const MOBS = {
  ghoul:  { skin: 'zombie', hp: 70, speed: 1.9, dmg: 18, cd: 900, from: 1 },
  mummy:  { skin: 'mummy', hp: 150, speed: 1.4, dmg: 30, cd: 1100, from: 3 },
  wolf:   { skin: 'werewolf', hp: 55, speed: 4.3, dmg: 16, cd: 600, from: 4 },
  slime:  { skin: 'slime', hp: 45, speed: 3.1, dmg: 45, cd: 0, from: 6, blast: 2.4 }, // bursts when it reaches you
  wraith: { skin: 'ghost', hp: 60, speed: 2.4, dmg: 12, cd: 2000, from: 7, ranged: 9 }, // hurls hexes from range
  brute:  { skin: 'demon', hp: 520, speed: 2.1, dmg: 45, cd: 1300, from: 9, big: 1.5 },
  lord:   { skin: 'vampire', hp: 2600, speed: 2.7, dmg: 55, cd: 1000, from: 10, big: 1.8, boss: true }, // boss waves
};
export const MOB_R = 0.3; // monster body radius (players are 0.22)

// power-ups on the arena maps: walk over one for a short boost. Where they sit is picked per
// map (server/extras.js); they come back after `respawn`
export const POWERUPS = {
  fury: { name: 'HEX FURY', ms: 12000, text: 'Double damage' },
  shield: { name: "WITCH'S HAT", ms: 15000, text: 'The brim soaks up 60 damage' },
  feather: { name: 'FEATHERFALL', ms: 15000, text: 'Double jump, soft landings' },
  cloak: { name: 'SHADOW CLOAK', ms: 8000, text: 'Invisible' },
};
export const POWERUP_COUNT = 4, POWERUP_RESPAWN = 40000, POWERUP_SHIELD = 60, FURY_DMG = 2;
// traversal: jump pads fling you up and along, portals come in linked pairs
export const JUMP_PAD = { count: 6, vz: 6.2, push: 5.5, r: 0.55 };
export const PORTAL = { pairs: 2, r: 0.55, cooldown: 1200 };
// map events: every so often something happens to the whole arena for a while
export const MAP_EVENTS = {
  bloodmoon: { name: 'BLOOD MOON', text: 'All damage x1.5', ms: 25000, dmg: 1.5 },
  lowgrav: { name: 'LOW GRAVITY', text: 'Everyone floats', ms: 25000, grav: 0.45 },
  frenzy: { name: 'FRENZY', text: 'Everyone runs 30% faster', ms: 25000, speed: 1.3 },
  meteors: { name: 'METEOR SHOWER', text: 'Watch the sky!', ms: 20000 },
};
export const EVENT_EVERY = 70000, EVENT_FIRST = 45000;
export const METEOR = { every: 900, dmg: 90, radius: 2.6, warn: 1300 };

// custom game settings (private rooms). Everyone in the lobby can change them; they apply to
// the next match. The first value is the default
export const CUSTOM = {
  gravity: [1, 0.5, 1.5],
  speed: [1, 0.8, 1.3, 1.6],
  hp: [100, 50, 200],
  respawn: [3, 1, 6],
  weapons: ['all', 'pistols', 'shotguns', 'snipers', 'blades'],
  headshots: [false, true],
  ammo: ['normal', 'infinite'],
  powerups: [true, false],
  events: [true, false],
};
export const CUSTOM_WEAPONS = {
  pistols: ['pistol', 'deagle', 'revolver', 'derringer', 'flintlock', 'autopistol'], shotguns: ['shotgun', 'doublebarrel', 'autoshotgun', 'blunderbuss'],
  snipers: ['sniper', 'crossbow', 'beam', 'marksman', 'dragon', 'bow'], blades: [],
};
export const defaultCustom = () => Object.fromEntries(Object.entries(CUSTOM).map(([k, v]) => [k, v[0]]));
// a custom setting sent by a player, or undefined if it's not allowed
export function customValue(key, value) {
  return Object.hasOwn(CUSTOM, key) && CUSTOM[key].includes(value) ? value : undefined;
}

// emotes (the emote key opens a wheel; number keys pick one)
export const EMOTES = ['cackle', 'curtsy', 'hex', 'brew', 'broom', 'bats', 'howl', 'hiss'];
export const EMOTE_MS = 2600;

// attachments: one per player, unlocked by level and picked in the lobby. They change your guns
export const ATTACHMENTS = {
  none: { name: 'None', level: 1, text: 'Stock guns' },
  extmag: { name: 'Extended Mags', level: 3, text: '+50% rounds per magazine' },
  quick: { name: 'Speed Loader', level: 5, text: 'Reload 30% faster' },
  laser: { name: 'Laser Sight', level: 7, text: '35% tighter hip-fire spread' },
  hollow: { name: 'Hollow Points', level: 10, text: '+12% damage, -15% rounds per magazine' },
};
export const magSize = (w, att) => {
  const m = WEAPONS[w]?.mag || 0;
  return att === 'extmag' ? Math.ceil(m * 1.5) : att === 'hollow' ? Math.max(1, Math.floor(m * 0.85)) : m;
};
export const reloadTime = (w, att, quick) => (WEAPONS[w]?.reload || 0) * (att === 'quick' ? 0.7 : 1) * (quick ? ELIXIR_RELOAD : 1);

// kill streaks (kills without dying) get callouts on the client; multi-kills are kills within
// MULTI_KILL_MS of each other, and ending a streak this long is a "shut down"
export const MULTI_KILL_MS = 3500;
export const SHUTDOWN_STREAK = 3;

// gun game: every kill moves you to the next gun; a kill with the last one (the blade) wins.
// Getting stabbed knocks you back one gun
export const GUN_GAME_LADDER = ['pistol', 'autopistol', 'uzi', 'reaper', 'smg', 'swarm', 'tommy', 'shotgun', 'autoshotgun', 'doublebarrel', 'burst', 'carbine',
  'assault', 'rifle', 'gatling', 'lmg', 'dmr', 'staff', 'beam', 'wand', 'deagle', 'revolver', 'derringer', 'flintlock', 'blunderbuss', 'bow', 'crossbow', 'marksman', 'sniper', 'dragon', 'blade'];
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
  // --- the armory's newer guns (each handles like a base gun: GUN_BASE below) ---
  derringer:    { dmg: 48,  head: 2,   cd: 220,  spread: 0.02,  scopedSpread: 0.01,  airSpread: 0.06, mag: 2, reload: 1100 },
  flintlock:    { dmg: 92,  head: 2,   cd: 700,  spread: 0.025, scopedSpread: 0.008, airSpread: 0.08, mag: 1, reload: 1500 },
  autopistol:   { dmg: 12,  head: 1.8, cd: 70,   spread: 0.035, scopedSpread: 0.02,  airSpread: 0.08, auto: true, mag: 20, reload: 1300 },
  assault:      { dmg: 26,  head: 2,   cd: 140,  spread: 0.022, scopedSpread: 0.008, airSpread: 0.06, auto: true, mag: 30, reload: 1800 },
  dmr:          { dmg: 44,  head: 2,   cd: 320,  spread: 0.014, scopedSpread: 0.003, airSpread: 0.05, mag: 15, reload: 1900 },
  marksman:     { dmg: 68,  head: 1.8, cd: 520,  spread: 0.09,  scopedSpread: 0,     airSpread: 0.08, mag: 8, reload: 2200 },
  dragon:       { dmg: 150, head: 1.5, cd: 2000, spread: 0.14,  scopedSpread: 0,     airSpread: 0.1,  mag: 3, reload: 3000 },
  doublebarrel: { dmg: 14,  head: 1.5, cd: 320,  spread: 0.08,  pellets: 10, falloff: 9, mag: 2, reload: 1900 },
  autoshotgun:  { dmg: 9,   head: 1.5, cd: 260,  spread: 0.075, pellets: 6, falloff: 10, auto: true, mag: 10, reload: 2600 },
  blunderbuss:  { dmg: 8,   head: 1.5, cd: 1100, spread: 0.12,  pellets: 14, falloff: 8, mag: 1, reload: 1600 },
  gatling:      { dmg: 10,  head: 1.6, cd: 45,   spread: 0.05,  scopedSpread: 0.035, airSpread: 0.09, auto: true, mag: 150, reload: 4200 },
  reaper:       { dmg: 10,  head: 1.8, cd: 50,   spread: 0.03,  scopedSpread: 0.018, airSpread: 0.07, auto: true, mag: 30, reload: 1400 },
  swarm:        { dmg: 9,   head: 1.8, cd: 60,   spread: 0.028, scopedSpread: 0.016, airSpread: 0.07, auto: true, mag: 50, reload: 1900 },
  tommy:        { dmg: 14,  head: 1.8, cd: 90,   spread: 0.035, scopedSpread: 0.02,  airSpread: 0.08, auto: true, mag: 50, reload: 2400 },
  staff:        { dmg: 20,  head: 2,   cd: 110,  spread: 0.012, scopedSpread: 0.004, airSpread: 0.04, auto: true, mag: 40, reload: 1800 },
  bow:          { dmg: 72,  head: 1.8, cd: 650,  spread: 0.015, scopedSpread: 0.003, airSpread: 0.05, mag: 1, reload: 900 },
  blade:    { dmg: 55,  backstab: 150, cd: 450, range: 1.4, melee: true },
  claws:   { dmg: MAX_HP / 2, cd: 450, range: 1.4, melee: true, auto: true },
};
// Every gun's ammo runs out; only the blade needs none. A gun you've emptied completely is gone.
export const START_GUN = 'pistol';
// spare rounds a gun comes with on top of a full mag (the pistol when you spawn, the rest from pads)
export const AMMO = { wand: 30, pistol: 24, deagle: 14, revolver: 18, rifle: 60, burst: 60, carbine: 50, sniper: 4, crossbow: 8, beam: 32, shotgun: 6, smg: 55, uzi: 64, lmg: 150,
  derringer: 10, flintlock: 8, autopistol: 40, assault: 60, dmr: 30, marksman: 16, dragon: 3, doublebarrel: 8, autoshotgun: 10, blunderbuss: 6,
  gatling: 150, reaper: 60, swarm: 100, tommy: 100, staff: 60, bow: 12 };
// the newer guns look, sound and handle like one of the originals (their model in your hands,
// the scope, the tracer); their stats and color are their own
export const GUN_BASE = { derringer: 'pistol', flintlock: 'revolver', autopistol: 'pistol', assault: 'rifle', dmr: 'carbine', marksman: 'sniper',
  dragon: 'sniper', doublebarrel: 'shotgun', autoshotgun: 'shotgun', blunderbuss: 'shotgun', gatling: 'lmg', reaper: 'smg', swarm: 'smg', tommy: 'smg',
  staff: 'beam', bow: 'crossbow' };
export const gunLook = w => GUN_BASE[w] || w;
// how a gun is named on screen
export const GUN_NAMES = { autopistol: 'Auto Pistol', assault: 'Grim Rifle', dmr: 'Warden DMR', marksman: 'Marksman', dragon: 'Dragon Rifle',
  doublebarrel: 'Double Barrel', autoshotgun: 'Auto Shotgun', gatling: 'Gatling Hex', reaper: 'Reaper SMG', swarm: 'Swarm', tommy: 'Coven Tommy',
  staff: 'Storm Staff', bow: 'Bone Bow', lmg: 'LMG', smg: 'SMG', beam: 'Beam Rifle', wand: 'Hex Wand' };
export const gunName = w => GUN_NAMES[w] || (w ? w[0].toUpperCase() + w.slice(1) : '');
export const MAX_SPARE = w => WEAPONS[w].mag * 3; // spare rounds you can carry per gun
export const PAD_GUNS = ['rifle', 'sniper', 'shotgun', 'smg', 'deagle', 'burst', 'lmg', 'revolver', 'carbine', 'crossbow', 'uzi', 'beam', 'wand',
  'derringer', 'flintlock', 'autopistol', 'assault', 'dmr', 'marksman', 'dragon', 'doublebarrel', 'autoshotgun', 'blunderbuss', 'gatling', 'reaper', 'swarm', 'tommy', 'staff', 'bow'];
// the Hex Wand's bolt jumps from whoever it hits to the nearest other enemy within range
export const WAND_CHAIN = { range: 5, dmg: 22 };
export const SNIPER_GUNS = ['sniper', 'crossbow', 'beam', 'marksman', 'dragon', 'bow', 'dmr'];
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
export const STORED_SPELLS = ['heal', 'haste', 'ward', 'broom', 'blink', 'invis', 'curse', 'frost', 'totem', 'well', 'decoy'];
export const FROST = { radius: 5, ms: 1800 };           // Frost Nova: roots every enemy near you
export const TOTEM = { ms: 9000, radius: 4, hps: 14 };  // Healing Totem: heals you and allies nearby
export const WELL = { ms: 2600, radius: 5.5, pull: 3.2, range: 18 }; // Gravity Well: drags enemies toward where you aim
export const DECOY = { ms: 8000, hp: 60 };              // Decoy: a double of you that draws fire
export const HEAL_SPELL = 50;                    // hp, up to your max
export const HASTE = { ms: 5000, speed: 1.5 };  // move this much faster for a while
export const WARD = { ms: 8000, absorb: 60 };   // soaks up this much damage while it lasts
export const BROOM = { ms: 450, speed: 13 };     // Broom Dash: a burst forward at this speed
export const BLINK = { dist: 6 };                // Blink: step this far ahead (short of walls and pits)
export const INVIS = { ms: 6000 };               // Invisibility: all but gone until it ends or you shoot
export const CURSE = { ms: 4000, slow: 0.55, range: 30, cone: 0.22 }; // Curse: slows the enemy you're aiming at
export const SCROLL_CRATES = 8;
export const SCROLL_RESPAWN = 20000;
