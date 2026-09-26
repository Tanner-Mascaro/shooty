// Creatures that haunt a level (the haunted house): they drift around, and when they see a
// player close by they give chase and claw at them. Shooting one enough drives it off for a
// while; it comes back somewhere far from everyone. They hurt every player, on any team.
import { TICK } from '../shared/config.js';
import { MW, MH } from '../shared/levels.js';
import { groundAt, kindAt, hitsWall } from '../shared/terrain.js';

export const CREATURE = {
  count: 3,          // per room, on levels that have them
  hp: 120,
  height: 1.0,       // hitbox (players are 0.8)
  radius: 0.28,
  wander: 1.1,       // speeds, map units / s (players run at 3, so you can outrun them)
  chase: 2.5,
  sight: 9,          // how far it notices you, if nothing is in the way
  giveUp: 14,        // stops chasing past this
  reach: 0.6,        // claws you from this close
  damage: 22,
  hitGap: 900,       // ms between claws
  away: 20000,       // ms before a driven-off creature comes back
};
export const CREATURE_LEVELS = ['haunt'];

// line of sight at chest height, blocked by anything taller
function canSee(T, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  for (let t = 0.3 / d; t < 1; t += 0.2 / d) if (groundAt(T, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) > 0.6) return false;
  return true;
}

const free = (T, x, y) => !hitsWall(T, x, y, CREATURE.radius) && kindAt(T, x, y) !== 2;

export function newCreature(id, spot) {
  return { id, creature: true, h: CREATURE.height, x: spot.x, y: spot.y, z: 0, a: Math.random() * Math.PI * 2, p: 0, hp: CREATURE.hp,
    goal: null, target: null, nextClaw: 0, awayUntil: 0, stuck: 0 };
}

// step toward (gx, gy); slides along walls; false if it couldn't move at all
function step(T, c, gx, gy, speed) {
  const d = Math.hypot(gx - c.x, gy - c.y);
  if (d < 1e-3) return true;
  const s = Math.min(d, speed * TICK / 1000), mx = (gx - c.x) / d * s, my = (gy - c.y) / d * s;
  c.a = Math.atan2(my, mx);
  if (free(T, c.x + mx, c.y + my)) { c.x += mx; c.y += my; }
  else if (free(T, c.x + mx, c.y)) c.x += mx;
  else if (free(T, c.x, c.y + my)) c.y += my;
  else return false;
  c.z = groundAt(T, c.x, c.y);
  return true;
}

function pickGoal(T, c) {
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
    const g = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    if (g.x > 1 && g.y > 1 && g.x < MW - 1 && g.y < MH - 1 && free(T, g.x, g.y) && canSee(T, c, g)) return g;
  }
  return null;
}

// one server tick for one creature. `room` supplies players, spawn spots and the damage callback.
export function creatureTick(room, c, now) {
  const T = room.T;
  if (c.awayUntil) {
    if (now < c.awayUntil) return;
    const s = room.spawnPos(room.list); // back, as far from everyone as it can get
    Object.assign(c, { x: s.x, y: s.y, z: 0, hp: CREATURE.hp, awayUntil: 0, target: null, goal: null });
    room.broadcast({ type: 'creature', event: 'return', id: c.id, x: c.x, y: c.y });
  }
  // keep chasing its target while it can; otherwise look for the nearest player it can see
  const dist = p => Math.hypot(p.x - c.x, p.y - c.y);
  let t = c.target && room.players[c.target.id] === c.target && dist(c.target) < CREATURE.giveUp ? c.target : null;
  if (!t) {
    t = room.list.filter(p => dist(p) < CREATURE.sight && canSee(T, c, p)).sort((a, b) => dist(a) - dist(b))[0] || null;
    if (t) room.broadcast({ type: 'creature', event: 'spot', id: c.id, x: c.x, y: c.y }); // a shriek when it starts the hunt
  }
  c.target = t;
  if (t) {
    if (!step(T, c, t.x, t.y, CREATURE.chase)) c.stuck++;
    if (dist(t) < CREATURE.reach && Math.abs(t.z - c.z) < 1 && now >= c.nextClaw) {
      c.nextClaw = now + CREATURE.hitGap;
      room.creatureHit(t, c);
    }
    if (c.stuck > 20) { c.target = null; c.stuck = 0; c.goal = pickGoal(T, c); } // lost it around a corner
    return;
  }
  if (!c.goal || Math.hypot(c.goal.x - c.x, c.goal.y - c.y) < 0.2) c.goal = pickGoal(T, c);
  if (c.goal && !step(T, c, c.goal.x, c.goal.y, CREATURE.wander)) c.goal = null;
}
