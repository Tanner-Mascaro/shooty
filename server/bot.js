// Server-side bot. It wanders between random reachable spots and shoots whatever gun it has
// (the starting pistol, as it never picks up guns) at the nearest enemy it can see. It refills
// from ammo crates it happens to walk over. How good it is depends on its level (LEVELS).
// Some bots (KNIFE_CHANCE) never shoot: they sprint at the nearest enemy they can see and stab.
// Movement uses the same accelerate / air-strafe / hold-jump bhop model as players.
import { TICK, EYE, BODY_H, WEAPONS, PLAGUE_SPEED_MULTIPLIER, PLAGUE_JUMPS, PLAGUE_DASH_SPEED, MOVE_SPEED, MOVE_SPEED_LIMIT, MOVE_GRAVITY } from '../shared/config.js';
import { tryJump } from '../shared/movement.js';
import { MW, MH } from '../shared/levels.js';
import { groundAt, kindAt } from '../shared/terrain.js';

// speed: walk wish-speed (map units / s); sprint: chase wish-speed; sight/reaction/aim as before
export const BOT_LEVELS = {
  easy:   { speed: 2.4, sprint: 3.0, sight: 15, reaction: 800, fireGap: 600, aim: 0.13, turn: 3.5 },
  medium: { speed: 2.8, sprint: 3.2, sight: 25, reaction: 400, fireGap: 320, aim: 0.06, turn: 6 },
  hard:   { speed: 3.0, sprint: 3.6, sight: 32, reaction: 200, fireGap: 220, aim: 0.025, turn: 11 },
};

export const KNIFE_CHANCE = 0.25;

const ACCEL = 18, AIR_ACCEL = 12, AIR_CAP = 0.28, FRICTION = 5, STOP_SPEED = 1.0;

// random human-looking names for bots (not "Bot 3")
const FIRST = ['Ash', 'Blake', 'Casey', 'Drew', 'Eden', 'Finn', 'Gray', 'Harper', 'Indie', 'Jules',
  'Kai', 'Lane', 'Morgan', 'Nova', 'Oak', 'Parker', 'Quinn', 'Remy', 'Sage', 'Tate',
  'Vale', 'Wren', 'York', 'Zane', 'Ari', 'Beau', 'Cruz', 'Dale', 'Echo', 'Fox'];
const LAST = ['Cole', 'Voss', 'Reed', 'Shaw', 'Pike', 'Cross', 'Stone', 'Frost', 'Drake', 'Hayes',
  'Kane', 'Lane', 'Moss', 'Nash', 'Page', 'Quinn', 'Rook', 'Steel', 'Vance', 'West'];
export function randomBotName(taken = new Set()) {
  for (let i = 0; i < 40; i++) {
    const n = FIRST[Math.floor(Math.random() * FIRST.length)] + ' ' + LAST[Math.floor(Math.random() * LAST.length)];
    if (!taken.has(n.toLowerCase())) return n.slice(0, 16);
  }
  return FIRST[Math.floor(Math.random() * FIRST.length)].slice(0, 16);
}

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
function canSee(T, p, o, sight) {
  const d = Math.hypot(o.x - p.x, o.y - p.y);
  if (d > sight) return false;
  const z0 = p.z + EYE, z1 = o.z + BODY_H / 2;
  for (let t = 0.2 / d; t < 1; t += 0.1 / d)
    if (groundAt(T, p.x + (o.x - p.x) * t, p.y + (o.y - p.y) * t) > z0 + (z1 - z0) * t) return false;
  return true;
}

const turnToward = (a, target, max) => {
  const da = Math.atan2(Math.sin(target - a), Math.cos(target - a));
  return a + Math.max(-max, Math.min(max, da));
};

function accelerate(p, wx, wy, wishSpeed, accel, dt) {
  const add = wishSpeed - (p.vx * wx + p.vy * wy);
  if (add <= 0) return;
  const acc = Math.min(add, accel * wishSpeed * dt);
  p.vx += wx * acc; p.vy += wy * acc;
}

function airAccelerate(p, wx, wy, wishSpeed, dt) {
  const add = Math.min(wishSpeed, AIR_CAP) - (p.vx * wx + p.vy * wy);
  if (add <= 0) return;
  const acc = Math.min(add, AIR_ACCEL * wishSpeed * dt);
  p.vx += wx * acc; p.vy += wy * acc;
}

function applyFriction(p, dt) {
  const sp = Math.hypot(p.vx, p.vy);
  if (sp < 0.01) { p.vx = p.vy = 0; return; }
  const drop = Math.max(sp, STOP_SPEED) * FRICTION * dt;
  const scale = Math.max(sp - drop, 0) / sp;
  p.vx *= scale; p.vy *= scale;
}

export function newBrain() {
  return { goal: null, seenAt: 0, nextShot: 0, stuck: 0, strafe: 1 };
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
  const T = game.T, b = p.brain, dt = TICK / 1000, now = Date.now(), L = BOT_LEVELS[p.level] || BOT_LEVELS.medium;
  const dist = o => Math.hypot(o.x - p.x, o.y - p.y);
  const foe = game.enemies(p).filter(o => canSee(T, p, o, L.sight)).sort((x, y) => dist(x) - dist(y))[0];
  const infected = game.isInfected(p);
  p.vx = p.vx || 0; p.vy = p.vy || 0;

  // Infected pursue reachable survivors; knife bots chase until a blocked path makes them wander.
  const chasing = foe && (infected ? clearPath(T, p, foe) : p.knife && now >= (b.wanderUntil || 0));
  if (chasing) {
    b.goal = { x: foe.x, y: foe.y };
    if (!infected && b.stuck > 10) { b.wanderUntil = now + 1500; b.goal = null; }
  }
  if (infected && chasing && b.target === foe.id && b.seenAt && now - b.seenAt >= L.reaction && dist(foe) > 3 && dist(foe) < 6)
    game.dash(p, foe.x - p.x, foe.y - p.y, now);
  // move toward the current goal, picking a new one on arrival or when blocked
  if (!chasing && (!b.goal || Math.hypot(b.goal.x - p.x, b.goal.y - p.y) < 0.3 || b.stuck > 10)) {
    b.goal = pickGoal(game, p); b.stuck = 0;
  }

  let heading = p.a;
  const stopClose = chasing && foe && dist(foe) < (infected ? WEAPONS.claws.range * 0.65 : 0.8);
  let wx = 0, wy = 0;
  if (b.goal && !stopClose) {
    heading = Math.atan2(b.goal.y - p.y, b.goal.x - p.x);
    // air-strafe: lean left/right while hopping so bhop actually gains speed
    if (!p.onGround) {
      if (Math.random() < 0.04) b.strafe = -b.strafe;
      const side = heading + b.strafe * (Math.PI / 2);
      wx = Math.cos(heading) * 0.7 + Math.cos(side) * 0.7;
      wy = Math.sin(heading) * 0.7 + Math.sin(side) * 0.7;
    } else {
      wx = Math.cos(heading); wy = Math.sin(heading);
    }
    const wl = Math.hypot(wx, wy) || 1;
    wx /= wl; wy /= wl;
  }

  const sprinting = chasing || p.knife || infected;
  let wishSpeed = sprinting ? L.sprint : L.speed;
  if (infected) wishSpeed = MOVE_SPEED * PLAGUE_SPEED_MULTIPLIER;
  else if (p.knife && chasing) wishSpeed = L.sprint * 1.12;

  const dashing = infected && game.gameOn && now < p.dashUntil;
  if (dashing) {
    p.vx = p.dashX * PLAGUE_DASH_SPEED; p.vy = p.dashY * PLAGUE_DASH_SPEED;
  } else {
    // hold jump while moving = continuous bunny hop (same as players holding space)
    tryJump(p, !!(wx || wy) || Math.hypot(p.vx, p.vy) > 0.4, infected ? PLAGUE_JUMPS : 1);
    if (p.onGround) {
      applyFriction(p, dt);
      if (wx || wy) accelerate(p, wx, wy, wishSpeed, ACCEL, dt);
    } else if (wx || wy) {
      airAccelerate(p, wx, wy, wishSpeed, dt);
    }
  }

  let speed = Math.hypot(p.vx, p.vy);
  const cap = infected ? MOVE_SPEED_LIMIT * PLAGUE_SPEED_MULTIPLIER : MOVE_SPEED_LIMIT;
  if (speed > cap) { p.vx *= cap / speed; p.vy *= cap / speed; speed = cap; }

  if (speed > 0.01) {
    const travel = speed * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.1));
    for (let i = 0; i < steps; i++) {
      const nx = p.x + p.vx * dt / steps, ny = p.y + p.vy * dt / steps;
      if (!walkable(T, nx, ny, p.z)) {
        // slide along the first axis that still clears
        if (walkable(T, nx, p.y, p.z)) { p.x = nx; p.vy *= 0.2; }
        else if (walkable(T, p.x, ny, p.z)) { p.y = ny; p.vx *= 0.2; }
        else { p.vx *= -0.15; p.vy *= -0.15; b.stuck++; p.dashUntil = 0; break; }
        b.stuck++;
      } else {
        p.x = nx; p.y = ny;
        if (p.onGround) p.z = groundAt(T, nx, ny);
        b.stuck = Math.max(0, b.stuck - 1);
      }
    }
  }

  if (!p.onGround) {
    p.vz -= MOVE_GRAVITY * dt; p.z += p.vz * dt;
    const floor = groundAt(T, p.x, p.y);
    if (p.z <= floor) { p.z = floor; p.vz = 0; p.onGround = true; }
  } else {
    p.z = groundAt(T, p.x, p.y);
  }

  // turn toward the target and shoot once it has had time to react
  if (!foe || (b.target !== undefined && b.target !== foe.id)) b.seenAt = 0; // new target: react again
  b.target = foe ? foe.id : undefined;
  if (!foe) {
    b.seenAt = 0;
    p.a = turnToward(p.a, heading, L.turn * dt);
    p.p *= 0.9;
    return;
  }
  if (!b.seenAt) b.seenAt = now;
  const d = Math.hypot(foe.x - p.x, foe.y - p.y);
  p.a = turnToward(p.a, Math.atan2(foe.y - p.y, foe.x - p.x), L.turn * dt);
  p.p = (foe.z + BODY_H * 0.55 - (p.z + EYE)) / (d || 1); // bullet pitch is a slope
  if (!game.gameOn || now - b.seenAt < L.reaction || now < b.nextShot) return;
  if (infected) {
    if (d <= WEAPONS.claws.range) {
      b.nextShot = now + WEAPONS.claws.cd;
      game.handlers.shoot.call(game, p, { weapon: 'claws' });
    }
    return;
  }
  if (p.knife) {
    if (d > WEAPONS.blade.range * 0.9) return;
    b.nextShot = now + Math.max(WEAPONS.blade.cd, L.fireGap);
    game.handlers.shoot.call(game, p, { weapon: 'blade' });
    return;
  }
  const gun = Object.keys(p.mag)[0];
  if (!gun) return; // out of ammo altogether
  if (!(p.mag[gun] > 0)) { // out: reload, a little after the last shot like a player would
    if (now - (p.lastShot[gun] || 0) >= WEAPONS[gun].reload) game.handlers.reload.call(game, p, { weapon: gun });
    return;
  }
  b.nextShot = now + L.fireGap * (0.8 + Math.random() * 0.4);
  const a = p.a, pch = p.p;
  p.a += (Math.random() * 2 - 1) * L.aim;
  p.p += (Math.random() * 2 - 1) * L.aim;
  game.handlers.shoot.call(game, p, { weapon: gun });
  p.a = a; p.p = pch;
}
