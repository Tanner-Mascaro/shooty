// One frame: sync camera, draw WebGL world + entities, blit to #c, then HUD on top.
import { TICK, EYE, SLIDE } from '/shared/config.js';
import { groundAt } from '/shared/terrain.js';
import { S } from '../state.js';
import { settings } from '../settings.js';
import { BASE_FOV, SCOPE_FOV, ADS_ZOOM, GRAVITY } from '../constants.js';
import { view, present, ensureCanvas } from './canvas.js';
import { initGL, setLevelWorld, renderGL } from './gl/scene.js';
import { syncCamera } from './gl/camera.js';
import { beginEntities, endEntities, drawPickupBillboards, drawOthersAndCorpses, drawParticlePoints } from './gl/entities.js';
import { drawTracers, drawPickupGlows, drawEnemyGlows, drawNameTags, drawWeaponView, drawHitMarker, drawDamageIndicators, drawFlashes, drawBanner, drawSpeed, drawMinimap, drawAmmo, drawUsePrompt } from './hud.js';
import { updateEmbers, volcanoPlumes, stepParticles } from '../particles.js';
import { playAt } from '../audio.js';
import { updateHud } from '../ui.js';
import { colors } from '../level.js';

function interpolateOthers(now) {
  for (const o of Object.values(S.others)) {
    const a = o.prev, b = o.cur;
    if (!b) continue;
    const k = Math.min(1, (now - o.t) / TICK);
    o.now = Object.assign({}, b, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
  }
}

function updateCorpses(now, dt) {
  for (const c of S.corpses) {
    c.vz -= GRAVITY * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    const gz = groundAt(S.T, c.x, c.y);
    if (gz > c.z + 0.5) { c.x -= c.vx * dt; c.y -= c.vy * dt; c.vx = c.vy = 0; }
    if (c.z < gz) {
      c.z = gz;
      if (!c.landed && c.vz < -1) { c.landed = true; playAt('thud', c.x, c.y); }
      c.vz = 0; c.vx *= 0.85; c.vy *= 0.85;
    }
  }
  S.corpses = S.corpses.filter(c => now - c.t < 6000);
}

function setupCamera() {
  const target = (!S.scoped ? BASE_FOV : S.weapon === 'sniper' ? SCOPE_FOV : BASE_FOV * (ADS_ZOOM[S.weapon] || 1)) * settings.fov;
  S.fov += (target - S.fov) * 0.3;
  const tanH = Math.tan(S.fov / 2) * (1 + S.fovKick), focal = (view.W / 2) / tanH;
  const ox = S.shake ? (Math.random() - 0.5) * S.shake : 0, oy = S.shake ? (Math.random() - 0.5) * S.shake : 0;
  const a = S.me.a;
  S.cam = {
    eye: S.me.z + EYE - SLIDE.drop * S.slideDip,
    horizon: view.H / 2 + (S.pitch + S.punch) * focal,
    focal, tanH, sc: 1, ox, oy,
    fwdx: Math.cos(a), fwdy: Math.sin(a), rtx: -Math.sin(a), rty: Math.cos(a),
  };
}

function decayEffects(dt) {
  const d = Math.pow(0.001, dt);
  S.punch *= d ** 0.8; S.shake *= d ** 1.2; S.fovKick *= d; S.recoil *= d ** 0.5;
  if (S.shake < 0.3) S.shake = 0;
}

export function render(dt) {
  if (!S.me || !S.T) return;
  if (!S.started) return;
  ensureCanvas();
  initGL();
  setLevelWorld(S.level, S.T, S.theme, colors);

  const now = performance.now();
  interpolateOthers(now);
  setupCamera();
  syncCamera();

  if (S.started) { updateEmbers(); volcanoPlumes(dt); }
  S.embers = stepParticles(S.embers, dt);
  S.particles = stepParticles(S.particles, dt);
  updateCorpses(now, dt);

  beginEntities();
  drawPickupBillboards(now);
  drawOthersAndCorpses(now);
  drawParticlePoints(S.embers, S.particles);
  endEntities();

  renderGL();
  present(S.cam.ox, S.cam.oy);

  drawPickupGlows();
  drawTracers(now);
  drawEnemyGlows(now);
  drawNameTags();
  drawWeaponView(now);
  drawHitMarker();
  drawFlashes();
  drawDamageIndicators(now);
  drawBanner(now);
  drawMinimap(now);
  drawSpeed();
  drawAmmo(now);
  drawUsePrompt();

  decayEffects(dt);
  updateHud();
}
