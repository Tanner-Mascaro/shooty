import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { botTick, botGun, PERSONALITIES, randomPersonality } from '../server/bot.js';
import { MAX_HP } from '../shared/config.js';
import { aimBuild, canBuild } from '../shared/spells.js';
import { walkHeight, kindAt } from '../shared/terrain.js';

// a match on the witch map with one bot of the given personality (the person sits it out)
function game(personality) {
  const hub = { nextId: 10, name: p => p.name, who: p => p.name, send() {}, sendRaw() {}, record() {}, afterMatch() {}, closeRoom() {} };
  const room = new Room(hub, 'BOTS', true);
  room.add({ id: 1, name: 'Person', skin: 'witch' });
  room.addBot('medium');
  const bot = room.list.find(p => p.bot);
  room.startGame();
  Object.assign(bot, { personality, knife: false, nadeBot: false });
  const person = room.players[1];
  person.dead = true; // out of the fight, so nothing distracts the bot
  return { room, bot, person };
}
const ticks = (room, bot, n) => { for (let i = 0; i < n; i++) botTick(room, bot); };

test('every bot gets a known personality', () => {
  const seen = new Set(Array.from({ length: 400 }, randomPersonality));
  assert.deepEqual([...seen].sort(), Object.keys(PERSONALITIES).sort());
});

test('rushers and snipers reach for their favorite guns', () => {
  const pick = (personality, mag, last) => botGun({ mag }, { weapon: last }, 8, PERSONALITIES[personality]);
  assert.equal(pick('rusher', { rifle: 30, shotgun: 6 }, 'rifle'), 'shotgun');
  assert.equal(pick('sniper', { smg: 30, crossbow: 1 }, 'smg'), 'crossbow');
  assert.equal(pick('soldier', { smg: 30, crossbow: 1 }, 'smg'), 'smg');
});

test('a hurt survivor heads for health', () => {
  const { room, bot } = game('survivor');
  const pad = room.pickups.find(pu => pu.weapon === 'health');
  pad.active = true;
  // an open spot a short walk from the pad
  let spot;
  for (let i = 0; i < 500 && !spot; i++) {
    const s = room.spawnPos([]), d = Math.hypot(s.x - pad.x, s.y - pad.y);
    if (d > 10 && d < 20) spot = s;
  }
  Object.assign(bot, { x: spot.x, y: spot.y, z: 0, hp: MAX_HP * 0.3, vx: 0, vy: 0 });
  const start = Math.hypot(pad.x - bot.x, pad.y - bot.y);
  ticks(room, bot, 150);
  const end = Math.hypot(pad.x - bot.x, pad.y - bot.y);
  assert.ok(end < start - 2 || bot.hp > MAX_HP * 0.3, `moved from ${start.toFixed(1)} to ${end.toFixed(1)}`);
});

test('snipers camp a spot they reach before moving on', () => {
  const { room, bot } = game('sniper');
  bot.mag = { sniper: 4, crossbow: 1 }; bot.inv = {}; // has its favorites, so it isn't off shopping
  bot.brain.goal = { x: bot.x, y: bot.y }; // already there
  ticks(room, bot, 1);
  assert.equal(bot.brain.goal, null);
  assert.ok(bot.brain.campUntil > Date.now());
  const x = bot.x, y = bot.y;
  ticks(room, bot, 20);
  assert.ok(Math.hypot(bot.x - x, bot.y - y) < 0.3, 'stays put while camping');
});

test('hunters go to where they last saw someone', () => {
  const { room, bot } = game('hunter');
  const spot = room.spawnPos([bot]);
  bot.brain.lastSeen = { id: 1, x: spot.x, y: spot.y, at: Date.now() };
  const start = Math.hypot(spot.x - bot.x, spot.y - bot.y);
  ticks(room, bot, 90);
  assert.ok(Math.hypot(spot.x - bot.x, spot.y - bot.y) < start - 2);
});

test('bots conjure ramps in a fight and run up them', () => {
  const { room, bot, person } = game('sniper');
  // an open run east with the target in plain sight at the far end
  let spot = null;
  for (let i = 0; i < 800 && !spot; i++) {
    const s = room.spawnPos([]);
    const at = aimBuild('ramp', s.x, s.y, 0);
    if (!canBuild(room.T, 'ramp', at.x, at.y, 0)) continue;
    if (Array.from({ length: 41 }, (_, n) => n / 4).every(dx => walkHeight(room.T, s.x + dx, s.y, 0) === 0 && kindAt(room.T, s.x + dx, s.y) === 0)) spot = s;
  }
  assert.ok(spot, 'no open run');
  Object.assign(bot, { x: spot.x, y: spot.y, z: 0, a: 0, mana: 100, vx: 0, vy: 0, mag: { sniper: 4 }, inv: {} });
  Object.assign(person, { dead: false, x: spot.x + 10, y: spot.y, z: 0 });
  for (let i = 0; i < 40 && !room.builds.length; i++) {
    Object.assign(bot, { x: spot.x, y: spot.y, z: 0, vx: 0, vy: 0 }); // hold it where the ramp fits
    bot.brain.nextRamp = 0;
    botTick(room, bot);
  }
  assert.equal(room.builds.length, 1, 'built a ramp');
  person.dead = true; // let it climb without a gunfight
  let top = 0;
  for (let i = 0; i < 90; i++) { botTick(room, bot); top = Math.max(top, bot.z); }
  assert.ok(top > 1, `climbed to ${top.toFixed(2)}`);
});
