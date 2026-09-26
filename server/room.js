// One game room: up to MAX_PLAYERS in free-for-all or red vs blue teams. The Hub (hub.js)
// owns connections, accounts and friends; a room only sees the players inside it.
// People can join a match that's already running; it ends early if too few are left.
import { TICK, RES, MAX_HP, WIN_SCORE, TEAM_WIN_SCORE, MAX_PLAYERS, TEAMS, PLAYER_SKINS, EYE, BODY_H, PIT_DPS, PICKUP_RESPAWN, HEAL, HEAL_RESPAWN, WEAPONS, AMMO, START_GUN, MAX_SPARE, PAD_GUNS, AMMO_CRATES, AMMO_RESPAWN, GUN_SLOTS, USE_RANGE, BOX_TIME } from '../shared/config.js';
import { LEVELS, LEVEL_NAMES, MW, MH } from '../shared/levels.js';
import { buildTerrain, groundAt, kindAt, findPickups, hitsWall } from '../shared/terrain.js';
import { doShoot, doMelee } from './combat.js';
import { newBrain, botTick, BOT_LEVELS, KNIFE_CHANCE } from './bot.js';
import { log } from './log.js';
import { VERSION } from './version.js';

const CHAT_MAX = 140; // as in public/js/chat.js

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
    this.mode = 'ffa';        // 'ffa' | 'teams'
    this.gameOn = false;
    this.boxes = [];          // loot boxes: { id, x, y, z, items: [{ w, mag, spare }], until }
    this.boxId = 0;
    this.setLevel('hell');
  }

  get list() { return Object.values(this.players); }
  get humans() { return this.list.filter(p => !p.bot); }
  get full() { return this.humans.length >= MAX_PLAYERS; } // bots give up their seats
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
      players: this.list.map(p => ({ id: p.id, name: this.hub.name(p), team: p.team, skin: p.skin || 'demon', ready: p.ready, bot: !!p.bot, level: p.level })) });
  }

  // --- level / pickups ---
  setLevel(name) {
    this.level = name;
    this.map = LEVELS[name];
    this.T = TERRAINS[name];
    this.resetPickups();
  }
  // the level's pads (gun pads roll a random gun every time they come back; health stays health)
  // plus small ammo crates at random open spots, new ones each match
  resetPickups() {
    this.pickups = findPickups(this.map).map(p => Object.assign(p, { gun: p.weapon !== 'health' }));
    const taken = [...this.pickups];
    for (let i = 0; i < AMMO_CRATES; i++) {
      const s = this.spawnPos(taken); // far from the pads and the other crates
      if (!s) break;
      taken.push(s);
      this.pickups.push({ x: s.x, y: s.y, weapon: 'ammo', gun: false });
    }
    for (const pu of this.pickups) { pu.active = true; pu.respawnAt = 0; this.rollPad(pu); }
    this.boxes = [];
  }
  rollPad(pu) { if (pu.gun) pu.weapon = PAD_GUNS[Math.floor(Math.random() * PAD_GUNS.length)]; }
  pickupList() { return { type: 'pickups', spots: this.pickups.map(p => ({ x: p.x, y: p.y, weapon: p.weapon })), active: this.pickups.map(p => p.active) }; }
  broadcastPickups() { this.broadcast(this.pickupList()); }
  boxList() { return { type: 'boxes', boxes: this.boxes.map(b => ({ id: b.id, x: b.x, y: b.y, z: b.z, items: b.items.map(it => it.w) })) }; }

  // a loot box on the ground at (x, y); nothing if it would land in lava / acid / bog
  addBox(x, y, items) {
    if (!items.length || kindAt(this.T, x, y) === 2) return;
    this.boxes.push({ id: ++this.boxId, x, y, z: groundAt(this.T, x, y), items, until: Date.now() + BOX_TIME });
  }

  // a dying player's guns go in a box at the body, with the ammo left in them
  dropLoot(p) {
    const items = Object.keys(p.mag).filter(w => p.mag[w] + (p.inv[w] || 0) > 0)
      .map(w => ({ w, mag: p.mag[w], spare: p.inv[w] || 0 }));
    this.addBox(p.x, p.y, items);
  }

  // give `p` gun w: its ammo if they have one, else a free slot, else it replaces `drop` (the gun
  // in their hand) in the same slot. Returns { dropped } (the replaced gun, if any), or null if
  // it can't be done
  takeGun(p, w, mag, spare, drop) {
    if (p.mag[w] !== undefined) { this.addSpare(p, w, mag + spare); return { dropped: null }; }
    const guns = Object.keys(p.mag);
    if (guns.length < GUN_SLOTS) { p.mag[w] = mag; p.inv[w] = spare; return { dropped: null }; }
    if (!guns.includes(drop)) return null;
    const dropped = { w: drop, mag: p.mag[drop], spare: p.inv[drop] || 0 };
    const mags = {}, invs = {};
    for (const g of guns) { // rebuild so the new gun keeps the old one's slot
      const k = g === drop ? w : g;
      mags[k] = g === drop ? mag : p.mag[g];
      if (g === drop) invs[k] = spare; else if (p.inv[g] !== undefined) invs[k] = p.inv[g];
    }
    p.mag = mags; p.inv = invs;
    return { dropped };
  }
  // spare rounds for gun w, up to what you can carry (the rest is left behind); how many fit
  addSpare(p, w, n) {
    const have = p.inv[w] || 0, add = Math.max(0, Math.min(n, MAX_SPARE(w) - have));
    p.inv[w] = have + add;
    return add;
  }
  // full ammo state, when the client's own count can't be trusted (respawn, rejected shot/reload)
  syncAmmo(p) { this.send(p, { type: 'inv', mag: p.mag, inv: p.inv }); }

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
    p.mag = { [START_GUN]: WEAPONS[START_GUN].mag }; // rounds loaded; you own the guns listed here
    p.inv = { [START_GUN]: AMMO[START_GUN] };         // spare rounds per gun
    p.lastShot = {};
    if (p.brain) p.brain = newBrain();
    p.seq++;    // client snaps to the new spawn; stale inputs from the old life are ignored
    this.syncAmmo(p);
  }

  add(p) {
    if (!p.bot && this.list.length >= MAX_PLAYERS) this.dropBot(); // make room for a person
    Object.assign(p, { room: this, kills: 0, ready: !!p.bot, skin: p.skin || 'demon', seq: p.seq || 0, nextFire: {}, mag: {}, inv: {}, lastShot: {}, sc: false });
    p.team = this.mode === 'teams' ? this.smallerTeam() : 0;
    this.players[p.id] = p;
    this.resetPlayer(p);
    this.send(p, { type: 'init', id: p.id, room: this.code, level: this.level, x: p.x, y: p.y, z: p.z, a: p.a, hp: MAX_HP, seq: p.seq, version: VERSION });
    this.send(p, this.pickupList());
    this.send(p, this.boxList());
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
    if (!this.maybeStart()) this.roster(); // the one who wasn't ready left
  }

  // start the match once there are two or more players and all of them are ready; true if it did
  maybeStart() {
    if (this.gameOn || this.list.length < 2 || !this.list.every(pl => pl.ready)) return false;
    this.startGame();
    return true;
  }

  // level: 'easy' | 'medium' | 'hard' (bot.js BOT_LEVELS); each bot gets a random character
  addBot(level = 'medium') {
    if (this.list.length >= MAX_PLAYERS || !BOT_LEVELS[level]) return;
    const id = this.hub.nextId++;
    const skin = PLAYER_SKINS[Math.floor(Math.random() * PLAYER_SKINS.length)];
    const bot = { id, bot: true, level, skin, knife: Math.random() < KNIFE_CHANCE, brain: newBrain(), a: 0, p: 0, seq: 0 };
    this.add(bot);
    log(`${this.hub.name(bot)} joined room ${this.code}`);
  }

  // take out the newest bot; false if there are none
  dropBot() {
    const bot = this.list.filter(p => p.bot).pop();
    if (!bot) return false;
    delete this.players[bot.id];
    log(`${this.hub.name(bot)} left room ${this.code}`);
    return true;
  }

  killPlayer(victim, killer, info) {
    const at = { x: victim.x, y: victim.y, z: victim.z };
    if (killer) killer.kills++;
    this.hub.record(killer, { kills: 1 });
    this.hub.record(victim, { deaths: 1 });
    this.dropLoot(victim);
    this.resetPlayer(victim);
    this.broadcast(this.boxList());
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
    this.broadcast(this.boxList());
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
        this.pickups.forEach(pu => this.tryWalkOver(p, pu, now));
      }
      let respawned = false;
      for (const pu of this.pickups) if (!pu.active && now >= pu.respawnAt) { pu.active = true; this.rollPad(pu); respawned = true; }
      if (respawned) this.broadcastPickups();
      const boxes = this.boxes.length;
      this.boxes = this.boxes.filter(b => now < b.until);
      if (this.boxes.length !== boxes) this.broadcast(this.boxList());
    }
    if (this.list.length < 2) return;
    const players = this.list.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, a: p.a, p: p.p, sc: p.sc, sl: p.sl, hp: p.hp, kills: p.kills, seq: p.seq, team: p.team }));
    this.broadcast({ type: 'state', players });
  }

  // health and ammo crates are taken by walking over them, only when you need them (guns need
  // the use key, see handlers.use). An ammo crate is a mag for each gun you carry
  tryWalkOver(p, pu, now) {
    if (pu.gun || !pu.active || Math.hypot(p.x - pu.x, p.y - pu.y) > 0.8 || p.z > 1) return;
    if (pu.weapon === 'health') {
      if (p.hp >= MAX_HP) return;
      p.hp = Math.min(MAX_HP, p.hp + HEAL);
      pu.respawnAt = now + HEAL_RESPAWN;
    } else {
      let got = 0;
      for (const w in p.mag) got += this.addSpare(p, w, WEAPONS[w].mag);
      if (!got) return;
      pu.respawnAt = now + AMMO_RESPAWN;
      this.syncAmmo(p);
    }
    pu.active = false;
    this.broadcast({ type: 'pickup', id: p.id, weapon: pu.weapon, x: pu.x, y: pu.y, z: 0 });
    this.broadcastPickups();
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
    if (!this.maybeStart()) this.roster();
  },

  addBot(p, msg) { this.addBot(msg.level); this.maybeStart(); }, // you may have readied up before adding it
  removeBot() {
    if (!this.dropBot()) return;
    if (this.gameOn && !this.enoughPlayers()) this.endMatch('Not enough players left');
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
    if (!this.gameOn) return;
    const near = o => Math.hypot(p.x - o.x, p.y - o.y) <= USE_RANGE && Math.abs(p.z - (o.z || 0)) < 1.2;
    let got = null, where = null;
    if (Number.isInteger(msg.pad)) {
      const pu = this.pickups[msg.pad];
      if (!pu || !pu.gun || !pu.active || !near(pu)) return;
      const r = this.takeGun(p, pu.weapon, WEAPONS[pu.weapon].mag, AMMO[pu.weapon], msg.drop);
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

  // sent when the client finishes a reload; it can't have fired that gun for the whole reload
  reload(p, msg) {
    const w = WEAPONS[msg.weapon], now = Date.now();
    if (!w || w.melee || p.mag[msg.weapon] === undefined) return;
    const spare = p.inv[msg.weapon] || 0;
    const n = Math.min(w.mag - p.mag[msg.weapon], spare);
    if (n <= 0 || now - (p.lastShot[msg.weapon] || 0) < w.reload * 0.85) { this.syncAmmo(p); return; } // slack for network jitter
    p.mag[msg.weapon] += n;
    p.inv[msg.weapon] -= n;
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
    p.sl = !!msg.sl;
  },

  shoot(p, msg) {
    const w = WEAPONS[msg.weapon];
    if (!w || !this.gameOn) return;
    const now = Date.now();
    if (now < (p.nextFire[msg.weapon] || 0)) return;
    if (!w.melee) {
      // the client counts its own rounds the same way, so no reply unless we disagree
      if (!(p.mag[msg.weapon] > 0)) { this.syncAmmo(p); return; }
      p.mag[msg.weapon]--;
      p.lastShot[msg.weapon] = now;
      if (!p.mag[msg.weapon] && !p.inv[msg.weapon]) { delete p.mag[msg.weapon]; delete p.inv[msg.weapon]; } // used up
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
