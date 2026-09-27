// While you're dead the camera follows someone: your killer, or in battle royale anyone still
// standing (click to switch). It moves S.me itself; the server ignores you until it respawns you,
// and that respawn's new seq snaps S.me back to your spawn (net.js state).
import { EYE, BODY_H } from '/shared/config.js';
import { kindAt, groundAt } from '/shared/terrain.js';
import { S } from './state.js';
import { setWind, setSizzle } from './audio.js';

const BACK = 2.6, UP = 1.0; // chase camera: this far behind and above the one you watch
const LOOK_S = 0.8; // seconds spent looking at your killer from your body first

const standing = id => { const o = S.others[id]; return !!(o && o.now && o.cur && !o.cur.dead); };

// respawnMs: when you're back (null: not until the match ends)
export function enterSpectate(killer, respawnMs) {
  S.dead = true;
  S.spectateId = killer != null && killer !== S.myId ? killer : null;
  S.respawnAt = respawnMs == null ? null : performance.now() + respawnMs;
  S.deathAt = S.me ? { x: S.me.x, y: S.me.y, z: S.me.z } : null;
  S.specCam = S.me ? { x: S.me.x, y: S.me.y, z: S.me.z + EYE, orbit: S.me.a } : null;
  S.scoped = false; S.reloading = null; S.mouseHeld = false; S.aimHeld = false; S.buildMode = false;
  S.sliding = false; S.slideDip = 0; S.vx = S.vy = S.vz = 0;
}

export function leaveSpectate() {
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
