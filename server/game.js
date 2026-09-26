// Lobby + match state for a two-player game. One Game instance per server.
import { TICK, RES, MAX_HP, WIN_SCORE, EYE, BODY_H, PIT_DPS, PICKUP_RESPAWN, HEAL, HEAL_RESPAWN, WEAPONS, AMMO } from '../shared/config.js';
import { LEVELS, LEVEL_NAMES, MW, MH } from '../shared/levels.js';
import { buildTerrain, groundAt, kindAt, findPickups } from '../shared/terrain.js';
import { doShoot, doMelee } from './combat.js';
import { newBrain, botTick } from './bot.js';
import { log } from './log.js';

// `node server.js --bots` (or BOTS=1): a bot joins as your opponent (local testing).
// The flag works in every shell; env vars need different syntax on Windows.
const BOTS = process.argv.includes('--bots') || !!process.env.BOTS;

const TERRAINS = {};
for (const k in LEVELS) TERRAINS[k] = buildTerrain(LEVELS[k], RES);

export class Game {
  constructor() {
    this.players = {};   // id -> player state
    this.clients = [];   // { id, socket }
    this.nextId = 0;
    this.gameOn = false;
    this.setLevel('hell');
  }

  // --- messaging ---
  send(id, msg) {
    const c = this.clients.find(c => c.id === id);
    if (c) try { c.socket.send(JSON.stringify(msg)); } catch {}
  }
  broadcast(msg) {
    const data = JSON.stringify(msg);
    this.clients.forEach(c => { try { c.socket.send(data); } catch {} });
  }
  waiting(reason) { this.broadcast({ type: 'waiting', reason }); }

  // --- level / pickups ---
  setLevel(name) {
    this.level = name;
    this.map = LEVELS[name];
    this.T = TERRAINS[name];
    this.resetPickups();
  }
  resetPickups() { this.pickups = findPickups(this.map).map(p => Object.assign(p, { active: true, respawnAt: 0 })); }
  broadcastPickups() { this.broadcast({ type: 'pickups', active: this.pickups.map(p => p.active) }); }

  spawnPos(avoid) {
    const M = this.map, spots = [];
    for (let y = 1; y < MH - 1; y++)
      for (let x = 1; x < MW - 1; x++) {
        if (M[y][x] !== '.') continue;
        let nearPit = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (M[y + dy][x + dx] === 'L') nearPit = true;
        if (!nearPit) spots.push({ x: x + 0.5, y: y + 0.5 });
      }
    if (!avoid) return spots[Math.floor(Math.random() * spots.length)];
    // pick one of the 10 spots furthest from `avoid`
    spots.sort((a, b) => Math.hypot(b.x - avoid.x, b.y - avoid.y) - Math.hypot(a.x - avoid.x, a.y - avoid.y));
    return spots[Math.floor(Math.random() * Math.min(10, spots.length))];
  }

  // --- players ---
  // how a player appears in the server log
  who(p) { return p.bot ? `Bot ${p.id}` : `Player ${p.id} (${p.ip})`; }
  score() { return Object.values(this.players).map(p => (p.bot ? 'Bot ' : 'P') + p.id + ' ' + p.kills).join(', '); }

  opponent(p) { return Object.values(this.players).find(o => o.id !== p.id) || null; }

  resetPlayer(p, avoid) {
    const sp = this.spawnPos(avoid);
    p.x = sp.x; p.y = sp.y; p.z = groundAt(this.T, sp.x, sp.y);
    p.a = avoid ? Math.atan2(avoid.y - sp.y, avoid.x - sp.x) : Math.random() * Math.PI * 2;
    p.p = 0;
    p.hp = MAX_HP;
    p.inv = {}; // picked-up guns are lost on death
    if (p.brain) p.brain = newBrain();
    p.seq++;    // client snaps to the new spawn; stale inputs from the old life are ignored
    this.send(p.id, { type: 'inv', inv: p.inv });
  }

  killPlayer(victim, killer, info) {
    const at = { x: victim.x, y: victim.y, z: victim.z };
    if (killer) killer.kills++;
    this.resetPlayer(victim, killer || this.opponent(victim));
    this.broadcast(Object.assign({ type: 'kill', killer: killer ? killer.id : null, victim: victim.id }, info, at));
    const how = killer ? `killed ${this.who(victim)} with ${info.weapon}${info.backstab ? ' (backstab)' : info.head ? ' (headshot)' : ''}` : 'died in the pit';
    log(`${this.who(killer || victim)} ${how} — ${this.score()}`);
    if (killer && killer.kills >= WIN_SCORE) {
      this.gameOn = false;
      Object.values(this.players).forEach(pl => pl.ready = !!pl.bot);
      this.broadcast({ type: 'win', winner: killer.id });
      log(`${this.who(killer)} won on ${LEVEL_NAMES[this.level]} — ${this.score()}`);
    }
  }

  startGame() {
    const ps = Object.values(this.players);
    ps.forEach(pl => { pl.kills = 0; pl.ready = !!pl.bot; });
    this.resetPickups();
    this.resetPlayer(ps[0], null);
    this.resetPlayer(ps[1], ps[0]);
    this.gameOn = true;
    this.broadcast({ type: 'start', level: this.level });
    this.broadcastPickups();
    log(`Match started on ${LEVEL_NAMES[this.level]}: ${ps.map(p => this.who(p)).join(' vs ')}`);
  }

  // --- connections ---
  connect(socket, ip) {
    if (this.clients.length >= 2) { log(`Turned away ${ip}: game is full`); socket.close(); return; }
    const id = this.nextId++;
    const sp = this.spawnPos(this.clients.length > 0 ? this.players[this.clients[0].id] : null);
    const p = this.players[id] = { id, x: sp.x, y: sp.y, z: groundAt(this.T, sp.x, sp.y), a: Math.random() * Math.PI * 2, p: 0, sc: false,
      hp: MAX_HP, kills: 0, ready: false, seq: 0, nextFire: {}, inv: {}, ip, joinedAt: Date.now() };
    this.clients.push({ id, socket });
    log(`${this.who(p)} connected (${this.clients.length}/2 players)`);
    if (BOTS && this.clients.length === 1) this.addBot();

    this.send(id, { type: 'init', id, level: this.level, x: p.x, y: p.y, z: p.z, a: p.a, hp: MAX_HP, seq: 0 });
    this.send(id, { type: 'pickups', active: this.pickups.map(p => p.active) });
    if (this.clients.length < 2) this.send(id, { type: 'waiting', reason: 'Waiting for opponent to join...' });
    else this.waiting("Both here — pick a level, then click \"I'm Here\" to start!");

    socket.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      const handler = this.handlers[msg.type];
      if (handler && this.players[id]) handler.call(this, this.players[id], msg);
    });
    const leave = () => this.disconnect(id);
    socket.on('close', leave);
    socket.on('error', leave);
  }

  // a bot is a player whose socket goes nowhere; it's always ready
  addBot() {
    const id = this.nextId++, human = Object.values(this.players)[0];
    const sp = this.spawnPos(human);
    this.players[id] = { id, x: sp.x, y: sp.y, z: groundAt(this.T, sp.x, sp.y), a: 0, p: 0, sc: false,
      hp: MAX_HP, kills: 0, ready: true, seq: 0, nextFire: {}, inv: {}, bot: true, brain: newBrain() };
    this.clients.push({ id, socket: { send() {} } });
    log(`Bot ${id} joined`);
  }

  disconnect(id) {
    const p = this.players[id];
    if (!p) return;
    const mins = ((Date.now() - p.joinedAt) / 60000).toFixed(1);
    log(`${this.who(p)} disconnected after ${mins} min${this.gameOn ? ', mid-match — ' + this.score() : ''}`);
    this.clients = this.clients.filter(c => c.id !== id);
    delete this.players[id];
    this.gameOn = false;
    if (this.clients.every(c => this.players[c.id].bot)) { // nobody left to play the bot
      this.clients.forEach(c => { log(`Bot ${c.id} left`); delete this.players[c.id]; });
      this.clients = [];
    }
    if (this.clients.length === 1) {
      Object.values(this.players).forEach(pl => pl.ready = false);
      this.broadcast({ type: 'opponentLeft' });
      this.waiting('Opponent left — waiting for opponent to join...');
    }
  }

  // --- per-tick: pits, pickups, state broadcast ---
  tick() {
    for (const p of Object.values(this.players)) if (p.bot) botTick(this, p);
    if (this.gameOn) {
      const now = Date.now();
      for (const p of Object.values(this.players)) {
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
    if (this.clients.length < 2) return;
    const players = Object.values(this.players).map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, a: p.a, p: p.p, sc: p.sc, hp: p.hp, kills: p.kills, seq: p.seq }));
    this.broadcast({ type: 'state', players });
  }

  tryPickup(p, pu, idx, now) {
    if (!pu.active || Math.hypot(p.x - pu.x, p.y - pu.y) > 0.8 || p.z > 1) return;
    const heal = pu.weapon === 'health';
    if (heal && p.hp >= MAX_HP) return; // leave it for when you need it
    pu.active = false;
    pu.respawnAt = now + (heal ? HEAL_RESPAWN : PICKUP_RESPAWN);
    if (heal) p.hp = Math.min(MAX_HP, p.hp + HEAL);
    else { p.inv[pu.weapon] = AMMO[pu.weapon]; this.send(p.id, { type: 'inv', inv: p.inv }); }
    this.broadcast({ type: 'pickup', id: p.id, weapon: pu.weapon, idx });
    this.broadcastPickups();
  }
}

// client -> server messages; `this` is the Game, `p` the sending player
Game.prototype.handlers = {
  level(p, msg) {
    if (this.gameOn || !LEVELS[msg.level]) return;
    this.setLevel(msg.level);
    log(`${this.who(p)} picked ${LEVEL_NAMES[this.level]}`);
    Object.values(this.players).forEach(pl => pl.ready = !!pl.bot); // everyone re-confirms on the new map
    this.broadcast({ type: 'level', level: this.level });
    this.waiting('Level: ' + LEVEL_NAMES[this.level] + " — click \"I'm Here\" to start!");
  },

  ready(p) {
    if (this.gameOn) return;
    p.ready = true;
    log(`${this.who(p)} is ready`);
    if (this.clients.length === 2 && Object.values(this.players).every(pl => pl.ready)) this.startGame();
    else this.waiting('Level: ' + LEVEL_NAMES[this.level] + ' — waiting for other player...');
  },

  input(p, msg) {
    if (msg.seq !== p.seq || ![msg.x, msg.y, msg.z, msg.a, msg.p].every(Number.isFinite)) return;
    // basic anti-cheat: no teleporting (bhop speed is capped client-side)
    if (Math.hypot(msg.x - p.x, msg.y - p.y) < 1) { p.x = msg.x; p.y = msg.y; }
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
      this.send(p.id, { type: 'inv', inv: p.inv });
    }
    p.nextFire[msg.weapon] = now + w.cd * 0.85; // slack for network jitter
    const other = this.opponent(p);
    const res = w.melee ? doMelee(this.T, p, other) : doShoot(this.T, p, other, msg.weapon, !!msg.scoped);
    this.broadcast({ type: 'shot', id: p.id, weapon: msg.weapon, x: p.x, y: p.y, z: p.z,
      rays: res.rays.map(r => ({ a: r.a, p: r.p, dist: r.dist, hit: r.hit })) });
    if (res.dmg <= 0) return;
    const r = res.hitRay;
    other.hp -= res.dmg;
    this.broadcast({ type: 'hit', who: other.id, by: p.id, dmg: res.dmg, head: res.head, weapon: msg.weapon,
      x: p.x + Math.cos(r.a) * r.dist, y: p.y + Math.sin(r.a) * r.dist,
      z: w.melee ? other.z + BODY_H / 2 : p.z + EYE + r.p * r.dist });
    if (other.hp <= 0) this.killPlayer(other, p, { weapon: msg.weapon, head: res.head, backstab: res.backstab, dist: r.dist, a: r.a });
  },
};
