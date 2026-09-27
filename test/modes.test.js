import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { MAX_HP, MAX_PLAYERS, ROYALE_MAX_PLAYERS, RESPAWN_MS, GUN_GAME_LADDER, WEAPONS } from '../shared/config.js';

function game(count = 4, mode = 'ffa') {
  const messages = [];
  const hub = {
    nextId: count, name: p => p.name || `Bot ${p.id}`, who: p => p.name || `Bot ${p.id}`,
    send(p, msg) { messages.push({ to: p.id, msg: structuredClone(msg) }); },
    sendRaw(p, raw) { messages.push({ to: p.id, msg: JSON.parse(raw) }); },
    record() {}, afterMatch() {}, closeRoom() {}, notice() {},
  };
  const room = new Room(hub, 'TEST', true);
  for (let id = 0; id < count; id++) room.add({ id, name: `Player ${id}`, skin: 'witch' });
  room.handlers.mode.call(room, room.list[0], { mode });
  room.startGame();
  return { room, hub, events: (type, id = 0) => messages.filter(m => m.to === id && m.msg.type === type).map(m => m.msg) };
}
const kill = (room, victim, killer, weapon = 'rifle') => room.killPlayer(victim, killer, { weapon });

test('a killed player spectates, cannot be hit or act, then respawns after the delay', () => {
  const { room, events } = game();
  const [a, b] = room.list, seq = b.seq;
  kill(room, b, a);
  assert.equal(b.dead, true);
  assert.equal(b.seq, seq); // still where they fell
  assert.ok(!room.enemies(a).includes(b));
  assert.equal(events('kill').at(-1).respawnMs, RESPAWN_MS);
  const x = b.x;
  room.handlers.input.call(room, b, { seq: b.seq, x: x + 1, y: b.y, z: b.z, a: 0, p: 0 });
  assert.equal(b.x, x);
  kill(room, b, a); // already down: no double kill
  assert.equal(a.kills, 1);
  room.tick();
  assert.equal(b.dead, true);
  b.respawnAt = Date.now() - 1;
  room.tick();
  assert.equal(b.dead, false);
  assert.equal(b.hp, MAX_HP);
  assert.equal(b.seq, seq + 1);
  assert.equal(events('state').at(-1).players.find(p => p.id === b.id).dead, undefined);
});

test('kill streaks, multi-kills and shutdowns are reported with the kill', () => {
  const { room, events } = game(5);
  const [a, b, c, d, e] = room.list;
  kill(room, b, a);
  kill(room, c, a);
  kill(room, d, a);
  let k = events('kill').at(-1);
  assert.equal(k.streak, 3);
  assert.equal(k.multi, 3);
  a.lastKillAt = Date.now() - 10000; // a long pause: the streak lives on, the multi-kill resets
  b.respawnAt = 0; room.tick();
  kill(room, b, a);
  k = events('kill').at(-1);
  assert.equal(k.streak, 4);
  assert.equal(k.multi, 1);
  kill(room, a, e);
  k = events('kill').at(-1);
  assert.equal(k.ended, 4);
  assert.equal(a.streak, 0);
  assert.equal(e.streak, 1);
});

test('gun game climbs the ladder, stabs knock you back, and the blade kill wins', () => {
  const { room, events } = game(3, 'gungame');
  const [a, b, c] = room.list;
  assert.deepEqual(Object.keys(a.mag), [GUN_GAME_LADDER[0]]);
  assert.ok(room.pickups.every(pu => !pu.gun && !pu.nade));
  kill(room, b, a, GUN_GAME_LADDER[0]);
  assert.equal(a.gunLevel, 1);
  assert.deepEqual(Object.keys(a.mag), [GUN_GAME_LADDER[1]]);
  assert.equal(a.mag[GUN_GAME_LADDER[1]], WEAPONS[GUN_GAME_LADDER[1]].mag);
  assert.equal(events('kill').at(-1).gunLevel, 1);
  // a stab doesn't climb, it drops the victim a gun
  room.tick(); c.gunLevel = 2;
  kill(room, c, a, 'blade');
  assert.equal(a.gunLevel, 1);
  assert.equal(c.gunLevel, 1);
  assert.equal(events('kill').at(-1).demoted, 1);
  // last rung: the blade; a kill with it ends the match
  a.gunLevel = GUN_GAME_LADDER.length - 1;
  room.gunGameLoadout(a);
  assert.deepEqual(a.mag, {});
  b.dead = false;
  kill(room, b, a, 'blade');
  assert.equal(room.gameOn, false);
  assert.equal(events('win').at(-1).winner, a.id);
});

test('battle royale has no respawns and the last one standing wins', () => {
  const { room, events } = game(3, 'royale');
  const [a, b, c] = room.list;
  assert.ok(room.zoneAt());
  kill(room, b, a);
  assert.equal(events('kill').at(-1).respawnMs, null);
  assert.equal(b.respawnAt, Infinity); // no respawn, however long you wait
  room.tick();
  assert.equal(b.dead, true);
  assert.equal(room.gameOn, true);
  kill(room, c, a);
  assert.equal(room.gameOn, false);
  assert.equal(events('win').at(-1).winner, a.id);
});

test('the royale storm hurts only players outside it, and late arrivals spectate', () => {
  const { room, hub } = game(3, 'royale');
  const [a, b] = room.list;
  const z = room.zoneAt();
  Object.assign(a, { x: z.x, y: z.y, hp: MAX_HP });
  room.zone.stages[0].from.r = 0.5; // shrink the storm right onto a
  b.x = z.x + 5;
  const hp = b.hp;
  room.stepZone(Date.now(), 1);
  assert.equal(a.hp, MAX_HP);
  assert.ok(b.hp < hp);
  room.add({ id: hub.nextId++, name: 'Late', skin: 'witch' });
  assert.equal(room.list.at(-1).dead, true);
});

test('battle royale tops a bot room up to its bigger size, and other modes shrink it back', () => {
  const { room } = game(1, 'ffa'); // one person can't start a match yet
  room.fillBots('easy');
  assert.equal(room.list.length, MAX_PLAYERS);
  room.handlers.mode.call(room, room.list[0], { mode: 'royale' });
  room.startGame();
  assert.equal(room.list.length, ROYALE_MAX_PLAYERS);
  assert.equal(room.humans.length, 1);
  room.finish([room.list[0]], {}, 'test');
  room.handlers.mode.call(room, room.list[0], { mode: 'ffa' });
  assert.equal(room.list.length, MAX_PLAYERS);
});
