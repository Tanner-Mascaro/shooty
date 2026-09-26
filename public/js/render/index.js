// One frame: set up the camera, simulate effects, draw the world, then the HUD on top.
import { TICK, EYE, SLIDE } from '/shared/config.js';
import { groundAt } from '/shared/terrain.js';
import { S } from '../state.js';
import { BASE_FOV, SCOPE_FOV, GRAVITY, GUN_COLOR } from '../constants.js';
import { view, present } from './canvas.js';
import { drawTerrain, drawSprite, drawPlayer, drawParticles } from './world.js';
import { pickupSprite, canopySprite, boxSprite } from './sprites.js';
import { drawTracers, drawPickupGlows, drawEnemyGlows, drawNameTags, drawWeaponView, drawHitMarker, drawFlashes, drawBanner, drawSpeed, drawMinimap, drawAmmo, drawUsePrompt } from './hud.js';
import { updateEmbers, volcanoPlumes, stepParticles } from '../particles.js';
import { playAt } from '../audio.js';
import { updateHud } from '../ui.js';

// draw everyone one server tick behind, interpolating between their last two states
function interpolateOthers(now) {
  for (const o of Object.values(S.others)) {
    const a = o.prev, b = o.cur;
    if (!b) continue;
    const k = Math.min(1, (now - o.t) / TICK);
    o.now = Object.assign({}, b, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
  }
}

// teams mode tints bodies: red / blue (free-for-all keeps the level's own colors)
const TEAM_TINT = { 1: [230, 50, 40], 2: [40, 110, 255] };

// Minecraft-style glowing outline: white in free-for-all, red / blue in teams. Teammates show
// through walls; enemies do for a few seconds after you hit them (like a spectral arrow).
const MARK_MS = 3000;
function glowFor(o, now) {
  const teams = S.room && S.room.mode === 'teams', ally = teams && o.now.team === S.myTeam;
  return { col: !teams ? [255, 255, 255] : ally ? [90, 170, 255] : [255, 70, 55], xray: ally || now - o.markT < MARK_MS };
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
  S.cam = { eye: S.me.z + EYE - SLIDE.drop * S.slideDip, horizon: view.RH / 2 + (S.pitch + S.punch) * focal, focal, tanH, sc: view.W / view.RW, ox, oy,
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
  interpolateOthers(now);
  setupCamera();

  if (S.started) { updateEmbers(); volcanoPlumes(dt); }
  S.embers = stepParticles(S.embers, dt);
  S.particles = stepParticles(S.particles, dt);
  updateCorpses(now, dt);

  // --- 3D world (low-res buffer) ---
  drawTerrain(now);
  S.pickupSpots.forEach((p, i) => {
    if (!S.pickupActive[i]) return;
    const sp = pickupSprite(p.weapon, GUN_COLOR[p.weapon]);
    const z = p.weapon === 'ammo' ? groundAt(S.T, p.x, p.y) : 0.3 + 0.07 * Math.sin(now / 400 + i); // crates sit on the ground
    drawSprite(p.x, p.y, z, sp.w, sp.h, sp.px, sp.pal, sp.emit);
  });
  const box = boxSprite(S.theme.accent);
  for (const b of S.boxes) drawSprite(b.x, b.y, b.z, box.w, box.h, box.px, box.pal, box.emit);
  for (const p of S.T.props) { // swamp tree canopies (the trunks are terrain)
    if (p.type !== 'tree' || Math.abs(p.x - S.me.x) > 30 || Math.abs(p.y - S.me.y) > 30) continue;
    const sp = canopySprite((p.x * 7 + p.y * 3 | 0) % 4);
    drawSprite(p.x, p.y, p.h - 1.0, p.r * 2, 1.7, sp.px, sp.pal, sp.emit);
  }
  for (const c of S.corpses) {
    if (c.mine) continue;
    const age = now - c.t, fall = Math.min(1, age / 450), sink = age > 4000 ? (age - 4000) / 2000 * 0.4 : 0;
    drawPlayer(c.x, c.y, c.z - sink, 1 - 0.72 * fall, 1 + 0.9 * fall, false, false, null, c.skin);
  }
  const teams = S.room && S.room.mode === 'teams';
  for (const o of Object.values(S.others))
    if (o.now) {
      const player = S.room && S.room.players.find(p => p.id === o.now.id);
      drawPlayer(o.now.x, o.now.y, o.now.z, o.now.sl ? SLIDE.crouch : 1, o.now.sl ? 1.15 : 1, now - o.hitT < 90, o.now.sc, teams ? TEAM_TINT[o.now.team] : null, player && player.skin, glowFor(o, now));
    }
  drawParticles(S.embers);
  drawParticles(S.particles);
  present(S.cam.ox, S.cam.oy);

  // --- overlay (full res) ---
  drawPickupGlows();
  drawTracers(now);
  drawEnemyGlows(now);
  drawNameTags();
  drawWeaponView(now);
  drawHitMarker();
  drawFlashes();
  drawBanner(now);
  drawMinimap(now);
  drawSpeed();
  drawAmmo(now);
  drawUsePrompt();

  decayEffects(dt);
  updateHud();
}
