// Your movement. Quake-style: holding space re-jumps on landing without ground friction,
// and strafing + turning in the air adds speed (bhop).
import { groundAt, kindAt } from '/shared/terrain.js';
import { S } from './state.js';
import { SENS, MAX_SPEED, ACCEL, AIR_ACCEL, AIR_CAP, FRICTION, STOP_SPEED, GRAVITY, JUMP_V, SPEED_LIMIT, STEP } from './constants.js';
import { send } from './net.js';
import { play, setWind, setSizzle } from './audio.js';
import { burst } from './particles.js';

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
    let valid = false;
    for (let jj = j; jj <= j + 1; jj++) for (let ii = i; ii <= i + 1; ii++) {
      if (ii < 0 || jj < 0 || ii >= T.TW || jj >= T.TH) continue;
      if (T.kind[jj * T.TW + ii] === 1) { valid = false; break; }
      valid = true;
    }
    if (!valid) continue;
    highest = Math.max(highest, groundAt(T, sx, sy));
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

function applyFriction(dt) {
  const sp = Math.hypot(S.vx, S.vy);
  if (sp < 0.001) { S.vx = S.vy = 0; return; }
  const drop = Math.max(sp, STOP_SPEED) * FRICTION * dt;
  const k = Math.max(0, sp - drop) / sp;
  S.vx *= k; S.vy *= k;
}

export function updatePlayer(dt) {
  if (!S.started || !S.me) { setWind(0); setSizzle(0); return; }
  const me = S.me, keys = S.keys;

  const sens = SENS * (S.scoped ? 0.3 : 1);
  me.a += S.mouseDX * sens;
  S.pitch = Math.max(-1.2, Math.min(1.2, S.pitch - S.mouseDY * sens));
  S.mouseDX = S.mouseDY = 0;

  const cos = Math.cos(me.a), sin = Math.sin(me.a);
  let fx = 0, sx = 0;
  if (keys['w']) fx++;
  if (keys['s']) fx--;
  if (keys['d']) sx++;
  if (keys['a']) sx--;
  let wx = cos * fx - sin * sx, wy = sin * fx + cos * sx;
  const wl = Math.hypot(wx, wy);
  if (wl > 0) { wx /= wl; wy /= wl; }
  const wishSpeed = wl > 0 ? MAX_SPEED * (S.scoped ? 0.55 : S.weapon === 'blade' ? 1.15 : 1) : 0;

  if (S.onGround && keys[' ']) { S.vz = JUMP_V; S.onGround = false; play('jump'); }
  if (S.onGround) { applyFriction(dt); accelerate(wx, wy, wishSpeed, ACCEL, dt); }
  else airAccelerate(wx, wy, wishSpeed, dt);

  let speed = Math.hypot(S.vx, S.vy);
  if (speed > SPEED_LIMIT) { S.vx *= SPEED_LIMIT / speed; S.vy *= SPEED_LIMIT / speed; speed = SPEED_LIMIT; }
  S.speed = speed;

  const prevX = me.x, prevY = me.y;
  resolveWallOverlap(me);

  // walls and pit edges block unless you jump over/out; sweep in small steps so we never clip through a wall
  const tol = S.onGround ? STEP : 0.12;
  const moveAxis = (axis, value) => {
    const step = 0.05; const n = Math.max(1, Math.ceil(Math.abs(value) / step));
    const dv = value / n;
    for (let i = 0; i < n; i++) {
      const next = (axis === 'x' ? me.x : me.y) + dv;
      const x = axis === 'x' ? next : me.x;
      const y = axis === 'y' ? next : me.y;
      if (wallHitbox(x, y)) {
        if (axis === 'x') S.vx = 0; else S.vy = 0;
        return;
      }
      if (footGround(x, y) <= me.z + tol) {
        if (axis === 'x') me.x = next; else me.y = next;
      } else {
        if (axis === 'x') S.vx = 0; else S.vy = 0;
        return;
      }
    }
  };

  if (S.vx) moveAxis('x', S.vx * dt);
  if (S.vy) moveAxis('y', S.vy * dt);

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

  if (S.onGround && speed > 0.5) {
    S.bobPhase += speed * dt * 2.2;
    S.stepAcc += speed * dt;
    if (S.stepAcc > 0.85) { S.stepAcc = 0; play('step'); }
  }
  setWind(Math.max(0, Math.min(1, (speed - 3) / 6)) * 0.3);
  setSizzle(inPit() ? 0.25 : 0);
  if (inPit() && Math.random() < 0.3) burst(me.x, me.y, me.z, 1, 'fire');

  send({ type: 'input', x: me.x, y: me.y, z: me.z, a: me.a, p: S.pitch, sc: S.scoped, seq: S.mySeq });
}
