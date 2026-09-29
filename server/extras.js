// Room add-ons that work across the arena modes: power-ups, jump pads and portals, map events
// (Blood Moon, Low Gravity, Frenzy, Meteor Shower), Soul Harvest's souls, the Decoy / Healing
// Totem / Gravity Well spells, emotes, custom game settings and attachments. Mixed into Room
// (server/room.js); `this` is the Room.
import { BODY_H, SOUL, POWERUPS, POWERUP_COUNT, POWERUP_RESPAWN, POWERUP_SHIELD, JUMP_PAD, PORTAL, MAP_EVENTS, EVENT_EVERY, METEOR,
  TOTEM, WELL, DECOY, EMOTES, EMOTE_MS, ATTACHMENTS, customValue, isTeamMode, TEAMS } from '../shared/config.js';
import { MW, MH } from '../shared/levels.js';
import { walkHeight, kindAt, hitsWall } from '../shared/terrain.js';
import { levelFor } from '../shared/progression.js';
import { log } from './log.js';

// a repeatable random sequence per map, so pads and portals are always in the same places
function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
// n spots spread out over the map: each the furthest from those already picked
function spread(spots, n, rand, avoid = []) {
  if (!spots.length) return [];
  const out = [], taken = [...avoid];
  let first = spots[Math.floor(rand() * spots.length)];
  if (taken.length) first = null;
  if (first) { out.push(first); taken.push(first); }
  const step = Math.max(1, Math.floor(spots.length / 600));
  while (out.length < n) {
    let best = null, gap = -1;
    for (let i = Math.floor(rand() * step); i < spots.length; i += step) {
      const s = spots[i], d = Math.min(...taken.map(t => Math.hypot(t.x - s.x, t.y - s.y)));
      if (d > gap) { gap = d; best = s; }
    }
    if (!best || gap < 3) break;
    out.push(best); taken.push(best);
  }
  return out;
}

export const extraMethods = {
  // --- jump pads and portals: fixed per map ---
  makeTraversal() {
    this.pads = []; this.portals = [];
    if (this.level === 'crypt') return;
    const rand = seeded(this.level), spots = this.spawnSpotsList().filter(s => !this.pickups.some(p => Math.hypot(p.x - s.x, p.y - s.y) < 2));
    // no pads under a ceiling: they'd fling you through it
    if (this.level !== 'haunt') this.pads = spread(spots, JUMP_PAD.count, rand).map((s, i) => {
      const dx = MW / 2 - s.x, dy = MH / 2 - s.y, d = Math.hypot(dx, dy) || 1;
      return { id: i, x: s.x, y: s.y, z: walkHeight(this.T, s.x, s.y, 0), dx: dx / d, dy: dy / d };
    });
    const ends = spread(spots, PORTAL.pairs * 2, rand, this.pads);
    for (let i = 0; i + 1 < ends.length; i += 2) {
      const [a, b] = [ends[i], ends[i + 1]];
      this.portals.push({ id: i / 2, a: { x: a.x, y: a.y, z: walkHeight(this.T, a.x, a.y, 0) }, b: { x: b.x, y: b.y, z: walkHeight(this.T, b.x, b.y, 0) } });
    }
  },
  stepTraversal(now) {
    for (const p of this.list) {
      if (p.dead) continue;
      for (const pad of this.pads) {
        if (Math.hypot(p.x - pad.x, p.y - pad.y) > JUMP_PAD.r || p.z - pad.z > 0.3) continue;
        p.padUntil = now + 2500; // the client flings itself; this lets the server believe it
        if (p.bot && p.onGround && now >= (p.padReady || 0)) {
          p.padReady = now + 600;
          p.vz = JUMP_PAD.vz; p.onGround = false;
          p.vx = (p.vx || 0) + pad.dx * JUMP_PAD.push; p.vy = (p.vy || 0) + pad.dy * JUMP_PAD.push;
        }
      }
      for (const pt of this.portals) {
        const da = Math.hypot(p.x - pt.a.x, p.y - pt.a.y), db = Math.hypot(p.x - pt.b.x, p.y - pt.b.y);
        if (p.portalLock === pt.id) { if (da > PORTAL.r + 0.5 && db > PORTAL.r + 0.5) p.portalLock = null; continue; }
        if (da > PORTAL.r && db > PORTAL.r) continue;
        const from = da <= PORTAL.r ? pt.a : pt.b, to = from === pt.a ? pt.b : pt.a;
        Object.assign(p, { x: to.x, y: to.y, z: walkHeight(this.T, to.x, to.y, to.z) });
        p.portalLock = pt.id;
        p.lastInputAt = now;
        this.send(p, { type: 'tp', x: p.x, y: p.y, z: p.z });
        this.broadcast({ type: 'portal', id: p.id, x0: from.x, y0: from.y, x1: to.x, y1: to.y });
      }
    }
  },

  // --- power-ups ---
  resetPowerups() {
    this.powerups = [];
    if (this.mode === 'survival' || this.tutorial || !this.custom.powerups) return;
    const kinds = Object.keys(POWERUPS);
    const avoid = [...this.pads, ...this.portals.flatMap(p => [p.a, p.b])];
    this.powerups = spread(this.spawnSpotsList(), POWERUP_COUNT, Math.random, avoid).map((s, i) => ({
      id: i, x: s.x, y: s.y, z: walkHeight(this.T, s.x, s.y, 0), kind: kinds[Math.floor(Math.random() * kinds.length)], active: true, respawnAt: 0,
    }));
  },
  powerupList() { return { type: 'powerups', list: this.powerups.map(u => ({ id: u.id, x: u.x, y: u.y, z: u.z, kind: u.kind, active: u.active })) }; },
  stepPowerups(now) {
    let changed = false;
    const kinds = Object.keys(POWERUPS);
    for (const u of this.powerups) {
      if (!u.active) {
        if (now >= u.respawnAt) { u.active = true; u.kind = kinds[Math.floor(Math.random() * kinds.length)]; changed = true; }
        continue;
      }
      const p = this.list.find(o => !o.dead && !this.isInfected(o) && Math.hypot(o.x - u.x, o.y - u.y) < 0.8 && Math.abs(o.z - u.z) < 1);
      if (!p) continue;
      this.givePowerup(p, u.kind, now);
      u.active = false; u.respawnAt = now + POWERUP_RESPAWN; changed = true;
      this.broadcast({ type: 'powerup', id: p.id, kind: u.kind, x: u.x, y: u.y, z: u.z });
    }
    if (changed) this.broadcast(this.powerupList());
  },
  givePowerup(p, kind, now) {
    const ms = POWERUPS[kind].ms;
    if (kind === 'fury') p.furyUntil = now + ms;
    else if (kind === 'shield') { p.wardUntil = now + ms; p.ward = POWERUP_SHIELD; }
    else if (kind === 'feather') p.featherUntil = now + ms;
    else if (kind === 'cloak') p.invisUntil = now + ms;
    this.send(p, { type: 'buff', kind, ms });
  },

  // --- map events ---
  eventsOn() { return this.gameOn && this.mode !== 'survival' && !this.tutorial && this.custom.events; },
  eventSnapshot(now = Date.now()) { return this.event && now < this.event.until ? { kind: this.event.kind, ms: this.event.until - now } : null; },
  stepEvents(now) {
    if (!this.eventsOn()) return false;
    if (this.event && now >= this.event.until) {
      this.event = null;
      this.eventAt = now + EVENT_EVERY;
      this.broadcast({ type: 'event', kind: null });
    }
    if (!this.event && now >= (this.eventAt || Infinity)) {
      const kinds = Object.keys(MAP_EVENTS).filter(k => k !== 'meteors' || this.level !== 'haunt');
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.event = { kind, until: now + MAP_EVENTS[kind].ms };
      this.nextMeteor = now + 1500;
      this.broadcast({ type: 'event', kind, ms: MAP_EVENTS[kind].ms });
      log(`[${this.code}] Event: ${MAP_EVENTS[kind].name}`);
    }
    if (this.eventOn('meteors', now) && now >= this.nextMeteor) {
      this.nextMeteor = now + METEOR.every * (0.6 + Math.random() * 0.8);
      const alive = this.list.filter(p => !p.dead);
      const near = alive[Math.floor(Math.random() * alive.length)];
      if (near) for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 5, x = near.x + Math.cos(a) * r, y = near.y + Math.sin(a) * r;
        if (x < 1 || y < 1 || x > MW - 1 || y > MH - 1 || kindAt(this.T, x, y) === 1) continue;
        const z = walkHeight(this.T, x, y, 0);
        this.meteors.push({ x, y, z, at: now + METEOR.warn });
        this.broadcast({ type: 'meteor', x, y, z, ms: METEOR.warn });
        break;
      }
    }
    const landed = this.meteors.filter(m => now >= m.at);
    this.meteors = this.meteors.filter(m => now < m.at);
    for (const m of landed) {
      this.broadcast({ type: 'nadeBoom', x: m.x, y: m.y, z: m.z + 0.3, id: 'meteor' });
      for (const p of this.list) {
        if (p.dead || p.hacks) continue;
        const d = Math.hypot(p.x - m.x, p.y - m.y, p.z - m.z);
        if (d > METEOR.radius) continue;
        const dmg = this.hurt(p, Math.round(METEOR.dmg * (1 - d / METEOR.radius)), now);
        p.hp -= dmg;
        this.broadcast({ type: 'hit', who: p.id, by: null, dmg, head: false, weapon: 'meteor', x: m.x, y: m.y, z: m.z, fromX: m.x, fromY: m.y });
        if (p.hp <= 0) this.killPlayer(p, null, { weapon: 'meteor', head: false, a: Math.atan2(p.y - m.y, p.x - m.x) });
        if (!this.gameOn) return true;
      }
    }
    return false;
  },

  // --- Soul Harvest ---
  dropSoul(victim) {
    if (kindAt(this.T, victim.x, victim.y) === 2 || (victim.team !== 1 && victim.team !== 2)) return;
    this.souls.push({ id: ++this.npcId, x: victim.x, y: victim.y, z: walkHeight(this.T, victim.x, victim.y, victim.z), team: victim.team, until: Date.now() + SOUL.life });
  },
  // reap an enemy soul for a point, or deny one of your own; true if that won the match
  updateSouls(now) {
    if (!this.gameOn || this.mode !== 'harvest') return false;
    this.souls = this.souls.filter(s => now < s.until);
    for (const s of [...this.souls]) {
      const p = this.list.find(o => !o.dead && Math.hypot(o.x - s.x, o.y - s.y) <= SOUL.touch && Math.abs(o.z - s.z) < 1.2);
      if (!p) continue;
      this.souls = this.souls.filter(o => o !== s);
      const reap = p.team !== s.team;
      if (reap) this.soulScores[p.team]++;
      this.broadcast({ type: 'soul', event: reap ? 'reap' : 'deny', by: p.id, team: s.team, x: s.x, y: s.y, z: s.z, scores: { ...this.soulScores } });
      if (reap && this.soulScores[p.team] >= this.soulWinScore) {
        this.finish(this.list.filter(o => o.team === p.team), { team: p.team, mode: 'harvest', soulScores: { ...this.soulScores } }, TEAMS[p.team] + ' team');
        return true;
      }
    }
    return false;
  },
  // where a harvest bot should head: the nearest soul it can see coming
  soulTarget(p) {
    if (this.mode !== 'harvest') return null;
    const s = this.souls.filter(s => Math.hypot(s.x - p.x, s.y - p.y) < 16).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    return s ? { index: `soul-${s.id}`, x: Math.floor(s.x) + 0.5, y: Math.floor(s.y) + 0.5, radius: 0.4 } : null;
  },

  // --- decoys and other conjured things ---
  // can npc n hurt / be hurt by player p? monsters fight every survivor; a decoy is on its caster's side
  npcHostile(n, p) {
    if (n.kind !== 'decoy') return true;
    if (p.id === n.owner) return false;
    return !isTeamMode(this.mode) || p.team !== n.team;
  },
  addDecoy(p, now) {
    this.killDecoys(p);
    this.npcs.push({ id: 'd' + (++this.npcId), npc: true, kind: 'decoy', owner: p.id, team: p.team, x: p.x, y: p.y, z: p.z, a: p.a,
      hp: DECOY.hp, maxHp: DECOY.hp, until: now + DECOY.ms, walk: true });
  },
  killDecoys(owner) {
    for (const n of this.npcs) if (n.kind === 'decoy' && n.owner === owner.id && !n.dead) this.popNpc(n);
  },
  popNpc(n, by = null, info = {}) {
    n.dead = true;
    this.npcs = this.npcs.filter(o => o !== n);
    this.broadcast({ type: 'npcDie', id: n.id, kind: n.kind, x: n.x, y: n.y, z: n.z, by: by ? by.id : null, head: !!info.head });
  },
  // damage to a monster or decoy from `by` (a player, or null)
  hitNpc(n, dmg, by, info) {
    if (n.dead || dmg <= 0) return;
    if (this.survival && n.kind !== 'decoy' && this.survival.instaUntil > Date.now()) dmg = Math.max(dmg, Math.ceil(n.hp)); // Insta-Kill
    n.hp -= dmg;
    this.broadcast({ type: 'hit', who: n.id, by: by ? by.id : null, dmg: Math.round(dmg), head: !!info.head, weapon: info.weapon,
      fromX: info.fromX ?? by?.x, fromY: info.fromY ?? by?.y, x: info.x ?? n.x, y: info.y ?? n.y, z: info.z ?? n.z + BODY_H * 0.6 * (n.big || 1) });
    if (n.kind === 'decoy') { if (n.hp <= 0) this.popNpc(n, by, info); return; }
    this.mobHit?.(n, by, info, dmg);
    if (n.hp <= 0) this.killMob(n, by, info);
  },
  stepDecoys(now, dt) {
    for (const n of [...this.npcs]) {
      if (n.kind !== 'decoy') continue;
      if (now >= n.until || !this.players[n.owner]) { this.popNpc(n); continue; }
      if (!n.walk) continue;
      const nx = n.x + Math.cos(n.a) * 2.6 * dt, ny = n.y + Math.sin(n.a) * 2.6 * dt; // walks the way you faced
      if (hitsWall(this.T, nx, ny, 0.22) || kindAt(this.T, nx, ny) === 2) n.walk = false;
      else { n.x = nx; n.y = ny; n.z = walkHeight(this.T, nx, ny, n.z); }
    }
  },
  stepTotems(now, dt) {
    this.totems = this.totems.filter(t => now < t.until);
    for (const t of this.totems) for (const p of this.list) {
      if (p.dead || Math.hypot(p.x - t.x, p.y - t.y) > TOTEM.radius) continue;
      if (isTeamMode(this.mode) ? p.team !== t.team : p.id !== t.owner) continue;
      p.hp = Math.min(this.maxHp(p), p.hp + TOTEM.hps * dt);
    }
  },
  stepWells(now, dt) {
    this.wells = this.wells.filter(w => now < w.until);
    for (const w of this.wells) {
      const owner = this.players[w.owner];
      for (const o of [...this.list, ...this.npcs]) {
        if (o.dead || o.id === w.owner) continue;
        if (o.npc ? owner && !this.npcHostile(o, owner) : isTeamMode(this.mode) && o.team === w.team) continue;
        const dx = w.x - o.x, dy = w.y - o.y, d = Math.hypot(dx, dy);
        if (d > WELL.radius || d < 0.3) continue;
        o.wellUntil = now + 600;
        if (!o.bot && !o.npc) continue; // people are pulled by their own browser (net.js)
        const step = Math.min(d, WELL.pull * dt), nx = o.x + dx / d * step, ny = o.y + dy / d * step;
        if (!hitsWall(this.T, nx, ny, 0.22)) { o.x = nx; o.y = ny; }
      }
    }
  },

  // --- everything above, once a tick; true if the match ended ---
  stepExtras(now, dt) {
    this.stepTraversal(now);
    this.stepPowerups(now);
    this.stepDecoys(now, dt);
    this.stepTotems(now, dt);
    this.stepWells(now, dt);
    return this.stepEvents(now);
  },
  // the match is over: clear what it conjured
  endExtras() {
    this.npcs = []; this.souls = []; this.totems = []; this.wells = []; this.meteors = [];
    if (this.event) this.broadcast({ type: 'event', kind: null });
    this.event = null;
  },

  // --- emotes ---
  emote(p, emote) {
    const now = Date.now();
    if (!EMOTES.includes(emote) || p.dead || now < (p.emoteReady || 0)) return;
    p.emoteReady = now + 1200;
    this.broadcast({ type: 'emote', id: p.id, emote, ms: EMOTE_MS });
  },
};

export const extraHandlers = {
  emote(p, msg) { this.emote(p, msg.emote); },

  // a custom game setting for the next match (the lobby's Custom panel)
  custom(p, msg) {
    if (this.gameOn) return;
    const value = customValue(msg.key, msg.value);
    if (value === undefined || this.custom[msg.key] === value) return;
    this.custom[msg.key] = value;
    if (msg.key === 'powerups' || msg.key === 'weapons') this.resetPickups();
    this.resetReady();
    log(`[${this.code}] ${this.hub.who(p)} set ${msg.key} to ${value}`);
    this.roster();
  },

  // your attachment (from the lobby); it applies from your next spawn
  att(p, msg) {
    const a = ATTACHMENTS[msg.att];
    if (!a || !Object.hasOwn(ATTACHMENTS, msg.att) || p.att === msg.att) return;
    if (levelFor(p.stats?.xp || 0) < a.level) return this.hub.notice(p, `${a.name} unlocks at level ${a.level}`);
    p.att = msg.att;
    if (!this.gameOn) this.roster();
  },
};
