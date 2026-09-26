// Your movement. Quake-style: holding space re-jumps on landing without ground friction,
// and strafing + turning in the air adds speed (bhop).
import { groundAt, kindAt } from '/shared/terrain.js';
import { S } from './state.js';
import { SENS, MAX_SPEED, ACCEL, AIR_ACCEL, AIR_CAP, FRICTION, STOP_SPEED, GRAVITY, JUMP_V, SPEED_LIMIT, STEP } from './constants.js';
import { send } from './net.js';
import { play, setWind, setSizzle } from './audio.js';
import { burst } from './particles.js';

// highest walkable ground under the player's footprint; walls are solid blockers, not ramps
export function footGround(x, y) {
  const T = S.T, r = 0.2;
  const samples = [
    [x, y],
    [x + r, y + r],
    [x - r, y - r],
    [x + r, y - r],
    [x - r, y + r],
  ];

  let highest = -Infinity;
  for (const [sx, sy] of samples) {
    if (kindAt(T, sx, sy) === 1) return -Infinity;
    highest = Math.max(highest, groundAt(T, sx, sy));
  }
  return highest;
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

  // walls and pit edges block unless you jump over/out
  const tol = S.onGround ? STEP : 0.12;
  const nx = me.x + S.vx * dt;
  if (footGround(nx, me.y) <= me.z + tol) me.x = nx; else S.vx = 0;
  const ny = me.y + S.vy * dt;
  if (footGround(me.x, ny) <= me.z + tol) me.y = ny; else S.vy = 0;

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
