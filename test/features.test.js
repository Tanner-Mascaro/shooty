import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { WAND_CHAIN, CURSE, CTF, WEAPONS } from '../shared/config.js';
import { currentChallenges, countEvent, dailyIds, weeklyIds, challengeById } from '../shared/challenges.js';
import { levelFor, titleOk, effectOk } from '../shared/progression.js';

function game(count = 4, mode = 'ffa') {
  const messages = [], progress = [];
  const hub = {
    nextId: count, name: p => p.name || `Bot ${p.id}`, who: p => p.name || `Bot ${p.id}`,
    send(p, msg) { messages.push({ to: p.id, msg: structuredClone(msg) }); },
    sendRaw(p, raw) { messages.push({ to: p.id, msg: JSON.parse(raw) }); },
    record() {}, afterMatch() {}, closeRoom() {}, notice() {},
    progress(p, e) { progress.push({ id: p.id, ...e }); }, matchDone() {},
  };
  const room = new Room(hub, 'TEST', true);
  for (let id = 0; id < count; id++) room.add({ id, name: `Player ${id}`, skin: 'witch' });
  room.handlers.mode.call(room, room.list[0], { mode });
  room.startGame();
  const sent = (type, to = 0) => messages.filter(m => m.to === to && m.msg.type === type).map(m => m.msg); // what one player got
  return { room, hub, progress, sent };
}
// put a player somewhere open on the map, facing a, standing on the ground
function place(room, p, x, y, a = 0) { Object.assign(p, { x, y, a, z: 0 }); }
// an open spot with room around it (a spawn spot)
const openSpot = room => room.spawnPos([]);

test('the Hex Wand bolt jumps to a second enemy standing close to the one it hit', () => {
  const { room, sent } = game(3);
  const [a, b, c] = room.list, s = openSpot(room);
  b.hp = c.hp = 100;
  place(room, b, s.x, s.y); place(room, c, s.x + 0.6, s.y);
  room.wandChain(a, b, Date.now());
  assert.equal(c.hp, 100 - WAND_CHAIN.dmg);
  assert.equal(sent('chain').length, 1);
});

test('the chain does not jump to anyone out of range', () => {
  const { room, sent } = game(3);
  const [a, b, c] = room.list;
  place(room, b, 5, 5); place(room, c, 5 + WAND_CHAIN.range + 3, 5);
  c.hp = 100;
  room.wandChain(a, b, Date.now());
  assert.equal(c.hp, 100);
  assert.equal(sent('chain').length, 0);
});

test('the Hex Wand is a real gun on the pads', () => {
  assert.ok(WEAPONS.wand && WEAPONS.wand.mag > 0);
});

test('curse slows the enemy in your sights; with no one there the scroll is kept', () => {
  const { room } = game(2);
  const [a, b] = room.list, s = openSpot(room);
  place(room, a, s.x, s.y, 0);
  place(room, b, s.x + 60, s.y); // far out of range
  a.spells = ['curse'];
  room.handlers.cast.call(room, a, { slot: 0 });
  assert.deepEqual(a.spells, ['curse']); // nothing to curse: kept
  place(room, b, s.x + 0.8, s.y);
  room.handlers.cast.call(room, a, { slot: 0 });
  assert.deepEqual(a.spells, []);
  assert.ok(b.curseUntil > Date.now() && b.curseUntil <= Date.now() + CURSE.ms);
});

test('invisibility ends when you shoot', () => {
  const { room } = game(2);
  const [a] = room.list;
  a.spells = ['invis'];
  room.handlers.cast.call(room, a, { slot: 0 });
  assert.ok(a.invisUntil > Date.now());
  room.handlers.shoot.call(room, a, { weapon: 'pistol', a: 0, p: 0 });
  assert.equal(a.invisUntil, 0);
});

test('blink moves you forward, never into a wall', () => {
  const { room } = game(2);
  const [a] = room.list, s = openSpot(room);
  place(room, a, s.x, s.y, 0);
  a.spells = ['blink'];
  const x0 = a.x;
  room.handlers.cast.call(room, a, { slot: 0 });
  if (a.spells.length === 0) assert.ok(a.x > x0); // it went somewhere ahead
  else assert.equal(a.x, x0); // blocked right away: stayed put and kept the scroll
});

test('Capture the Cauldron: grab theirs, bring it home, score; the match ends at the cap', () => {
  const { room, progress } = game(4, 'ctf');
  assert.equal(room.mode, 'ctf');
  const red = room.list.find(p => p.team === 1), bases = room.ctfBases();
  assert.ok(Math.hypot(bases[1].x - bases[2].x, bases[1].y - bases[2].y) > 5); // bases are apart
  for (let cap = 1; cap <= CTF.caps; cap++) {
    place(room, red, bases[2].x, bases[2].y);
    red.z = bases[2].z;
    room.updateCtf(Date.now());
    assert.equal(room.ctf.c[2].carrier, red.id);
    place(room, red, bases[1].x, bases[1].y);
    red.z = bases[1].z;
    room.updateCtf(Date.now());
    if (cap < CTF.caps) {
      assert.equal(room.ctf.scores[1], cap);
      assert.equal(room.ctf.c[2].home, true);
    }
  }
  assert.equal(room.gameOn, false); // red won
  assert.equal(progress.filter(e => e.type === 'capture').length, CTF.caps);
});

test('a carrier who dies drops the cauldron; a teammate touching it sends it home', () => {
  const { room } = game(4, 'ctf');
  const red = room.list.find(p => p.team === 1), blue = room.list.find(p => p.team === 2), bases = room.ctfBases();
  place(room, red, bases[2].x, bases[2].y); red.z = bases[2].z;
  room.updateCtf(Date.now());
  assert.equal(room.ctf.c[2].carrier, red.id);
  const s = openSpot(room);
  place(room, red, s.x, s.y); red.z = 0;
  room.updateCtf(Date.now());
  room.killPlayer(red, blue, { weapon: 'rifle' });
  assert.equal(room.ctf.c[2].carrier, null);
  assert.equal(room.ctf.c[2].home, false);
  place(room, blue, room.ctf.c[2].x, room.ctf.c[2].y); blue.z = room.ctf.c[2].z;
  room.updateCtf(Date.now());
  assert.equal(room.ctf.c[2].home, true);
});

test('a dropped cauldron goes home by itself after a while', () => {
  const { room } = game(4, 'ctf');
  const c = room.ctf.c[1];
  Object.assign(c, { x: 1, y: 1, home: false, carrier: null, droppedAt: Date.now() - CTF.returnMs - 1 });
  room.updateCtf(Date.now());
  assert.equal(room.ctf.c[1].home, true);
});

test('challenges: everyone gets the same ones today, and they count and pay out once', () => {
  assert.deepEqual(dailyIds(), dailyIds());
  assert.equal(new Set(dailyIds()).size, dailyIds().length);
  const state = currentChallenges(null);
  const id = Object.keys(state.daily)[0], c = challengeById(id);
  // feed events that match this challenge until it completes
  const event = { kills10: { type: 'kill' }, heads5: { type: 'kill', head: true }, play3: { type: 'match' }, win1: { type: 'win', mode: 'ffa' },
    blade3: { type: 'kill', weapon: 'blade' }, potion2: { type: 'kill', weapon: 'nade' }, cast3: { type: 'cast' },
    streak3: { type: 'kill', streak: 3 }, snipe3: { type: 'kill', weapon: 'sniper' }, wand3: { type: 'kill', weapon: 'wand' } }[id];
  let paid = 0;
  for (let i = 0; i < c.goal + 3; i++) paid += countEvent(state, event).filter(x => x.id === id).length;
  assert.equal(paid, 1);
  assert.ok(weeklyIds().length === 2);
});

test('the "4 different modes" weekly counts distinct modes', () => {
  const state = { day: 'x', week: 'y', daily: {}, weekly: { modes4: 0 }, done: [] };
  countEvent(state, { type: 'win', mode: 'ffa' });
  countEvent(state, { type: 'win', mode: 'ffa' });
  countEvent(state, { type: 'win', mode: 'teams' });
  assert.deepEqual(state.weekly.modes4, ['ffa', 'teams']);
});

test('titles and kill effects unlock with levels', () => {
  assert.equal(titleOk('apprentice', 1), true);
  assert.equal(titleOk('arch', 3), false);
  assert.equal(effectOk('emerald', levelFor(0)), false);
  assert.equal(effectOk('blood', 1), true);
});

test('joining to watch a match in progress spectates until the next match', () => {
  const { room } = game(2);
  const watcher = { id: 50, name: 'Watcher', skin: 'witch' };
  room.add(watcher, { watch: true });
  assert.equal(watcher.dead, true);
  assert.equal(watcher.respawnAt, Infinity);
  const late = { id: 51, name: 'Late', skin: 'witch' };
  room.add(late); // an ordinary join plays right away
  assert.equal(late.dead, false);
});

test('the tutorial room has three harmless straw dummies and no kill limit to speak of', () => {
  const messages = [];
  const hub = { nextId: 100, name: p => p.name, who: p => p.name, send(p, m) { messages.push(m); }, sendRaw() {},
    record() {}, afterMatch() {}, closeRoom() {}, notice() {} };
  const room = new Room(hub, 'TUTOR', true);
  room.makeTutorial();
  const dummies = room.list.filter(p => p.bot);
  assert.equal(dummies.length, 3);
  assert.ok(dummies.every(b => b.level === 'dummy' && b.name.startsWith('Straw Dummy')));
  assert.ok(room.winScore > 100);
  const me = { id: 1, name: 'Learner', skin: 'witch' };
  room.add(me);
  room.handlers.ready.call(room, me);
  assert.equal(room.gameOn, true);
  assert.equal(me.nades, 2);
  assert.deepEqual(me.spells, ['haste']);
});
