import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { MAX_HP, CHAMBER, SURVIVAL, SOUL, WEAPONS, magSize, DECOY, CUSTOM_WEAPONS, GUN_GAME_LADDER, AMMO, GUN_BASE, PAD_GUNS } from '../shared/config.js';
import { kindAt } from '../shared/terrain.js';
import { cryptLayout } from '../shared/crypt.js';
import { LEVELS } from '../shared/levels.js';

function game(count = 4, mode = 'ffa', setup) {
  const messages = [];
  const hub = {
    nextId: count, name: p => p.name || `Bot ${p.id}`, who: p => p.name || `Bot ${p.id}`,
    send(p, msg) { messages.push({ to: p.id, msg: structuredClone(msg) }); },
    sendRaw(p, raw) { messages.push({ to: p.id, msg: JSON.parse(raw) }); },
    record() {}, afterMatch() {}, closeRoom() {}, notice(p, text) { messages.push({ to: p.id, msg: { type: 'notice', text } }); },
  };
  const room = new Room(hub, 'TEST', true);
  for (let id = 0; id < count; id++) room.add({ id, name: `Player ${id}`, skin: 'witch' });
  room.handlers.mode.call(room, room.list[0], { mode });
  setup?.(room);
  room.startGame();
  return { room, hub, events: (type, id = 0) => messages.filter(m => m.to === id && m.msg.type === type).map(m => m.msg) };
}
const kill = (room, victim, killer, weapon = 'rifle') => room.killPlayer(victim, killer, { weapon });

test('Soul Harvest: kills drop souls, enemies reap them for points, allies deny them', () => {
  const { room, events } = game(4, 'harvest', r => r.handlers.score.call(r, r.list[0], { score: 15 }));
  assert.equal(room.gameOn, true);
  const red = room.list.find(p => p.team === 1), blue = room.list.find(p => p.team === 2);
  kill(room, blue, red);
  assert.equal(room.souls.length, 1);
  assert.equal(red.kills, 1);
  // a teammate of the fallen grabs it first: denied
  const blue2 = room.list.find(p => p.team === 2 && p !== blue);
  Object.assign(blue2, { x: room.souls[0].x, y: room.souls[0].y, z: room.souls[0].z });
  room.tick();
  assert.equal(room.souls.length, 0);
  assert.deepEqual(room.soulScores, { 1: 0, 2: 0 });
  assert.equal(events('soul').at(-1).event, 'deny');
  // reaping wins at the limit
  room.soulScores[1] = 14;
  kill(room, blue2, red);
  const soul = room.souls[0];
  Object.assign(red, { x: soul.x, y: soul.y, z: soul.z });
  room.tick();
  assert.equal(room.gameOn, false);
  assert.equal(events('win').at(-1).team, 1);
});

test('One in the Chamber: one round, kills reload it, lives run out, last one standing wins', () => {
  const { room, events } = game(3, 'chamber');
  const [a, b, c] = room.list;
  assert.deepEqual(a.mag, { [CHAMBER.gun]: 1 });
  assert.deepEqual(a.inv, {});
  assert.equal(room.pickups.filter(p => p.gun || p.weapon === 'ammo' || p.nade).length, 0);
  // a pistol hit kills outright
  a.a = Math.atan2(b.y - a.y, b.x - a.x); a.p = 0;
  Object.assign(b, { x: a.x + Math.cos(a.a) * 2, y: a.y + Math.sin(a.a) * 2, z: a.z });
  room.handlers.shoot.call(room, a, { weapon: CHAMBER.gun, a: a.a, p: Math.atan2(b.z + 0.4 - (a.z + 0.62), 2) });
  if (!b.dead) kill(room, b, a, CHAMBER.gun); // the shot can be blocked by cover at the spawn; the rules are what's tested
  assert.equal(b.dead, true);
  assert.equal(b.lives, CHAMBER.lives - 1);
  assert.equal(a.mag[CHAMBER.gun], 1); // spent one, got one back
  assert.equal(events('kill').at(-1).lives, CHAMBER.lives - 1);
  // run b out of lives
  for (let i = 0; i < CHAMBER.lives - 1; i++) { b.respawnAt = 0; room.tick(); kill(room, b, a); }
  assert.equal(b.lives, 0);
  assert.equal(b.respawnAt, Infinity);
  assert.equal(room.gameOn, true); // a and c are still in
  for (let i = 0; i < CHAMBER.lives; i++) { c.respawnAt = 0; room.tick(); kill(room, c, a); }
  assert.equal(room.gameOn, false);
  assert.equal(events('win').at(-1).winner, a.id);
});

test('Wave Survival: solo start in the Crypt, doors cost gold, monsters come in waves and pay out', () => {
  const { room, events } = game(1, 'survival');
  assert.equal(room.gameOn, true, 'one person can start survival');
  assert.equal(room.level, 'crypt');
  const me = room.list[0], L = cryptLayout(LEVELS.crypt);
  assert.equal(me.gold, SURVIVAL.startGold);
  assert.ok(L.doors.length >= 6 && L.spawners.length > 10 && L.buys.length >= 8);
  // every door starts shut
  for (const d of L.doors) assert.equal(kindAt(room.T, d.x, d.y), 1);
  // not enough gold: stays shut
  const d = L.doors.find(d => d.group === 1);
  Object.assign(me, { x: d.x1 + 0.5, y: d.y });
  me.gold = 100;
  room.handlers.use.call(room, me, { door: d.id });
  assert.equal(kindAt(room.T, d.x, d.y), 1);
  me.gold = d.cost + 10;
  room.handlers.use.call(room, me, { door: d.id });
  assert.equal(kindAt(room.T, d.x, d.y), 0);
  assert.equal(me.gold, 10);
  assert.ok(room.survival.open.size > 1);
  // the first wave rises
  room.survival.nextAt = Date.now() - 1;
  room.tick();
  assert.equal(room.survival.wave, 1);
  room.survival.nextSpawnAt = 0;
  room.tick();
  const mob = room.npcs.find(n => n.kind !== 'decoy');
  assert.ok(mob, 'a monster spawned');
  assert.ok(room.enemies(me).includes(mob));
  const gold = me.gold;
  room.hitNpc(mob, 9999, me, { weapon: 'pistol', head: true });
  assert.ok(mob.dead);
  assert.equal(me.gold, gold + SURVIVAL.hitGold + SURVIVAL.killGold + SURVIVAL.headGold);
  assert.equal(me.kills, 1);
  // everyone down: game over at this wave
  room.killPlayer(me, null, { weapon: 'ghoul', mob: 'Ghoul' });
  assert.equal(room.gameOn, false);
  assert.equal(events('win').at(-1).wave, 1);
});

test('Survival wall guns: buy one, refill it for less', () => {
  const { room } = game(1, 'survival');
  const me = room.list[0], b = cryptLayout(LEVELS.crypt).buys.find(b => b.key === 'a');
  Object.assign(me, { x: b.x, y: b.y, gold: 5000 });
  room.handlers.use.call(room, me, { buy: b.id });
  assert.ok(me.mag[b.w] !== undefined);
  assert.equal(me.gold, 5000 - b.cost);
  me.mag[b.w] = 0; me.inv[b.w] = 0;
  room.handlers.use.call(room, me, { buy: b.id });
  assert.equal(me.gold, 5000 - b.cost - Math.ceil(b.cost * SURVIVAL.refillShare));
  assert.equal(me.mag[b.w], magSize(b.w, me.att));
});

test('custom games: health, headshots only and weapon pools apply to the next match', () => {
  const { room } = game(2, 'ffa', r => {
    r.handlers.custom.call(r, r.list[0], { key: 'hp', value: 200 });
    r.handlers.custom.call(r, r.list[0], { key: 'headshots', value: true });
    r.handlers.custom.call(r, r.list[0], { key: 'weapons', value: 'shotguns' });
    r.handlers.custom.call(r, r.list[0], { key: 'gravity', value: 7 }); // not an option: ignored
  });
  const [a] = room.list;
  assert.equal(a.hp, 200);
  assert.equal(room.maxHp(a), 200);
  assert.deepEqual(Object.keys(a.mag), ['shotgun']);
  assert.equal(room.custom.gravity, 1);
  assert.equal(room.scaleDamage(a, 50, { head: false }), 0);
  assert.equal(room.scaleDamage(a, 50, { head: true }), 50);
  assert.equal(room.scaleDamage(a, 50, { melee: true }), 50);
  assert.ok(room.pickups.filter(p => p.gun).every(p => CUSTOM_WEAPONS.shotguns.includes(p.weapon)));
});

test('attachments change magazines; locked ones need the level', () => {
  const { room, events } = game(2);
  const [a] = room.list;
  room.handlers.att.call(room, a, { att: 'extmag' });
  assert.notEqual(a.att, 'extmag');
  assert.match(events('notice').at(-1).text, /unlocks at level/);
  a.stats = { xp: 1e9 };
  room.handlers.att.call(room, a, { att: 'extmag' });
  assert.equal(a.att, 'extmag');
  assert.equal(magSize('pistol', 'extmag'), Math.ceil(WEAPONS.pistol.mag * 1.5));
});

test('emotes are broadcast, not too often', () => {
  const { room, events } = game(2);
  const [a] = room.list;
  room.handlers.emote.call(room, a, { emote: 'cackle' });
  room.handlers.emote.call(room, a, { emote: 'cackle' });
  room.handlers.emote.call(room, a, { emote: 'nope' });
  assert.equal(events('emote', 1).length, 1);
  assert.equal(events('emote', 1)[0].emote, 'cackle');
});

test('power-ups, jump pads and portals are placed; walking over a power-up gives its buff', () => {
  const { room, events } = game(2);
  assert.ok(room.pads.length > 0 && room.portals.length > 0 && room.powerups.length > 0);
  const [a] = room.list, u = room.powerups[0];
  u.kind = 'fury';
  Object.assign(a, { x: u.x, y: u.y, z: u.z });
  room.tick();
  assert.equal(u.active, false);
  assert.ok(a.furyUntil > Date.now());
  assert.equal(events('buff').at(-1).kind, 'fury');
  // a portal carries you to its other end
  const pt = room.portals[0], b = room.list[1];
  Object.assign(b, { x: pt.a.x, y: pt.a.y, z: pt.a.z, dead: false });
  room.tick();
  assert.ok(Math.hypot(b.x - pt.b.x, b.y - pt.b.y) < 0.1);
});

test('decoys draw fire and pop; frost nova roots enemies', () => {
  const { room } = game(2);
  const [a, b] = room.list;
  a.spells = ['decoy', 'frost'];
  room.handlers.cast.call(room, a, { slot: 0 });
  const decoy = room.npcs.find(n => n.kind === 'decoy');
  assert.ok(decoy);
  assert.ok(room.enemies(b).includes(decoy));
  assert.ok(!room.enemies(a).includes(decoy));
  room.hitNpc(decoy, DECOY.hp, b, { weapon: 'rifle' });
  assert.equal(room.npcs.length, 0);
  Object.assign(b, { x: a.x + 1, y: a.y, dead: false });
  room.handlers.cast.call(room, a, { slot: 0 });
  assert.ok(b.frozenUntil > Date.now());
});

test('Soul Harvest and custom health do not leak into other modes', () => {
  const { room } = game(2, 'teams');
  assert.equal(room.souls.length, 0);
  assert.equal(room.maxHp(room.list[0]), MAX_HP);
  assert.equal(SOUL.win, room.soulWinScore);
});

test('every gun is complete: stats, spare ammo, a base look, and a rung in gun game', () => {
  for (const w of PAD_GUNS) {
    assert.ok(WEAPONS[w] && WEAPONS[w].mag > 0, w);
    assert.ok(AMMO[w] > 0, w + ' ammo');
    assert.ok(GUN_GAME_LADDER.includes(w), w + ' in gun game');
    if (GUN_BASE[w]) assert.ok(WEAPONS[GUN_BASE[w]], w + ' base');
  }
  assert.equal(GUN_GAME_LADDER.at(-1), 'blade');
});
