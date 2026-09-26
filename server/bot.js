// Server-side bot for local testing (--bots). It wanders between random reachable spots and
// shoots the rifle at the nearest enemy it can see.
import { TICK, EYE, BODY_H, WEAPONS } from '../shared/config.js';
import { MW, MH } from '../shared/levels.js';
import { groundAt, kindAt } from '../shared/terrain.js';

const SPEED = 2.4;          // map units / s (players run at 3)
const SIGHT = 25;           // how far it will spot and shoot you
const REACTION = 400;       // ms after spotting you before the first shot
const FIRE_GAP = 280;       // ms between shots (rifle cd is 120, so it's slower than you)
const AIM_ERROR = 0.06;     // radians of random aim wobble
const TURN = 6;             // radians / s it can turn

// true if feet can stand at (x, y) coming from height z: no walls, no pits
function walkable(T, x, y, z) {
  return kindAt(T, x, y) === 0 && groundAt(T, x, y) <= z + 0.3;
}

// straight-line walk from a to b stays on open ground (with a body-width margin)
function clearPath(T, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 0.1);
  const nx = -(b.y - a.y) / (d || 1) * 0.25, ny = (b.x - a.x) / (d || 1) * 0.25;
  for (let i = 1; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
    if (!walkable(T, x, y, 0) || !walkable(T, x + nx, y + ny, 0) || !walkable(T, x - nx, y - ny, 0)) return false;
  }
  return true;
}

// a bullet from the bot's eye would reach the target's chest
function canSee(T, p, o) {
  const d = Math.hypot(o.x - p.x, o.y - p.y);
  if (d > SIGHT) return false;
  const z0 = p.z + EYE, z1 = o.z + BODY_H / 2;
  for (let t = 0.2 / d; t < 1; t += 0.1 / d)
    if (groundAt(T, p.x + (o.x - p.x) * t, p.y + (o.y - p.y) * t) > z0 + (z1 - z0) * t) return false;
  return true;
}

const turnToward = (a, target, max) => {
  const da = Math.atan2(Math.sin(target - a), Math.cos(target - a));
  return a + Math.max(-max, Math.min(max, da));
};

export function newBrain() {
  return { goal: null, seenAt: 0, nextShot: 0, stuck: 0 };
}

function pickGoal(game, p) {
  for (let i = 0; i < 30; i++) {
    const g = { x: 1 + Math.random() * (MW - 2), y: 1 + Math.random() * (MH - 2) };
    if (Math.hypot(g.x - p.x, g.y - p.y) > 2 && clearPath(game.T, p, g)) return g;
  }
  return null;
}

// one server tick of thinking, moving and shooting
export function botTick(game, p) {
  const T = game.T, b = p.brain, dt = TICK / 1000, now = Date.now();
  const dist = o => Math.hypot(o.x - p.x, o.y - p.y);
  const foe = game.enemies(p).filter(o => canSee(T, p, o)).sort((x, y) => dist(x) - dist(y))[0];

  // move toward the current goal, picking a new one on arrival or when blocked
  if (!b.goal || Math.hypot(b.goal.x - p.x, b.goal.y - p.y) < 0.3 || b.stuck > 10) {
    b.goal = pickGoal(game, p); b.stuck = 0;
  }
  let heading = p.a;
  if (b.goal) {
    heading = Math.atan2(b.goal.y - p.y, b.goal.x - p.x);
    const nx = p.x + Math.cos(heading) * SPEED * dt, ny = p.y + Math.sin(heading) * SPEED * dt;
    if (walkable(T, nx, ny, p.z)) { p.x = nx; p.y = ny; p.z = groundAt(T, nx, ny); }
    else b.stuck++;
  }

  // turn toward the target and shoot once it has had time to react
  if (!foe || (b.target !== undefined && b.target !== foe.id)) b.seenAt = 0; // new target: react again
  b.target = foe ? foe.id : undefined;
  if (!foe) {
    b.seenAt = 0;
    p.a = turnToward(p.a, heading, TURN * dt);
    p.p *= 0.9;
    return;
  }
  if (!b.seenAt) b.seenAt = now;
  const d = Math.hypot(foe.x - p.x, foe.y - p.y);
  p.a = turnToward(p.a, Math.atan2(foe.y - p.y, foe.x - p.x), TURN * dt);
  p.p = (foe.z + BODY_H * 0.55 - (p.z + EYE)) / (d || 1); // bullet pitch is a slope
  if (!game.gameOn || now - b.seenAt < REACTION || now < b.nextShot) return;
  if (!(p.mag.rifle > 0)) { // out: reload, a little after the last shot like a player would
    if (now - (p.lastShot.rifle || 0) >= WEAPONS.rifle.reload) game.handlers.reload.call(game, p, { weapon: 'rifle' });
    return;
  }
  b.nextShot = now + FIRE_GAP * (0.8 + Math.random() * 0.4);
  const a = p.a, pch = p.p;
  p.a += (Math.random() * 2 - 1) * AIM_ERROR;
  p.p += (Math.random() * 2 - 1) * AIM_ERROR;
  game.handlers.shoot.call(game, p, { weapon: 'rifle' });
  p.a = a; p.p = pch;
}
