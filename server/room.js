// One game room: up to MAX_PLAYERS in free-for-all or red vs blue teams. The Hub (hub.js)
// owns connections, accounts and friends; a room only sees the players inside it.
// People can join a match that's already running; it ends early if too few are left.
import { TICK, RES, MAX_HP, WIN_SCORE, TEAM_WIN_SCORE, MAX_PLAYERS, TEAMS, EYE, BODY_H, PIT_DPS, PICKUP_RESPAWN, HEAL, HEAL_RESPAWN, WEAPONS, AMMO } from '../shared/config.js';
import { LEVELS, LEVEL_NAMES, MW, MH } from '../shared/levels.js';
import { buildTerrain, groundAt, kindAt, findPickups, hitsWall } from '../shared/terrain.js';
import { doShoot, doMelee } from './combat.js';
import { newBrain, botTick } from './bot.js';
import { log } from './log.js';

// `node server.js --bots` (or BOTS=1): every room starts with a bot, and the lobby gets
// add/remove bot buttons (local testing). The flag works in every shell; env vars need
// different syntax on Windows.
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
    this.mode = 'ffa';        // 'ffa' | 'teams'
    this.gameOn = false;
    this.setLevel('hell');
  }

  get list() { return Object.values(this.players); }
  get humans() { return this.list.filter(p => !p.bot); }
  get full() { return this.list.length >= MAX_PLAYERS; }
  get hasBots() { return this.list.some(p => p.bot); }

  // --- messaging ---
  send(p, msg) { this.hub.send(p, msg); }
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.humans) this.hub.sendRaw(p, data);
  }
  // who's here, teams and ready state: sent whenever any of it changes
  roster() {
    this.broadcast({ type: 'room', code: this.code, private: this.private, mode: this.mode, level: this.level,
      gameOn: this.gameOn, bots: BOTS, max: MAX_PLAYERS,
      players: this.list.map(p => ({ id: p.id, name: this.hub.name(p), team: p.team, ready: p.ready, bot: !!p.bot })) });
  }

  // --- level / pickups ---
  setLevel(name) {
    this.level = name;
    this.map = LEVELS[name];
    this.T = TERRAINS[name];
    this.resetPickups();
  }
  resetPickups() { this.pickups = findPickups(this.map).map(p => Object.assign(p, { active: true, respawnAt: 0 })); }
  broadcastPickups() { this.broadcast({ type: 'pickups', active: this.pickups.map(p => p.active) }); }

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
  enemies(p) { return this.list.filter(o => o !== p && (this.mode !== 'teams' || o.team !== p.team)); }
  smallerTeam() { return this.list.filter(p => p.team === 1).length <= this.list.filter(p => p.team === 2).length ? 1 : 2; }
  teamKills(t) { return this.list.filter(p => p.team === t).reduce((n, p) => n + p.kills, 0); }
  score() {
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
    p.hp = MAX_HP;
    p.inv = {}; // picked-up guns are lost on death
    if (p.brain) p.brain = newBrain();
    p.seq++;    // client snaps to the new spawn; stale inputs from the old life are ignored
    this.send(p, { type: 'inv', inv: p.inv });
  }

  add(p) {
    Object.assign(p, { room: this, kills: 0, ready: !!p.bot, seq: p.seq || 0, nextFire: {}, inv: {}, sc: false });
    p.team = this.mode === 'teams' ? this.smallerTeam() : 0;
    this.players[p.id] = p;
    this.resetPlayer(p);
    this.send(p, { type: 'init', id: p.id, room: this.code, level: this.level, x: p.x, y: p.y, z: p.z, a: p.a, hp: MAX_HP, seq: p.seq });
    this.send(p, { type: 'pickups', active: this.pickups.map(pu => pu.active) });
    if (this.gameOn) this.send(p, { type: 'start', level: this.level }); // drop straight into the running match
    if (BOTS && !p.bot && this.humans.length === 1 && !this.hasBots) this.addBot();
    this.roster();
  }

  remove(p) {
    if (!this.players[p.id]) return;
    delete this.players[p.id];
    p.room = null;
    if (!this.humans.length) { this.hub.closeRoom(this); return; } // bots go with it
    if (this.gameOn && !this.enoughPlayers()) this.endMatch('Not enough players left');
    this.roster();
  }

  addBot() {
    if (this.full) return;
    const id = this.hub.nextId++;
    const bot = { id, bot: true, brain: newBrain(), a: 0, p: 0, seq: 0 };
    this.add(bot);
    log(`${this.hub.name(bot)} joined room ${this.code}`);
  }

  killPlayer(victim, killer, info) {
    const at = { x: victim.x, y: victim.y, z: victim.z };
    if (killer) killer.kills++;
    this.hub.record(killer, { kills: 1 });
    this.hub.record(victim, { deaths: 1 });
    this.resetPlayer(victim);
    this.broadcast(Object.assign({ type: 'kill', killer: killer ? killer.id : null, victim: victim.id }, info, at));
    const how = killer ? `killed ${this.hub.name(victim)} with ${info.weapon}${info.backstab ? ' (backstab)' : info.head ? ' (headshot)' : ''}` : 'died in the pit';
    log(`[${this.code}] ${this.hub.name(killer || victim)} ${how} — ${this.score()}`);
    if (!killer) return;
    if (this.mode === 'teams') {
      if (this.teamKills(killer.team) >= TEAM_WIN_SCORE) this.finish(this.list.filter(p => p.team === killer.team), { team: killer.team }, TEAMS[killer.team] + ' team');
    } else if (killer.kills >= WIN_SCORE) this.finish([killer], { winner: killer.id }, this.hub.name(killer));
  }

  startGame() {
    if (this.mode === 'teams' && ![1, 2].every(t => this.list.some(p => p.team === t)))
      this.list.forEach((p, i) => p.team = i % 2 + 1); // everyone picked the same team: split them
    const placed = [];
    for (const p of this.list) {
      p.kills = 0; p.ready = !!p.bot;
      this.resetPlayer(p, placed.filter(o => this.mode !== 'teams' || o.team !== p.team));
      placed.push(p);
    }
    this.resetPickups();
    this.gameOn = true;
    this.broadcast({ type: 'start', level: this.level });
    this.broadcastPickups();
    this.roster();
    log(`[${this.code}] Match started on ${LEVEL_NAMES[this.level]} (${this.mode === 'teams' ? 'teams' : 'free-for-all'}): ${this.list.map(p => this.hub.who(p)).join(', ')}`);
  }

  finish(winners, result, label) {
    this.gameOn = false;
    this.list.forEach(p => p.ready = !!p.bot);
    this.broadcast(Object.assign({ type: 'win' }, result));
    for (const p of this.humans) this.hub.record(p, winners.includes(p) ? { wins: 1 } : { losses: 1 });
    log(`[${this.code}] ${label} won on ${LEVEL_NAMES[this.level]} — ${this.score()}`);
    this.hub.afterMatch(this);
    this.roster();
  }

  endMatch(reason) {
    this.gameOn = false;
    this.list.forEach(p => p.ready = !!p.bot);
    this.broadcast({ type: 'end', reason });
    log(`[${this.code}] Match ended: ${reason}`);
  }

  // --- per-tick: bots, pits, pickups, state broadcast ---
  tick() {
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
    }
    if (this.list.length < 2) return;
    const players = this.list.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, a: p.a, p: p.p, sc: p.sc, hp: p.hp, kills: p.kills, seq: p.seq, team: p.team }));
    this.broadcast({ type: 'state', players });
  }

  tryPickup(p, pu, idx, now) {
    if (!pu.active || Math.hypot(p.x - pu.x, p.y - pu.y) > 0.8 || p.z > 1) return;
    const heal = pu.weapon === 'health';
    if (heal && p.hp >= MAX_HP) return; // leave it for when you need it
    pu.active = false;
    pu.respawnAt = now + (heal ? HEAL_RESPAWN : PICKUP_RESPAWN);
    if (heal) p.hp = Math.min(MAX_HP, p.hp + HEAL);
    else { p.inv[pu.weapon] = AMMO[pu.weapon]; this.send(p, { type: 'inv', inv: p.inv }); }
    this.broadcast({ type: 'pickup', id: p.id, weapon: pu.weapon, idx });
    this.broadcastPickups();
  }
}

// client -> server messages about the match; `this` is the Room, `p` the sending player
Room.prototype.handlers = {
  level(p, msg) {
    if (this.gameOn || !LEVELS[msg.level]) return;
    this.setLevel(msg.level);
    log(`[${this.code}] ${this.hub.who(p)} picked ${LEVEL_NAMES[this.level]}`);
    this.list.forEach(pl => pl.ready = !!pl.bot); // everyone re-confirms on the new map
    this.broadcast({ type: 'level', level: this.level });
    this.roster();
  },

  mode(p, msg) {
    if (this.gameOn || !['ffa', 'teams'].includes(msg.mode) || msg.mode === this.mode) return;
    this.mode = msg.mode;
    this.list.forEach((pl, i) => { pl.team = this.mode === 'teams' ? i % 2 + 1 : 0; pl.ready = !!pl.bot; });
    log(`[${this.code}] ${this.hub.who(p)} switched to ${this.mode === 'teams' ? 'teams' : 'free-for-all'}`);
    this.roster();
  },

  team(p, msg) {
    if (this.gameOn || this.mode !== 'teams' || !TEAMS[msg.team]) return;
    p.team = msg.team;
    this.roster();
  },

  ready(p) {
    if (this.gameOn) return;
    p.ready = true;
    log(`[${this.code}] ${this.hub.who(p)} is ready`);
    if (this.list.length >= 2 && this.list.every(pl => pl.ready)) this.startGame();
    else this.roster();
  },

  addBot() { if (BOTS) this.addBot(); },
  removeBot() {
    const bot = BOTS && this.list.filter(p => p.bot).pop();
    if (!bot) return;
    delete this.players[bot.id];
    log(`${this.hub.name(bot)} left room ${this.code}`);
    if (this.gameOn && !this.enoughPlayers()) this.endMatch('Not enough players left');
    this.roster();
  },

  input(p, msg) {
    if (msg.seq !== p.seq || ![msg.x, msg.y, msg.z, msg.a, msg.p].every(Number.isFinite)) return;
    // basic anti-cheat: no teleporting (bhop speed is capped client-side) and no walking into walls
    if (Math.hypot(msg.x - p.x, msg.y - p.y) < 1 && !hitsWall(this.T, msg.x, msg.y, PLAYER_R)) { p.x = msg.x; p.y = msg.y; }
    const g = groundAt(this.T, p.x, p.y);
    p.z = Math.max(g - 0.4, Math.min(g + 2, msg.z));
    p.a = msg.a;
    p.p = Math.max(-1.2, Math.min(1.2, msg.p));
    p.sc = !!msg.sc;
  },

  shoot(p, msg) {
    const w = WEAPONS[msg.weapon];
    if (!w || !this.gameOn) return;
    const now = Date.now();
    if (now < (p.nextFire[msg.weapon] || 0)) return;
    if (AMMO[msg.weapon] !== undefined) {
      if (!(p.inv[msg.weapon] > 0)) return;
      if (--p.inv[msg.weapon] === 0) delete p.inv[msg.weapon];
      this.send(p, { type: 'inv', inv: p.inv });
    }
    p.nextFire[msg.weapon] = now + w.cd * 0.85; // slack for network jitter
    const targets = this.enemies(p);
    const res = w.melee ? doMelee(this.T, p, targets) : doShoot(this.T, p, targets, msg.weapon, !!msg.scoped);
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
