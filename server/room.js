// One game room: up to MAX_PLAYERS in free-for-all or red vs blue teams. The Hub (hub.js)
// owns connections, accounts and friends; a room only sees the players inside it.
// People can join a match that's already running; it ends early if too few are left.
import { TICK, RES, MAX_HP, WIN_SCORE, TEAM_WIN_SCORE, MAX_PLAYERS, TEAMS, PLAYER_SKINS, EYE, BODY_H, PIT_DPS, PICKUP_RESPAWN, HEAL, HEAL_RESPAWN, WEAPONS, AMMO, DROP_TIME } from '../shared/config.js';
import { MODE_NAMES, PLAGUE_DURATION, PLAGUE_TEAM, HEALTHY_TEAM, PLAGUE_SKIN, PLAGUE_SPEED_MULTIPLIER, PLAGUE_MAX_HP, isTeamMode, teamName } from '../shared/config.js';
import { LEVELS, LEVEL_NAMES, MW, MH } from '../shared/levels.js';
import { buildTerrain, groundAt, kindAt, findPickups, hitsWall } from '../shared/terrain.js';
import { doShoot, doMelee } from './combat.js';
import { newBrain, botTick } from './bot.js';
import { tryDash } from '../shared/movement.js';
import { log } from './log.js';

// Anyone can add bots to a room with the lobby's + BOT / − BOT buttons; they only fill empty
// seats, so a person joining a full room takes a bot's place. `node server.js --bots` (or
// BOTS=1) also starts every new room with one (local testing). The flag works in every shell;
// env vars need different syntax on Windows.
export const BOTS = process.argv.includes('--bots') || !!process.env.BOTS;

const PLAYER_R = 0.22; // body radius for wall collisions, as in public/js/physics.js

const TERRAINS = {};
for (const k in LEVELS) TERRAINS[k] = buildTerrain(LEVELS[k], RES, k); // level key = obstacle style

export class Room {
  constructor(hub, code, isPrivate) {
    this.hub = hub;
    this.code = code;
    this.private = isPrivate; // quick play never drops strangers into a private room
    this.players = {};        // id -> player (the hub's connection object, or a bot)
    this.mode = 'ffa';        // 'ffa' | 'teams' | 'plague'
    this.gameOn = false;
    this.plagueEndsAt = 0;
    this.plagueSelection = 'random'; // 'random' | 'manual'; manual roles survive rematches
    this.drops = [];          // guns dead players dropped: { id, weapon, mag, spare, x, y, z, until }
    this.dropId = 0;
    this.setLevel('hell');
  }

  get list() { return Object.values(this.players); }
  get humans() { return this.list.filter(p => !p.bot); }
  get full() { return this.humans.length >= MAX_PLAYERS; } // bots give up their seats
  get hasBots() { return this.list.some(p => p.bot); }
  isInfected(p) { return this.mode === 'plague' && p.team === PLAGUE_TEAM; }
  maxHp(p) { return this.isInfected(p) ? PLAGUE_MAX_HP : MAX_HP; }
  dash(p, dx, dy, now = Date.now()) {
    return this.gameOn && this.isInfected(p) && tryDash(p, dx, dy, now);
  }
  get plagueRemainingMs() { return this.mode === 'plague' && this.gameOn ? Math.max(0, this.plagueEndsAt - Date.now()) : 0; }
  skinOf(p) { return this.mode === 'plague' && this.gameOn && p.team === PLAGUE_TEAM ? PLAGUE_SKIN : p.skin || 'demon'; }
  startMessage() { return { type: 'start', level: this.level, mode: this.mode, plagueRemainingMs: this.plagueRemainingMs }; }
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
    this.broadcast({ type: 'room', code: this.code, private: this.private, mode: this.mode, level: this.level,
      gameOn: this.gameOn, bots: BOTS, max: MAX_PLAYERS, plagueRemainingMs: this.plagueRemainingMs,
      plagueSelection: this.plagueSelection, plagueSetupValid: this.plagueSetupValid(),
      players: this.list.map(p => ({ id: p.id, name: this.hub.name(p), team: p.team, plagueStartTeam: p.plagueStartTeam, skin: this.skinOf(p), ready: p.ready, bot: !!p.bot })) });
  }

  // --- level / pickups ---
  setLevel(name) {
    this.level = name;
    this.map = LEVELS[name];
    this.T = TERRAINS[name];
    this.resetPickups();
  }
  resetPickups() {
    this.pickups = findPickups(this.map).map(p => Object.assign(p, { active: true, respawnAt: 0 }));
    this.drops = [];
  }
  broadcastPickups() { this.broadcast({ type: 'pickups', active: this.pickups.map(p => p.active) }); }
  dropList() { return { type: 'drops', drops: this.drops.map(d => ({ id: d.id, weapon: d.weapon, x: d.x, y: d.y, z: d.z })) }; }

  // a dying player's picked-up guns fall around the body with whatever ammo was left in them
  dropGuns(p) {
    const until = Date.now() + DROP_TIME;
    for (const w in p.mag) {
      if (w === 'rifle' || !(p.mag[w] + (p.inv[w] || 0) > 0)) continue;
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.3;
      let x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (hitsWall(this.T, x, y, 0.1)) { x = p.x; y = p.y; }
      if (kindAt(this.T, x, y) === 2) continue; // lost in the lava / acid / bog
      this.drops.push({ id: ++this.dropId, weapon: w, mag: p.mag[w], spare: p.inv[w] || 0, x, y, z: groundAt(this.T, x, y), until });
    }
  }

  // hand `p` a gun (or its ammo if they already have one) and tell them what changed
  giveGun(p, w, mag, spare) {
    if (this.isInfected(p)) return;
    const fresh = p.mag[w] === undefined;
    if (fresh) { p.mag[w] = mag; p.inv[w] = spare; }
    else p.inv[w] = (p.inv[w] || 0) + mag + spare;
    this.send(p, { type: 'ammo', weapon: w, fresh, mag, add: fresh ? spare : mag + spare });
  }
  // full ammo state, when the client's own count can't be trusted (respawn, rejected shot/reload)
  syncAmmo(p) { this.send(p, { type: 'inv', mag: p.mag, inv: p.inv, clawsOnly: this.isInfected(p) }); }

  // a random open spot, preferring ones far from everyone in `avoid`
  spawnPos(avoid) {
    const M = this.map, spots = [];
    for (let y = 1; y < MH - 1; y++)
      for (let x = 1; x < MW - 1; x++) {
        if (M[y][x] !== '.') continue;
        let nearPit = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (M[y + dy][x + dx] === 'L') nearPit = true;
        // shapes spread past their squares (volcano slopes, cliffs): only spawn on clear flat ground
        if (!nearPit && !hitsWall(this.T, x + 0.5, y + 0.5, 0.5) && groundAt(this.T, x + 0.5, y + 0.5) < 0.05) spots.push({ x: x + 0.5, y: y + 0.5 });
      }
    if (!avoid.length) return spots[Math.floor(Math.random() * spots.length)];
    // pick one of the 10 spots furthest from the nearest enemy
    const gap = s => Math.min(...avoid.map(o => Math.hypot(s.x - o.x, s.y - o.y)));
    spots.forEach(s => s.gap = gap(s));
    spots.sort((a, b) => b.gap - a.gap);
    return spots[Math.floor(Math.random() * Math.min(10, spots.length))];
  }

  // --- players ---
  enemies(p) { return this.list.filter(o => o !== p && (!isTeamMode(this.mode) || o.team !== p.team)); }
  smallerTeam() { return this.list.filter(p => p.team === 1).length <= this.list.filter(p => p.team === 2).length ? 1 : 2; }
  teamKills(t) { return this.list.filter(p => p.team === t).reduce((n, p) => n + p.kills, 0); }
  score() {
    if (this.mode === 'plague') return `${this.list.filter(p => p.team === HEALTHY_TEAM).length} healthy, ${this.list.filter(p => p.team === PLAGUE_TEAM).length} infected`;
    if (this.mode === 'teams') return `${TEAMS[1]} ${this.teamKills(1)}, ${TEAMS[2]} ${this.teamKills(2)}`;
    return this.list.map(p => this.hub.name(p) + ' ' + p.kills).join(', ');
  }
  enoughPlayers() {
    if (this.list.length < 2) return false;
    return this.mode !== 'teams' || [1, 2].every(t => this.list.some(p => p.team === t));
  }

  resetPlayer(p, avoid = this.enemies(p)) {
    const sp = this.spawnPos(avoid);
    p.x = sp.x; p.y = sp.y; p.z = groundAt(this.T, sp.x, sp.y);
    const near = avoid.length ? avoid.reduce((m, o) => Math.hypot(o.x - sp.x, o.y - sp.y) < Math.hypot(m.x - sp.x, m.y - sp.y) ? o : m) : null;
    p.a = near ? Math.atan2(near.y - sp.y, near.x - sp.x) : Math.random() * Math.PI * 2;
    p.p = 0;
    p.hp = this.maxHp(p);
    p.mag = this.isInfected(p) ? {} : { rifle: WEAPONS.rifle.mag }; // infected only have claws
    p.inv = {};  // spare rounds per picked-up gun (the rifle's are unlimited)
    p.lastShot = {};
    p.sc = false;
    p.vz = 0; p.onGround = true; p.jumpsUsed = 0; p.jumpHeld = false;
    p.dashUntil = 0; p.nextDash = 0; p.dashX = 0; p.dashY = 0;
    if (p.brain) p.brain = newBrain();
    p.seq++;    // client snaps to the new spawn; stale inputs from the old life are ignored
    this.syncAmmo(p);
  }

  add(p) {
    if (!p.bot && this.list.length >= MAX_PLAYERS) this.dropBot(); // make room for a person
    Object.assign(p, { room: this, kills: 0, ready: !!p.bot, skin: p.skin || 'demon', seq: p.seq || 0, nextFire: {}, mag: {}, inv: {}, lastShot: {}, sc: false });
    p.plagueStartTeam = HEALTHY_TEAM;
    // Late arrivals join the plague, so reconnecting cannot undo an infection.
    p.team = this.mode === 'plague' ? (this.gameOn ? PLAGUE_TEAM : HEALTHY_TEAM) : this.mode === 'teams' ? this.smallerTeam() : 0;
    this.players[p.id] = p;
    if (this.mode === 'plague' && !this.gameOn) this.resetReady();
    this.resetPlayer(p);
    this.send(p, { type: 'init', id: p.id, room: this.code, level: this.level, x: p.x, y: p.y, z: p.z, a: p.a, hp: p.hp, seq: p.seq });
    this.send(p, { type: 'pickups', active: this.pickups.map(pu => pu.active) });
    this.send(p, this.dropList());
    if (BOTS && !p.bot && this.humans.length === 1 && !this.hasBots) this.addBot();
    if (this.gameOn) this.checkPlagueWin();
    this.roster();
    if (this.gameOn) this.send(p, this.startMessage()); // roles arrive before the match starts
  }

  remove(p) {
    if (!this.players[p.id]) return;
    delete this.players[p.id];
    p.room = null;
    if (this.mode === 'plague' && !this.gameOn) this.resetReady();
    if (!this.humans.length) { this.hub.closeRoom(this); return; } // bots go with it
    if (this.gameOn && !this.checkPlagueWin() && !this.enoughPlayers()) this.endMatch('Not enough players left');
    this.roster();
  }

  addBot() {
    if (this.list.length >= MAX_PLAYERS) return;
    const id = this.hub.nextId++;
    const bot = { id, bot: true, brain: newBrain(), a: 0, p: 0, seq: 0 };
    this.add(bot);
    log(`${this.hub.name(bot)} joined room ${this.code}`);
  }

  // take out the newest bot; false if there are none
  dropBot() {
    const bot = this.list.filter(p => p.bot).pop();
    if (!bot) return false;
    delete this.players[bot.id];
    if (this.mode === 'plague' && !this.gameOn) this.resetReady();
    log(`${this.hub.name(bot)} left room ${this.code}`);
    return true;
  }

  killPlayer(victim, killer, info) {
    if (!this.gameOn) return;
    const at = { x: victim.x, y: victim.y, z: victim.z };
    const skin = this.skinOf(victim);
    const infected = this.mode === 'plague' && killer && killer.team === PLAGUE_TEAM && victim.team === HEALTHY_TEAM;
    if (killer) killer.kills++;
    this.hub.record(killer, { kills: 1 });
    this.hub.record(victim, { deaths: 1 });
    this.dropGuns(victim);
    if (infected) victim.team = PLAGUE_TEAM;
    this.resetPlayer(victim);
    this.broadcast(this.dropList());
    this.broadcast(Object.assign({ type: 'kill', killer: killer ? killer.id : null, victim: victim.id, infected: !!infected, skin }, info, at));
    const how = killer ? `killed ${this.hub.name(victim)} with ${info.weapon}${info.backstab ? ' (backstab)' : info.head ? ' (headshot)' : ''}` : 'died in the pit';
    log(`[${this.code}] ${this.hub.name(killer || victim)} ${how} — ${this.score()}`);
    if (this.mode === 'plague') {
      if (infected) this.roster(); // deliver the new team before a possible victory message
      this.checkPlagueWin();
      return;
    }
    if (!killer) return;
    if (this.mode === 'teams') {
      if (this.teamKills(killer.team) >= TEAM_WIN_SCORE) this.finish(this.list.filter(p => p.team === killer.team), { team: killer.team }, TEAMS[killer.team] + ' team');
    } else if (killer.kills >= WIN_SCORE) this.finish([killer], { winner: killer.id }, this.hub.name(killer));
  }

  startGame() {
    if (this.gameOn || this.list.length < 2 || !this.plagueSetupValid()) return;
    if (this.mode === 'teams' && ![1, 2].every(t => this.list.some(p => p.team === t)))
      this.list.forEach((p, i) => p.team = i % 2 + 1); // everyone picked the same team: split them
    if (this.mode === 'plague') {
      this.list.forEach(p => p.team = this.plagueSelection === 'manual' ? p.plagueStartTeam : HEALTHY_TEAM);
      if (this.plagueSelection === 'random') this.list[Math.floor(Math.random() * this.list.length)].team = PLAGUE_TEAM;
      this.plagueEndsAt = Date.now() + PLAGUE_DURATION;
    }
    const placed = [];
    for (const p of this.list) {
      p.kills = 0; p.ready = !!p.bot;
      this.resetPlayer(p, placed.filter(o => !isTeamMode(this.mode) || o.team !== p.team));
      placed.push(p);
    }
    this.resetPickups();
    this.gameOn = true;
    this.roster();
    this.broadcast(this.startMessage());
    this.broadcastPickups();
    this.broadcast(this.dropList());
    log(`[${this.code}] Match started on ${LEVEL_NAMES[this.level]} (${MODE_NAMES[this.mode]}): ${this.list.map(p => this.hub.who(p)).join(', ')}`);
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

  finish(winners, result, label) {
    this.gameOn = false;
    this.plagueEndsAt = 0;
    this.list.forEach(p => p.ready = !!p.bot);
    this.broadcast(Object.assign({ type: 'win' }, result));
    for (const p of this.humans) this.hub.record(p, winners.includes(p) ? { wins: 1 } : { losses: 1 });
    log(`[${this.code}] ${label} won on ${LEVEL_NAMES[this.level]} — ${this.score()}`);
    this.hub.afterMatch(this);
    this.roster();
  }

  endMatch(reason) {
    this.gameOn = false;
    this.plagueEndsAt = 0;
    this.list.forEach(p => p.ready = !!p.bot);
    this.broadcast({ type: 'end', reason });
    log(`[${this.code}] Match ended: ${reason}`);
  }

  // --- per-tick: bots, pits, pickups, state broadcast ---
  tick() {
    this.checkPlagueWin(); // the timer expires before another bot or player can infect anyone
    for (const p of this.list) if (p.bot) botTick(this, p);
    if (this.gameOn) {
      const now = Date.now();
      for (const p of this.list) {
        if (kindAt(this.T, p.x, p.y) === 2 && p.z < -0.15) {
          p.hp -= PIT_DPS * TICK / 1000;
          if (p.hp <= 0) { this.killPlayer(p, null, { weapon: 'pit' }); continue; }
        }
        this.pickups.forEach((pu, idx) => this.tryPickup(p, pu, idx, now));
      }
      let respawned = false;
      for (const pu of this.pickups) if (!pu.active && now >= pu.respawnAt) { pu.active = true; respawned = true; }
      if (respawned) this.broadcastPickups();
      const drops = this.drops.length;
      this.drops = this.drops.filter(d => now < d.until && !this.list.some(p => this.tryGrab(p, d)));
      if (this.drops.length !== drops) this.broadcast(this.dropList());
    }
    if (this.list.length < 2) return;
    const players = this.list.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, a: p.a, p: p.p, sc: p.sc, hp: p.hp, kills: p.kills, seq: p.seq, team: p.team }));
    this.broadcast({ type: 'state', players, plagueRemainingMs: this.plagueRemainingMs });
  }

  tryPickup(p, pu, idx, now) {
    if (!pu.active || Math.hypot(p.x - pu.x, p.y - pu.y) > 0.8 || p.z > 1) return;
    const heal = pu.weapon === 'health';
    if (this.isInfected(p) && !heal) return;
    const maxHp = this.maxHp(p);
    if (heal && p.hp >= maxHp) return; // leave it for when you need it
    pu.active = false;
    pu.respawnAt = now + (heal ? HEAL_RESPAWN : PICKUP_RESPAWN);
    if (heal) p.hp = Math.min(maxHp, p.hp + HEAL);
    else this.giveGun(p, pu.weapon, WEAPONS[pu.weapon].mag, AMMO[pu.weapon]);
    this.broadcast({ type: 'pickup', id: p.id, weapon: pu.weapon, x: pu.x, y: pu.y, z: 0 });
    this.broadcastPickups();
  }

  // walk over a dropped gun to take it; true if `p` took it
  tryGrab(p, d) {
    if (this.isInfected(p)) return false;
    if (Math.hypot(p.x - d.x, p.y - d.y) > 0.8 || Math.abs(p.z - d.z) > 1) return false;
    this.giveGun(p, d.weapon, d.mag, d.spare);
    this.broadcast({ type: 'pickup', id: p.id, weapon: d.weapon, x: d.x, y: d.y, z: d.z });
    return true;
  }
}

// client -> server messages about the match; `this` is the Room, `p` the sending player
Room.prototype.handlers = {
  skin(p, msg) {
    if (this.gameOn || !PLAYER_SKINS.includes(msg.skin) || p.skin === msg.skin) return;
    p.skin = msg.skin;
    p.ready = !!p.bot;
    this.roster();
  },

  level(p, msg) {
    if (this.gameOn || !LEVELS[msg.level]) return;
    this.setLevel(msg.level);
    log(`[${this.code}] ${this.hub.who(p)} picked ${LEVEL_NAMES[this.level]}`);
    this.list.forEach(pl => pl.ready = !!pl.bot); // everyone re-confirms on the new map
    this.broadcast({ type: 'level', level: this.level });
    this.roster();
  },

  mode(p, msg) {
    if (this.gameOn || !Object.hasOwn(MODE_NAMES, msg.mode) || msg.mode === this.mode) return;
    this.mode = msg.mode;
    this.plagueEndsAt = 0;
    this.list.forEach((pl, i) => { pl.team = this.mode === 'plague' ? HEALTHY_TEAM : this.mode === 'teams' ? i % 2 + 1 : 0; pl.ready = !!pl.bot; });
    log(`[${this.code}] ${this.hub.who(p)} switched to ${MODE_NAMES[this.mode]}`);
    this.roster();
  },

  team(p, msg) {
    if (this.gameOn || this.mode !== 'teams' || !TEAMS[msg.team]) return;
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
    if (this.list.length >= 2 && this.list.every(pl => pl.ready)) this.startGame();
    else this.roster();
  },

  addBot() { this.addBot(); },
  removeBot() {
    if (!this.dropBot()) return;
    if (this.gameOn && !this.checkPlagueWin() && !this.enoughPlayers()) this.endMatch('Not enough players left');
    this.roster();
  },

  // sent when the client finishes a reload; it can't have fired that gun for the whole reload
  reload(p, msg) {
    if (this.isInfected(p)) return;
    const w = WEAPONS[msg.weapon], now = Date.now();
    if (!w || w.melee || p.mag[msg.weapon] === undefined) return;
    const spare = msg.weapon === 'rifle' ? Infinity : p.inv[msg.weapon] || 0;
    const n = Math.min(w.mag - p.mag[msg.weapon], spare);
    if (n <= 0 || now - (p.lastShot[msg.weapon] || 0) < w.reload * 0.85) { this.syncAmmo(p); return; } // slack for network jitter
    p.mag[msg.weapon] += n;
    if (spare !== Infinity) p.inv[msg.weapon] -= n;
  },

  dash(p, msg) {
    const now = Date.now();
    if (this.gameOn) this.checkPlagueWin(now);
    const accepted = msg.seq === p.seq && [msg.dx, msg.dy].every(Number.isFinite) && this.dash(p, msg.dx, msg.dy, now);
    this.send(p, { type: 'dash', seq: p.seq, accepted, cooldownMs: Math.max(0, p.nextDash - now) });
  },

  input(p, msg) {
    if (msg.seq !== p.seq || ![msg.x, msg.y, msg.z, msg.a, msg.p].every(Number.isFinite)) return;
    // basic anti-cheat: no teleporting (bhop speed is capped client-side) and no walking into walls
    const maxStep = this.isInfected(p) ? PLAGUE_SPEED_MULTIPLIER : 1; // match the infected movement cap
    if (Math.hypot(msg.x - p.x, msg.y - p.y) < maxStep && !hitsWall(this.T, msg.x, msg.y, PLAYER_R)) { p.x = msg.x; p.y = msg.y; }
    const g = groundAt(this.T, p.x, p.y);
    p.z = Math.max(g - 0.4, Math.min(g + 2, msg.z));
    p.a = msg.a;
    p.p = Math.max(-1.2, Math.min(1.2, msg.p));
    p.sc = !this.isInfected(p) && !!msg.sc;
  },

  shoot(p, msg) {
    const w = WEAPONS[msg.weapon];
    if (!w || !this.gameOn) return;
    const now = Date.now();
    if (this.checkPlagueWin(now)) return;
    if (this.isInfected(p) ? msg.weapon !== 'claws' : msg.weapon === 'claws') { this.syncAmmo(p); return; }
    if (now < (p.nextFire[msg.weapon] || 0)) return;
    if (!w.melee) {
      // the client counts its own rounds the same way, so no reply unless we disagree
      if (!(p.mag[msg.weapon] > 0)) { this.syncAmmo(p); return; }
      p.mag[msg.weapon]--;
      p.lastShot[msg.weapon] = now;
      if (msg.weapon !== 'rifle' && !p.mag[msg.weapon] && !p.inv[msg.weapon]) { delete p.mag[msg.weapon]; delete p.inv[msg.weapon]; } // used up
    }
    p.nextFire[msg.weapon] = now + w.cd * (msg.weapon === 'claws' ? 1 : 0.85); // guns keep their network slack
    const targets = this.enemies(p);
    const res = w.melee ? doMelee(this.T, p, targets, msg.weapon) : doShoot(this.T, p, targets, msg.weapon, !!msg.scoped);
    this.broadcast({ type: 'shot', id: p.id, weapon: msg.weapon, x: p.x, y: p.y, z: p.z,
      rays: res.rays.map(r => ({ a: r.a, p: r.p, dist: r.dist, hit: !!r.hit })) });
    for (const h of res.hits) {
      const o = h.target, r = h.ray;
      if (!this.players[o.id]) continue;
      o.hp -= h.dmg;
      this.broadcast({ type: 'hit', who: o.id, by: p.id, dmg: h.dmg, head: h.head, weapon: msg.weapon,
        x: p.x + Math.cos(r.a) * r.dist, y: p.y + Math.sin(r.a) * r.dist,
        z: w.melee ? o.z + BODY_H / 2 : p.z + EYE + r.p * r.dist });
      if (o.hp <= 0) this.killPlayer(o, p, { weapon: msg.weapon, head: h.head, backstab: h.backstab, dist: r.dist, a: r.a });
      if (!this.gameOn) break; // that kill ended the match
    }
  },
};
