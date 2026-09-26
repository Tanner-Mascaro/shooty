// Server-side bot. It wanders between random reachable spots, seeks gun crates when it has room,
// and shoots the latest gun it picked up at the nearest enemy it can see. It refills from ammo
// crates it happens to walk over. How good it is depends on its level (LEVELS).
// Some bots (KNIFE_CHANCE) never shoot: they sprint at the nearest enemy they can see and stab.
// Some (NADE_CHANCE) get endless grenades and just lob them.
// Movement uses the same accelerate / air-strafe / hold-jump bhop model as players.
import { TICK, EYE, BODY_H, WEAPONS, GUN_SLOTS, PLAGUE_SPEED_MULTIPLIER, PLAGUE_JUMPS, PLAGUE_DASH_SPEED, MOVE_SPEED, MOVE_SPEED_LIMIT, MOVE_GRAVITY } from '../shared/config.js';
import { tryJump } from '../shared/movement.js';
import { MW, MH } from '../shared/levels.js';
import { kindAt, walkHeight, solidAt } from '../shared/terrain.js';

// speed: walk wish-speed (map units / s); sprint: chase wish-speed; sight/reaction/aim as before
export const BOT_LEVELS = {
  easy:   { speed: 2.4, sprint: 3.0, sight: 15, reaction: 800, fireGap: 600, aim: 0.13, turn: 3.5 },
  medium: { speed: 2.8, sprint: 3.2, sight: 25, reaction: 400, fireGap: 320, aim: 0.06, turn: 6 },
  hard:   { speed: 3.0, sprint: 3.6, sight: 32, reaction: 200, fireGap: 220, aim: 0.025, turn: 11 },
};

export const KNIFE_CHANCE = 0.25;
export const NADE_CHANCE = 0.2;

const ACCEL = 18, AIR_ACCEL = 12, AIR_CAP = 0.28, FRICTION = 5, STOP_SPEED = 1.0;
const GUN_RANGES = {
  shotgun: [2.5, 5.5], smg: [5, 10], uzi: [5, 10],
  pistol: [6, 11], deagle: [6, 12], revolver: [6, 12],
  rifle: [8, 15], burst: [8, 15], carbine: [8, 15], beam: [8, 16],
  lmg: [9, 16], crossbow: [10, 19], sniper: [13, 23],
};

// random witchy names for bots (not "Bot 3")
const FIRST = ['Willow', 'Raven', 'Nyx', 'Luna', 'Briar', 'Thorn', 'Ivy', 'Circe', 'Hex',
  'Rowan', 'Sable', 'Vesper', 'Aster', 'Fern', 'Hazel', 'Onyx', 'Rue', 'Twyla',
  'Yarrow', 'Agatha', 'Morrigan', 'Elspeth', 'Juniper', 'Coven', 'Wisp', 'Bramble',
  'Hecate', 'Morgana', 'Selene', 'Ophelia'];
const LAST = ['Grim', 'Crowe', 'Shade', 'Bramble', 'Ashwood', 'Night', 'Hollow',
  'Boggs', 'Dusk', 'Ember', 'Grave', 'Hexwell', 'Thorn', 'Wyrd', 'Moss',
  'Raven', 'Spell', 'Blackwood', 'Fog', 'Cinder'];
export function randomBotName(taken = new Set()) {
  for (let i = 0; i < 40; i++) {
    const n = FIRST[Math.floor(Math.random() * FIRST.length)] + ' ' + LAST[Math.floor(Math.random() * LAST.length)];
    if (!taken.has(n.toLowerCase())) return n.slice(0, 16);
  }
  return FIRST[Math.floor(Math.random() * FIRST.length)].slice(0, 16);
}

// true if feet can stand at (x, y) coming from height z: no walls, no pits
function walkable(T, x, y, z) {
  return kindAt(T, x, y) === 0 && walkHeight(T, x, y, z) <= z + 0.3;
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

const HARDPOINT_UNREACHABLE = 0xffff;
const HARDPOINT_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const hardpointFields = new WeakMap();

function routePositionOpen(T, x, y) {
  return kindAt(T, x, y) === 0
    && kindAt(T, x + 0.22, y) === 0 && kindAt(T, x - 0.22, y) === 0
    && kindAt(T, x, y + 0.22) === 0 && kindAt(T, x, y - 0.22) === 0
    && kindAt(T, x + 0.155, y + 0.155) === 0 && kindAt(T, x + 0.155, y - 0.155) === 0
    && kindAt(T, x - 0.155, y + 0.155) === 0 && kindAt(T, x - 0.155, y - 0.155) === 0;
}

// Like clearPath, but follows the ground height. Hardpoint routes can cross gentle slopes,
// where testing every point at z=0 would incorrectly mark the hillside as blocked.
function routeClearPath(T, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 0.1));
  const nx = -(b.y - a.y) / (d || 1) * 0.25, ny = (b.x - a.x) / (d || 1) * 0.25;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (!routePositionOpen(T, x, y) || !routePositionOpen(T, x + nx, y + ny) || !routePositionOpen(T, x - nx, y - ny)) return false;
  }
  return true;
}

function hardpointField(T, hill) {
  let fields = hardpointFields.get(T);
  if (!fields) { fields = new Map(); hardpointFields.set(T, fields); }
  const key = `${hill.index}:${hill.x}:${hill.y}`;
  if (fields.has(key)) return fields.get(key);

  const count = MW * MH, distance = new Uint16Array(count);
  distance.fill(HARDPOINT_UNREACHABLE);
  const queue = new Int32Array(count);
  let goal = -1, goalScore = Infinity;
  for (let radius = 0; radius <= 3 && goal < 0; radius++) {
    for (let y = Math.max(0, Math.floor(hill.y) - radius); y <= Math.min(MH - 1, Math.floor(hill.y) + radius); y++) {
      for (let x = Math.max(0, Math.floor(hill.x) - radius); x <= Math.min(MW - 1, Math.floor(hill.x) + radius); x++) {
        const point = { x: x + 0.5, y: y + 0.5 };
        if (!routePositionOpen(T, point.x, point.y)) continue;
        const score = Math.hypot(point.x - hill.x, point.y - hill.y);
        if (score < goalScore) { goal = y * MW + x; goalScore = score; }
      }
    }
  }
  let head = 0, tail = 0;
  if (goal >= 0) {
    distance[goal] = 0;
    queue[tail++] = goal;
  }
  while (head < tail) {
    const at = queue[head++], x = at % MW, y = Math.floor(at / MW);
    for (const [dx, dy] of HARDPOINT_STEPS) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
      const next = ty * MW + tx;
      if (distance[next] !== HARDPOINT_UNREACHABLE) continue;
      const a = { x: x + 0.5, y: y + 0.5 }, b = { x: tx + 0.5, y: ty + 0.5 };
      if (!routePositionOpen(T, b.x, b.y) || !routeClearPath(T, a, b)) continue;
      distance[next] = distance[at] + 1;
      queue[tail++] = next;
    }
  }
  const field = { distance, goal, goalPoint: goal >= 0 ? { x: goal % MW + 0.5, y: Math.floor(goal / MW) + 0.5 } : null };
  fields.set(key, field);
  if (fields.size > 32) fields.delete(fields.keys().next().value);
  return field;
}

function makeHardpointRoute(T, p, hill) {
  const { distance, goal, goalPoint } = hardpointField(T, hill);
  if (goal < 0) return [];
  const px = Math.floor(p.x), py = Math.floor(p.y);
  let start = -1, best = Infinity, fallbackStart = -1, fallbackBest = Infinity;
  for (let radius = 0; radius <= 8 && start < 0; radius++) {
    for (let y = Math.max(0, py - radius); y <= Math.min(MH - 1, py + radius); y++) {
      for (let x = Math.max(0, px - radius); x <= Math.min(MW - 1, px + radius); x++) {
        if (Math.max(Math.abs(x - px), Math.abs(y - py)) !== radius) continue;
        const id = y * MW + x, point = { x: x + 0.5, y: y + 0.5 };
        if (distance[id] === HARDPOINT_UNREACHABLE || !routePositionOpen(T, point.x, point.y)) continue;
        const score = Math.hypot(point.x - p.x, point.y - p.y) + distance[id] * 0.025;
        if (score < fallbackBest) { fallbackStart = id; fallbackBest = score; }
        if (!routeClearPath(T, p, point)) continue;
        if (score < best) { start = id; best = score; }
      }
    }
    if (start >= 0) break;
  }
  if (start < 0) start = fallbackStart;
  if (start < 0) return [];

  const nodes = [start];
  let at = start;
  while (at !== goal && nodes.length < MW * MH) {
    const x = at % MW, y = Math.floor(at / MW), nextOptions = [];
    for (const [dx, dy] of HARDPOINT_STEPS) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
      const next = ty * MW + tx;
      if (distance[next] !== distance[at] - 1) continue;
      if (routeClearPath(T, { x: x + 0.5, y: y + 0.5 }, { x: tx + 0.5, y: ty + 0.5 })) nextOptions.push(next);
    }
    if (!nextOptions.length) break;
    at = nextOptions[Math.floor(Math.random() * nextOptions.length)];
    nodes.push(at);
  }

  // Skip intermediate tile centers when a straight, body-width route remains clear.
  const route = [];
  let from = { x: p.x, y: p.y }, cursor = 0;
  while (cursor < nodes.length) {
    let furthest = cursor;
    for (let i = cursor; i < Math.min(nodes.length, cursor + 12); i++) {
      const point = { x: nodes[i] % MW + 0.5, y: Math.floor(nodes[i] / MW) + 0.5 };
      if (routeClearPath(T, from, point)) furthest = i;
    }
    const id = nodes[furthest];
    from = { x: id % MW + 0.5, y: Math.floor(id / MW) + 0.5 };
    route.push(from);
    cursor = furthest + 1;
  }
  return route.length ? route : goalPoint ? [goalPoint] : [];
}

function hardpointWaypoint(T, p, hill, brain, slot = 'hardpoint', forceReplan = false) {
  const key = `${hill.index}:${hill.x}:${hill.y}`;
  const keyField = `${slot}RouteKey`, routeField = `${slot}Route`, indexField = `${slot}RouteIndex`;
  if (brain[keyField] !== key || forceReplan || brain.stuck > 10 || !brain[routeField]) {
    brain[keyField] = key;
    brain[routeField] = makeHardpointRoute(T, p, hill);
    brain[indexField] = 0;
    brain.stuck = 0;
  }
  if (slot === 'combat' && !brain[routeField].length) return null;
  while (brain[indexField] < brain[routeField].length) {
    const waypoint = brain[routeField][brain[indexField]];
    if (Math.hypot(waypoint.x - p.x, waypoint.y - p.y) >= 0.45) return waypoint;
    brain[indexField]++;
  }
  return brain[routeField].at(-1) || { x: hill.x, y: hill.y };
}

// a bullet from the bot's eye would reach the target's chest
function canSee(T, p, o, sight) {
  const d = Math.hypot(o.x - p.x, o.y - p.y);
  if (d > sight) return false;
  const z0 = p.z + EYE, z1 = o.z + BODY_H / 2;
  for (let t = 0.2 / d; t < 1; t += 0.1 / d) {
    const z = z0 + (z1 - z0) * t;
    if (solidAt(T, p.x + (o.x - p.x) * t, p.y + (o.y - p.y) * t, z) > z) return false;
  }
  return true;
}

function botGun(p, b, d) {
  const guns = Object.keys(p.mag);
  if (guns.includes(b.weapon)) return b.weapon;
  return guns.includes('sniper') && d > 5 ? 'sniper'
    : guns.includes('beam') && d > 4 ? 'beam'
    : guns.includes('crossbow') && d > 3 ? 'crossbow'
    : guns.find(w => w !== 'pistol') || guns[0];
}

function engagementPoint(p, foe, gun, side) {
  const [min, max] = GUN_RANGES[gun] || GUN_RANGES.pistol;
  const dx = p.x - foe.x, dy = p.y - foe.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const distance = Math.max(min + 0.4, Math.min(max - 0.6, d));
  const orbit = d >= min && d <= max ? 1.1 : 0;
  return { x: foe.x + ux * distance - uy * side * orbit, y: foe.y + uy * distance + ux * side * orbit };
}

function findCover(T, p, foe, sight, minRange, maxRange) {
  let best = null, bestScore = Infinity;
  for (let r = 0.5; r <= 3; r += 0.5) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    const z = walkHeight(T, x, y, p.z), candidate = { x, y, z };
    const d = Math.hypot(foe.x - x, foe.y - y);
    if (d < minRange || d > maxRange || !walkable(T, x, y, z) || !clearPath(T, p, candidate) || canSee(T, candidate, foe, sight)) continue;
    const score = r + Math.abs(d - (minRange + maxRange) / 2) * 0.2;
    if (score < bestScore) { best = { x, y }; bestScore = score; }
  }
  return best;
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
  return { goal: null, seenAt: 0, nextShot: 0, nextNade: 0, stuck: 0, strafe: 1, bhop: Math.random() < 0.4 };
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
  const hill = game.mode === 'hardpoint' ? game.hardpointTarget(now) : null;
  const visibleEnemies = game.enemies(p).filter(o => canSee(T, p, o, L.sight));
  const foe = visibleEnemies.sort((x, y) => {
    const xThreat = hill && Math.hypot(x.x - hill.x, x.y - hill.y) <= hill.radius + 5 ? 0 : 1;
    const yThreat = hill && Math.hypot(y.x - hill.x, y.y - hill.y) <= hill.radius + 5 ? 0 : 1;
    return xThreat - yThreat || dist(x) - dist(y);
  })[0];
  const infected = game.isInfected(p);
  if (foe) b.lastSeen = { id: foe.id, x: foe.x, y: foe.y, at: now };
  const hillDistance = hill ? Math.hypot(hill.x - p.x, hill.y - p.y) : Infinity;
  const forceRouteReplan = b.stuck > 10;
  const hardpointGoal = hill && hillDistance > hill.radius * 0.65
    ? hardpointWaypoint(T, p, hill, b, 'hardpoint', forceRouteReplan) : null;
  const hardpointHold = !!hill && !hardpointGoal;
  const hillAnchor = hill && game.list
    .filter(o => o.team === p.team && Math.hypot(o.x - hill.x, o.y - hill.y) <= hill.radius
      && o.z - walkHeight(T, o.x, o.y, o.z) <= 0.55)
    .sort((a, c) => (a.bot ? 1 : 0) - (c.bot ? 1 : 0) || a.id - c.id)[0];
  const leadBot = hill && game.list.filter(o => o.bot && o.team === p.team).sort((a, c) => a.id - c.id)[0];
  const selectedGun = botGun(p, b, foe ? dist(foe) : 10);
  p.vx = p.vx || 0; p.vy = p.vy || 0;

  // Infected pursue reachable survivors; knife / nade bots chase until a blocked path makes them wander.
  const chasing = foe && (infected ? clearPath(T, p, foe) : (p.knife || p.nadeBot) && now >= (b.wanderUntil || 0));
  let tacticalGoal = null, holdInCover = false;
  b.combatSprint = false;
  if (foe && !infected && !p.knife && !p.nadeBot && selectedGun) {
    const d = dist(foe), [min, max] = GUN_RANGES[selectedGun] || GUN_RANGES.pistol;
    if (b.coverGoal && (selectedGun !== 'sniper' || b.coverTarget !== foe.id)) b.coverGoal = null;
    if (selectedGun === 'sniper' && (!b.coverGoal || now >= b.coverUntil || b.coverTarget !== foe.id) && now >= (b.coverSearchAt || 0)) {
      b.coverSearchAt = now + 5000;
      const cover = findCover(T, p, foe, L.sight, min, max);
      if (cover) {
        b.coverGoal = cover; b.coverTarget = foe.id; b.coverUntil = now + 7000;
        b.coverHoldUntil = 0;
      }
    }
    if (b.coverGoal && now < b.coverUntil && b.coverTarget === foe.id) {
      tacticalGoal = b.coverGoal;
    } else {
      if (now >= (b.combatSideUntil || 0)) {
        b.combatSide = Math.random() < 0.5 ? -1 : 1;
        b.combatSideUntil = now + 1800;
      }
      tacticalGoal = engagementPoint(p, foe, selectedGun, b.combatSide || 1);
      b.combatSprint = d < min - 0.5 || d > max + 0.5;
    }
  } else if (!foe && b.coverGoal) {
    if (now >= b.coverUntil) {
      b.coverGoal = null;
    } else {
      tacticalGoal = b.coverGoal;
      if (Math.hypot(p.x - b.coverGoal.x, p.y - b.coverGoal.y) < 0.4) {
        if (!b.coverHoldUntil) b.coverHoldUntil = now + 900;
        if (now < b.coverHoldUntil) holdInCover = true;
        else b.coverGoal = null;
      }
    }
  }
  const needsGun = !infected && !p.knife && !p.nadeBot && Object.keys(p.mag).length < GUN_SLOTS;
  const gunPickup = needsGun && game.pickups
    .filter(pu => pu.active && pu.gun && pu.crate && p.mag[pu.weapon] === undefined && clearPath(T, p, pu))
    .sort((a, c) => dist(a) - dist(c))[0];
  const rememberedThreat = !foe && hill && b.lastSeen && now - b.lastSeen.at <= 1800
    && Math.hypot(b.lastSeen.x - hill.x, b.lastSeen.y - hill.y) <= hill.radius + 5 ? b.lastSeen : null;
  const combatTarget = foe || rememberedThreat;
  const foeNearHill = hill && combatTarget && Math.hypot(combatTarget.x - hill.x, combatTarget.y - hill.y) <= hill.radius + 5;
  const shouldFightForHill = hillAnchor ? hillAnchor !== p : leadBot === p;
  const combatDestination = combatTarget && (tacticalGoal || (
    selectedGun && !p.knife && !p.nadeBot
      ? engagementPoint(p, combatTarget, selectedGun, b.combatSide || 1)
      : { x: combatTarget.x, y: combatTarget.y }
  ));
  const combatRouteTarget = combatDestination && {
    index: `combat-${combatTarget.id}`,
    x: Math.floor(combatDestination.x) + 0.5,
    y: Math.floor(combatDestination.y) + 0.5,
  };
  const hardpointCombatGoal = foeNearHill && hillDistance <= hill.radius + 6 && shouldFightForHill && combatRouteTarget
    ? hardpointWaypoint(T, p, combatRouteTarget, b, 'combat', forceRouteReplan)
    : null;
  if (hardpointCombatGoal) {
    b.goal = hardpointCombatGoal;
    b.pickupGoal = false;
    b.combatGoal = true;
  } else if (hardpointGoal) {
    b.goal = hardpointGoal;
    b.pickupGoal = false;
    b.combatGoal = false;
  } else if (hardpointHold) {
    b.goal = null;
    b.pickupGoal = false;
    b.combatGoal = false;
  } else if (chasing) {
    b.goal = { x: foe.x, y: foe.y };
    b.pickupGoal = false;
    b.combatGoal = false;
    if (!infected && b.stuck > 10) { b.wanderUntil = now + 1500; b.goal = null; }
  } else if (tacticalGoal) {
    b.goal = tacticalGoal;
    b.pickupGoal = false;
    b.combatGoal = true;
  } else if (gunPickup) {
    b.goal = { x: gunPickup.x, y: gunPickup.y };
    b.pickupGoal = true;
  }
  if (infected && chasing && b.target === foe.id && b.seenAt && now - b.seenAt >= L.reaction && dist(foe) > 3 && dist(foe) < 6)
    game.dash(p, foe.x - p.x, foe.y - p.y, now);
  // move toward the current goal, picking a new one on arrival or when blocked
  if (!hardpointGoal && !hardpointHold && !chasing && !tacticalGoal && !gunPickup && (!b.goal || Math.hypot(b.goal.x - p.x, b.goal.y - p.y) < 0.3 || b.stuck > 10 || b.pickupGoal || b.combatGoal)) {
    b.goal = pickGoal(game, p); b.stuck = 0; b.pickupGoal = false; b.combatGoal = false;
  }

  let heading = p.a;
  const stopClose = hardpointHold && !hardpointCombatGoal
    || (!hardpointGoal && !hardpointHold && (holdInCover || chasing && foe && dist(foe) < (infected ? WEAPONS.claws.range * 0.65 : p.nadeBot ? 4 : 0.8)));
  let wx = 0, wy = 0;
  if (b.goal && !stopClose) {
    heading = Math.atan2(b.goal.y - p.y, b.goal.x - p.x);
    // air-strafe only for hoppers; walkers keep a straight wish dir
    if (!p.onGround && b.bhop) {
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

  const sprinting = !!hardpointGoal || chasing || p.knife || p.nadeBot || infected || b.pickupGoal || b.combatSprint;
  let wishSpeed = sprinting ? L.sprint : L.speed;
  if (infected) wishSpeed = MOVE_SPEED * PLAGUE_SPEED_MULTIPLIER;
  else if (p.knife && chasing) wishSpeed = L.sprint * 1.12;

  const dashing = infected && game.gameOn && now < p.dashUntil;
  if (dashing) {
    p.vx = p.dashX * PLAGUE_DASH_SPEED; p.vy = p.dashY * PLAGUE_DASH_SPEED;
  } else {
    // run on the ground first — jumping with no speed just hops in place
    if (p.onGround) {
      applyFriction(p, dt);
      if (wx || wy) accelerate(p, wx, wy, wishSpeed, ACCEL, dt);
    }
    const spd = Math.hypot(p.vx, p.vy);
    // only some bots bunny-hop; the rest just sprint/walk on the ground
    const wantJump = b.bhop && sprinting && !!(wx || wy) && (spd > wishSpeed * 0.8 || !p.onGround);
    tryJump(p, wantJump, infected ? PLAGUE_JUMPS : 1);
    if (!p.onGround && (wx || wy)) airAccelerate(p, wx, wy, wishSpeed, dt);
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
        if (p.onGround) p.z = walkHeight(T, nx, ny, p.z);
        b.stuck = Math.max(0, b.stuck - 1);
      }
    }
  }

  if (!p.onGround) {
    p.vz -= MOVE_GRAVITY * dt; p.z += p.vz * dt;
    const floor = walkHeight(T, p.x, p.y, p.z);
    if (p.z <= floor) { p.z = floor; p.vz = 0; p.onGround = true; }
  } else {
    p.z = walkHeight(T, p.x, p.y, p.z);
  }

  // Sliding against a tree can produce tiny steps without increasing `stuck`; watch whether
  // the current waypoint is actually getting closer and force a fresh route if it isn't.
  if (b.goal && (wx || wy)) {
    const goalKey = `${Math.round(b.goal.x * 2)}:${Math.round(b.goal.y * 2)}`;
    const remaining = Math.hypot(b.goal.x - p.x, b.goal.y - p.y);
    if (b.progressGoalKey !== goalKey) {
      b.progressGoalKey = goalKey;
      b.progressAt = now;
      b.progressRemaining = remaining;
    } else if (now - (b.progressAt || 0) >= 800) {
      if (b.progressRemaining - remaining < 0.35) b.stuck = Math.max(11, b.stuck);
      b.progressAt = now;
      b.progressRemaining = remaining;
    }
  } else {
    b.progressGoalKey = null;
    b.progressAt = now;
    b.progressRemaining = 0;
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
  p.p = Math.atan2(foe.z + BODY_H * 0.55 - (p.z + EYE), d || 1); // look angle; combat turns this into a slope
  if (!game.gameOn || now - b.seenAt < L.reaction || now < b.nextShot) return;
  if (infected) {
    if (d <= WEAPONS.claws.range) {
      b.nextShot = now + WEAPONS.claws.cd;
      game.handlers.shoot.call(game, p, { weapon: 'claws' });
    }
    return;
  }
  if (p.nadeBot) {
    p.nades = 99; // endless pouch
    if (game.mode === 'snipers' || now < (b.nextNade || 0)) return;
    const aim = Math.atan2(foe.y - p.y, foe.x - p.x);
    const da = Math.abs(Math.atan2(Math.sin(aim - p.a), Math.cos(aim - p.a)));
    if (da > 0.4) return; // still turning onto the throw
    if (d > 18) return; // don't lob across the whole map
    p.p = 0.28 + Math.min(0.5, d / 32); // lob farther targets higher
    b.nextNade = now + 2800 + Math.random() * 2200; // ~3–5s between throws
    game.handlers.nade.call(game, p);
    return;
  }
  if (p.knife) {
    if (d > WEAPONS.blade.range * 0.9) return;
    b.nextShot = now + Math.max(WEAPONS.blade.cd, L.fireGap);
    game.handlers.shoot.call(game, p, { weapon: 'blade' });
    return;
  }
  const gun = botGun(p, b, d);
  if (!gun) return; // out of ammo altogether
  if (!(p.mag[gun] > 0)) { // out: reload, a little after the last shot like a player would
    if (now - (p.lastShot[gun] || 0) >= WEAPONS[gun].reload) game.handlers.reload.call(game, p, { weapon: gun });
    return;
  }
  b.nextShot = now + L.fireGap * (0.8 + Math.random() * 0.4);
  const a = p.a, pch = p.p;
  p.a += (Math.random() * 2 - 1) * L.aim;
  p.p += (Math.random() * 2 - 1) * L.aim;
  if (gun === 'sniper') p.sc = true; // bots scope for the zero hip-fire spread
  game.handlers.shoot.call(game, p, { weapon: gun });
  p.a = a; p.p = pch;
}
