// Your movement. Quake-style: holding space re-jumps on landing without ground friction,
// and strafing + turning in the air adds speed (bhop).
import { groundAt, kindAt } from '/shared/terrain.js';
import { SLIDE } from '/shared/config.js';
import { S } from './state.js';
import { SENS, MAX_SPEED, ACCEL, AIR_ACCEL, AIR_CAP, FRICTION, STOP_SPEED, GRAVITY, JUMP_V, SPEED_LIMIT, STEP } from './constants.js';
import { send } from './net.js';
import { play, setWind, setSizzle } from './audio.js';
import { burst } from './particles.js';
import { settings, held } from './settings.js';

const PLAYER_R = 0.22;

function wallHitbox(x, y) {
  const T = S.T;
  if (!T) return false;

  const minI = Math.floor((x - PLAYER_R) * T.RES), maxI = Math.floor((x + PLAYER_R) * T.RES);
  const minJ = Math.floor((y - PLAYER_R) * T.RES), maxJ = Math.floor((y + PLAYER_R) * T.RES);

  for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
    if (i < 0 || j < 0 || i >= T.TW || j >= T.TH) return true;
    if (T.kind[j * T.TW + i] !== 1) continue;

    const left = i / T.RES, right = (i + 1) / T.RES;
    const top = j / T.RES, bottom = (j + 1) / T.RES;
    const closestX = Math.min(Math.max(x, left), right);
    const closestY = Math.min(Math.max(y, top), bottom);
    const dx = x - closestX, dy = y - closestY;
    if (dx * dx + dy * dy <= PLAYER_R * PLAYER_R) return true;
  }

  return false;
}

// highest walkable ground under the player's footprint; wall height must never count as ground
export function footGround(x, y) {
  const T = S.T;
  if (wallHitbox(x, y)) return -Infinity;

  let highest = -Infinity;
  for (const [sx, sy] of [
    [x, y],
    [x + PLAYER_R, y + PLAYER_R],
    [x - PLAYER_R, y - PLAYER_R],
    [x + PLAYER_R, y - PLAYER_R],
    [x - PLAYER_R, y + PLAYER_R],
    [x + PLAYER_R, y],
    [x - PLAYER_R, y],
    [x, y + PLAYER_R],
    [x, y - PLAYER_R],
  ]) {
    const fx = sx * T.RES - 0.5, fy = sy * T.RES - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy);
    // blend the 4 samples around this point, unless one is a wall: then use the highest non-wall one
    let wall = false, top = -Infinity;
    for (let jj = j; jj <= j + 1; jj++) for (let ii = i; ii <= i + 1; ii++) {
      if (ii < 0 || jj < 0 || ii >= T.TW || jj >= T.TH) continue;
      const k = jj * T.TW + ii;
      if (T.kind[k] === 1) wall = true; else top = Math.max(top, T.hgt[k]);
    }
    if (top === -Infinity) continue; // nothing but wall here
    highest = Math.max(highest, wall ? top : groundAt(T, sx, sy));
  }
  return highest;
}

function resolveWallOverlap(me) {
  if (!wallHitbox(me.x, me.y)) return;

  const dirX = S.vx || 0;
  const dirY = S.vy || 0;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const ring = [];

  for (let r = 0.05; r <= 0.8; r += 0.05) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      ring.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    ring.push([r, 0], [-r, 0], [0, r], [0, -r]);
  }

  if (dirLen > 0) {
    ring.push([dirX / dirLen * 0.18, dirY / dirLen * 0.18]);
    ring.push([dirX / dirLen * 0.32, dirY / dirLen * 0.32]);
  }

  for (const [ox, oy] of ring) {
    const x = me.x + ox, y = me.y + oy;
    if (!wallHitbox(x, y)) { me.x = x; me.y = y; return; }
  }

  for (const [ox, oy] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2], [0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]]) {
    const x = me.x + ox, y = me.y + oy;
    if (!wallHitbox(x, y)) { me.x = x; me.y = y; return; }
  }
}

// can you stand at (x, y) with feet at z? walls block, and so does ground more than `tol` above your feet
const blocked = (x, y, z, tol) => wallHitbox(x, y) || footGround(x, y) > z + tol;

// which way is "out" of whatever is at (x, y): away from the nearby wall samples, weighted by how
// deep they overlap you, or downhill for a rise too steep to step onto; null if there's no clear way
function wallNormal(x, y) {
  const T = S.T, r = PLAYER_R + 0.05;
  let nx = 0, ny = 0;
  const minI = Math.floor((x - r) * T.RES), maxI = Math.floor((x + r) * T.RES);
  const minJ = Math.floor((y - r) * T.RES), maxJ = Math.floor((y + r) * T.RES);
  for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
    const out = i < 0 || j < 0 || i >= T.TW || j >= T.TH;
    if (!out && T.kind[j * T.TW + i] !== 1) continue;
    const cx = Math.min(Math.max(x, i / T.RES), (i + 1) / T.RES), cy = Math.min(Math.max(y, j / T.RES), (j + 1) / T.RES);
    const d = Math.hypot(x - cx, y - cy);
    if (d < r && d > 1e-6) { nx += (x - cx) / d * (r - d); ny += (y - cy) / d * (r - d); }
  }
  if (!nx && !ny) { const e = 0.1; nx = footGround(x - e, y) - footGround(x + e, y); ny = footGround(x, y - e) - footGround(x, y + e); }
  const l = Math.hypot(nx, ny);
  return l > 1e-6 && Number.isFinite(l) ? { x: nx / l, y: ny / l } : null;
}

// move by the velocity in small steps; on bumping into something, drop the part of the velocity
// going into its surface and keep the rest, so you slide around trunks, cones and rough cliffs
function slideMove(me, dt, tol) {
  const n = Math.max(1, Math.ceil(Math.hypot(S.vx, S.vy) * dt / 0.04));
  for (let i = 0; i < n; i++) {
    let dx = S.vx * dt / n, dy = S.vy * dt / n;
    if (!blocked(me.x + dx, me.y + dy, me.z, tol)) { me.x += dx; me.y += dy; continue; }
    const nrm = wallNormal(me.x + dx, me.y + dy);
    if (nrm) {
      const into = S.vx * nrm.x + S.vy * nrm.y;
      if (into < 0) { S.vx -= into * nrm.x; S.vy -= into * nrm.y; }
      dx = S.vx * dt / n; dy = S.vy * dt / n;
      if (!blocked(me.x + dx, me.y + dy, me.z, tol)) { me.x += dx; me.y += dy; continue; }
    }
    // wedged in a corner: try each axis on its own, else stop
    if (!blocked(me.x + dx, me.y, me.z, tol)) { me.x += dx; S.vy = 0; }
    else if (!blocked(me.x, me.y + dy, me.z, tol)) { me.y += dy; S.vx = 0; }
    else { S.vx = S.vy = 0; return; }
  }
}

export const inPit = () => S.me && S.T && kindAt(S.T, S.me.x, S.me.y) === 2 && S.me.z < -0.15;

function accelerate(wx, wy, wishSpeed, accel, dt) {
  const add = wishSpeed - (S.vx * wx + S.vy * wy);
  if (add <= 0) return;
  const acc = Math.min(add, accel * wishSpeed * dt);
  S.vx += acc * wx; S.vy += acc * wy;
}

function airAccelerate(wx, wy, wishSpeed, dt) {
  const add = Math.min(wishSpeed, AIR_CAP) - (S.vx * wx + S.vy * wy);
  if (add <= 0) return;
  const acc = Math.min(add, AIR_ACCEL * wishSpeed * dt);
  S.vx += acc * wx; S.vy += acc * wy;
}

function applyFriction(dt, scale = 1) {
  const sp = Math.hypot(S.vx, S.vy);
  if (sp < 0.001) { S.vx = S.vy = 0; return; }
  const drop = Math.max(sp, STOP_SPEED) * FRICTION * scale * dt;
  const k = Math.max(0, sp - drop) / sp;
  S.vx *= k; S.vy *= k;
}

// start a slide on a fresh press of the slide key (or holding it as you land) while running;
// it ends when you let go, jump, slow down or it runs out
function updateSlide(wx, wy, wl) {
  const now = performance.now(), sp = Math.hypot(S.vx, S.vy);
  if (S.sliding && (!held('slide') || !S.onGround || now > S.slideEnd || sp < 0.8)) {
    S.sliding = false; S.slideReady = now + SLIDE.cooldown;
  }
  if (S.sliding || !S.slideArmed || !held('slide') || !S.onGround || now < S.slideReady || sp < SLIDE.minSpeed) return;
  S.sliding = true; S.slideArmed = false; S.slideEnd = now + SLIDE.time;
  // boost along where you're moving (or where you're pressing, if that's clearer)
  const dx = wl > 0 ? wx : S.vx / sp, dy = wl > 0 ? wy : S.vy / sp;
  S.vx += dx * SLIDE.boost; S.vy += dy * SLIDE.boost;
  S.fovKick = Math.max(S.fovKick, 0.04);
  play('slide');
}

export function updatePlayer(dt) {
  if (!S.started || !S.me) { setWind(0); setSizzle(0); return; }
  const me = S.me;

  const sens = SENS * settings.sens * (!S.scoped ? 1 : S.weapon === 'sniper' ? 0.3 : 0.8);
  me.a += S.mouseDX * sens;
  S.pitch = Math.max(-1.2, Math.min(1.2, S.pitch - S.mouseDY * sens));
  // the gun trails fast mouse movement a little, then settles (see drawViewmodel)
  const k = Math.min(1, dt * 10), lim = v => Math.max(-4, Math.min(4, v));
  S.swayX += (lim(-S.mouseDX / Math.max(dt, 1e-3) * 0.004) - S.swayX) * k;
  S.swayY += (lim(-S.mouseDY / Math.max(dt, 1e-3) * 0.004) - S.swayY) * k;
  S.mouseDX = S.mouseDY = 0;

  const cos = Math.cos(me.a), sin = Math.sin(me.a);
  let fx = 0, sx = 0;
  if (held('forward')) fx++;
  if (held('back')) fx--;
  if (held('right')) sx++;
  if (held('left')) sx--;
  let wx = cos * fx - sin * sx, wy = sin * fx + cos * sx;
  const wl = Math.hypot(wx, wy);
  if (wl > 0) { wx /= wl; wy /= wl; }
  const wishSpeed = wl > 0 ? MAX_SPEED * (S.scoped ? (S.weapon === 'sniper' ? 0.55 : 0.8) : S.weapon === 'blade' ? 1.15 : 1) : 0;

  updateSlide(wx, wy, wl);
  if (S.onGround && held('jump')) { S.vz = JUMP_V; S.onGround = false; play('jump'); }
  if (S.sliding && S.onGround) { applyFriction(dt, SLIDE.friction); accelerate(wx, wy, wishSpeed * 0.3, ACCEL * 0.3, dt); } // glide, steer a little
  else if (S.onGround) { applyFriction(dt); accelerate(wx, wy, wishSpeed, ACCEL, dt); }
  else airAccelerate(wx, wy, wishSpeed, dt);
  S.slideDip += ((S.sliding ? 1 : 0) - S.slideDip) * Math.min(1, dt * 12);

  let speed = Math.hypot(S.vx, S.vy);
  if (speed > SPEED_LIMIT) { S.vx *= SPEED_LIMIT / speed; S.vy *= SPEED_LIMIT / speed; speed = SPEED_LIMIT; }
  S.speed = speed;

  const prevX = me.x, prevY = me.y;
  resolveWallOverlap(me);

  // walls and pit edges block unless you jump over/out (in the air you can still land on a low
  // rise, but not climb out of a pit); slide along whatever you hit instead of stopping dead
  const tol = S.onGround || me.z > -0.1 ? STEP : 0.12;
  slideMove(me, dt, tol);

  if (wallHitbox(me.x, me.y)) {
    me.x = prevX; me.y = prevY;
    S.vx = 0; S.vy = 0;
    resolveWallOverlap(me);
  }

  const g = footGround(me.x, me.y);
  if (S.onGround) {
    if (Number.isFinite(g) && g >= me.z - 0.12) me.z = g;
    else { S.onGround = false; S.vz = 0; } // walked off a ledge into a pit or hit a wall
  }
  if (!S.onGround) {
    S.vz -= GRAVITY * dt;
    me.z += S.vz * dt;
    if (me.z <= g) { me.z = g; S.vz = 0; S.onGround = true; play('land'); }
  }

  if (S.onGround && speed > 0.5 && !S.sliding) {
    S.bobPhase += speed * dt * 2.2;
    S.stepAcc += speed * dt;
    if (S.stepAcc > 0.85) { S.stepAcc = 0; play('step'); }
  }
  setWind(Math.max(0, Math.min(1, (speed - 3) / 6)) * 0.3);
  setSizzle(inPit() ? 0.25 : 0);
  if (inPit() && Math.random() < 0.3) burst(me.x, me.y, me.z, 1, 'fire');

  send({ type: 'input', x: me.x, y: me.y, z: me.z, a: me.a, p: S.pitch, sc: S.scoped && S.weapon === 'sniper', sl: S.sliding, seq: S.mySeq });
}
