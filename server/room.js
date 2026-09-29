// One game room: up to MAX_PLAYERS people (more seats for bots in battle royale) in free-for-all or red vs blue teams. The Hub (hub.js)
// owns connections, accounts and friends; a room only sees the players inside it.
// People can join a match that's already running; it ends early if too few are left.
import { TICK, RES, MAX_HP, WIN_SCORE, TEAM_WIN_SCORE, WIN_SCORE_OPTIONS, TEAM_WIN_SCORE_OPTIONS, HARDPOINT_SCORE_LIMIT, HARDPOINT_MATCH_MS, HARDPOINT_ROTATION_MS, HARDPOINT_FIRST_MS, HARDPOINT_REVEAL_MS, HARDPOINT_SITE_COUNT, HARDPOINT_RADIUS, MAX_PLAYERS, TEAMS, PLAYER_SKINS, EYE, BODY_H, PIT_DPS, PICKUP_RESPAWN, HEAL, HEAL_RESPAWN, WEAPONS, AMMO, MAX_SPARE, AMMO_CRATES, AMMO_RESPAWN, GUN_CRATES, GUN_CRATE_RESPAWN, GUN_SLOTS, USE_RANGE, BOX_TIME, NADE, NADE_CRATES, NADE_RESPAWN, MOVE_SPEED_LIMIT, startGun, padGuns, HACK_HP, HACK_DMG, HACK_SPEED, HACK_FIRE } from '../shared/config.js';
import { LEVELS, LEVEL_NAMES, FEATURED_LEVELS, MW, MH } from '../shared/levels.js';
import { buildTerrain, groundAt, walkHeight, kindAt, findPickups, hitsWall } from '../shared/terrain.js';
import { doShoot, doMelee } from './combat.js';
import { newBrain, botTick, BOT_LEVELS, KNIFE_CHANCE, NADE_CHANCE, randomBotName, randomPersonality } from './bot.js';
import { MODE_NAMES, PLAGUE_DURATION, PLAGUE_TEAM, HEALTHY_TEAM, PLAGUE_SKIN, PLAGUE_SPEED_MULTIPLIER, PLAGUE_MAX_HP, isTeamMode, teamName, redBlue, CTF } from '../shared/config.js';
import { canBuildIn, rampLevels, MAX_MANA, MANA_REGEN, BUILDS, SPELL_SLOTS, STORED_SPELLS, HEAL_SPELL, HASTE, WARD, SCROLL_CRATES, SCROLL_RESPAWN, WAND_CHAIN, BROOM, BLINK, INVIS, CURSE, FROST, TOTEM, WELL } from '../shared/config.js';
import { RAMP, canBuild, applyBuild, removeBuild, touchesBuild, rampUnder, fitsLevels } from '../shared/spells.js';
import { maxPlayers, respawnDelay, RESPAWN_MS, MULTI_KILL_MS, SHUTDOWN_STREAK, GUN_GAME_LADDER, gunGameGun, ROYALE_ZONE } from '../shared/config.js';
import { tryDash } from '../shared/movement.js';
import { log } from './log.js';
import { XP, levelFor, skinUnlocked, TITLES, KILL_EFFECTS } from '../shared/progression.js';
import { VERSION } from './version.js';
import { EVENT_FIRST, SURVIVAL, SOUL, SOUL_WIN_OPTIONS, CHAMBER, CUSTOM_WEAPONS, defaultCustom, magSize, reloadTime, ELIXIR_HP, ELIXIR_SPEED, FURY_DMG, MAP_EVENTS, ATTACHMENTS, EMOTES, EMOTE_MS } from '../shared/config.js';
import { modeLevel } from '../shared/levels.js';
import { extraMethods, extraHandlers } from './extras.js';
import { survivalMethods, survivalHandlers } from './survival.js';

const CHAT_MAX = 140; // as in public/js/chat.js

// Anyone can add bots to a room with the lobby's + BOT / − BOT buttons; they only fill empty
// seats, so a person joining a full room takes a bot's place. `node server.js --bots` (or
// BOTS=1) also starts every new room with one (local testing). The flag works in every shell;
// env vars need different syntax on Windows.
export const BOTS = process.argv.includes('--bots') || !!process.env.BOTS;

const PLAYER_R = 0.22; // body radius for wall collisions, as in public/js/physics.js

// Pick five stable, map-specific hills on broad, flat, open ground. Their order is fixed for
// each map so teams can learn the rotation instead of chasing a randomly moving objective.
function makeHardpointSites(MAP, T) {
  const candidates = [];
  for (let y = 3; y < MH - 3; y++) for (let x = 3; x < MW - 3; x++) {
    if (MAP[y][x] !== '.') continue;
    const sx = x + 0.5, sy = y + 0.5;
    if (groundAt(T, sx, sy) > 0.05 || hitsWall(T, sx, sy, PLAYER_R)) continue;
    let clear = true;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, px = sx + Math.cos(a) * HARDPOINT_RADIUS, py = sy + Math.sin(a) * HARDPOINT_RADIUS;
      if (kindAt(T, px, py) !== 0 || groundAt(T, px, py) > 0.05 || hitsWall(T, px, py, PLAYER_R)) { clear = false; break; }
    }
    if (clear) candidates.push({ x: sx, y: sy, z: 0, radius: HARDPOINT_RADIUS });
  }
  const anchors = [
    { x: MW / 2, y: MH / 2 }, { x: MW / 4, y: MH / 4 }, { x: MW * 3 / 4, y: MH / 4 },
    { x: MW * 3 / 4, y: MH * 3 / 4 }, { x: MW / 4, y: MH * 3 / 4 },
  ];
  const sites = [];
  for (const anchor of anchors) {
    let options = candidates.filter(c => sites.every(s => Math.hypot(c.x - s.x, c.y - s.y) >= 12));
    if (!options.length) options = candidates.filter(c => sites.every(s => Math.hypot(c.x - s.x, c.y - s.y) >= 6));
    options.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y));
    if (options.length) sites.push(options[0]);
  }
  // Dense maps may not have a valid point near every anchor; fill remaining slots with the
  // farthest clear sites so the rotation still spans the map.
  while (sites.length < HARDPOINT_SITE_COUNT) {
    let best = null, bestGap = -1;
    for (const c of candidates) {
      const gap = sites.length ? Math.min(...sites.map(s => Math.hypot(c.x - s.x, c.y - s.y))) : Infinity;
      if (gap >= 4 && gap > bestGap) { best = c; bestGap = gap; }
    }
    if (!best) break;
    sites.push(best);
  }
  return sites;
}

const TERRAINS = {};
for (const k in LEVELS) TERRAINS[k] = buildTerrain(LEVELS[k], RES, k); // level key = obstacle style
// a room's own copy of a map's height grid, made the first time someone builds on it
const ownCopy = T => ({ ...T, hgt: new Float32Array(T.hgt), kind: new Uint8Array(T.kind), mat: new Uint8Array(T.mat) });

// open flat cells reachable from the map's corner; only depends on the level, so each is built once
const SPAWN_SPOTS = {};
function spawnSpots(M, T) {
  const spots = [];
  const reach = Array.from({ length: MH }, () => Array(MW).fill(false));
  const q = [];
  if (M[1][1] !== '#') { reach[1][1] = true; q.push([1, 1]); }
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || reach[ny][nx] || M[ny][nx] === '#') continue;
      reach[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      if (M[y][x] !== '.' || !reach[y][x]) continue;
      let nearPit = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (M[y + dy][x + dx] === 'L') nearPit = true;
      // shapes spread past their squares (volcano slopes, cliffs): only spawn on clear flat ground
      if (!nearPit && !hitsWall(T, x + 0.5, y + 0.5, 0.5) && groundAt(T, x + 0.5, y + 0.5) < 0.05) spots.push({ x: x + 0.5, y: y + 0.5 });
    }
  if (!spots.length) { // fallback: any open flat cell
    for (let y = 1; y < MH - 1; y++)
      for (let x = 1; x < MW - 1; x++) {
        if (M[y][x] === '#' || hitsWall(T, x + 0.5, y + 0.5, 0.5)) continue;
        if (groundAt(T, x + 0.5, y + 0.5) < 0.05) spots.push({ x: x + 0.5, y: y + 0.5 });
      }
  }
  return spots;
}

export class Room {
  constructor(hub, code, isPrivate) {
    this.hub = hub;
    this.code = code;
    this.private = isPrivate; // quick play never drops strangers into a private room
    this.players = {};        // id -> player (the hub's connection object, or a bot)
    this.mode = 'ffa';        // a MODE_NAMES key: 'ffa' | 'teams' | 'hardpoint' | 'plague' | 'snipers' | 'gungame' | 'royale'
    this.winScore = WIN_SCORE;
    this.teamWinScore = TEAM_WIN_SCORE;
    this.gameOn = false;
    this.plagueEndsAt = 0;
    this.hardpointStartedAt = 0;
    this.hardpointEndsAt = 0;
    this.hardpointLastScoreAt = 0;
    this.hardpointScores = { 1: 0, 2: 0 };
    this.hardpointScoreMs = { 1: 0, 2: 0 };
    this.hardpointOwner = 0;
    this.hardpointContested = false;
    this.hardpointOvertime = false;
    this.hardpointOvertimeScores = null;
    this.plagueSelection = 'random'; // 'random' | 'manual'; manual roles survive rematches
    this.boxes = [];          // loot boxes: { id, x, y, z, items: [{ w, mag, spare }], until }
    this.boxId = 0;
    this.nades = [];          // thrown grenades in flight
    this.nadeId = 0;
    this.zone = null;         // battle royale storm: { stages: [{ from, to, shrinkAt, doneAt, dps }] }
    this.builds = [];         // conjured ramps: { id, kind, x, y, dir, base, on (the ramp it stands on), hp, until, by, prev }
    this.buildId = 0;
    this.custom = defaultCustom(); // custom game settings (shared/config.js CUSTOM)
    this.soulWinScore = SOUL.win;
    this.npcs = [];           // monsters (survival) and decoys: { id, npc, kind, x, y, z, a, hp, ... } (extras.js, survival.js)
    this.npcId = 0;
    this.souls = [];          // Soul Harvest: { id, x, y, z, team, until }
    this.soulScores = { 1: 0, 2: 0 };
    this.powerups = [];       // { id, x, y, z, kind, active, respawnAt }
    this.totems = []; this.wells = []; this.meteors = [];
    this.event = null;        // map event: { kind, until }
    this.survival = null;     // Wave Survival state (survival.js)
    this.setLevel('witch');
  }

  get list() { return Object.values(this.players); }
  get humans() { return this.list.filter(p => !p.bot); }
  get full() { return this.humans.length >= MAX_PLAYERS; } // bots give up their seats
  get max() { return maxPlayers(this.mode); } // seats, counting bots
  get hasBots() { return this.list.some(p => p.bot); }
  isInfected(p) { return this.mode === 'plague' && p.team === PLAGUE_TEAM; }
  maxHp(p) {
    if (p.hacks) return HACK_HP;
    if (this.isInfected(p)) return PLAGUE_MAX_HP;
    return (this.mode === 'survival' ? MAX_HP : this.custom.hp) + (p.elixirs?.troll ? ELIXIR_HP : 0);
  }
  // speed multiplier on top of the usual limits: custom speed, the Frenzy event, Swift Tonic
  speedScale(p, now = Date.now()) {
    return (this.mode === 'survival' ? 1 : this.custom.speed) * (this.eventOn('frenzy', now) ? MAP_EVENTS.frenzy.speed : 1) * (p.elixirs?.swift ? ELIXIR_SPEED : 1);
  }
  gravityScale(now = Date.now()) { return (this.mode === 'survival' ? 1 : this.custom.gravity) * (this.eventOn('lowgrav', now) ? MAP_EVENTS.lowgrav.grav : 1); }
  eventOn(kind, now = Date.now()) { return !!this.event && this.event.kind === kind && now < this.event.until; }
  // one or no round in the pistol: every hit kills (One in the Chamber)
  get chamber() { return this.mode === 'chamber'; }
  // modes with their own start / respawn rules
  respawnMs() {
    if (this.mode === 'plague' || this.mode === 'royale' || this.mode === 'chamber' || this.mode === 'survival') return respawnDelay(this.mode);
    return this.custom.respawn * 1000;
  }
  minPlayers() { return this.mode === 'survival' ? 1 : 2; }
  // guns this match hands out: on spawn, and on the gun pads / crates
  startLoadout(p) {
    const w = this.custom.weapons;
    const gun = this.mode === 'survival' ? 'pistol' : w === 'all' ? startGun(this.mode) : w === 'blades' ? null : CUSTOM_WEAPONS[w][0];
    if (!gun) { p.mag = {}; p.inv = {}; return; }
    p.mag = { [gun]: magSize(gun, p.att) };
    p.inv = { [gun]: AMMO[gun] };
  }
  padGunList() {
    const w = this.custom.weapons;
    return w === 'all' ? padGuns(this.mode) : CUSTOM_WEAPONS[w];
  }

  // cheater loadout: strong guns, full mags, max nades
  giveHackLoadout(p) {
    if (!p.hacks || this.isInfected(p) || this.mode === 'gungame' || this.chamber) return;
    if (this.mode === 'snipers') {
      p.mag = { sniper: magSize('sniper', p.att), beam: magSize('beam', p.att) };
      p.inv = { sniper: MAX_SPARE('sniper'), beam: MAX_SPARE('beam') };
    } else {
      p.mag = { rifle: magSize('rifle', p.att), shotgun: magSize('shotgun', p.att) };
      p.inv = { rifle: MAX_SPARE('rifle'), shotgun: MAX_SPARE('shotgun') };
    }
    p.nades = this.mode === 'snipers' ? 0 : NADE.maxCarry;
  }
  dash(p, dx, dy, now = Date.now()) {
    return this.gameOn && this.isInfected(p) && tryDash(p, dx, dy, now);
  }
  get plagueRemainingMs() { return this.mode === 'plague' && this.gameOn ? Math.max(0, this.plagueEndsAt - Date.now()) : 0; }
  skinOf(p) { return this.mode === 'plague' && this.gameOn && p.team === PLAGUE_TEAM ? PLAGUE_SKIN : p.skin || 'witch'; }
  hardpointSnapshot(now = Date.now()) {
    if (this.mode !== 'hardpoint' || !this.gameOn || !this.hardpointSites.length) return null;
    const elapsed = now - this.hardpointStartedAt, beforeStart = elapsed < HARDPOINT_FIRST_MS;
    const rotationElapsed = Math.max(0, elapsed - HARDPOINT_FIRST_MS);
    const index = Math.floor(rotationElapsed / HARDPOINT_ROTATION_MS) % this.hardpointSites.length;
    const rotationRemainingMs = beforeStart ? 0 : HARDPOINT_ROTATION_MS - (rotationElapsed % HARDPOINT_ROTATION_MS);
    const point = (i, active) => Object.assign({ index: i, active }, this.hardpointSites[i]);
    const active = beforeStart ? null : point(index, true);
    const revealNext = beforeStart || rotationRemainingMs <= HARDPOINT_REVEAL_MS;
    const next = revealNext ? point(beforeStart ? 0 : (index + 1) % this.hardpointSites.length, false) : null;
    return {
      scores: { ...this.hardpointScores },
      matchRemainingMs: Math.max(0, this.hardpointEndsAt - now),
      hillRemainingMs: beforeStart ? HARDPOINT_FIRST_MS - elapsed : rotationRemainingMs,
      activatesInMs: beforeStart ? HARDPOINT_FIRST_MS - elapsed : 0,
      index: beforeStart ? -1 : index,
      count: this.hardpointSites.length,
      active, next, owner: this.hardpointOwner, contested: this.hardpointContested,
      overtime: this.hardpointOvertime,
    };
  }
  hardpointTarget(now = Date.now()) {
    const state = this.hardpointSnapshot(now);
    return state && (state.active || state.next);
  }
  startMessage() {
    return { type: 'start', level: this.level, mode: this.mode, plagueRemainingMs: this.plagueRemainingMs,
      hardpoint: this.hardpointSnapshot(), zone: this.zoneSnapshot(Date.now()), ctf: this.ctfSnapshot(), builds: this.buildList(),
      custom: this.custom, pads: this.pads, portals: this.portals, event: this.eventSnapshot(), survival: this.survivalSnapshot() };
  }
  plagueSetupValid() {
    return this.mode !== 'plague' || this.plagueSelection === 'random'
      || [PLAGUE_TEAM, HEALTHY_TEAM].every(team => this.list.some(p => p.plagueStartTeam === team));
  }
  resetReady() { this.list.forEach(p => p.ready = !!p.bot); }

  // --- messaging ---
  send(p, msg) { this.hub.send(p, msg); }
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.humans) this.hub.sendRaw(p, data);
  }
  // who's here, teams and ready state: sent whenever any of it changes
  roster() {
    const votes = {}, modeVotes = {};
    for (const p of this.humans) {
      if (p.vote && LEVELS[p.vote]) votes[p.vote] = (votes[p.vote] || 0) + 1;
      if (p.modeVote && Object.hasOwn(MODE_NAMES, p.modeVote)) modeVotes[p.modeVote] = (modeVotes[p.modeVote] || 0) + 1;
    }
    this.broadcast({ type: 'room', code: this.code, private: this.private, mode: this.mode, level: this.level,
      gameOn: this.gameOn, bots: BOTS, max: this.max, votes, modeVotes, plagueRemainingMs: this.plagueRemainingMs,
      plagueSelection: this.plagueSelection, plagueSetupValid: this.plagueSetupValid(),
      winScore: this.winScore, teamWinScore: this.teamWinScore, soulWinScore: this.soulWinScore, custom: this.custom, hardpoint: this.hardpointSnapshot(),
      players: this.list.map(p => ({ id: p.id, name: this.hub.name(p), team: p.team, att: p.att || 'none', plagueStartTeam: p.plagueStartTeam, skin: this.skinOf(p), ready: p.ready, bot: !!p.bot, account: !!p.username, title: !p.bot && TITLES[p.title] && p.title !== 'apprentice' ? TITLES[p.title].name : null, level: p.level, personality: p.personality, vote: p.vote || null, modeVote: p.modeVote || null })) });
  }

  // --- level / pickups ---
  setLevel(name) {
    this.level = name;
    this.map = LEVELS[name];
    this.T = TERRAINS[name];
    this.builds = [];
    this.hardpointSites = makeHardpointSites(this.map, this.T);
    this.resetPickups();
    this.makeTraversal();
  }
  spawnSpotsList() { return SPAWN_SPOTS[this.level] ||= spawnSpots(this.map, TERRAINS[this.level]); }
  // a fresh copy of the map's height grid for this room (the Crypt's doors go in it)
  freshTerrain() { this.builds = []; this.T = ownCopy(TERRAINS[this.level]); }
  // the level's pads (gun pads roll a random gun every time they come back; health / nades stay)
  // plus ammo crates, spare guns and grenades at random open spots each match
  resetPickups() {
    this.pickups = findPickups(this.map).map(p => Object.assign(p, {
      gun: p.weapon !== 'health' && p.weapon !== 'nade',
      nade: p.weapon === 'nade',
    })).filter(p => (this.mode !== 'snipers' || !p.nade) && (this.mode !== 'gungame' || !p.gun && !p.nade)
      && (!this.chamber || p.weapon === 'health') && (this.custom.weapons === 'all' || !p.gun || this.padGunList().length));
    if (this.mode === 'survival') { this.pickups = []; this.boxes = []; this.nades = []; return; } // the Crypt has its own shops
    const taken = [...this.pickups];
    const scatter = (n, weapon, gun, nade, crate) => {
      for (let i = 0; i < n; i++) {
        const s = this.spawnPos(taken);
        if (!s) break;
        taken.push(s);
        this.pickups.push({ x: s.x, y: s.y, weapon, gun: !!gun, nade: !!nade, crate: !!crate });
      }
    };
    if (!this.chamber) scatter(AMMO_CRATES, 'ammo', false, false, false);
    scatter(SCROLL_CRATES, 'scroll', false, false, false);
    for (const pu of this.pickups) if (pu.weapon === 'scroll') pu.scroll = true;
    if (this.mode !== 'gungame' && !this.chamber) { // gun game: the ladder hands out every gun, and no potions
      if (this.padGunList().length) scatter(GUN_CRATES, 'rifle', true, false, true); // weapon re-rolled in rollPad; walk-over crates
      if (this.mode !== 'snipers') scatter(NADE_CRATES, 'nade', false, true, false);
    }
    for (const pu of this.pickups) { pu.active = true; pu.respawnAt = 0; this.rollPad(pu); }
    this.boxes = [];
    this.nades = [];
  }
  rollPad(pu) {
    if (pu.scroll) pu.spell = STORED_SPELLS[Math.floor(Math.random() * STORED_SPELLS.length)];
    if (!pu.gun) return;
    const guns = this.padGunList();
    if (guns.length) pu.weapon = guns[Math.floor(Math.random() * guns.length)];
  }
  pickupList() { return { type: 'pickups', spots: this.pickups.map(p => ({ x: p.x, y: p.y, weapon: p.weapon, crate: !!p.crate, spell: p.spell })), active: this.pickups.map(p => p.active) }; }
  broadcastPickups() { this.broadcast(this.pickupList()); }
  boxList() { return { type: 'boxes', boxes: this.boxes.map(b => ({ id: b.id, x: b.x, y: b.y, z: b.z, items: b.items.map(it => it.w) })) }; }
  syncAmmo(p) {
    this.send(p, { type: 'inv', mag: p.mag, inv: p.inv, nades: p.nades || 0, spells: p.spells || [], clawsOnly: this.isInfected(p),
      att: p.att || 'none', elixirs: p.elixirs || {}, ...(this.chamber ? { lives: p.lives } : {}), ...(this.mode === 'survival' ? { gold: p.gold || 0 } : {}) });
  }

  voteWinner() {
    const counts = {};
    for (const p of this.humans) if (p.vote && LEVELS[p.vote]) counts[p.vote] = (counts[p.vote] || 0) + 1;
    let best = this.level === 'crypt' ? 'witch' : this.level, n = 0;
    for (const [k, v] of Object.entries(counts)) if (v > n) { n = v; best = k; }
    return best;
  }

  modeVoteWinner() {
    const counts = {};
    for (const p of this.humans) if (p.modeVote && Object.hasOwn(MODE_NAMES, p.modeVote)) counts[p.modeVote] = (counts[p.modeVote] || 0) + 1;
    let best = this.mode, n = 0;
    for (const [k, v] of Object.entries(counts)) if (v > n) { n = v; best = k; }
    return best;
  }

  // apply a lobby mode (from votes): reassign teams and clear ready flags
  applyMode(mode) {
    if (!Object.hasOwn(MODE_NAMES, mode) || mode === this.mode) return false;
    this.mode = mode;
    this.plagueEndsAt = 0;
    while (this.list.length > this.max && this.dropBot()); // leaving battle royale's bigger rooms
    this.list.forEach((pl, i) => {
      pl.team = this.mode === 'plague' ? HEALTHY_TEAM : redBlue(this.mode) ? i % 2 + 1 : this.mode === 'survival' ? 1 : 0;
      pl.ready = !!pl.bot;
    });
    // survival always plays in the Crypt; leaving it goes back to the voted realm
    const level = modeLevel(mode) || (this.level === 'crypt' ? this.voteWinner() : this.level);
    if (level !== this.level) { this.setLevel(level === 'crypt' && !modeLevel(mode) ? 'witch' : level); this.broadcast({ type: 'level', level: this.level }); }
    return true;
  }

  // a loot box on the ground at (x, y); nothing if it would land in lava / acid / bog
  addBox(x, y, items) {
    if (!items.length || kindAt(this.T, x, y) === 2) return;
    // walkHeight, not groundAt: under a hut roof the heightmap is the roof, but loot sits on the floor
    this.boxes.push({ id: ++this.boxId, x, y, z: walkHeight(this.T, x, y, 0), items, until: Date.now() + BOX_TIME });
  }

  // a dying player's guns fall at the body, with the ammo left in them (drawn as the guns
  // themselves lying there; walk up and use to take them)
  dropLoot(p) {
    if (this.mode === 'gungame' || this.chamber || this.mode === 'survival') return; // your gun is your rank / your one round / bought with gold
    const items = Object.keys(p.mag).filter(w => p.mag[w] + (p.inv[w] || 0) > 0)
      .map(w => ({ w, mag: p.mag[w], spare: p.inv[w] || 0 }));
    this.addBox(p.x, p.y, items);
  }

  // give `p` gun w: its ammo if they have one, else a free slot, else it replaces `drop` (the gun
  // in their hand) in the same slot. Returns { dropped } (the replaced gun, if any), or null if
  // it can't be done
  takeGun(p, w, mag, spare, drop) {
    if (this.isInfected(p) || this.mode === 'gungame' || this.chamber) return null;
    if (this.mode === 'snipers' && !padGuns(this.mode).includes(w)) return null;
    if (p.mag[w] !== undefined) { this.addSpare(p, w, mag + spare); return { dropped: null }; }
    const guns = Object.keys(p.mag);
    if (guns.length < GUN_SLOTS) { p.mag[w] = mag; p.inv[w] = spare; return { dropped: null }; }
    // if the client sent a stale/missing drop (race after emptying a gun), still swap something out
    const victim = guns.includes(drop) ? drop : guns[0];
    const dropped = { w: victim, mag: p.mag[victim], spare: p.inv[victim] || 0 };
    const mags = {}, invs = {};
    for (const g of guns) { // rebuild so the new gun keeps the old one's slot
      const k = g === victim ? w : g;
      mags[k] = g === victim ? mag : p.mag[g];
      if (g === victim) invs[k] = spare; else if (p.inv[g] !== undefined) invs[k] = p.inv[g];
    }
    p.mag = mags; p.inv = invs;
    return { dropped };
  }
  // spare rounds for gun w, up to what you can carry (the rest is left behind); how many fit
  addSpare(p, w, n) {
    if (this.isInfected(p)) return 0;
    const have = p.inv[w] || 0, add = Math.max(0, Math.min(n, MAX_SPARE(w) - have));
    p.inv[w] = have + add;
    return add;
  }

  // a random open spot on the main walkable area, preferring ones far from everyone in `avoid`
  spawnPos(avoid) {
    const spots = SPAWN_SPOTS[this.level] ||= spawnSpots(this.map, this.T);
    if (!spots.length) return undefined;
    if (!avoid.length) return { ...spots[Math.floor(Math.random() * spots.length)] };
    // pick one of the 10 spots furthest from the nearest enemy
    const gap = s => Math.min(...avoid.map(o => Math.hypot(s.x - o.x, s.y - o.y)));
    const far = spots.map(s => ({ s, gap: gap(s) })).sort((a, b) => b.gap - a.gap);
    return { ...far[Math.floor(Math.random() * Math.min(10, far.length))].s };
  }

  // --- players ---
  // everyone (and every monster or decoy) `p` can hurt
  enemies(p) {
    const players = this.list.filter(o => o !== p && !o.dead && (!isTeamMode(this.mode) || o.team !== p.team));
    return this.npcs.length ? players.concat(this.npcs.filter(n => !n.dead && this.npcHostile(n, p))) : players;
  }
  smallerTeam() { return this.list.filter(p => p.team === 1).length <= this.list.filter(p => p.team === 2).length ? 1 : 2; }
  teamKills(t) { return this.list.filter(p => p.team === t).reduce((n, p) => n + p.kills, 0); }
  score() {
    if (this.mode === 'plague') return `${this.list.filter(p => p.team === HEALTHY_TEAM).length} healthy, ${this.list.filter(p => p.team === PLAGUE_TEAM).length} infected`;
    if (this.mode === 'hardpoint') return `${TEAMS[1]} ${this.hardpointScores[1]}, ${TEAMS[2]} ${this.hardpointScores[2]}`;
    if (this.mode === 'ctf' && this.ctf) return `${TEAMS[1]} ${this.ctf.scores[1]}, ${TEAMS[2]} ${this.ctf.scores[2]} captures`;
    if (this.mode === 'teams') return `${TEAMS[1]} ${this.teamKills(1)}, ${TEAMS[2]} ${this.teamKills(2)}`;
    if (this.mode === 'gungame') return this.list.map(p => `${this.hub.name(p)} gun ${(p.gunLevel || 0) + 1}`).join(', ');
    return this.list.map(p => this.hub.name(p) + ' ' + p.kills).join(', ');
  }
  enoughPlayers() {
    if (this.list.length < this.minPlayers()) return false;
    return !redBlue(this.mode) || [1, 2].every(t => this.list.some(p => p.team === t));
  }

  resetPlayer(p, avoid = this.enemies(p)) {
    const sp = this.mode === 'survival' ? this.survivalSpawn() : this.mode === 'ctf' && this.ctf && p.team ? this.baseSpawn(p.team) : this.spawnPos(avoid);
    p.x = sp.x; p.y = sp.y; p.z = walkHeight(this.T, sp.x, sp.y, 0);
    const near = avoid.length ? avoid.reduce((m, o) => Math.hypot(o.x - sp.x, o.y - sp.y) < Math.hypot(m.x - sp.x, m.y - sp.y) ? o : m) : null;
    p.a = near ? Math.atan2(near.y - sp.y, near.x - sp.x) : Math.random() * Math.PI * 2;
    p.p = 0;
    p.lastInputAt = Date.now() - TICK;
    p.hp = this.maxHp(p);
    p.nades = 0;
    p.dead = false; p.respawnAt = 0;
    p.mana = MAX_MANA; p.hasteUntil = 0; p.wardUntil = 0; p.ward = 0;
    p.broomUntil = 0; p.invisUntil = 0; p.curseUntil = 0;
    p.furyUntil = 0; p.featherUntil = 0; p.frozenUntil = 0; p.padUntil = 0; p.portalLock = null;
    p.elixirs = {}; // elixirs last one life
    if (this.isInfected(p)) { p.mag = {}; p.inv = {}; }
    else if (this.mode === 'gungame') this.gunGameLoadout(p);
    else if (this.chamber) { p.mag = { [CHAMBER.gun]: 1 }; p.inv = {}; }
    else if (p.hacks) this.giveHackLoadout(p);
    else if (this.mode === 'snipers' && this.custom.weapons === 'all') {
      // both long guns from the start; pads only restock sniper / crossbow
      p.mag = { sniper: magSize('sniper', p.att), crossbow: magSize('crossbow', p.att) };
      p.inv = { sniper: AMMO.sniper * 2, crossbow: AMMO.crossbow };
    } else this.startLoadout(p);
    if (this.tutorial && !p.bot) { p.nades = 2; if (!(p.spells || []).length) p.spells = ['haste']; } // something to practice with
    p.lastShot = {};
    p.w = this.isInfected(p) ? null : Object.keys(p.mag)[0] || 'blade'; // what others see in your hand
    p.sc = false; p.sl = false;
    p.vz = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.jumpsUsed = 0; p.jumpHeld = false;
    p.dashUntil = 0; p.nextDash = 0; p.dashX = 0; p.dashY = 0;
    if (p.brain) p.brain = newBrain();
    p.seq++;    // client snaps to the new spawn; stale inputs from the old life are ignored
    this.syncAmmo(p);
  }

  // gun game: just the gun for your rung of the ladder (the blade is always yours)
  gunGameLoadout(p) {
    const gun = gunGameGun(p.gunLevel || 0);
    p.mag = gun === 'blade' ? {} : { [gun]: magSize(gun, p.att) };
    p.inv = gun === 'blade' ? {} : { [gun]: MAX_SPARE(gun) };
    if (p.brain) p.brain.weapon = gun;
  }

  // a practice room: straw dummies that never fight back, no end in sight (public/js/tutorial.js)
  makeTutorial() {
    this.tutorial = true;
    this.winScore = 999;
    for (let i = 0; i < 3; i++) { const b = this.addBot('dummy'); if (b) b.name = 'Straw Dummy ' + (i + 1); }
  }

  add(p, { watch = false } = {}) {
    if (!p.bot && this.list.length >= this.max) this.dropBot(); // make room for a person
    // late gun-game arrivals start level with whoever is furthest behind
    const gunLevel = this.gameOn && this.mode === 'gungame' && this.list.length ? Math.min(...this.list.map(o => o.gunLevel || 0)) : 0;
    Object.assign(p, { room: this, kills: 0, deaths: 0, streak: 0, multi: 0, gunLevel, dead: false, spells: [], lives: CHAMBER.lives, gold: 0, elixirs: {}, ready: !!p.bot, skin: p.skin || 'witch', seq: p.seq || 0, nextFire: {}, mag: {}, inv: {}, lastShot: {}, sc: false, vote: p.vote || null, modeVote: p.modeVote || null, nades: 0 });
    p.plagueStartTeam = HEALTHY_TEAM;
    // Late arrivals join the plague, so reconnecting cannot undo an infection.
    p.team = this.mode === 'plague' ? (this.gameOn ? PLAGUE_TEAM : HEALTHY_TEAM) : redBlue(this.mode) ? this.smallerTeam() : this.mode === 'survival' ? 1 : 0;
    this.players[p.id] = p;
    if (this.mode === 'plague' && !this.gameOn) this.resetReady();
    this.resetPlayer(p);
    // no dropping into a royale or One in the Chamber halfway; watchers spectate. Survival
    // latecomers wait for the next wave
    const watching = this.gameOn && (this.mode === 'royale' || this.chamber || (watch && !p.bot));
    if (watching) this.eliminate(p);
    else if (this.gameOn && this.mode === 'survival') { p.gold = SURVIVAL.startGold; if (this.survival?.phase === 'wave') this.eliminate(p, Infinity); }
    this.send(p, { type: 'init', id: p.id, room: this.code, level: this.level, x: p.x, y: p.y, z: p.z, a: p.a, hp: p.hp, seq: p.seq, version: VERSION,
      ...(watching ? { watching: true } : {}), ...(this.tutorial ? { tutorial: true } : {}) });
    this.send(p, this.pickupList());
    this.send(p, this.boxList());
    this.send(p, { type: 'builds', builds: this.buildList() });
    this.send(p, this.powerupList());
    if (BOTS && !p.bot && this.humans.length === 1 && !this.hasBots) this.addBot();
    if (this.gameOn) this.checkPlagueWin();
    if (this.gameOn && this.chamber) p.lives = 0;
    this.roster();
    if (this.gameOn) this.send(p, this.startMessage()); // roles arrive before the match starts
  }

  remove(p) {
    if (!this.players[p.id]) return;
    this.dropCauldron(p);
    delete this.players[p.id];
    p.room = null;
    if (this.mode === 'plague' && !this.gameOn) this.resetReady();
    if (!this.humans.length) { this.hub.closeRoom(this); return; } // bots go with it
    if (this.gameOn && !this.checkPlagueWin() && !this.checkRoyaleWin() && !this.checkSurvivalOver() && !this.enoughPlayers()) this.endMatch('Not enough players left');
    if (!this.maybeStart()) this.roster(); // the one who wasn't ready left
  }

  // start once every human is ready (bots are always ready) and there is someone to fight
  maybeStart() {
    if (this.gameOn || this.list.length < this.minPlayers() || !this.plagueSetupValid()) return false;
    if (!this.humans.every(pl => pl.ready)) return false;
    this.startGame();
    return true;
  }

  // level: 'easy' | 'medium' | 'hard' (bot.js BOT_LEVELS); each bot gets a random character + name
  addBot(level = 'medium') {
    if (this.list.length >= this.max || !BOT_LEVELS[level]) return false;
    const id = this.hub.nextId++;
    const skin = PLAYER_SKINS[Math.floor(Math.random() * PLAYER_SKINS.length)];
    const taken = new Set(this.list.map(p => (p.name || '').toLowerCase()));
    const name = randomBotName(taken);
    const knife = Math.random() < KNIFE_CHANCE;
    const nadeBot = !knife && this.mode !== 'snipers' && Math.random() < NADE_CHANCE;
    const personality = knife ? 'knife' : nadeBot ? 'potions' : randomPersonality();
    const bot = { id, bot: true, name, level, skin, knife, nadeBot, personality, brain: newBrain(), a: 0, p: 0, seq: 0, nades: 0 };
    this.add(bot);
    log(`${this.hub.name(bot)} joined room ${this.code}`);
    return bot;
  }

  // take out one bot by id, or the newest bot if no id; false if there are none
  dropBot(id) {
    const bot = id != null
      ? this.players[id]
      : this.list.filter(p => p.bot).pop();
    if (!bot || !bot.bot) return false;
    delete this.players[bot.id];
    if (this.mode === 'plague' && !this.gameOn) this.resetReady();
    log(`${this.hub.name(bot)} left room ${this.code}`);
    return true;
  }

  addBots(level, count = 1) {
    let n = 0;
    for (let i = 0; i < count; i++) { if (!this.addBot(level)) break; n++; }
    return n;
  }
  fillBots(level) {
    let n = 0;
    while (this.list.length < this.max) { if (!this.addBot(level)) break; n++; }
    return n;
  }
  clearBots() {
    let n = 0;
    while (this.dropBot()) n++;
    return n;
  }

  killPlayer(victim, killer, info) {
    if (!this.gameOn || victim.dead) return;
    const now = Date.now();
    const at = { x: victim.x, y: victim.y, z: victim.z };
    const skin = this.skinOf(victim);
    const infected = this.mode === 'plague' && killer && killer.team === PLAGUE_TEAM && victim.team === HEALTHY_TEAM;
    if (killer) killer.kills++;
    victim.deaths = (victim.deaths || 0) + 1;
    this.hub.record(killer, { kills: 1, xp: XP.kill });
    this.hub.record(victim, { deaths: 1 });

    // streaks: kills in a row without dying, and multi-kills in quick succession
    const streaks = {};
    if (killer) {
      killer.streak = (killer.streak || 0) + 1;
      killer.multi = now - (killer.lastKillAt || 0) <= MULTI_KILL_MS ? (killer.multi || 1) + 1 : 1;
      killer.lastKillAt = now;
      streaks.streak = killer.streak;
      streaks.multi = killer.multi;
      if ((victim.streak || 0) >= SHUTDOWN_STREAK) streaks.ended = victim.streak;
    }
    victim.streak = 0; victim.multi = 0;
    if (killer) this.hub.progress?.(killer, { type: 'kill', weapon: info.weapon, head: !!info.head, backstab: !!info.backstab, streak: killer.streak });

    // gun game: a kill climbs one gun; a stab knocks the victim down one instead
    let climbed = false;
    if (this.mode === 'gungame' && killer) {
      if (info.weapon === 'blade' && gunGameGun(killer.gunLevel) !== 'blade') {
        if (victim.gunLevel > 0) streaks.demoted = --victim.gunLevel;
      } else { killer.gunLevel++; climbed = streaks.climbed = true; }
      streaks.gunLevel = killer.gunLevel;
    }

    // One in the Chamber: every kill loads a round; every death costs a life
    if (this.chamber) {
      if (killer && killer !== victim && !killer.dead) {
        killer.mag[CHAMBER.gun] = Math.min(magSize(CHAMBER.gun, killer.att), (killer.mag[CHAMBER.gun] || 0) + 1);
        this.syncAmmo(killer);
      }
      victim.lives = Math.max(0, (victim.lives ?? CHAMBER.lives) - 1);
      streaks.lives = victim.lives;
    }
    // Soul Harvest: the victim's soul drops where they fell
    if (this.mode === 'harvest' && info.weapon !== 'respawn') this.dropSoul(victim);
    this.dropLoot(victim);
    this.dropCauldron(victim);
    this.killDecoys(victim);
    if (infected) victim.team = PLAGUE_TEAM;
    const delay = info.weapon === 'respawn' && !(this.chamber && victim.lives <= 0) ? 0
      : this.chamber ? (victim.lives > 0 ? RESPAWN_MS : Infinity)
      : this.mode === 'survival' ? Infinity // back with the next wave
      : this.respawnMs();
    if (delay) this.eliminate(victim, now + delay);
    else this.resetPlayer(victim);
    if (killer && killer.bot && killer !== victim && Math.random() < 0.25) this.emote(killer, Math.random() < 0.5 ? 'hiss' : 'cackle');
    this.broadcast(this.boxList());
    const fx = killer && KILL_EFFECTS[killer.effect]?.color; // the killer's kill effect, if not plain blood
    this.broadcast(Object.assign({ type: 'kill', killer: killer ? killer.id : null, victim: victim.id, infected: !!infected, skin, ...(fx ? { fx } : {}),
      respawnMs: Number.isFinite(delay) ? delay : null }, streaks, info, at));
    const how = killer ? `killed ${this.hub.name(victim)} with ${info.weapon}${info.backstab ? ' (backstab)' : info.head ? ' (headshot)' : ''}`
      : info.weapon === 'respawn' ? 'respawned'
      : info.weapon === 'zone' ? 'was caught in the storm'
      : info.weapon === 'meteor' ? 'was flattened by a meteor'
      : info.mob ? `was slain by a ${info.mob}`
      : 'died in the pit';
    log(`[${this.code}] ${this.hub.name(killer || victim)} ${how} — ${this.score()}`);
    if (this.mode === 'plague') {
      if (infected) this.roster(); // deliver the new team before a possible victory message
      this.checkPlagueWin();
      return;
    }
    if (this.mode === 'royale' || this.chamber) { this.checkRoyaleWin(victim); return; }
    if (this.mode === 'survival') { this.checkSurvivalOver(); return; }
    if (!killer) return;
    if (this.mode === 'gungame') {
      if (killer.gunLevel >= GUN_GAME_LADDER.length) this.finish([killer], { winner: killer.id }, this.hub.name(killer));
      else if (climbed) { this.gunGameLoadout(killer); this.syncAmmo(killer); }
      return;
    }
    if (this.mode === 'teams') {
      if (this.teamKills(killer.team) >= this.teamWinScore) this.finish(this.list.filter(p => p.team === killer.team), { team: killer.team }, TEAMS[killer.team] + ' team');
    } else if (!['hardpoint', 'ctf', 'harvest'].includes(this.mode) && killer.kills >= this.winScore) this.finish([killer], { winner: killer.id }, this.hub.name(killer));
  }

  // out of the fight: the body stays put (others can't hit it), and the player watches until
  // respawnAt (never, in battle royale)
  eliminate(p, respawnAt = Infinity) {
    p.dead = true;
    p.respawnAt = respawnAt;
    p.hp = 0;
    p.sc = false; p.sl = false;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.dashUntil = 0;
  }

  // battle royale ends when one player is left standing (or the last to fall, if the storm
  // takes everyone at once)
  checkRoyaleWin(lastDown = null) {
    if (!this.gameOn || (this.mode !== 'royale' && !this.chamber)) return false;
    // One in the Chamber: whoever still has lives (the dead ones waiting to respawn count)
    const alive = this.chamber ? this.list.filter(p => !p.dead || p.respawnAt < Infinity) : this.list.filter(p => !p.dead);
    if (alive.length > 1) return false;
    const winner = alive[0] || lastDown;
    if (!winner || !this.players[winner.id]) { this.endMatch('Everyone was eliminated'); return true; }
    this.finish([winner], { winner: winner.id }, this.hub.name(winner));
    return true;
  }

  // the storm: nested circles, each inside the last and centered on open ground
  makeZone(now) {
    const spots = SPAWN_SPOTS[this.level] ||= spawnSpots(this.map, this.T);
    const r0 = Math.hypot(MW, MH) / 2 + 1;
    let x = MW / 2, y = MH / 2, r = r0, t = now;
    const stages = [];
    for (const st of ROYALE_ZONE) {
      const nr = r0 * st.r;
      const inside = spots.filter(s => Math.hypot(s.x - x, s.y - y) <= Math.max(0, r - nr));
      const next = inside.length ? inside[Math.floor(Math.random() * inside.length)] : { x, y };
      stages.push({ from: { x, y, r }, to: { x: next.x, y: next.y, r: nr }, shrinkAt: t + st.hold, doneAt: t + st.hold + st.shrink, dps: st.dps });
      t += st.hold + st.shrink;
      ({ x, y } = next); r = nr;
    }
    return { stages };
  }
  // where the safe circle is now: x, y, r; where it's heading: nx, ny, nr; ms until it next
  // starts or stops moving
  zoneAt(now = Date.now()) {
    if (!this.zone || this.mode !== 'royale') return null;
    const stages = this.zone.stages, s = stages.find(s => now < s.doneAt) || stages.at(-1);
    const k = now <= s.shrinkAt ? 0 : Math.min(1, (now - s.shrinkAt) / (s.doneAt - s.shrinkAt));
    const mix = (a, b) => a + (b - a) * k;
    return {
      x: mix(s.from.x, s.to.x), y: mix(s.from.y, s.to.y), r: mix(s.from.r, s.to.r),
      nx: s.to.x, ny: s.to.y, nr: s.to.r, dps: s.dps, stage: stages.indexOf(s), stages: stages.length,
      shrinking: k > 0 && k < 1, ms: Math.max(0, now < s.shrinkAt ? s.shrinkAt - now : s.doneAt - now),
    };
  }
  zoneSnapshot(now) {
    const z = this.zoneAt(now);
    if (!z) return null;
    const r2 = v => Math.round(v * 100) / 100;
    return { x: r2(z.x), y: r2(z.y), r: r2(z.r), nx: r2(z.nx), ny: r2(z.ny), nr: r2(z.nr), stage: z.stage, stages: z.stages,
      shrinking: z.shrinking, ms: Math.round(z.ms), alive: this.list.filter(p => !p.dead).length };
  }
  // storm damage for anyone outside the circle; false once that ended the match
  stepZone(now, dt) {
    const z = this.zoneAt(now);
    if (!z) return true;
    for (const p of this.list) {
      if (p.dead || p.hacks || Math.hypot(p.x - z.x, p.y - z.y) <= z.r) continue;
      p.hp -= z.dps * dt;
      if (p.hp <= 0) this.killPlayer(p, null, { weapon: 'zone' });
      if (!this.gameOn) return false;
    }
    return true;
  }

  startGame() {
    if (this.gameOn || this.list.length < this.minPlayers() || !this.plagueSetupValid()) return;
    const mode = this.modeVoteWinner();
    if (mode !== this.mode) this.applyMode(mode);
    if (this.list.length < this.minPlayers()) return;
    if (redBlue(this.mode) && ![1, 2].every(t => this.list.some(p => p.team === t)))
      this.list.forEach((p, i) => p.team = i % 2 + 1); // everyone picked the same team: split them
    // vs bots, a battle royale fills its extra seats with more of them
    const bot = this.list.find(p => p.bot);
    if (this.mode === 'royale' && bot) this.fillBots(bot.level);
    const map = modeLevel(this.mode) || this.voteWinner();
    if (map !== this.level) this.setLevel(map);
    if (this.mode === 'hardpoint' && !this.hardpointSites.length) return;
    const now = Date.now();
    if (this.mode === 'hardpoint') {
      this.hardpointStartedAt = now;
      this.hardpointEndsAt = now + HARDPOINT_MATCH_MS;
      this.hardpointLastScoreAt = now;
      this.hardpointScores = { 1: 0, 2: 0 };
      this.hardpointScoreMs = { 1: 0, 2: 0 };
      this.hardpointOwner = 0;
      this.hardpointContested = false;
      this.hardpointOvertime = false;
      this.hardpointOvertimeScores = null;
    }
    if (this.mode === 'plague') {
      this.list.forEach(p => p.team = this.plagueSelection === 'manual' ? p.plagueStartTeam : HEALTHY_TEAM);
      if (this.plagueSelection === 'random') this.list[Math.floor(Math.random() * this.list.length)].team = PLAGUE_TEAM;
      this.plagueEndsAt = Date.now() + PLAGUE_DURATION;
    }
    this.ctf = this.mode === 'ctf' ? { scores: { 1: 0, 2: 0 }, endsAt: now + CTF.ms, c: { 1: this.cauldronHome(1), 2: this.cauldronHome(2) } } : null;
    const placed = [];
    this.clearBuilds();
    this.npcs = []; this.souls = []; this.soulScores = { 1: 0, 2: 0 };
    this.totems = []; this.wells = []; this.meteors = []; this.event = null;
    this.eventAt = now + EVENT_FIRST;
    if (this.mode === 'survival') this.startSurvival(now);
    else this.survival = null;
    for (const p of this.list) {
      p.kills = 0; p.deaths = 0; p.ready = !!p.bot; p.spells = [];
      p.streak = 0; p.multi = 0; p.lastKillAt = 0; p.gunLevel = 0; p.lives = CHAMBER.lives; p.gold = this.mode === 'survival' ? SURVIVAL.startGold : 0;
      this.resetPlayer(p, placed.filter(o => !isTeamMode(this.mode) || o.team !== p.team));
      placed.push(p);
    }
    this.resetPickups();
    this.resetPowerups();
    this.zone = this.mode === 'royale' ? this.makeZone(now) : null;
    this.gameOn = true;
    this.roster();
    this.broadcast(this.startMessage());
    if (this.tutorial) this.humans.forEach(p => this.syncAmmo(p)); // the start message clears the practice potions and spell
    this.broadcastPickups();
    this.broadcast(this.boxList());
    this.broadcast(this.powerupList());
    log(`[${this.code}] Match started on ${LEVEL_NAMES[this.level]} (${MODE_NAMES[this.mode]}): ${this.list.map(p => this.hub.who(p)).join(', ')}`);
    for (const p of this.humans) this.hub.presence?.(p); // friends see "playing" (and a Watch button)
  }

  checkPlagueWin(now = Date.now()) {
    if (!this.gameOn || this.mode !== 'plague') return false;
    const healthy = this.list.filter(p => p.team === HEALTHY_TEAM), infected = this.list.filter(p => p.team === PLAGUE_TEAM);
    let team;
    if (!healthy.length) team = PLAGUE_TEAM;
    else if (!infected.length || now >= this.plagueEndsAt) team = HEALTHY_TEAM;
    else return false;
    this.finish(team === PLAGUE_TEAM ? infected : healthy, { team, mode: this.mode }, teamName(this.mode, team));
    return true;
  }

  updateHardpoint(now) {
    if (!this.gameOn || this.mode !== 'hardpoint') return false;
    const state = this.hardpointSnapshot(now), present = { 1: false, 2: false };
    if (state.active) for (const p of this.list) {
      if (p.dead || (p.team !== 1 && p.team !== 2)) continue;
      const floor = walkHeight(this.T, p.x, p.y, p.z);
      if (p.z - floor > 0.55 || Math.hypot(p.x - state.active.x, p.y - state.active.y) > state.active.radius) continue;
      present[p.team] = true;
    }
    this.hardpointContested = present[1] && present[2];
    this.hardpointOwner = this.hardpointContested ? 0 : present[1] ? 1 : present[2] ? 2 : 0;

    const elapsed = Math.min(200, Math.max(0, now - this.hardpointLastScoreAt));
    this.hardpointLastScoreAt = now;
    if (state.active && this.hardpointOwner && !this.hardpointContested) {
      const team = this.hardpointOwner;
      this.hardpointScoreMs[team] += elapsed;
      const earned = Math.floor(this.hardpointScoreMs[team] / 1000);
      if (earned) {
        this.hardpointScores[team] += earned;
        this.hardpointScoreMs[team] -= earned * 1000;
      }
    }

    let winner = this.hardpointScores[1] >= HARDPOINT_SCORE_LIMIT ? 1
      : this.hardpointScores[2] >= HARDPOINT_SCORE_LIMIT ? 2 : 0;
    if (!winner && now >= this.hardpointEndsAt && !this.hardpointOvertime) {
      if (this.hardpointScores[1] === this.hardpointScores[2]) {
        this.hardpointOvertime = true;
        this.hardpointOvertimeScores = { ...this.hardpointScores };
      } else winner = this.hardpointScores[1] > this.hardpointScores[2] ? 1 : 2;
    } else if (!winner && this.hardpointOvertime && this.hardpointOvertimeScores
      && (this.hardpointScores[1] !== this.hardpointOvertimeScores[1] || this.hardpointScores[2] !== this.hardpointOvertimeScores[2])) {
      winner = this.hardpointScores[1] > this.hardpointOvertimeScores[1] ? 1 : 2;
    }
    if (!winner) return false;
    this.finish(this.list.filter(p => p.team === winner), {
      team: winner, mode: 'hardpoint', hardpointScores: { ...this.hardpointScores },
    }, TEAMS[winner] + ' team');
    return true;
  }

  // final scoreboard for the post-match summary screen
  scoreboard() {
    return this.list
      .map(p => ({ id: p.id, name: this.hub.name(p), kills: p.kills || 0, deaths: p.deaths || 0, team: p.team || 0,
        ...(this.mode === 'survival' ? { gold: p.goldEarned || 0 } : {}) }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
  }

  finish(winners, result, label) {
    this.gameOn = false;
    this.plagueEndsAt = 0;
    this.zone = null;
    this.endExtras();
    this.list.forEach(p => p.ready = !!p.bot);
    this.broadcast(Object.assign({ type: 'win', mode: this.mode, level: this.level, scores: this.scoreboard() }, result));
    for (const p of this.humans) {
      this.hub.record(p, winners.includes(p) ? { wins: 1, xp: XP.match + XP.win } : { losses: 1, xp: XP.match });
      this.hub.matchDone?.(p, { mode: this.mode, level: this.level, won: winners.includes(p), kills: p.kills || 0, deaths: p.deaths || 0 });
    }
    log(`[${this.code}] ${label} won on ${LEVEL_NAMES[this.level]} — ${this.score()}`);
    for (const p of this.humans) this.hub.presence?.(p);
    this.hub.afterMatch(this);
    this.roster();
  }

  endMatch(reason) {
    this.gameOn = false;
    this.plagueEndsAt = 0;
    this.zone = null;
    this.endExtras();
    this.list.forEach(p => p.ready = !!p.bot);
    this.broadcast({ type: 'end', reason, mode: this.mode, level: this.level, scores: this.scoreboard(),
      ...(this.mode === 'hardpoint' ? { hardpointScores: { ...this.hardpointScores } } : {}),
      ...(this.mode === 'ctf' && this.ctf ? { ctfScores: { ...this.ctf.scores } } : {}),
      ...(this.mode === 'harvest' ? { soulScores: { ...this.soulScores } } : {}),
      ...(this.survival ? { wave: this.survival.wave } : {}) });
    log(`[${this.code}] Match ended: ${reason}`);
    for (const p of this.humans) this.hub.presence?.(p);
  }

  // --- spells ---
  buildList() { return this.builds.map(b => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, dir: b.dir, base: b.base, on: b.on, by: b.by })); }
  clearBuilds() {
    for (const b of this.builds) removeBuild(this.T, b.prev);
    this.builds = [];
  }
  // a conjured ramp at (x, y) facing dir, if there's room and nobody is standing there; one that
  // continues another ramp stacks on its top (up to the map's limit)
  addBuild(p, kind, x, y, dir) {
    if (this.T === TERRAINS[this.level]) this.T = ownCopy(this.T); // builds never touch the shared map
    const under = rampUnder(this.builds, x, y, dir), base = under ? under.base + RAMP.rise : 0;
    if (!fitsLevels(base, rampLevels(this.level)) || !canBuild(this.T, kind, x, y, dir)) return null;
    const probe = { kind, x, y, dir, base };
    if (this.list.some(o => !o.dead && [[0, 0], [PLAYER_R, 0], [-PLAYER_R, 0], [0, PLAYER_R], [0, -PLAYER_R]]
      .some(([dx, dy]) => touchesBuild(probe, o.x + dx, o.y + dy, o.z, 0)))) return null;
    const b = { id: ++this.buildId, kind, x, y, dir, base, on: under ? under.id : null, by: p.id, hp: BUILDS[kind].hp, until: Date.now() + BUILDS[kind].life };
    b.prev = applyBuild(this.T, kind, x, y, dir, base);
    this.builds.push(b);
    this.broadcast({ type: 'build', id: b.id, kind, x, y, dir, base, on: b.on, by: p.id });
    return b;
  }
  // taking a ramp down brings down whatever was stacked on it
  breakBuild(b, broken) {
    if (!this.builds.includes(b)) return;
    for (const above of this.builds.filter(o => o.on === b.id)) this.breakBuild(above, broken);
    removeBuild(this.T, b.prev);
    this.builds = this.builds.filter(o => o !== b);
    this.broadcast({ type: 'unbuild', id: b.id, broken });
  }
  damageBuild(x, y, z, dmg) {
    const b = this.builds.find(b => touchesBuild(b, x, y, z));
    if (!b) return;
    b.hp -= dmg;
    if (b.hp <= 0) this.breakBuild(b, true);
  }
  // what a hit from p is worth: Hex Fury, the Blood Moon, hollow points, the cheat multiplier;
  // custom headshots-only games ignore body shots
  scaleDamage(p, dmg, { head = false, melee = false, now = Date.now() } = {}) {
    if (this.mode !== 'survival' && this.custom.headshots && !head && !melee) return 0;
    if (p && p.furyUntil > now) dmg *= FURY_DMG;
    if (this.eventOn('bloodmoon', now)) dmg *= MAP_EVENTS.bloodmoon.dmg;
    if (p && p.att === 'hollow' && !melee) dmg *= 1.12;
    if (p && p.hacks) dmg *= HACK_DMG;
    return Math.round(dmg);
  }
  // damage after any ward soaks some of it up
  hurt(o, dmg, now = Date.now()) {
    if (o.wardUntil > now && o.ward > 0) {
      const soak = Math.min(o.ward, dmg);
      o.ward -= soak; dmg -= soak;
    }
    return dmg;
  }
  // is the straight line between two points free of walls (sampled every 0.2)?
  clearLine(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) if (hitsWall(this.T, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 0.05)) return false;
    return true;
  }
  // a stored spell takes effect; false if it had nothing to do (a curse with no one to curse):
  // then the scroll is kept
  castStored(p, spell, now) {
    const extra = {};
    if (spell === 'heal') p.hp = Math.min(this.maxHp(p), p.hp + HEAL_SPELL);
    else if (spell === 'haste') p.hasteUntil = now + HASTE.ms;
    else if (spell === 'ward') { p.wardUntil = now + WARD.ms; p.ward = WARD.absorb; }
    else if (spell === 'broom') { p.broomUntil = now + BROOM.ms; extra.a = p.a; }
    else if (spell === 'invis') p.invisUntil = now + INVIS.ms;
    else if (spell === 'blink') {
      // step ahead until a wall, pit or ledge would stop you
      let to = null;
      for (let d = 0.25; d <= BLINK.dist; d += 0.25) {
        const x = p.x + Math.cos(p.a) * d, y = p.y + Math.sin(p.a) * d;
        if (x < 0.5 || y < 0.5 || x > MW - 0.5 || y > MH - 0.5 || hitsWall(this.T, x, y, PLAYER_R)) break;
        const z = walkHeight(this.T, x, y, p.z);
        if (Math.abs(z - p.z) > 1.2) break;
        if (kindAt(this.T, x, y) !== 2) to = { x, y, z };
      }
      if (!to) return false;
      Object.assign(p, to);
      p.lastInputAt = now;
      extra.to = to;
    } else if (spell === 'curse') {
      const t = this.enemies(p).filter(o => {
        const d = Math.hypot(o.x - p.x, o.y - p.y), off = Math.atan2(o.y - p.y, o.x - p.x) - p.a;
        return d <= CURSE.range && Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= CURSE.cone && this.clearLine(p.x, p.y, o.x, o.y);
      }).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (!t) return false;
      t.curseUntil = now + CURSE.ms;
      extra.target = t.id;
    } else if (spell === 'frost') {
      // Frost Nova: everyone hostile close by is rooted to the spot
      const hit = this.enemies(p).filter(o => Math.hypot(o.x - p.x, o.y - p.y) <= FROST.radius);
      for (const o of hit) o.frozenUntil = now + FROST.ms;
      extra.frozen = hit.filter(o => !o.npc).map(o => o.id);
    } else if (spell === 'totem') {
      const z = walkHeight(this.T, p.x, p.y, p.z);
      this.totems.push({ x: p.x, y: p.y, z, team: p.team, owner: p.id, until: now + TOTEM.ms });
    } else if (spell === 'well') {
      // Gravity Well: opens where you aim (short of walls) and drags enemies into it
      let x = p.x, y = p.y;
      for (let d = 0.5; d <= WELL.range; d += 0.5) {
        const nx = p.x + Math.cos(p.a) * d, ny = p.y + Math.sin(p.a) * d;
        if (hitsWall(this.T, nx, ny, 0.3) || kindAt(this.T, nx, ny) === 2) break;
        x = nx; y = ny;
      }
      this.wells.push({ x, y, owner: p.id, team: p.team, until: now + WELL.ms });
      Object.assign(extra, { wx: x, wy: y, team: p.team });
    } else if (spell === 'decoy') {
      this.addDecoy(p, now);
    }
    this.broadcast({ type: 'spell', id: p.id, spell, x: p.x, y: p.y, z: p.z, ...extra });
    this.hub.progress?.(p, { type: 'cast' });
    return true;
  }

  // --- Capture the Cauldron ---
  // each coven's base: the two spawn spots furthest apart on this map (team 1 gets the first)
  ctfBases() {
    if (this.ctfBaseCache?.level === this.level) return this.ctfBaseCache.bases;
    const spots = SPAWN_SPOTS[this.level] ||= spawnSpots(this.map, this.T);
    let best = [spots[0], spots[spots.length - 1]], far = -1;
    const step = Math.max(1, Math.floor(spots.length / 400)); // a sample is plenty on big maps
    for (let i = 0; i < spots.length; i += step) for (let j = i + 1; j < spots.length; j += step) {
      const d = Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y);
      if (d > far) { far = d; best = [spots[i], spots[j]]; }
    }
    const bases = { 1: { ...best[0], z: walkHeight(this.T, best[0].x, best[0].y, 0) }, 2: { ...best[1], z: walkHeight(this.T, best[1].x, best[1].y, 0) } };
    this.ctfBaseCache = { level: this.level, bases };
    return bases;
  }
  // somewhere near your own base
  baseSpawn(team) {
    const spots = SPAWN_SPOTS[this.level] ||= spawnSpots(this.map, this.T), base = this.ctfBases()[team];
    const near = spots.slice().sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y)).slice(0, 10);
    return { ...near[Math.floor(Math.random() * near.length)] };
  }
  cauldronHome(team) { const b = this.ctfBases()[team]; return { x: b.x, y: b.y, z: b.z, home: true, carrier: null, droppedAt: 0 }; }
  // a carrier who dies or leaves drops the cauldron where they are
  dropCauldron(p) {
    if (!this.ctf) return;
    for (const t of [1, 2]) {
      const c = this.ctf.c[t];
      if (c.carrier !== p.id) continue;
      Object.assign(c, { x: p.x, y: p.y, z: walkHeight(this.T, p.x, p.y, p.z), carrier: null, home: false, droppedAt: Date.now() });
      this.broadcast({ type: 'cauldron', event: 'drop', team: t, by: p.id });
    }
  }
  updateCtf(now) {
    if (!this.gameOn || this.mode !== 'ctf' || !this.ctf) return false;
    const { c, scores } = this.ctf;
    for (const t of [1, 2]) {
      const cd = c[t];
      if (cd.carrier != null) {
        const p = this.players[cd.carrier];
        if (!p || p.dead) { if (p) this.dropCauldron(p); else Object.assign(cd, this.cauldronHome(t)); continue; }
        Object.assign(cd, { x: p.x, y: p.y, z: p.z });
      } else if (!cd.home && now - cd.droppedAt >= CTF.returnMs) {
        Object.assign(cd, this.cauldronHome(t));
        this.broadcast({ type: 'cauldron', event: 'return', team: t });
      }
    }
    for (const p of this.list) {
      if (p.dead || (p.team !== 1 && p.team !== 2)) continue;
      const mine = c[p.team], theirs = c[3 - p.team], near = cd => Math.hypot(cd.x - p.x, cd.y - p.y) <= CTF.touch && Math.abs(cd.z - p.z) < 1.2;
      if (!mine.home && mine.carrier == null && near(mine)) { // send your own cauldron home
        Object.assign(mine, this.cauldronHome(p.team));
        this.broadcast({ type: 'cauldron', event: 'return', team: p.team, by: p.id });
      }
      if (theirs.carrier == null && near(theirs)) { // grab theirs
        Object.assign(theirs, { carrier: p.id, home: false });
        this.broadcast({ type: 'cauldron', event: 'take', team: 3 - p.team, by: p.id });
      }
      const base = this.ctfBases()[p.team];
      if (theirs.carrier === p.id && mine.home && Math.hypot(base.x - p.x, base.y - p.y) <= CTF.touch + 0.3) { // capture
        scores[p.team]++;
        Object.assign(theirs, this.cauldronHome(3 - p.team));
        this.broadcast({ type: 'cauldron', event: 'capture', team: 3 - p.team, by: p.id, scores: { ...scores } });
        this.hub.progress?.(p, { type: 'capture' });
        log(`[${this.code}] ${this.hub.name(p)} captured the ${TEAMS[3 - p.team]} cauldron — ${TEAMS[1]} ${scores[1]}, ${TEAMS[2]} ${scores[2]}`);
      }
    }
    let winner = scores[1] >= CTF.caps ? 1 : scores[2] >= CTF.caps ? 2 : 0;
    if (!winner && now >= this.ctf.endsAt) {
      if (scores[1] === scores[2]) { this.endMatch('Time is up — a draw'); return true; }
      winner = scores[1] > scores[2] ? 1 : 2;
    }
    if (!winner) return false;
    this.finish(this.list.filter(p => p.team === winner), { team: winner, mode: 'ctf', ctfScores: { ...scores } }, TEAMS[winner] + ' team');
    return true;
  }
  // where a bot on this team should head: home with their cauldron, to their own dropped one,
  // or to steal theirs (unless a teammate has it); { index, x, y, radius } like a hardpoint hill
  ctfTarget(p) {
    if (this.mode !== 'ctf' || !this.ctf || (p.team !== 1 && p.team !== 2)) return null;
    const mine = this.ctf.c[p.team], theirs = this.ctf.c[3 - p.team], base = this.ctfBases()[p.team];
    const at = (x, y, tag) => ({ index: `ctf-${tag}-${Math.floor(x)}-${Math.floor(y)}`, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, radius: 0.9 });
    if (theirs.carrier === p.id) return at(base.x, base.y, 'home');
    if (!mine.home && mine.carrier == null) return at(mine.x, mine.y, 'mine');
    if (theirs.carrier == null) return at(theirs.x, theirs.y, 'theirs');
    return null; // a teammate has it: fight
  }
  ctfSnapshot(now = Date.now()) {
    if (this.mode !== 'ctf' || !this.ctf) return null;
    const cd = t => { const c = this.ctf.c[t]; return { x: c.x, y: c.y, z: c.z, home: c.home, carrier: c.carrier }; };
    return { scores: { ...this.ctf.scores }, bases: this.ctfBases(), c: { 1: cd(1), 2: cd(2) }, ms: Math.max(0, this.ctf.endsAt - now) };
  }

  // the Hex Wand's bolt leaps from the one it hit to the nearest other enemy in range
  wandChain(p, from, now) {
    const next = this.enemies(p).filter(o => o !== from && Math.hypot(o.x - from.x, o.y - from.y) <= WAND_CHAIN.range && this.clearLine(from.x, from.y, o.x, o.y))
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    if (!next) return;
    this.broadcast({ type: 'chain', x0: from.x, y0: from.y, z0: from.z + BODY_H * 0.6, x1: next.x, y1: next.y, z1: next.z + BODY_H * 0.6 });
    if (next.npc) { this.hitNpc(next, this.scaleDamage(p, WAND_CHAIN.dmg, { now }), p, { weapon: 'wand', head: false, fromX: from.x, fromY: from.y }); return; }
    let dmg = this.hurt(next, next.hacks ? 0 : this.scaleDamage(p, WAND_CHAIN.dmg, { now }), now);
    next.hp -= dmg;
    this.broadcast({ type: 'hit', who: next.id, by: p.id, dmg, head: false, weapon: 'wand', fromX: from.x, fromY: from.y, x: next.x, y: next.y, z: next.z + BODY_H * 0.6 });
    if (next.hp <= 0) this.killPlayer(next, p, { weapon: 'wand', head: false, dist: Math.hypot(next.x - p.x, next.y - p.y), a: Math.atan2(next.y - from.y, next.x - from.x) });
  }

  // a bot's think-and-move for this tick; rooted bots can still aim and shoot
  botStep(p) {
    const now = Date.now(), frozen = p.frozenUntil > now, x = p.x, y = p.y;
    botTick(this, p);
    if (frozen) { p.x = x; p.y = y; p.vx = 0; p.vy = 0; }
  }

  // --- per-tick: bots, pits, pickups, grenades, state broadcast ---
  tick() {
    this.checkPlagueWin(); // the timer expires before another bot or player can infect anyone
    for (const p of this.list) if (p.bot && !p.dead) this.botStep(p);
    if (this.gameOn) {
      const now = Date.now(), dt = TICK / 1000;
      for (const p of this.list) {
        if (p.dead && now >= p.respawnAt) this.resetPlayer(p);
        if (!p.dead) p.mana = Math.min(MAX_MANA, (p.mana ?? MAX_MANA) + MANA_REGEN * dt);
      }
      for (const b of this.builds) if (now >= b.until) this.breakBuild(b, false);
      if (this.updateHardpoint(now)) return;
      if (this.updateCtf(now)) return;
      if (this.updateSouls(now)) return;
      if (!this.stepZone(now, dt)) return;
      if (this.stepSurvival(now, dt)) return;
      if (this.stepExtras(now, dt)) return;
      this.stepNades(dt, now);
      for (const p of this.list) {
        if (p.dead) continue;
        if (kindAt(this.T, p.x, p.y) === 2 && p.z < -0.15) {
          if (p.hacks) continue; // god mode: lava is a hot tub
          p.hp -= PIT_DPS * TICK / 1000;
          if (p.hp <= 0) { this.killPlayer(p, null, { weapon: 'pit' }); continue; }
        }
        this.pickups.forEach(pu => this.tryWalkOver(p, pu, now));
      }
      let respawned = false;
      for (const pu of this.pickups) if (!pu.active && now >= pu.respawnAt) { pu.active = true; this.rollPad(pu); respawned = true; }
      if (respawned) this.broadcastPickups();
      const boxes = this.boxes.length;
      this.boxes = this.boxes.filter(b => now < b.until);
      if (this.boxes.length !== boxes) this.broadcast(this.boxList());
    }
    if (this.list.length < this.minPlayers()) return;
    const gunGame = this.mode === 'gungame', now = Date.now(), r2 = v => Math.round(v * 100) / 100;
    const players = this.list.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, a: p.a, p: p.p, sc: p.sc, sl: p.sl, hp: p.hp, kills: p.kills, seq: p.seq, team: p.team,
      mn: Math.floor(p.mana ?? MAX_MANA), ...(p.invisUntil > now ? { iv: 1 } : {}), ...(p.curseUntil > now ? { cu: 1 } : {}),
      ...(p.w && !this.isInfected(p) ? { w: p.w } : {}), ...(p.furyUntil > now ? { fy: 1 } : {}), ...(p.frozenUntil > now ? { fr: 1 } : {}),
      ...(p.wardUntil > now && p.ward > 0 ? { sh: 1 } : {}),
      ...(this.chamber ? { lv: p.lives } : {}), ...(this.mode === 'survival' ? { gd: p.gold || 0 } : {}),
      ...(p.dead ? { dead: true } : {}), ...(gunGame ? { gl: p.gunLevel || 0 } : {}) }));
    this.broadcast({ type: 'state', players, plagueRemainingMs: this.plagueRemainingMs,
      hardpoint: this.hardpointSnapshot(), zone: this.zoneSnapshot(now), ctf: this.ctfSnapshot(), nades: this.nades.map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z, f: Math.max(0, Math.round(n.until - now)) })),
      ...(this.npcs.length ? { npcs: this.npcs.filter(n => !n.dead).map(n => ({ id: n.id, k: n.kind, x: r2(n.x), y: r2(n.y), z: r2(n.z), a: r2(n.a), hp: Math.ceil(n.hp), mhp: n.maxHp,
        ...(n.owner != null ? { o: n.owner } : {}), ...(n.frozenUntil > now ? { fr: 1 } : {}), ...(n.atkT && now - n.atkT < 250 ? { at: 1 } : {}) })) } : {}),
      ...(this.mode === 'harvest' ? { souls: this.souls.map(o => ({ id: o.id, x: r2(o.x), y: r2(o.y), z: r2(o.z), t: o.team })), soulScores: this.soulScores, soulWin: this.soulWinScore } : {}),
      ...(this.totems.length ? { totems: this.totems.map(t => ({ x: t.x, y: t.y, z: t.z, team: t.team, o: t.owner })) } : {}),
      ...(this.survival ? { sv: this.survivalState(now) } : {}) });
  }

  stepNades(dt, now) {
    const still = [];
    for (const n of this.nades) {
      n.vz -= NADE.gravity * dt;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      const g = walkHeight(this.T, n.x, n.y, n.z);
      if (n.z < g) {
        n.z = g; n.vz *= -NADE.bounce;
        n.vx *= 0.7; n.vy *= 0.7;
        if (Math.abs(n.vz) < 1.2) n.vz = 0;
      }
      if (hitsWall(this.T, n.x, n.y, 0.12)) {
        n.vx *= -0.5; n.vy *= -0.5;
        n.x += n.vx * dt; n.y += n.vy * dt;
      }
      if (now >= n.until) this.explodeNade(n);
      else still.push(n);
    }
    this.nades = still;
  }

  explodeNade(n) {
    const killer = this.players[n.by] || null;
    this.broadcast({ type: 'nadeBoom', x: n.x, y: n.y, z: n.z, id: n.id });
    if (!this.gameOn || (killer && this.isInfected(killer))) return;
    for (const b of [...this.builds]) {
      const d = Math.hypot(b.x - n.x, b.y - n.y);
      if (d < NADE.radius) { b.hp -= NADE.dmg * (1 - d / NADE.radius); if (b.hp <= 0) this.breakBuild(b, true); }
    }
    for (const o of this.npcs) {
      if (o.dead || (killer && !this.npcHostile(o, killer))) continue;
      const d = Math.hypot(o.x - n.x, o.y - n.y, (o.z + BODY_H / 2) - n.z);
      if (d <= NADE.radius) this.hitNpc(o, this.scaleDamage(killer, NADE.dmg * (1 - d / NADE.radius), { head: true }), killer, { weapon: 'nade', head: false, fromX: n.x, fromY: n.y });
    }
    for (const o of this.list) {
      if (!this.players[o.id] || o.dead) continue;
      if (killer && isTeamMode(this.mode) && o.team === killer.team && o !== killer) continue; // no team damage except self
      const d = Math.hypot(o.x - n.x, o.y - n.y, (o.z + BODY_H / 2) - n.z);
      if (d > NADE.radius) continue;
      const dmg = Math.round(NADE.dmg * (1 - d / NADE.radius));
      if (dmg <= 0) continue;
      let hit = killer ? this.scaleDamage(killer, dmg, { head: true }) : dmg; // blasts count in headshots-only games
      if (o.hacks) hit = 0;
      hit = this.hurt(o, hit);
      o.hp -= hit;
      this.broadcast({ type: 'hit', who: o.id, by: n.by, dmg: hit, head: false, weapon: 'nade', x: n.x, y: n.y, z: n.z, fromX: n.x, fromY: n.y });
      if (o.hp <= 0) {
        this.killPlayer(o, killer && killer !== o ? killer : null, { weapon: 'nade', head: false, dist: d, a: Math.atan2(o.y - n.y, o.x - n.x) });
        if (!this.gameOn) break;
      }
    }
  }

  // health, ammo, nades and gun crates are taken by walking over them when you need them
  tryWalkOver(p, pu, now) {
    if (pu.gun && !pu.crate) return; // map gun pads need the use key; random gun crates are walk-over
    if (!pu.active || Math.hypot(p.x - pu.x, p.y - pu.y) > 0.8 || p.z > 1) return;
    if (this.isInfected(p) && pu.weapon !== 'health') return;
    const maxHp = this.maxHp(p);
    if (pu.scroll) {
      if ((p.spells || []).length >= SPELL_SLOTS) return;
      p.spells.push(pu.spell);
      pu.respawnAt = now + SCROLL_RESPAWN;
      this.syncAmmo(p);
      pu.active = false;
      this.broadcast({ type: 'pickup', id: p.id, weapon: 'scroll', spell: pu.spell, x: pu.x, y: pu.y, z: 0 });
      this.broadcastPickups();
      return;
    }
    let stored = false;
    if (pu.weapon === 'health') {
      // a med kit goes in a free spell slot as a heal for later; with none free it heals now
      if (!this.isInfected(p) && (p.spells || []).length < SPELL_SLOTS) { p.spells.push('heal'); stored = true; this.syncAmmo(p); }
      else if (p.hp >= maxHp) return;
      else p.hp = Math.min(maxHp, p.hp + HEAL);
      pu.respawnAt = now + HEAL_RESPAWN;
    } else if (pu.nade || pu.weapon === 'nade') {
      if (this.mode === 'snipers' || (p.nades || 0) >= NADE.maxCarry) return;
      p.nades = (p.nades || 0) + 1;
      pu.respawnAt = now + NADE_RESPAWN;
      this.syncAmmo(p);
    } else if (pu.gun) {
      const r = this.takeGun(p, pu.weapon, magSize(pu.weapon, p.att), AMMO[pu.weapon], null);
      if (!r) return;
      if (p.bot && p.brain) p.brain.weapon = pu.weapon;
      pu.respawnAt = now + GUN_CRATE_RESPAWN;
      this.syncAmmo(p);
    } else {
      let got = 0;
      for (const w in p.mag) got += this.addSpare(p, w, magSize(w, p.att));
      if (!got) return;
      pu.respawnAt = now + AMMO_RESPAWN;
      this.syncAmmo(p);
    }
    pu.active = false;
    this.broadcast({ type: 'pickup', id: p.id, weapon: pu.weapon, stored, x: pu.x, y: pu.y, z: 0 });
    this.broadcastPickups();
  }
}

// client -> server messages about the match; `this` is the Room, `p` the sending player
Room.prototype.handlers = {
  skin(p, msg) {
    if (this.gameOn || !PLAYER_SKINS.includes(msg.skin) || p.skin === msg.skin) return;
    if (!skinUnlocked(msg.skin, levelFor(p.stats?.xp || 0))) return this.roster(); // locked: the roster puts your old skin back
    p.skin = msg.skin;
    p.ready = !!p.bot;
    this.roster();
  },

  level(p, msg) {
    // lobby map clicks are votes now (see vote); keep level for backwards compat as a vote
    this.handlers.vote.call(this, p, msg);
  },

  vote(p, msg) {
    if (this.gameOn || !FEATURED_LEVELS.includes(msg.level) || !LEVELS[msg.level]) return;
    p.vote = msg.level;
    p.ready = !!p.bot;
    const winner = modeLevel(this.mode) || this.voteWinner();
    if (winner !== this.level) {
      this.setLevel(winner);
      this.broadcast({ type: 'level', level: this.level });
      log(`[${this.code}] ${this.hub.who(p)} voted ${LEVEL_NAMES[msg.level]} → leading ${LEVEL_NAMES[this.level]}`);
    } else {
      log(`[${this.code}] ${this.hub.who(p)} voted ${LEVEL_NAMES[msg.level]}`);
    }
    this.roster();
  },

  mode(p, msg) {
    if (this.gameOn || !Object.hasOwn(MODE_NAMES, msg.mode)) return;
    if (p.modeVote === msg.mode) return;
    p.modeVote = msg.mode;
    p.ready = !!p.bot;
    const winner = this.modeVoteWinner();
    if (winner !== this.mode) {
      this.applyMode(winner);
      log(`[${this.code}] ${this.hub.who(p)} voted ${MODE_NAMES[msg.mode]} → leading ${MODE_NAMES[this.mode]}`);
    } else {
      log(`[${this.code}] ${this.hub.who(p)} voted ${MODE_NAMES[msg.mode]}`);
    }
    this.roster();
  },

  score(p, msg) {
    if (this.gameOn) return;
    const n = +msg.score;
    if (this.mode === 'teams') {
      if (!TEAM_WIN_SCORE_OPTIONS.includes(n) || n === this.teamWinScore) return;
      this.teamWinScore = n;
    } else if (this.mode === 'harvest') {
      if (!SOUL_WIN_OPTIONS.includes(n) || n === this.soulWinScore) return;
      this.soulWinScore = n;
    } else if (this.mode === 'ffa' || this.mode === 'snipers' || this.mode === 'build') {
      if (!WIN_SCORE_OPTIONS.includes(n) || n === this.winScore) return;
      this.winScore = n;
    } else return;
    this.resetReady();
    log(`[${this.code}] ${this.hub.who(p)} set score limit to ${n}`);
    this.roster();
  },

  team(p, msg) {
    if (this.gameOn || !redBlue(this.mode) || ![1, 2].includes(msg.team)) return;
    p.team = msg.team;
    this.roster();
  },

  plagueSetup(p, msg) {
    if (this.gameOn || this.mode !== 'plague' || !['random', 'manual'].includes(msg.selection) || msg.selection === this.plagueSelection) return;
    this.plagueSelection = msg.selection;
    this.resetReady();
    this.roster();
  },

  plagueRole(p, msg) {
    if (this.gameOn || this.mode !== 'plague' || this.plagueSelection !== 'manual') return;
    if (!Number.isInteger(msg.id) || ![PLAGUE_TEAM, HEALTHY_TEAM].includes(msg.team)) return;
    const target = this.players[msg.id];
    if (!target || target.plagueStartTeam === msg.team) return;
    target.plagueStartTeam = msg.team;
    this.resetReady();
    this.roster();
  },

  ready(p) {
    if (this.gameOn) return;
    if (!this.plagueSetupValid()) {
      this.send(p, { type: 'notice', text: 'Choose at least one infected and one healthy player before starting.' });
      this.roster();
      return;
    }
    p.ready = true;
    log(`[${this.code}] ${this.hub.who(p)} is ready`);
    if (!this.maybeStart()) this.roster();
  },

  // changed your mind on the loading screen: not ready after all
  unready(p) {
    if (this.gameOn || !p.ready) return;
    p.ready = false;
    this.roster();
  },

  addBot(p, msg) {
    const n = Math.max(1, Math.min(this.max, msg.count | 0 || 1));
    this.addBots(msg.level, n);
    this.maybeStart();
    this.roster();
  },
  fillBots(p, msg) { this.fillBots(msg.level); this.maybeStart(); this.roster(); },
  clearBots() {
    this.clearBots();
    if (this.gameOn && !this.checkPlagueWin() && !this.checkRoyaleWin() && !this.enoughPlayers()) this.endMatch('Not enough players left');
    this.roster();
  },
  removeBot(p, msg) {
    if (msg.id != null) {
      this.dropBot(+msg.id);
    } else {
      const n = Math.max(1, Math.min(this.max, msg.count | 0 || 1));
      for (let i = 0; i < n; i++) if (!this.dropBot()) break;
    }
    if (this.gameOn && !this.checkPlagueWin() && !this.checkRoyaleWin() && !this.enoughPlayers()) this.endMatch('Not enough players left');
    this.roster();
  },

  // text chat to everyone in the room: trimmed, at most CHAT_MAX characters, 5 per 5 seconds
  chat(p, msg) {
    const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!text) return;
    const now = Date.now();
    p.chatTimes = (p.chatTimes || []).filter(t => now - t < 5000);
    if (p.chatTimes.length >= 5) return this.hub.notice(p, 'Slow down — too many messages');
    p.chatTimes.push(now);
    this.broadcast({ type: 'chat', id: p.id, name: this.hub.name(p), team: p.team, text });
    log(`[${this.code}] ${this.hub.who(p)}: ${text}`);
  },

  // voice chat connection setup (public/js/voice.js): passed on to one other person in the room
  rtc(p, msg) {
    const to = this.players[msg.to];
    if (!to || to === p || to.bot || (!msg.sdp && !msg.candidate) || JSON.stringify(msg).length > 20000) return;
    this.send(to, { type: 'rtc', from: p.id, sdp: msg.sdp, candidate: msg.candidate });
  },

  // use key: pick up the gun on pad `pad`, or loot box `box`. `drop` is the gun in your hand,
  // swapped out if both slots are full (from a pad it's left in a new box at your feet)
  use(p, msg) {
    if (this.isInfected(p) || p.dead) return;
    if (!this.gameOn) return;
    if (this.mode === 'survival') return this.survivalUse(p, msg);
    const near = o => {
      const oz = o.z || 0, floorZ = oz > p.z + 1.5 ? 0 : oz;
      return Math.hypot(p.x - o.x, p.y - o.y) <= USE_RANGE && Math.abs(p.z - floorZ) < 1.2;
    };
    let got = null, where = null;
    if (Number.isInteger(msg.pad)) {
      const pu = this.pickups[msg.pad];
      if (!pu || !pu.gun || pu.crate || !pu.active || !near(pu)) return;
      const r = this.takeGun(p, pu.weapon, magSize(pu.weapon, p.att), AMMO[pu.weapon], msg.drop);
      if (!r) return;
      pu.active = false;
      pu.respawnAt = Date.now() + PICKUP_RESPAWN;
      if (r.dropped) { this.addBox(p.x, p.y, [r.dropped]); this.broadcast(this.boxList()); }
      got = pu.weapon; where = { x: pu.x, y: pu.y, z: 0 };
      this.broadcastPickups();
    } else {
      const b = this.boxes.find(b => b.id === msg.box);
      if (!b || !near(b)) return;
      // ammo for guns you already carry comes out first, then the first gun you don't have
      const ammo = b.items.filter(it => p.mag[it.w] !== undefined);
      for (const it of ammo) this.takeGun(p, it.w, it.mag, it.spare);
      b.items = b.items.filter(it => !ammo.includes(it));
      if (ammo.length) got = 'ammo';
      const i = b.items.findIndex(it => p.mag[it.w] === undefined);
      if (i >= 0) {
        const it = b.items[i], r = this.takeGun(p, it.w, it.mag, it.spare, msg.drop);
        if (r) { b.items.splice(i, 1); if (r.dropped) b.items.push(r.dropped); got = it.w; }
      }
      if (!got) return;
      if (!b.items.length) this.boxes = this.boxes.filter(o => o !== b);
      where = b;
      this.broadcast(this.boxList());
    }
    this.syncAmmo(p);
    this.broadcast({ type: 'pickup', id: p.id, weapon: got, x: where.x, y: where.y, z: where.z });
  },

  nade(p) {
    if (!this.gameOn || p.dead || this.mode === 'snipers' || this.mode === 'gungame' || this.isInfected(p) || !(p.nades > 0)) return;
    if (!p.hacks) p.nades--;
    this.syncAmmo(p);
    const cos = Math.cos(p.a), sin = Math.sin(p.a), cp = Math.cos(p.p), sp = Math.sin(p.p);
    const eye = p.z + EYE - (p.sl ? 0.25 : 0);
    const n = {
      id: ++this.nadeId, by: p.id, until: Date.now() + NADE.fuse,
      x: p.x + cos * 0.35, y: p.y + sin * 0.35, z: eye,
      vx: cos * cp * NADE.speed, vy: sin * cp * NADE.speed, vz: sp * NADE.speed + 1.2,
    };
    this.nades.push(n);
    this.broadcast({ type: 'nadeThrow', id: n.id, by: p.id, x: n.x, y: n.y, z: n.z });
  },

  // spells: { build: 'ramp', x, y, dir } conjures one where the caster aimed it (near
  // them); { slot } casts a stored spell
  cast(p, msg) {
    if (!this.gameOn || p.dead || this.isInfected(p)) return;
    const now = Date.now();
    if (BUILDS[msg.build]) {
      if (!canBuildIn(this.mode)) return;
      const cost = BUILDS[msg.build].mana;
      if (![msg.x, msg.y].every(Number.isFinite) || !Number.isInteger(msg.dir) || msg.dir < 0 || msg.dir > 3) return;
      if (Math.hypot(msg.x - p.x, msg.y - p.y) > 6 || (p.mana ?? MAX_MANA) < cost) return;
      if (this.addBuild(p, msg.build, msg.x, msg.y, msg.dir)) p.mana -= cost;
      return;
    }
    const spell = Number.isInteger(msg.slot) && (p.spells || [])[msg.slot];
    if (!spell) return;
    if (!this.castStored(p, spell, now)) { this.send(p, { type: 'notice', text: spell === 'curse' ? 'No enemy in your sights to curse' : 'No room to blink there' }); return; }
    p.spells.splice(msg.slot, 1);
    this.syncAmmo(p);
  },

  // sent when the client finishes a reload; it can't have fired that gun for the whole reload
  reload(p, msg) {
    if (this.isInfected(p) || p.dead) return;
    const w = WEAPONS[msg.weapon], now = Date.now();
    if (!w || w.melee || p.mag[msg.weapon] === undefined) return;
    const spare = p.inv[msg.weapon] || 0;
    const n = Math.min(magSize(msg.weapon, p.att) - p.mag[msg.weapon], spare);
    if (n <= 0 || now - (p.lastShot[msg.weapon] || 0) < reloadTime(msg.weapon, p.att, p.elixirs?.quick) * 0.85) { this.syncAmmo(p); return; } // slack for network jitter
    p.mag[msg.weapon] += n;
    p.inv[msg.weapon] -= n;
  },

  dash(p, msg) {
    const now = Date.now();
    if (this.gameOn) this.checkPlagueWin(now);
    const accepted = !p.dead && msg.seq === p.seq && [msg.dx, msg.dy].every(Number.isFinite) && this.dash(p, msg.dx, msg.dy, now);
    this.send(p, { type: 'dash', seq: p.seq, accepted, cooldownMs: Math.max(0, p.nextDash - now) });
  },

  // voluntary respawn when stuck (counts as a death; short cooldown)
  respawn(p) {
    if (!this.gameOn || p.bot || p.dead) return;
    const now = Date.now();
    if (now < (p.nextRespawn || 0)) {
      this.hub.notice(p, `Respawn ready in ${Math.ceil((p.nextRespawn - now) / 1000)}s`);
      return;
    }
    p.nextRespawn = now + 8000;
    this.killPlayer(p, null, { weapon: 'respawn' });
  },

  input(p, msg) {
    if (p.dead || msg.seq !== p.seq || ![msg.x, msg.y, msg.z, msg.a, msg.p].every(Number.isFinite)
      || msg.x < 0 || msg.x >= MW || msg.y < 0 || msg.y >= MH) return;
    const now = Date.now();
    if (p.lastInputAt && now - p.lastInputAt < TICK * 0.8) return;
    const elapsed = p.lastInputAt ? Math.min(250, Math.max(TICK * 0.8, now - p.lastInputAt)) : TICK;
    p.lastInputAt = now;
    let maxSpeed = MOVE_SPEED_LIMIT * (this.isInfected(p) ? PLAGUE_SPEED_MULTIPLIER : 1) * this.speedScale(p, now);
    if (p.hacks) maxSpeed *= HACK_SPEED;
    if (p.padUntil > now || p.wellUntil > now) maxSpeed *= 1.3;
    if (p.frozenUntil > now) maxSpeed = 0.2;
    if (p.hasteUntil > now) maxSpeed *= HASTE.speed;
    if (p.broomUntil > now - 150) maxSpeed = Math.max(maxSpeed, BROOM.speed * 1.3);
    if (p.curseUntil > now) maxSpeed *= CURSE.slow;
    const maxStep = maxSpeed * elapsed / 1000 + 0.04;
    const dx = msg.x - p.x, dy = msg.y - p.y, distance = Math.hypot(dx, dy);
    const scale = distance > maxStep ? maxStep / distance : 1;
    const x = p.x + dx * scale, y = p.y + dy * scale;
    if (!hitsWall(this.T, x, y, PLAYER_R)) { p.x = x; p.y = y; }
    const g = walkHeight(this.T, p.x, p.y, p.z);
    // how high above the floor you could be: a jump, higher in low gravity, much higher off a jump pad
    const rise = p.padUntil > now ? 4.5 : 0.8 / Math.min(1, this.gravityScale(now)) * (p.featherUntil > now ? 1.8 : 1);
    p.z = Math.max(g - 0.4, Math.min(g + rise, msg.z));
    p.a = Math.atan2(Math.sin(msg.a), Math.cos(msg.a));
    p.p = Math.max(-1.2, Math.min(1.2, msg.p));
    p.sc = !this.isInfected(p) && !!msg.sc;
    p.sl = !this.isInfected(p) && !!msg.sl;
    if (msg.w === 'blade' || (typeof msg.w === 'string' && Object.hasOwn(p.mag, msg.w))) p.w = msg.w;
  },

  shoot(p, msg) {
    const w = WEAPONS[msg.weapon];
    if (!w || !this.gameOn || p.dead) return;
    const now = Date.now();
    if (this.checkPlagueWin(now)) return;
    if (this.isInfected(p) ? msg.weapon !== 'claws' : msg.weapon === 'claws') { this.syncAmmo(p); return; }
    if (now < (p.nextFire[msg.weapon] || 0)) return;
    p.invisUntil = 0; // attacking gives you away
    if (msg.weapon !== 'claws') p.w = msg.weapon;
    if (!w.melee) {
      // the client counts its own rounds the same way, so no reply unless we disagree
      if (!(p.mag[msg.weapon] > 0)) { this.syncAmmo(p); return; }
      if (!p.hacks && !(this.custom.ammo === 'infinite' && this.mode !== 'survival' && !this.chamber)) {
        p.mag[msg.weapon]--;
        p.lastShot[msg.weapon] = now;
        if (!p.mag[msg.weapon] && !p.inv[msg.weapon]) { delete p.mag[msg.weapon]; delete p.inv[msg.weapon]; } // used up
      } else p.lastShot[msg.weapon] = now;
    }
    const cd = w.cd * (msg.weapon === 'claws' ? 1 : 0.85) * (p.hacks ? HACK_FIRE : 1);
    p.nextFire[msg.weapon] = now + cd;
    // prefer the aim snapshot from the shot so bullets match the crosshair (incl. recoil)
    const prevA = p.a, prevP = p.p;
    if (Number.isFinite(msg.a)) p.a = Math.atan2(Math.sin(msg.a), Math.cos(msg.a));
    if (Number.isFinite(msg.p)) p.p = Math.max(-1.2, Math.min(1.2, msg.p));
    const targets = this.enemies(p);
    const res = w.melee ? doMelee(this.T, p, targets, msg.weapon) : doShoot(this.T, p, targets, msg.weapon, !!msg.scoped, p.att === 'laser' ? 0.65 : 1);
    p.a = prevA; p.p = prevP;
    this.broadcast({ type: 'shot', id: p.id, weapon: msg.weapon, x: p.x, y: p.y, z: p.z,
      rays: res.rays.map(r => ({ a: r.a, p: r.p, dist: r.dist, hit: !!r.hit })) });
    // rounds that stopped against a conjured ramp chip away at it
    if (this.builds.length && !w.melee) for (const r of res.rays) {
      if (r.hit) continue;
      const d = r.dist + 0.06, eye = p.z + EYE - (p.sl ? 0.25 : 0);
      this.damageBuild(p.x + Math.cos(r.a) * d, p.y + Math.sin(r.a) * d, eye + Math.tan(r.p) * d, w.dmg * (p.hacks ? HACK_DMG : 1));
    }
    for (const h of res.hits) {
      const o = h.target, r = h.ray;
      let dmg = this.scaleDamage(p, h.dmg, { head: h.head, melee: !!w.melee, now });
      if (this.chamber && msg.weapon === CHAMBER.gun) dmg = 999; // one round, one kill
      if (o.npc) {
        this.hitNpc(o, dmg, p, { weapon: msg.weapon, head: h.head, backstab: h.backstab, dist: r.dist, a: r.a, fromX: p.x, fromY: p.y,
          x: p.x + Math.cos(r.a) * r.dist, y: p.y + Math.sin(r.a) * r.dist, z: w.melee ? o.z + BODY_H / 2 : p.z + EYE + Math.tan(r.p) * r.dist });
        continue;
      }
      if (!this.players[o.id]) continue;
      if (o.hacks) dmg = 0;
      dmg = this.hurt(o, dmg, now);
      o.hp -= dmg;
      this.broadcast({ type: 'hit', who: o.id, by: p.id, dmg, head: h.head, weapon: msg.weapon, fromX: p.x, fromY: p.y,
        x: p.x + Math.cos(r.a) * r.dist, y: p.y + Math.sin(r.a) * r.dist,
        z: w.melee ? o.z + BODY_H / 2 : p.z + EYE + Math.tan(r.p) * r.dist });
      if (o.hp <= 0) this.killPlayer(o, p, { weapon: msg.weapon, head: h.head, backstab: h.backstab, dist: r.dist, a: r.a });
      if (!this.gameOn) break; // that kill ended the match
    }
    if (msg.weapon === 'wand' && res.hits.length && this.gameOn) this.wandChain(p, res.hits[0].target, now);
  },
};

Object.assign(Room.prototype, extraMethods, survivalMethods);
Object.assign(Room.prototype.handlers, extraHandlers, survivalHandlers);
