// Wave Survival (the Crypt, the Drowned Fleet): survivors (people and ally bots, team 1) against endless waves
// of monsters. Monsters are NPCs (room.npcs), not players: they find their way to the nearest
// survivor over a flow field that's rebuilt as people move and doors open, then claw, burst
// or hurl hexes. Gold from hits and kills buys doors, guns off the walls, elixirs and rolls of
// the mystery cauldron. Mixed into Room (server/room.js); `this` is the Room.
import { BODY_H, WEAPONS, AMMO, MAX_SPARE, SURVIVAL, MOBS, MOB_SETS, MOB_R, DROPS, ELIXIR_HP, magSize } from '../shared/config.js';
import { walkHeight, kindAt, hitsWall } from '../shared/terrain.js';
import { cryptLayout, openRegions, closeDoor, openDoor } from '../shared/crypt.js';
import { LEVEL_NAMES } from '../shared/levels.js';
import { log } from './log.js';

const FAR = 0xffff;
// which monster comes next in wave w (by role: a map with its own monsters swaps them in, see MOB_SETS)
function pickKind(w, s) {
  if (s.bossLeft > 0) { s.bossLeft--; return w >= 10 ? 'lord' : 'brute'; }
  if (w % 4 === 0 && w % 5 !== 0 && Math.random() < 0.8) return 'wolf'; // wolf-pack waves
  const pool = [['ghoul', 10], ['mummy', w >= MOBS.mummy.from ? 3 : 0], ['wolf', w >= MOBS.wolf.from ? 2 + w * 0.1 : 0],
    ['slime', w >= MOBS.slime.from ? 2 + w * 0.05 : 0], ['wraith', w >= MOBS.wraith.from ? 2 : 0], ['brute', w >= MOBS.brute.from ? 0.4 + (w - MOBS.brute.from) * 0.15 : 0]];
  let r = Math.random() * pool.reduce((n, [, v]) => n + v, 0);
  for (const [k, v] of pool) if ((r -= v) < 0) return k;
  return 'ghoul';
}

export const survivalMethods = {
  startSurvival(now) {
    const layout = cryptLayout(this.map);
    this.freshTerrain();
    const doorPrev = new Map();
    for (const d of layout.doors) doorPrev.set(d.id, closeDoor(this.T, d));
    const cellDoor = new Int16Array(layout.W * layout.H).fill(-1);
    for (const d of layout.doors) for (const [x, y] of d.cells) cellDoor[y * layout.W + x] = d.id;
    this.survival = {
      layout, doorPrev, cellDoor, wave: 0, phase: 'break', nextAt: now + SURVIVAL.firstWaveMs, toSpawn: 0, nextSpawnAt: 0, bossLeft: 0,
      opened: new Set(), open: openRegions(layout, new Set()), pass: null, field: null, fieldAt: 0,
      doubleUntil: 0, instaUntil: 0, drops: [], dropId: 0,
    };
    this.buildPass();
    log(`[${this.code}] Survival: ${layout.doors.length} doors, ${layout.spawners.length} spawners`);
  },
  survivalSpawn() {
    const starts = cryptLayout(this.map).starts;
    if (!starts.length) return this.spawnPos([]);
    const s = starts[Math.floor(Math.random() * starts.length)];
    return { x: s.x + (Math.random() - 0.5) * 0.4, y: s.y + (Math.random() - 0.5) * 0.4 };
  },
  // for the start message and people joining: which doors are shut and where the wave is
  survivalSnapshot(now = Date.now()) {
    const s = this.survival;
    if (!s) return null;
    return { opened: [...s.opened], wave: s.wave, phase: s.phase, ms: Math.max(0, s.nextAt - now) };
  },
  // every tick, in the state message
  survivalState(now) {
    const s = this.survival;
    return { w: s.wave, ph: s.phase, ms: s.phase === 'break' ? Math.max(0, s.nextAt - now) : 0,
      left: s.toSpawn + this.npcs.filter(n => n.kind !== 'decoy').length,
      ...(s.doubleUntil > now ? { db: s.doubleUntil - now } : {}), ...(s.instaUntil > now ? { ik: s.instaUntil - now } : {}),
      drops: s.drops.map(d => ({ id: d.id, k: d.kind, x: d.x, y: d.y, z: d.z })) };
  },

  // which map cells monsters can walk through (walls, pits, the sea, gravestones, crates, rails, masts and shut doors can't)
  buildPass() {
    const s = this.survival, { W, H } = s.layout;
    s.pass = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = this.map[y][x], door = s.cellDoor[y * W + x];
      s.pass[y * W + x] = !'#L+RI'.includes(c) && (door < 0 || s.opened.has(door)) ? 1 : 0;
    }
    s.fieldAt = 0;
  },
  // steps to the nearest survivor from every cell (breadth-first from all of them at once)
  buildField() {
    const s = this.survival, { W, H } = s.layout, dist = s.field ||= new Uint16Array(W * H);
    dist.fill(FAR);
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    for (const p of this.list) {
      if (p.dead) continue;
      const k = Math.floor(p.y) * W + Math.floor(p.x);
      if (k >= 0 && k < W * H && dist[k] !== 0) { dist[k] = 0; q[tail++] = k; }
    }
    while (head < tail) {
      const k = q[head++], x = k % W, y = (k - x) / W, d = dist[k] + 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!s.pass[n] || dist[n] <= d) continue;
        dist[n] = d; q[tail++] = n;
      }
    }
  },

  startWave(now) {
    const s = this.survival;
    s.wave++;
    s.phase = 'wave';
    s.toSpawn = SURVIVAL.count(s.wave);
    s.bossLeft = s.wave % 5 === 0 ? (s.wave >= 10 ? Math.floor(s.wave / 10) : 2) : 0;
    s.nextSpawnAt = now + 800;
    const label = s.wave % 5 === 0 ? 'BOSS WAVE' : s.wave % 4 === 0 ? 'WOLF PACK' : s.wave >= 15 ? 'FRENZY' : null;
    this.broadcast({ type: 'wave', wave: s.wave, phase: 'wave', label });
    log(`[${this.code}] Wave ${s.wave}: ${s.toSpawn} monsters`);
  },
  waveCleared(now) {
    const s = this.survival;
    s.phase = 'break';
    s.nextAt = now + SURVIVAL.breakMs;
    for (const p of this.list) {
      if (p.dead) { const gold = p.gold; this.resetPlayer(p); p.gold = gold; continue; } // the fallen come back
      this.earn(p, SURVIVAL.waveGold);
      if (p.bot) { for (const w in p.mag) { p.mag[w] = magSize(w, p.att); p.inv[w] = MAX_SPARE(w); } } // allies restock
    }
    for (const p of this.humans) this.hub.record(p, { xp: 5 });
    this.broadcast({ type: 'wave', wave: s.wave, phase: 'break', ms: SURVIVAL.breakMs });
  },
  earn(p, gold) {
    if (!p || !this.survival) return;
    const g = Math.round(gold * (this.survival.doubleUntil > Date.now() ? 2 : 1));
    p.gold = (p.gold || 0) + g;
    p.goldEarned = (p.goldEarned || 0) + g;
  },

  // a monster rises from an open spawner, ideally not right on top of anyone
  spawnMob(kind, now) {
    const s = this.survival, def = MOBS[kind], alive = this.list.filter(p => !p.dead);
    const open = s.layout.spawners.filter(sp => s.open.has(sp.region));
    if (!open.length) return false;
    const near = sp => Math.min(...alive.map(p => Math.hypot(p.x - sp.x, p.y - sp.y)));
    const good = open.filter(sp => { const d = near(sp); return d > 5 && d < 34; });
    const sp = (good.length ? good : open)[Math.floor(Math.random() * (good.length || open.length))];
    const x = sp.x + (Math.random() - 0.5) * 0.5, y = sp.y + (Math.random() - 0.5) * 0.5;
    const hp = Math.round(def.hp * SURVIVAL.hpScale(s.wave));
    const m = { id: 'm' + (++this.npcId), npc: true, kind, x, y, z: walkHeight(this.T, x, y, 0), a: 0, hp, maxHp: hp,
      speed: def.speed * SURVIVAL.speedScale(s.wave) * (0.9 + Math.random() * 0.2), dmg: Math.round(def.dmg * (1 + s.wave * 0.02)),
      big: def.big || 0, nextAtk: now + 900, bestD: Infinity, progressAt: now };
    this.npcs.push(m);
    this.broadcast({ type: 'npcSpawn', id: m.id, kind, x, y, z: m.z });
    return true;
  },

  // one tick of the whole mode; true if it ended the match
  stepSurvival(now, dt) {
    const s = this.survival;
    if (!s || !this.gameOn || this.mode !== 'survival') return false;
    if (s.phase === 'break' && now >= s.nextAt) this.startWave(now);
    const mobs = this.npcs.filter(n => n.kind !== 'decoy' && !n.dead);
    if (s.phase === 'wave') {
      if (s.toSpawn > 0 && now >= s.nextSpawnAt && mobs.length < SURVIVAL.maxAlive(s.wave)) {
        const role = pickKind(s.wave, s);
        if (this.spawnMob(MOB_SETS[this.level]?.[role] || role, now)) s.toSpawn--;
        s.nextSpawnAt = now + Math.max(180, 900 - s.wave * 40);
      }
      if (s.toSpawn <= 0 && !mobs.length) this.waveCleared(now);
    }
    if (now - s.fieldAt > 400) { this.buildField(); s.fieldAt = now; }
    for (const m of mobs) { this.stepMob(m, now, dt); if (!this.gameOn) return true; }
    this.separateMobs(mobs);
    // drops: walk over them
    s.drops = s.drops.filter(d => now < d.until);
    for (const d of [...s.drops]) {
      const p = this.list.find(o => !o.dead && Math.hypot(o.x - d.x, o.y - d.y) < 0.9);
      if (p) this.takeDrop(p, d, now);
    }
    return !this.gameOn;
  },

  stepMob(m, now, dt) {
    const s = this.survival, { W, H } = s.layout, T = this.T;
    const alive = this.list.filter(p => !p.dead);
    if (!alive.length) return;
    // decoys fool monsters too
    const lures = [...alive, ...this.npcs.filter(n => n.kind === 'decoy' && !n.dead)];
    let t = lures[0], td = Infinity;
    for (const o of lures) { const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < td) { t = o; td = d; } }
    const def = MOBS[m.kind], reach = 0.85 + m.big * 0.3, frozen = m.frozenUntil > now;
    if (now - (m.losAt || 0) > 150) { m.los = td < 12 && this.clearLine(m.x, m.y, t.x, t.y); m.losAt = now; }
    // attack
    if (!frozen && now >= m.nextAtk) {
      if (def.ranged && m.los && td <= def.ranged && td > reach) return this.mobHex(m, t, now);
      if (td <= reach && Math.abs(t.z - m.z) < 1.2) return this.mobStrike(m, t, now);
    }
    if (frozen) return;
    // where to: straight at them when in sight, else down the flow field
    let gx = t.x, gy = t.y;
    if (!m.los || td > 7) {
      const cx = Math.floor(m.x), cy = Math.floor(m.y), here = cy * W + cx, f = s.field;
      let best = f[here] ?? FAR, bx = null, by = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (dx && dy && (!s.pass[cy * W + nx] || !s.pass[ny * W + cx])) continue; // no cutting corners
        const d = f[ny * W + nx];
        if (d < best) { best = d; bx = nx + 0.5; by = ny + 0.5; }
      }
      if (bx !== null) { gx = bx; gy = by; }
    }
    // wraiths keep their distance
    if (def.ranged && m.los && td < def.ranged - 3) { gx = m.x - (t.x - m.x); gy = m.y - (t.y - m.y); }
    if (td <= reach * 0.9) return;
    const dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    m.a = Math.atan2(t.y - m.y, t.x - m.x);
    const step = Math.min(d, m.speed * dt), nx = m.x + dx / d * step, ny = m.y + dy / d * step;
    const ok = (x, y) => !hitsWall(T, x, y, MOB_R) && kindAt(T, x, y) !== 2;
    if (ok(nx, ny)) { m.x = nx; m.y = ny; }
    else if (ok(nx, m.y)) m.x = nx;
    else if (ok(m.x, ny)) m.y = ny;
    m.z = walkHeight(T, m.x, m.y, m.z);
    // stuck somewhere it can't get out of: rise again from a spawner
    if (td < m.bestD - 0.5) { m.bestD = td; m.progressAt = now; }
    else if (now - m.progressAt > 15000 && !m.los) {
      const sp = s.layout.spawners.filter(o => s.open.has(o.region));
      const o = sp[Math.floor(Math.random() * sp.length)];
      if (o) Object.assign(m, { x: o.x, y: o.y, z: walkHeight(T, o.x, o.y, 0), bestD: Infinity, progressAt: now });
    }
  },
  // monsters don't stack up in one spot
  separateMobs(mobs) {
    for (let i = 0; i < mobs.length; i++) for (let j = i + 1; j < mobs.length; j++) {
      const a = mobs[i], b = mobs[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = MOB_R * 2 * Math.max(1, (a.big + b.big) / 2 || 1);
      if (d >= min || d < 1e-4) continue;
      const push = (min - d) / 2, ux = dx / d * push, uy = dy / d * push;
      if (!hitsWall(this.T, a.x - ux, a.y - uy, MOB_R)) { a.x -= ux; a.y -= uy; }
      if (!hitsWall(this.T, b.x + ux, b.y + uy, MOB_R)) { b.x += ux; b.y += uy; }
    }
  },
  // claws, or a slime bursting
  mobStrike(m, t, now) {
    const def = MOBS[m.kind];
    m.nextAtk = now + (def.cd || 1000); m.atkT = now;
    if (def.blast) {
      this.broadcast({ type: 'nadeBoom', x: m.x, y: m.y, z: m.z + 0.4, id: 'slime' });
      this.popNpc(m);
      for (const p of this.list) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (!p.dead && d <= def.blast) this.hurtBy(m, p, Math.round(m.dmg * (1 - d / def.blast * 0.5)), now);
        if (!this.gameOn) return;
      }
      return;
    }
    if (t.npc) { this.hitNpc(t, m.dmg, null, { weapon: 'claws' }); return; } // tore up a decoy
    this.hurtBy(m, t, m.dmg, now);
  },
  // a wraith's hex: mostly finds its mark
  mobHex(m, t, now) {
    const def = MOBS[m.kind];
    m.nextAtk = now + def.cd * (0.8 + Math.random() * 0.4); m.atkT = now;
    const hit = Math.random() < 0.6;
    this.broadcast({ type: 'hex', x0: m.x, y0: m.y, z0: m.z + 0.7, x1: t.x + (hit ? 0 : (Math.random() - 0.5) * 2), y1: t.y + (hit ? 0 : (Math.random() - 0.5) * 2), z1: t.z + BODY_H * 0.6, hit });
    if (!hit) return;
    if (t.npc) this.hitNpc(t, m.dmg, null, { weapon: 'hex' });
    else this.hurtBy(m, t, m.dmg, now);
  },
  hurtBy(m, p, dmg, now) {
    if (p.hacks || p.dead) return;
    dmg = this.hurt(p, dmg, now);
    p.hp -= dmg;
    this.broadcast({ type: 'hit', who: p.id, by: m.id, dmg, head: false, weapon: 'claws', fromX: m.x, fromY: m.y, x: p.x, y: p.y, z: p.z + BODY_H * 0.6 });
    if (p.hp <= 0) this.killPlayer(p, null, { weapon: m.kind, mob: MOBS[m.kind].name, head: false, a: Math.atan2(p.y - m.y, p.x - m.x) });
  },

  // gold for hurting monsters, and more for finishing them
  mobHit(m, by, info, dmg) {
    if (by && !by.npc) this.earn(by, SURVIVAL.hitGold);
  },
  killMob(m, by, info = {}) {
    if (m.dead) return;
    this.popNpc(m, by, info);
    const s = this.survival;
    if (by && !by.npc) {
      by.kills++;
      this.earn(by, SURVIVAL.killGold + (info.head ? SURVIVAL.headGold : 0) + (WEAPONS[info.weapon]?.melee ? SURVIVAL.meleeGold : 0));
      this.hub.record(by, { xp: 2 });
      this.hub.progress?.(by, { type: 'kill', weapon: info.weapon, head: !!info.head, backstab: !!info.backstab, streak: 0, mob: true, boss: !!MOBS[m.kind].heavy, kind: m.kind });
    }
    if (s && Math.random() < SURVIVAL.dropChance * (MOBS[m.kind].boss ? 10 : 1) && kindAt(this.T, m.x, m.y) !== 2) {
      const kinds = Object.keys(DROPS);
      s.drops.push({ id: ++s.dropId, kind: kinds[Math.floor(Math.random() * kinds.length)], x: m.x, y: m.y, z: walkHeight(this.T, m.x, m.y, m.z), until: Date.now() + SURVIVAL.dropLife });
    }
  },
  takeDrop(p, d, now) {
    const s = this.survival;
    s.drops = s.drops.filter(o => o !== d);
    if (d.kind === 'maxammo') for (const o of this.list) {
      if (o.dead) continue;
      for (const w in o.mag) { o.mag[w] = magSize(w, o.att); o.inv[w] = MAX_SPARE(w); }
      this.syncAmmo(o);
    }
    else if (d.kind === 'double') s.doubleUntil = now + DROPS.double.ms;
    else if (d.kind === 'insta') s.instaUntil = now + DROPS.insta.ms;
    else if (d.kind === 'nuke') {
      for (const m of this.npcs.filter(n => n.kind !== 'decoy')) this.killMob(m, null);
      this.earn(p, 400);
    }
    this.broadcast({ type: 'drop', kind: d.kind, by: p.id, x: d.x, y: d.y, z: d.z });
  },

  // everyone down: the crypt wins. Ten waves or more counts as a win for the survivors
  checkSurvivalOver() {
    if (!this.gameOn || this.mode !== 'survival' || !this.survival) return false;
    if (this.list.some(p => !p.dead)) return false;
    const wave = this.survival.wave;
    for (const p of this.humans) this.hub.record(p, { xp: Math.min(400, wave * 10) });
    this.finish(wave >= 10 ? this.humans : [], { mode: 'survival', wave, survived: wave - 1 }, `${LEVEL_NAMES[this.level]} (survivors reached wave ${wave})`);
    return true;
  },

  // the use key in a survival map: { door } / { buy } / { elixir } / { cauldron } by index
  survivalUse(p, msg) {
    const s = this.survival;
    if (!s || p.bot) return;
    const L = s.layout, near = (o, r) => Math.hypot(p.x - o.x, p.y - o.y) <= r;
    const pay = cost => {
      if ((p.gold || 0) < cost) { this.hub.notice(p, `Not enough gold — that costs ${cost}`); return false; }
      p.gold -= cost;
      return true;
    };
    if (Number.isInteger(msg.door)) {
      const d = L.doors[msg.door];
      if (!d || s.opened.has(d.id)) return;
      const dx = Math.max(d.x0 - p.x, 0, p.x - d.x1), dy = Math.max(d.y0 - p.y, 0, p.y - d.y1);
      if (Math.hypot(dx, dy) > 1.6 || !pay(d.cost)) return;
      openDoor(this.T, s.doorPrev.get(d.id));
      s.opened.add(d.id);
      s.open = openRegions(L, s.opened);
      this.buildPass();
      this.broadcast({ type: 'door', id: d.id, by: p.id });
      log(`[${this.code}] ${this.hub.name(p)} opened the ${d.name} door`);
    } else if (Number.isInteger(msg.buy)) {
      const b = L.buys[msg.buy];
      if (!b || !near(b, 1.5)) return;
      if (p.mag[b.w] !== undefined) {
        if ((p.inv[b.w] || 0) >= MAX_SPARE(b.w) && p.mag[b.w] >= magSize(b.w, p.att)) return this.hub.notice(p, 'Already full');
        if (!pay(Math.ceil(b.cost * SURVIVAL.refillShare))) return;
        p.mag[b.w] = magSize(b.w, p.att); p.inv[b.w] = MAX_SPARE(b.w);
      } else {
        if ((p.gold || 0) < b.cost) return pay(b.cost);
        if (!this.takeGun(p, b.w, magSize(b.w, p.att), AMMO[b.w] * 2, msg.drop)) return;
        p.gold -= b.cost;
      }
      this.broadcast({ type: 'pickup', id: p.id, weapon: b.w, x: b.x, y: b.y, z: 1 });
    } else if (Number.isInteger(msg.elixir)) {
      const e = L.elixirs[msg.elixir];
      if (!e || !near(e, 1.5) || p.elixirs?.[e.elixir]) return;
      if (!pay(e.cost)) return;
      p.elixirs = { ...p.elixirs, [e.elixir]: true };
      if (e.elixir === 'troll') p.hp += ELIXIR_HP;
      this.broadcast({ type: 'elixir', id: p.id, elixir: e.elixir, name: e.name, x: e.x, y: e.y });
    } else if (Number.isInteger(msg.cauldron)) {
      const c = L.boxes[msg.cauldron];
      if (!c || !near(c, 1.6)) return;
      const guns = SURVIVAL.boxGuns.filter(w => p.mag[w] === undefined);
      if (!guns.length || (p.gold || 0) < SURVIVAL.boxCost) return pay(SURVIVAL.boxCost);
      const w = guns[Math.floor(Math.random() * guns.length)];
      if (!this.takeGun(p, w, magSize(w, p.att), AMMO[w] * 2, msg.drop)) return;
      p.gold -= SURVIVAL.boxCost;
      this.broadcast({ type: 'boxRoll', id: p.id, weapon: w, x: c.x, y: c.y });
      this.broadcast({ type: 'pickup', id: p.id, weapon: w, x: c.x, y: c.y, z: 0.6 });
    } else return;
    this.syncAmmo(p);
  },
};

export const survivalHandlers = {};
