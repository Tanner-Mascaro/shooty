import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { walkHeight, kindAt } from '../shared/terrain.js';
import { aimBuild, canBuild, RAMP } from '../shared/spells.js';
import { MAX_HP, MAX_MANA, BUILDS, SPELL_SLOTS, HEAL_SPELL, WARD, WEAPONS, RAMP_STACK } from '../shared/config.js';

function game(count = 2) {
  const messages = [];
  const hub = {
    nextId: count, name: p => p.name, who: p => p.name,
    send(p, msg) { messages.push({ to: p.id, msg: structuredClone(msg) }); },
    sendRaw(p, raw) { messages.push({ to: p.id, msg: JSON.parse(raw) }); },
    record() {}, afterMatch() {}, closeRoom() {}, notice() {},
  };
  const room = new Room(hub, 'MAGIC', true);
  for (let id = 0; id < count; id++) room.add({ id, name: `Player ${id}`, skin: 'witch' });
  room.startGame();
  return { room, events: (type, id = 0) => messages.filter(m => m.to === id && m.msg.type === type).map(m => m.msg) };
}
// an open spot where a ramp fits facing east, with everyone else out of the way
function clearing(room, p, others) {
  for (let i = 0; i < 400; i++) {
    const s = room.spawnPos([]);
    Object.assign(p, { x: s.x, y: s.y, z: 0, a: 0 });
    const b = aimBuild('ramp', p.x, p.y, 0), fits = canBuild(room.T, 'ramp', b.x, b.y, b.dir);
    if (fits) { for (const o of others) Object.assign(o, { x: p.x - 8, y: p.y }); return; }
  }
  assert.fail('no clearing found');
}
const cast = (room, p, kind) => {
  const at = aimBuild(kind, p.x, p.y, p.a);
  room.handlers.cast.call(room, p, { build: kind, ...at });
  return at;
};

test('an earth ramp costs mana, stops bullets under its slope, can be shot down, and only this room gets it', () => {
  const { room, events } = game();
  const [me, other] = room.list;
  clearing(room, me, [other]);
  const shared = room.T;
  const at = cast(room, me, 'ramp');
  assert.equal(room.builds.length, 1);
  assert.equal(me.mana, MAX_MANA - BUILDS.ramp.mana);
  assert.ok(walkHeight(room.T, at.x + 1, at.y, 2) > 1);
  assert.notEqual(room.T, shared, 'the room built on its own copy of the map');
  assert.equal(walkHeight(shared, at.x + 1, at.y, 2), 0, 'the shared map is untouched');
  assert.deepEqual(events('build').at(-1), { type: 'build', id: 1, kind: 'ramp', x: at.x, y: at.y, dir: 0, base: 0, on: null, by: me.id });

  // shooting into the slope: the rounds stop there, never reach whoever hides behind it, and
  // chip the ramp down until it breaks
  Object.assign(other, { x: at.x + 3, y: at.y, z: 0 });
  let shots = 0;
  while (room.builds.length && shots < 40) {
    me.nextFire = {}; me.mag.pistol = 12;
    room.handlers.shoot.call(room, me, { weapon: 'pistol', a: 0, p: 0 });
    shots++;
  }
  assert.equal(other.hp, MAX_HP, 'nobody behind the ramp was hit');
  assert.equal(room.builds.length, 0);
  assert.equal(shots, Math.ceil(BUILDS.ramp.hp / WEAPONS.pistol.dmg));
  assert.equal(walkHeight(room.T, at.x + 1, at.y, 2), 0, 'the ground is back the way it was');
  assert.equal(events('unbuild').at(-1).broken, true);
});

test('an earth ramp is a slope you can walk up', () => {
  const { room } = game();
  const [me, other] = room.list;
  clearing(room, me, [other]);
  const at = cast(room, me, 'ramp');
  assert.equal(room.builds.length, 1);
  const low = walkHeight(room.T, at.x - 1.2, at.y, 0), high = walkHeight(room.T, at.x + 1.2, at.y, 2);
  assert.ok(low < 0.4 && high > 1.2, `${low} .. ${high}`);
  assert.equal(kindAt(room.T, at.x, at.y), 0, 'walkable, not a wall');
});

test('builds need mana and room, fade out, and are cleared for the next match', () => {
  const { room, events } = game();
  const [me, other] = room.list;
  clearing(room, me, [other]);
  me.mana = BUILDS.ramp.mana - 1;
  cast(room, me, 'ramp');
  assert.equal(room.builds.length, 0, 'not enough mana');
  me.mana = MAX_MANA;
  const at = aimBuild('ramp', me.x, me.y, 0);
  Object.assign(other, { x: at.x, y: at.y });
  cast(room, me, 'ramp');
  assert.equal(room.builds.length, 0, 'someone is standing there');
  Object.assign(other, { x: me.x - 8, y: me.y });
  room.handlers.cast.call(room, me, { build: 'wall', ...at });
  assert.equal(room.builds.length, 0, 'there is no wall spell');
  room.handlers.cast.call(room, me, { build: 'ramp', x: me.x + 20, y: me.y, dir: 0 });
  assert.equal(room.builds.length, 0, 'too far away');
  cast(room, me, 'ramp');
  assert.equal(room.builds.length, 1);
  room.builds[0].until = Date.now() - 1;
  room.tick();
  assert.equal(room.builds.length, 0);
  assert.equal(events('unbuild').at(-1).broken, false);
  me.mana = MAX_MANA;
  cast(room, me, 'ramp');
  room.finish([me], { winner: me.id }, 'test');
  room.startGame();
  assert.equal(room.builds.length, 0);
});

test('scrolls store up to three spells; heal, ward and haste work', () => {
  const { room, events } = game();
  const [me] = room.list;
  const scroll = room.pickups.find(pu => pu.scroll);
  assert.ok(scroll, 'every match scatters spell scrolls');
  for (const spell of ['heal', 'ward', 'haste', 'heal']) {
    Object.assign(scroll, { active: true, spell });
    Object.assign(me, { x: scroll.x, y: scroll.y, z: 0 });
    room.tryWalkOver(me, scroll, Date.now());
  }
  assert.deepEqual(me.spells, ['heal', 'ward', 'haste'], `only ${SPELL_SLOTS} fit`);
  assert.deepEqual(events('inv').at(-1).spells, ['heal', 'ward', 'haste']);

  me.hp = 20;
  room.handlers.cast.call(room, me, { slot: 0 });
  assert.equal(me.hp, 20 + HEAL_SPELL);
  assert.deepEqual(me.spells, ['ward', 'haste']);

  room.handlers.cast.call(room, me, { slot: 0 });
  me.hp = MAX_HP;
  assert.equal(room.hurt(me, 40), 0);
  assert.equal(room.hurt(me, 40), 40 - (WARD.absorb - 40));

  room.handlers.cast.call(room, me, { slot: 0 });
  assert.ok(me.hasteUntil > Date.now());
  assert.deepEqual(me.spells, []);
  assert.equal(events('spell').length, 3);
});

test('the infected cannot cast', () => {
  const { room } = game();
  const [me, other] = room.list;
  room.mode = 'plague'; me.team = 1;
  clearing(room, me, [other]);
  cast(room, me, 'ramp');
  assert.equal(room.builds.length, 0);
});

test('ramps stack up to three high from on top of one another, and fall with the one below', () => {
  const { room, events } = game();
  const [me, other] = room.list;
  // a run long enough for three ramps in a row
  let found = false;
  for (let i = 0; i < 600 && !found; i++) {
    const s = room.spawnPos([]);
    Object.assign(me, { x: s.x, y: s.y, z: 0, a: 0 });
    const first = aimBuild('ramp', me.x, me.y, 0);
    found = [0, 1, 2].every(n => canBuild(room.T, 'ramp', first.x + n * RAMP.len, first.y, 0));
  }
  assert.ok(found, 'no long enough run');
  Object.assign(other, { x: me.x - 8, y: me.y });
  const tops = [];
  for (let n = 0; n < RAMP_STACK + 1; n++) {
    me.mana = MAX_MANA;
    const at = aimBuild('ramp', me.x, me.y, 0, room.builds);
    room.handlers.cast.call(room, me, { build: 'ramp', ...at });
    const b = room.builds.at(-1);
    tops.push(b.base);
    Object.assign(me, { x: b.x + RAMP.len / 2 - 0.3, y: b.y }); // walk up to its top
    me.z = b.base + RAMP.rise;
  }
  assert.equal(room.builds.length, RAMP_STACK, 'the fourth one is too high to fit');
  assert.deepEqual(tops.slice(0, RAMP_STACK), [0, RAMP.rise, RAMP.rise * 2]);
  const top = room.builds.at(-1);
  assert.ok(walkHeight(room.T, top.x + RAMP.len / 2 - 0.2, top.y, 9) > RAMP.rise * RAMP_STACK - 0.2, 'you can stand up high');
  room.breakBuild(room.builds[0], true);
  assert.equal(room.builds.length, 0, 'the ramps on top came down with it');
  assert.equal(events('unbuild').length, RAMP_STACK);
});

test('the manor ceiling allows only one ramp high', () => {
  const { room } = game();
  room.setLevel('haunt');
  const [me, other] = room.list;
  let found = false;
  for (let i = 0; i < 600 && !found; i++) {
    const s = room.spawnPos([]);
    Object.assign(me, { x: s.x, y: s.y, z: 0, a: 0 });
    const first = aimBuild('ramp', me.x, me.y, 0);
    found = [0, 1].every(n => canBuild(room.T, 'ramp', first.x + n * RAMP.len, first.y, 0));
  }
  Object.assign(other, { x: me.x - 8, y: me.y });
  const first = aimBuild('ramp', me.x, me.y, 0);
  room.handlers.cast.call(room, me, { build: 'ramp', ...first });
  me.mana = MAX_MANA;
  room.handlers.cast.call(room, me, { build: 'ramp', x: first.x + RAMP.len, y: first.y, dir: 0 });
  assert.equal(room.builds.length, 1);
});

test('med kits are stored as heals, and heal on the spot when your slots are full', () => {
  const { room, events } = game();
  const [me] = room.list;
  const kit = room.pickups.find(pu => pu.weapon === 'health');
  const grab = () => { Object.assign(kit, { active: true }); Object.assign(me, { x: kit.x, y: kit.y, z: 0 }); room.tryWalkOver(me, kit, Date.now()); };
  me.hp = MAX_HP; me.spells = [];
  grab();
  assert.deepEqual(me.spells, ['heal'], 'stored even at full health');
  assert.equal(events('pickup').at(-1).stored, true);
  me.spells = ['ward', 'haste', 'ward'];
  me.hp = 30;
  grab();
  assert.equal(me.hp, 30 + HEAL_SPELL);
  assert.equal(events('pickup').at(-1).stored, false);
});
