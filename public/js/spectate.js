// While you're dead the camera follows someone: your killer, or in battle royale anyone still
// standing (click to switch). It moves S.me itself; the server ignores you until it respawns you,
// and that respawn's new seq snaps S.me back to your spawn (net.js state).
import { EYE, BODY_H } from '/shared/config.js';
import { kindAt, groundAt } from '/shared/terrain.js';
import { S } from './state.js';
import { BASE_FOV } from './constants.js';
import { setWind, setSizzle } from './audio.js';

const BACK = 2.6, UP = 1.0; // chase camera: this far behind and above the one you watch
const LOOK_S = 0.8; // seconds spent looking at your killer from your body first
const KILLCAM_MS = 2600; // when someone killed you: a look from where you fell, zooming in on them
const KILLCAM_MIN = 3.2; // never closer to them than this (stabbed from behind, say)

const standing = id => { const o = S.others[id]; return !!(o && o.now && o.cur && !o.cur.dead); };

// respawnMs: when you're back (null: not until the match ends)
export function enterSpectate(killer, respawnMs, weapon) {
  S.dead = true;
  S.spectateId = killer != null && killer !== S.myId ? killer : null;
  S.killcam = S.spectateId != null ? { id: S.spectateId, weapon, until: performance.now() + KILLCAM_MS } : null;
  S.killcamFov = 0;
  S.respawnAt = respawnMs == null ? null : performance.now() + respawnMs;
  S.deathAt = S.me ? { x: S.me.x, y: S.me.y, z: S.me.z } : null;
  S.specCam = S.me ? { x: S.me.x, y: S.me.y, z: S.me.z + EYE, orbit: S.me.a } : null;
  S.scoped = false; S.reloading = null; S.mouseHeld = false; S.aimHeld = false; S.buildMode = false;
  S.sliding = false; S.slideDip = 0; S.vx = S.vy = S.vz = 0;
}

export function leaveSpectate() {
  S.killcam = null; S.killcamFov = 0;
  S.dead = false; S.spectateId = null; S.respawnAt = 0; S.deathAt = null; S.specCam = null;
}

// watch the next player still standing
export function cycleSpectate() {
  const ids = Object.keys(S.others).map(Number).filter(standing).sort((a, b) => a - b);
  if (ids.length) S.spectateId = ids[(ids.indexOf(S.spectateId) + 1) % ids.length];
}

// per frame instead of updatePlayer
export function updateSpectate(dt) {
  const me = S.me, cam = S.specCam;
  S.mouseDX = S.mouseDY = 0;
  setWind(0); setSizzle(0);
  if (!me || !cam) return;
  if (S.spectateId != null && !standing(S.spectateId)) S.spectateId = null;
  if (S.spectateId == null && S.respawnAt === null) cycleSpectate(); // out for good: keep watching someone

  const t = S.spectateId != null ? S.others[S.spectateId].now : null;
  // killcam: from where you fell, turn to your killer and zoom in on them (render/index.js
  // narrows the view by S.killcamFov; the killer is drawn through walls, gl/entities.js)
  const kc = S.killcam;
  const kt = kc && (t || S.others[kc.id]?.cur); // their last known spot if this frame has none
  if (kc && (performance.now() > kc.until || !kt)) { S.killcam = null; S.killcamFov = 0; cam.age = LOOK_S; }
  else if (kc && S.deathAt) {
    const d = S.deathAt, tx = kt.x, ty = kt.y, tz = kt.z + BODY_H * 0.55;
    // from where you fell; up close (a stab), back off along the same line so they fit on screen
    let ux = d.x - tx, uy = d.y - ty, near = Math.hypot(ux, uy);
    if (near < 0.01) { ux = -Math.cos(kt.a || 0); uy = -Math.sin(kt.a || 0); near = 0; } else { ux /= near; uy /= near; }
    const z = d.z + EYE + 0.12;
    let back = near;
    for (let r = near; r <= KILLCAM_MIN; r += 0.1) {
      const bx = tx + ux * r, by = ty + uy * r;
      if (kindAt(S.T, bx, by) === 1 && groundAt(S.T, bx, by) > z - 0.3) break; // a wall: stop short of it
      back = r;
    }
    const x = tx + ux * back, y = ty + uy * back;
    cam.x = x; cam.y = y; cam.z = z;
    me.x = x; me.y = y; me.z = z - EYE;
    const dist = Math.hypot(tx - x, ty - y) || 1;
    const age = 1 - (kc.until - performance.now()) / KILLCAM_MS, ease = Math.min(1, age / 0.35);
    const wantA = Math.atan2(ty - y, tx - x), wantP = Math.atan2(tz - z, dist);
    me.a += Math.atan2(Math.sin(wantA - me.a), Math.cos(wantA - me.a)) * Math.min(1, dt * 14);
    S.pitch += (wantP - S.pitch) * Math.min(1, dt * 14);
    // zoom so they fill about a third of the screen's height (never wider than normal)
    const tight = Math.min(1, 2 * Math.atan(1.6 / dist) / BASE_FOV); // a fraction of the normal view
    S.killcamFov = 1 + (tight - 1) * Math.min(1, Math.max(0, (age - 0.12) / 0.45)) * ease;
    S.speed = 0;
    return;
  }
  let fx, fy, fz, a;
  if (t) { fx = t.x; fy = t.y; fz = t.z + BODY_H * 0.6; a = t.a; }
  else { // circle slowly over where you fell
    const d = S.deathAt || me;
    fx = d.x; fy = d.y; fz = d.z + 0.3;
    cam.orbit += dt * 0.4; a = cam.orbit;
  }
  // back off behind the target, stopping short of any wall in the way
  const camZ = fz + UP;
  let back = 0.3;
  for (; back < BACK; back += 0.1) {
    const x = fx - Math.cos(a) * back, y = fy - Math.sin(a) * back;
    if (kindAt(S.T, x, y) === 1 && groundAt(S.T, x, y) > camZ - 0.3) { back = Math.max(0.3, back - 0.3); break; }
  }
  // first a beat looking at them from where you fell, then cut to behind them if they're far
  // (gliding across the map would pass through walls) and follow smoothly from there
  cam.age = (cam.age || 0) + dt;
  const wx = fx - Math.cos(a) * back, wy = fy - Math.sin(a) * back;
  if (!t || cam.age >= LOOK_S) {
    const k = Math.hypot(wx - cam.x, wy - cam.y) > 6 ? 1 : 1 - Math.exp(-dt * 6);
    cam.x += (wx - cam.x) * k;
    cam.y += (wy - cam.y) * k;
    cam.z += (camZ - cam.z) * k;
  }
  me.x = cam.x; me.y = cam.y; me.z = cam.z - EYE;
  const turn = t && cam.age >= LOOK_S ? 1 : 1 - Math.exp(-dt * 8), wantA = Math.atan2(fy - cam.y, fx - cam.x);
  me.a += Math.atan2(Math.sin(wantA - me.a), Math.cos(wantA - me.a)) * turn;
  S.pitch += (Math.atan2(fz - cam.z, Math.hypot(fx - cam.x, fy - cam.y) || 1) - S.pitch) * turn;
  S.speed = 0;
}
