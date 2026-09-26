// One frame: set up the camera, simulate effects, draw the world, then the HUD on top.
import { TICK, EYE } from '/shared/config.js';
import { groundAt } from '/shared/terrain.js';
import { S } from '../state.js';
import { BASE_FOV, SCOPE_FOV, GRAVITY, GUN_COLOR } from '../constants.js';
import { view, present } from './canvas.js';
import { drawTerrain, drawSprite, drawPlayer, drawParticles } from './world.js';
import { pickupSprite } from './sprites.js';
import { drawTracers, drawPickupGlows, drawEnemyGlows, drawWeaponView, drawHitMarker, drawFlashes, drawBanner, drawSpeed, drawMinimap } from './hud.js';
import { updateEmbers, stepParticles } from '../particles.js';
import { playAt } from '../audio.js';
import { updateHud } from '../ui.js';

// draw the enemy one server tick behind, interpolating between the last two states
function interpolateEnemy(now) {
  const a = S.ePrev, b = S.eCur;
  if (!b) return;
  const k = Math.min(1, (now - S.eTime) / TICK);
  S.enemy = Object.assign({}, b, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
}

// bodies fly in the shot direction, thud on landing, sink after 4s
function updateCorpses(now, dt) {
  for (const c of S.corpses) {
    c.vz -= GRAVITY * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    const gz = groundAt(S.T, c.x, c.y);
    if (gz > c.z + 0.5) { c.x -= c.vx * dt; c.y -= c.vy * dt; c.vx = c.vy = 0; } // hit a wall
    if (c.z < gz) {
      c.z = gz;
      if (!c.landed && c.vz < -1) { c.landed = true; playAt('thud', c.x, c.y); }
      c.vz = 0; c.vx *= 0.85; c.vy *= 0.85;
    }
  }
  S.corpses = S.corpses.filter(c => now - c.t < 6000);
}

function setupCamera() {
  S.fov += ((S.scoped ? SCOPE_FOV : BASE_FOV) - S.fov) * 0.3;
  const tanH = Math.tan(S.fov / 2) * (1 + S.fovKick), focal = (view.RW / 2) / tanH;
  const ox = S.shake ? (Math.random() - 0.5) * S.shake : 0, oy = S.shake ? (Math.random() - 0.5) * S.shake : 0;
  const a = S.me.a;
  S.cam = { eye: S.me.z + EYE, horizon: view.RH / 2 + (S.pitch + S.punch) * focal, focal, tanH, sc: view.W / view.RW, ox, oy,
    fwdx: Math.cos(a), fwdy: Math.sin(a), rtx: -Math.sin(a), rty: Math.cos(a) };
}

// time-based decay so effects feel the same at any framerate
function decayEffects(dt) {
  const d = Math.pow(0.001, dt);
  S.punch *= d ** 0.8; S.shake *= d ** 1.2; S.fovKick *= d; S.recoil *= d ** 0.5;
  if (S.shake < 0.3) S.shake = 0;
}

export function render(dt) {
  if (!S.me || !S.T) return;
  const now = performance.now();
  interpolateEnemy(now);
  setupCamera();

  if (S.started) updateEmbers();
  S.embers = stepParticles(S.embers, dt);
  S.particles = stepParticles(S.particles, dt);
  updateCorpses(now, dt);

  // --- 3D world (low-res buffer) ---
  drawTerrain(now);
  S.pickupSpots.forEach((p, i) => {
    if (!S.pickupActive[i]) return;
    const sp = pickupSprite(p.weapon, GUN_COLOR[p.weapon]);
    drawSprite(p.x, p.y, 0.3 + 0.07 * Math.sin(now / 400 + i), sp.w, sp.h, sp.px, sp.pal, sp.emit);
  });
  for (const c of S.corpses) {
    if (c.mine) continue;
    const age = now - c.t, fall = Math.min(1, age / 450), sink = age > 4000 ? (age - 4000) / 2000 * 0.4 : 0;
    drawPlayer(c.x, c.y, c.z - sink, 1 - 0.72 * fall, 1 + 0.9 * fall, false, false);
  }
  if (S.enemy) drawPlayer(S.enemy.x, S.enemy.y, S.enemy.z, 1, 1, now - S.enemyHitT < 90, S.enemy.sc);
  drawParticles(S.embers);
  drawParticles(S.particles);
  present(S.cam.ox, S.cam.oy);

  // --- overlay (full res) ---
  drawPickupGlows();
  drawTracers(now);
  drawEnemyGlows(now);
  drawWeaponView(now);
  drawHitMarker();
  drawFlashes();
  drawBanner(now);
  drawMinimap(now);
  drawSpeed();

  decayEffects(dt);
  updateHud();
}
