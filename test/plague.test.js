import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { botTick } from '../server/bot.js';
import { groundAt, hitsWall } from '../shared/terrain.js';
import { MAX_HP, PLAGUE_MAX_HP, PLAGUE_DURATION, PLAGUE_TEAM, HEALTHY_TEAM, PLAGUE_SKIN, WIN_SCORE, TEAM_WIN_SCORE, WEAPONS, START_GUN, MOVE_SPEED, PLAGUE_SPEED_MULTIPLIER, TICK } from '../shared/config.js';

function game(count = 4, mode = 'plague', start = true) {
  const messages = [], records = [];
  const hub = {
    nextId: count, name: p => p.name || `Bot ${p.id}`, who: p => p.name || `Bot ${p.id}`,
    send(p, msg) { messages.push({ to: p.id, msg: structuredClone(msg) }); },
    sendRaw(p, raw) { messages.push({ to: p.id, msg: JSON.parse(raw) }); },
    record(p, stats) { if (p) records.push({ id: p.id, stats }); },
    afterMatch() {}, closeRoom() {},
  };
  const room = new Room(hub, 'TEST', true);
  for (let id = 0; id < count; id++) room.add({ id, name: `Player ${id}`, skin: 'knight' });
  room.handlers.mode.call(room, room.list[0], { mode });
  if (start) room.startGame();
  return { room, messages, records, events: (type, id = 0) => messages.filter(m => m.to === id && m.msg.type === type).map(m => m.msg) };
}
const plague = r => r.list.filter(p => p.team === PLAGUE_TEAM);
const healthy = r => r.list.filter(p => p.team === HEALTHY_TEAM);
const kill = (r, victim, killer) => r.killPlayer(victim, killer, { weapon: killer ? r.isInfected(killer) ? 'claws' : 'rifle' : 'pit' });
function openLane(room) {
  // stay clear of the outer hedge / wall ring on large maps
  const y0 = 8, y1 = room.map.length - 8, x0 = 8, x1 = room.map[0].length - 8;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (Array.from({ length: 16 }, (_, i) => i * 0.2).every(dx => groundAt(room.T, x + dx, y) === 0 && !hitsWall(room.T, x + dx, y, 0.3))) return { x, y };
  }
  assert.fail('an open firing lane must exist');
}

// first ground tick of plague chase: ACCEL (18) caps how fast wish-speed is reached
function plagueFirstStep() {
  const dt = TICK / 1000, wish = MOVE_SPEED * PLAGUE_SPEED_MULTIPLIER, ACCEL = 18;
  return Math.min(wish, ACCEL * wish * dt) * dt;
}

test('Plague assigns exactly one monster and sends roles before start', () => {
  const { room, events, messages } = game();
  assert.equal(plague(room).length, 1);
  assert.equal(healthy(room).length, 3);
  assert.equal(room.enemies(plague(room)[0]).length, 3);
  assert.equal(room.skinOf(plague(room)[0]), PLAGUE_SKIN);
  assert.equal(plague(room)[0].skin, 'knight');
  assert.ok(room.plagueRemainingMs > PLAGUE_DURATION - 2000);
  assert.ok(room.plagueRemainingMs <= PLAGUE_DURATION);
  assert.equal(events('room').at(-1).gameOn, true);
  assert.equal(events('start').at(-1).mode, 'plague');
  const received = messages.filter(m => m.to === 0).map(m => m.msg);
  assert.ok(received.findIndex(m => m.type === 'room' && m.gameOn) < received.findIndex(m => m.type === 'start'));
  assert.deepEqual(room.enemies(healthy(room)[0]), plague(room));
});

test('infection spreads through newly infected players and ends only after the last survivor', () => {
  const { room, events, records } = game();
  const first = plague(room)[0], [a, b, c] = healthy(room), seq = a.seq;
  kill(room, a, first);
  assert.equal(a.team, PLAGUE_TEAM);
  assert.equal(a.hp, PLAGUE_MAX_HP);
  assert.equal(a.seq, seq + 1);
  assert.equal(room.skinOf(a), PLAGUE_SKIN);
  assert.ok(!room.enemies(a).includes(first));
  assert.equal(room.gameOn, true);
  room.handlers.team.call(room, a, { team: HEALTHY_TEAM });
  room.handlers.mode.call(room, a, { mode: 'ffa' });
  assert.equal(a.team, PLAGUE_TEAM);
  assert.equal(room.mode, 'plague');
  kill(room, b, a);
  assert.equal(b.team, PLAGUE_TEAM);
  kill(room, c, b);
  assert.equal(room.gameOn, false);
  assert.equal(events('win').at(-1).team, PLAGUE_TEAM);
  assert.equal(events('kill').filter(m => m.infected).length, 3);
  assert.equal(records.filter(r => r.stats.wins === 1).length, 4);
  assert.equal(room.plagueEndsAt, 0);
  assert.ok(room.list.every(p => room.skinOf(p) === 'knight'));
});

test('monster deaths stay infected and pit deaths do not infect healthy players', () => {
  const { room, events } = game();
  const monster = plague(room)[0], survivor = healthy(room)[0];
  kill(room, monster, survivor);
  assert.equal(monster.team, PLAGUE_TEAM);
  kill(room, survivor, null);
  assert.equal(survivor.team, HEALTHY_TEAM);
  assert.equal(survivor.hp, MAX_HP);
  assert.ok(events('kill').every(m => !m.infected));
  assert.equal(room.gameOn, true);
});

test('claws ignore teammates, require two hits even from behind, and respect their cooldown', () => {
  const { room } = game();
  const shooter = plague(room)[0], [ally, victim, other] = healthy(room);
  ally.team = PLAGUE_TEAM;
  const spot = openLane(room);
  Object.assign(shooter, { ...spot, z: 0, a: 0, p: 0 });
  Object.assign(ally, { x: spot.x + 0.7, y: spot.y, z: 0 });
  Object.assign(victim, { x: spot.x + 1.2, y: spot.y, z: 0, hp: MAX_HP, a: 0 });
  Object.assign(other, { x: spot.x, y: spot.y + 4, z: 0 });
  room.handlers.shoot.call(room, shooter, { weapon: 'claws' });
  assert.equal(victim.hp, MAX_HP / 2);
  assert.equal(victim.team, HEALTHY_TEAM);
  room.handlers.shoot.call(room, shooter, { weapon: 'claws' });
  assert.equal(victim.hp, MAX_HP / 2);
  shooter.nextFire.claws = 0;
  room.handlers.shoot.call(room, shooter, { weapon: 'claws' });
  assert.equal(ally.hp, MAX_HP);
  assert.equal(victim.team, PLAGUE_TEAM);
  assert.equal(victim.hp, PLAGUE_MAX_HP);
  assert.equal(room.gameOn, true);
});

test('healthy players win at the deadline even if a shot arrives before the next tick', () => {
  const { room, events, records } = game();
  const monster = plague(room)[0];
  room.plagueEndsAt = Date.now() - 1;
  room.handlers.shoot.call(room, monster, { weapon: 'claws' });
  assert.equal(room.gameOn, false);
  assert.equal(events('shot').length, 0);
  assert.equal(events('win').at(-1).team, HEALTHY_TEAM);
  assert.equal(records.filter(r => r.stats.wins === 1).length, 3);
  room.tick();
  assert.equal(events('win').length, 1);
});

test('the timer also ends a quiet round and ordinary kill targets do not end Plague', () => {
  const { room, events } = game();
  const monster = plague(room)[0], survivor = healthy(room)[0];
  survivor.kills = TEAM_WIN_SCORE;
  kill(room, monster, survivor);
  assert.equal(room.gameOn, true);
  room.plagueEndsAt = Date.now() - 1;
  room.tick();
  assert.equal(events('win').at(-1).team, HEALTHY_TEAM);
});

test('late joiners and bots join the plague without restarting the timer', () => {
  const { room, messages } = game(3);
  const deadline = room.plagueEndsAt;
  room.add({ id: 20, name: 'Late player', skin: 'goose' });
  room.addBot();
  assert.equal(room.players[20].team, PLAGUE_TEAM);
  assert.equal(room.list.find(p => p.bot).team, PLAGUE_TEAM);
  assert.equal(room.plagueEndsAt, deadline);
  const received = messages.filter(m => m.to === 20).map(m => m.msg);
  const start = received.findIndex(m => m.type === 'start');
  assert.ok(received.slice(0, start).some(m => m.type === 'room' && m.players.find(p => p.id === 20).team === PLAGUE_TEAM));
  assert.ok(received[start].plagueRemainingMs > 0);
});

test('disconnecting the last monster awards healthy players a win', () => {
  const { room, events } = game();
  const monster = plague(room)[0], remaining = healthy(room)[0];
  room.remove(monster);
  assert.equal(events('win', remaining.id).at(-1).team, HEALTHY_TEAM);
  assert.equal(room.gameOn, false);
});

test('disconnecting the last healthy player awards the plague a win', () => {
  const { room, events } = game(2);
  const monster = plague(room)[0];
  room.remove(healthy(room)[0]);
  assert.equal(events('win', monster.id).at(-1).team, PLAGUE_TEAM);
});

test('removing the only monster bot ends the round instead of leaving survivors stuck', () => {
  const { room, events } = game(2);
  room.addBot();
  room.list.forEach(p => p.team = p.bot ? PLAGUE_TEAM : HEALTHY_TEAM);
  room.handlers.removeBot.call(room, room.humans[0], { count: 1 });
  assert.equal(events('win').at(-1).team, HEALTHY_TEAM);
});

test('rematches reset infections, kills, timer and readiness; mode switches clear roles', () => {
  const { room } = game();
  const monster = plague(room)[0];
  for (const victim of healthy(room)) kill(room, victim, monster);
  assert.equal(room.gameOn, false);
  room.startGame();
  assert.equal(plague(room).length, 1);
  assert.ok(room.list.every(p => p.kills === 0 && !p.ready));
  assert.ok(room.plagueRemainingMs > PLAGUE_DURATION - 2000);
  room.endMatch('test');
  room.handlers.mode.call(room, room.list[0], { mode: 'ffa' });
  assert.ok(room.list.every(p => p.team === 0 && p.skin === 'knight'));
  assert.equal(room.plagueEndsAt, 0);
});

test('free-for-all and teams still win at their kill targets', () => {
  for (const mode of ['ffa', 'teams']) {
    const { room, events } = game(2, mode);
    const [killer, victim] = room.list;
    killer.kills = (mode === 'ffa' ? WIN_SCORE : TEAM_WIN_SCORE) - 1;
    kill(room, victim, killer);
    assert.equal(room.gameOn, false);
    assert.equal(events('kill').at(-1).infected, false);
    assert.equal(mode === 'ffa' ? events('win').at(-1).winner : events('win').at(-1).team, mode === 'ffa' ? killer.id : killer.team);
  }
});

const setup = (room, selection) => room.handlers.plagueSetup.call(room, room.list[0], { selection });
const role = (room, player, team) => room.handlers.plagueRole.call(room, room.list[0], { id: player.id, team });

test('manual setup starts chosen humans and bots infected and preserves choices through rematches', () => {
  const { room, events } = game(3, 'plague', false);
  room.addBot();
  const [a, b, c, bot] = room.list;
  setup(room, 'manual');
  role(room, a, PLAGUE_TEAM);
  role(room, bot, PLAGUE_TEAM);
  assert.equal(events('room').at(-1).plagueSelection, 'manual');
  assert.equal(events('room').at(-1).plagueSetupValid, true);
  assert.equal(events('room').at(-1).players.find(p => p.id === bot.id).plagueStartTeam, PLAGUE_TEAM);
  for (const p of room.humans) room.handlers.ready.call(room, p);
  assert.equal(room.gameOn, true);
  assert.deepEqual(plague(room).map(p => p.id), [a.id, bot.id]);
  kill(room, b, bot);
  kill(room, c, b);
  assert.equal(room.gameOn, false);
  assert.equal(b.plagueStartTeam, HEALTHY_TEAM);
  room.startGame();
  assert.deepEqual(plague(room).map(p => p.id), [a.id, bot.id]);
  assert.deepEqual(healthy(room).map(p => p.id), [b.id, c.id]);
});

test('manual setup blocks all-healthy and all-infected rounds on the server', () => {
  const { room, events } = game(2, 'plague', false);
  setup(room, 'manual');
  for (const p of room.list) room.handlers.ready.call(room, p);
  room.startGame();
  assert.equal(room.gameOn, false);
  assert.equal(room.plagueSetupValid(), false);
  assert.equal(events('notice').length, 1);
  for (const p of room.list) role(room, p, PLAGUE_TEAM);
  room.startGame();
  assert.equal(room.gameOn, false);
  role(room, room.list[1], HEALTHY_TEAM);
  assert.equal(room.plagueSetupValid(), true);
  for (const p of room.list) room.handlers.ready.call(room, p);
  assert.equal(room.gameOn, true);
});

test('random setup includes bots and ignores saved manual roles', t => {
  const { room } = game(2, 'plague', false);
  room.addBot();
  setup(room, 'manual');
  room.list.forEach(p => role(room, p, PLAGUE_TEAM));
  setup(room, 'random');
  t.mock.method(Math, 'random', () => 0.999);
  room.startGame();
  assert.equal(plague(room).length, 1);
  assert.equal(plague(room)[0].bot, true);
  assert.equal(healthy(room).length, 2);
});

test('setup and roster changes reset human readiness and removing the assigned bot invalidates setup', () => {
  const { room } = game(2, 'plague', false);
  const a = room.list[0];
  a.ready = true;
  setup(room, 'manual');
  assert.equal(a.ready, false);
  room.addBot();
  const bot = room.list.find(p => p.bot);
  role(room, bot, PLAGUE_TEAM);
  room.handlers.ready.call(room, a);
  assert.equal(a.ready, true);
  role(room, room.list[1], PLAGUE_TEAM);
  assert.equal(a.ready, false);
  role(room, room.list[1], HEALTHY_TEAM);
  room.handlers.ready.call(room, a);
  room.add({ id: 20, name: 'New player' });
  assert.equal(a.ready, false);
  assert.equal(room.players[20].plagueStartTeam, HEALTHY_TEAM);
  assert.equal(bot.ready, true);
  room.handlers.removeBot.call(room, room.humans[0], { count: 1 });
  assert.equal(room.plagueSetupValid(), false);
  room.startGame();
  assert.equal(room.gameOn, false);
});

test('invalid role requests and changes during a round cannot alter the setup', () => {
  const { room } = game(2, 'plague', false);
  const a = room.list[0];
  role(room, a, PLAGUE_TEAM); // random mode has no manual assignments
  assert.equal(a.plagueStartTeam, HEALTHY_TEAM);
  setup(room, 'invalid');
  assert.equal(room.plagueSelection, 'random');
  setup(room, 'manual');
  role(room, a, 0);
  role(room, { id: 999 }, PLAGUE_TEAM);
  assert.equal(a.plagueStartTeam, HEALTHY_TEAM);
  role(room, a, PLAGUE_TEAM);
  room.startGame();
  role(room, a, HEALTHY_TEAM);
  setup(room, 'random');
  assert.equal(a.team, PLAGUE_TEAM);
  assert.equal(a.plagueStartTeam, PLAGUE_TEAM);
  assert.equal(room.plagueSelection, 'manual');
  room.endMatch('test');
  room.handlers.mode.call(room, a, { mode: 'ffa' });
  role(room, a, HEALTHY_TEAM);
  setup(room, 'random');
  assert.equal(a.plagueStartTeam, PLAGUE_TEAM);
  assert.equal(room.plagueSelection, 'manual');
});

test('infected loadouts reject guns, blades, reloading, weapon pickups and dropped guns', () => {
  const { room, events } = game();
  const monster = plague(room)[0], survivor = healthy(room)[0];
  assert.deepEqual(monster.mag, {});
  assert.deepEqual(monster.inv, {});
  assert.equal(events('inv', monster.id).at(-1).clawsOnly, true);
  for (const weapon of ['rifle', 'sniper', 'shotgun', 'smg', 'blade']) room.handlers.shoot.call(room, monster, { weapon });
  room.handlers.shoot.call(room, survivor, { weapon: 'claws' });
  assert.equal(events('shot').length, 0);
  monster.mag.rifle = 0;
  room.handlers.reload.call(room, monster, { weapon: 'rifle' });
  assert.equal(monster.mag.rifle, 0);
  delete monster.mag.rifle;
  monster.z = 0;
  const pickup = { x: monster.x, y: monster.y, weapon: 'shotgun', gun: true, crate: true, active: true };
  room.tryWalkOver(monster, pickup, Date.now());
  assert.equal(pickup.active, true);
  assert.equal(room.takeGun(monster, 'shotgun', 6, 6), null);
  room.addBox(monster.x, monster.y, [{ w: 'shotgun', mag: 6, spare: 6 }]);
  room.handlers.use.call(room, monster, { box: room.boxes.at(-1).id });
  assert.deepEqual(monster.mag, {});
  monster.hp = 50;
  pickup.weapon = 'health';
  room.tryWalkOver(monster, pickup, Date.now());
  assert.equal(monster.hp, MAX_HP);
  assert.equal(pickup.active, false);
});

test('infection immediately removes guns and a healthy rematch restores them', () => {
  const { room, events } = game(3, 'plague', false);
  const [monster, victim, other] = room.list;
  setup(room, 'manual'); role(room, monster, PLAGUE_TEAM); room.startGame();
  room.takeGun(victim, 'shotgun', 6, 6);
  kill(room, victim, monster);
  assert.deepEqual(victim.mag, {});
  assert.equal(events('inv', victim.id).at(-1).clawsOnly, true);
  kill(room, victim, other);
  assert.deepEqual(victim.mag, {});
  room.endMatch('test');
  room.startGame();
  assert.equal(victim.team, HEALTHY_TEAM);
  assert.equal(victim.mag[START_GUN], WEAPONS[START_GUN].mag);
  assert.equal(events('inv', victim.id).at(-1).clawsOnly, false);
});

test('infected bots move faster, close to melee distance, and infect with two claw swipes', t => {
  const { room, events } = game(2, 'plague', false);
  room.addBot();
  const bot = room.list.find(p => p.bot), [victim, other] = room.humans, spot = openLane(room);
  setup(room, 'manual'); role(room, bot, PLAGUE_TEAM); room.startGame();
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  Object.assign(bot, { ...spot, z: 0, a: 0, p: 0, vx: 0, vy: 0, onGround: true });
  Object.assign(victim, { x: spot.x + 2.5, y: spot.y, z: 0, a: 0 });
  Object.assign(other, { x: spot.x, y: spot.y + 8, z: 0 });
  botTick(room, bot);
  assert.ok(Math.abs(bot.x - spot.x - plagueFirstStep()) < 1e-6);
  victim.x = bot.x + 0.8;
  now += 500; botTick(room, bot);
  assert.equal(victim.hp, MAX_HP / 2);
  now += WEAPONS.claws.cd + 1; botTick(room, bot);
  assert.equal(victim.team, PLAGUE_TEAM);
  assert.deepEqual(bot.mag, {});
  assert.ok(events('shot').every(m => m.weapon === 'claws'));
});

test('infected bots can spend their second jump while chasing an elevated survivor', t => {
  const { room } = game(2, 'plague', false);
  room.addBot();
  const bot = room.list.find(p => p.bot), [victim, other] = room.humans, spot = openLane(room);
  setup(room, 'manual'); role(room, bot, PLAGUE_TEAM); room.startGame();
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  bot.brain.bhop = true;
  Object.assign(bot, { ...spot, z: 0, a: 0, vx: 0, vy: 0, onGround: true });
  Object.assign(victim, { x: spot.x + 2.5, y: spot.y, z: 1.2 });
  Object.assign(other, { x: spot.x, y: spot.y + 8, z: 0 });
  let maxJumps = 0, peak = 0;
  for (let i = 0; i < 30; i++) { now += TICK; botTick(room, bot); maxJumps = Math.max(maxJumps, bot.jumpsUsed || 0); peak = Math.max(peak, bot.z); }
  assert.equal(maxJumps, 2);
  assert.ok(peak > 0.5);
});
