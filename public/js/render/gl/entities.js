// In-world sprites: pooled billboards + reusable particle buffers (updated in place each frame).
import * as THREE from 'three';
import { S } from '../../state.js';
import { BODY_H, SLIDE, PLAGUE_TEAM, isTeamMode } from '/shared/config.js';
import { walkHeight } from '/shared/terrain.js';
import { ALLY_OUTLINE_COLOR, ENEMY_OUTLINE_COLOR, GUN_COLOR } from '../../constants.js';
import { pickupSprite, boxSprite, PLAYER_SPRITES } from '../sprites.js';
import { getScene } from './scene.js';

const spriteCache = new Map();
const entityRoot = new THREE.Group();
entityRoot.name = 'entities';
let attached = false;

const TEAM_TINT = { 1: [230, 50, 40], 2: [40, 110, 255] };
const PLAGUE_TINT = [100, 225, 45];

// pools
const playerPool = [];
const pickupPool = [];
const boxPool = [];
const nadePool = [];
let particlePoints = null;
let particlePos = null;
let particleCol = null;
let particleCap = 0;

function ensureRoot() {
  const scene = getScene();
  if (!scene) return null;
  if (!attached) { scene.add(entityRoot); attached = true; }
  return entityRoot;
}

function spriteTexture(px, pal, w = 32, h = 48, keyExtra = '') {
  const key = (px.name || 'fn') + '|' + pal.map(c => c ? c.join(',') : '').join(';') + '|' + w + 'x' + h + '|' + keyExtra;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h;
    const pi = px(u, v, false);
    const col = pal[pi];
    const i = (y * w + x) * 4;
    if (!col) { id.data[i + 3] = 0; continue; }
    id.data[i] = col[0]; id.data[i + 1] = col[1]; id.data[i + 2] = col[2]; id.data[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, tex);
  return tex;
}

// One-pixel rim around the silhouette (Minecraft glowing outline).
function outlineTexture(px, col, w = 32, h = 48, keyExtra = '') {
  const key = 'ol|' + (px.name || 'fn') + '|' + col.join(',') + '|' + w + 'x' + h + '|' + keyExtra;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px((x + 0.5) / w, (y + 0.5) / h, false)) mask[y * w + x] = 1;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (mask[k]) continue;
    const edge = (x > 0 && mask[k - 1]) || (x < w - 1 && mask[k + 1])
      || (y > 0 && mask[k - w]) || (y < h - 1 && mask[k + w]);
    if (!edge) continue;
    const i = k * 4;
    id.data[i] = col[0]; id.data[i + 1] = col[1]; id.data[i + 2] = col[2]; id.data[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, tex);
  return tex;
}

function tintPalette(pal, tint) {
  if (!tint) return pal;
  return pal.map((c, i) => {
    if (!c || i < 1 || i > 3) return c;
    return c.map((v, j) => v * 0.35 + tint[j] * (i === 2 ? 0.4 : 0.65));
  });
}

function acquire(pool, make) {
  for (const s of pool) if (!s.userData.inUse) { s.userData.inUse = true; s.visible = true; return s; }
  const s = make();
  s.userData.inUse = true;
  pool.push(s);
  entityRoot.add(s);
  return s;
}

function resetPoolMarks(pool) {
  for (const s of pool) s.userData.inUse = false;
}

function makeSprite() {
  const mat = new THREE.SpriteMaterial({
    transparent: true,
    depthWrite: false,
    alphaTest: 0.4,
  });
  return new THREE.Sprite(mat);
}

function setBillboard(spr, tex, x, y, z, worldW, worldH, xray, additive) {
  if (spr.material.map !== tex) {
    spr.material.map = tex;
    spr.material.needsUpdate = true;
  }
  const wantAdd = !!additive;
  if (!!spr.material.userData.additive !== wantAdd) {
    spr.material.blending = wantAdd ? THREE.AdditiveBlending : THREE.NormalBlending;
    spr.material.userData.additive = wantAdd;
    spr.material.needsUpdate = true;
  }
  spr.scale.set(worldW, worldH, 1);
  spr.position.set(x, z + worldH * 0.5, y);
  spr.material.depthTest = !xray;
  spr.renderOrder = xray ? 10 : (additive ? 2 : 0);
  spr.userData.inUse = true;
  spr.visible = true;
}

export function beginEntities() {
  ensureRoot();
  resetPoolMarks(playerPool);
  resetPoolMarks(pickupPool);
  resetPoolMarks(boxPool);
  resetPoolMarks(nadePool);
}

export function endEntities() {
  for (const s of playerPool) if (!s.userData.inUse) s.visible = false;
  for (const s of pickupPool) if (!s.userData.inUse) s.visible = false;
  for (const s of boxPool) if (!s.userData.inUse) s.visible = false;
  for (const s of nadePool) if (!s.userData.inUse) s.visible = false;
}

export function drawPickupBillboards(now) {
  if (!ensureRoot() || !S.T) return;
  S.pickupSpots.forEach((p, i) => {
    if (!S.pickupActive[i]) return;
    const sp = pickupSprite(p.weapon, GUN_COLOR[p.weapon]);
    const z = p.weapon === 'ammo' ? walkHeight(S.T, p.x, p.y, 0) : 0.3 + 0.07 * Math.sin(now / 400 + i);
    const tex = spriteTexture(sp.px, sp.pal, 32, 32, p.weapon);
    const spr = acquire(pickupPool, makeSprite);
    setBillboard(spr, tex, p.x, p.y, z, sp.w, sp.h, false);
  });

  const box = boxSprite();
  const boxTex = spriteTexture(box.px, box.pal, 32, 32, 'cauldron-classic');
  const brewPx = (u, v) => (Math.hypot(u - 0.5, v - 0.5) < 0.48 ? 1 : 0);
  const glowTex = spriteTexture(brewPx, [null, [50, 220, 70]], 16, 16, 'brewGlow-green');
  for (const b of S.boxes) {
    const bob = 0.035 * Math.sin(now / 320 + b.id);
    const spr = acquire(boxPool, makeSprite);
    setBillboard(spr, boxTex, b.x, b.y, b.z + bob, box.w, box.h, false);
    const glow = acquire(boxPool, makeSprite);
    setBillboard(glow, glowTex, b.x, b.y, b.z + bob + box.h * 0.4, 0.48, 0.3, false, true);
    glow.material.opacity = 0.5 + 0.2 * Math.sin(now / 180 + b.id);
    glow.material.alphaTest = 0.05;
  }

  const nadeSp = pickupSprite('nade', GUN_COLOR.nade);
  const nadeTex = spriteTexture(nadeSp.px, nadeSp.pal, 24, 32, 'nade');
  for (const n of S.thrown) {
    const bob = 0.04 * Math.sin(now / 70 + n.id);
    const spr = acquire(nadePool, makeSprite);
    setBillboard(spr, nadeTex, n.x, n.y, n.z + bob, nadeSp.w * 1.15, nadeSp.h * 1.15, false);
  }
}

function glowFor(o) {
  const teams = S.room && isTeamMode(S.room.mode);
  const ally = teams && o.now.team === S.myTeam;
  // Visible glow only — never draws through walls.
  return { col: !teams ? [255, 255, 255] : ally ? ALLY_OUTLINE_COLOR : ENEMY_OUTLINE_COLOR };
}

function drawPlayerBillboard(x, y, z, hScale, wScale, flash, tint, skin, outline) {
  const s = PLAYER_SPRITES[skin] || PLAYER_SPRITES.witch;
  let pal = s.pal;
  if (tint || flash) {
    pal = tintPalette(s.pal.map(c => c && c.slice()), tint);
    if (flash) for (let i = 1; i < pal.length; i++) if (pal[i]) pal[i] = pal[i].map(v => Math.min(255, v + 80));
  }
  const skinKey = skin || 'witch';
  const h = (BODY_H + 0.12) * hScale;
  const bw = 0.6 * wScale;

  if (outline) {
    const otex = outlineTexture(s.px, outline.col, 32, 48, skinKey);
    const ospr = acquire(playerPool, makeSprite);
    setBillboard(ospr, otex, x, y, z, bw * 1.12, h * 1.12, false);
    const gtex = spriteTexture(s.px, [null, outline.col, outline.col, outline.col, outline.col, outline.col], 32, 48, 'glowfill|' + skinKey + '|' + outline.col.join(','));
    const gspr = acquire(playerPool, makeSprite);
    setBillboard(gspr, gtex, x, y, z, bw * 1.06, h * 1.06, false, true);
    gspr.material.opacity = 0.28;
    gspr.material.alphaTest = 0.05;
  }

  const tex = spriteTexture(s.px, pal, 32, 48, skinKey + (tint ? tint.join(',') : '') + (flash ? 'f' : ''));
  const spr = acquire(playerPool, makeSprite);
  setBillboard(spr, tex, x, y, z, bw, h, false);
  spr.material.opacity = 1;
  spr.material.alphaTest = 0.4;
}

export function drawParticlePoints(embers, particles) {
  if (!ensureRoot()) return;
  const nE = embers.length, nP = particles.length, total = nE + nP;
  if (!total) {
    if (particlePoints) particlePoints.visible = false;
    return;
  }
  const n = Math.min(total, 400);
  if (!particlePoints || particleCap < n) {
    if (particlePoints) {
      entityRoot.remove(particlePoints);
      particlePoints.geometry.dispose();
      particlePoints.material.dispose();
    }
    particleCap = Math.max(n, 64);
    particlePos = new Float32Array(particleCap * 3);
    particleCol = new Float32Array(particleCap * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(particleCol, 3));
    particlePoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.1, vertexColors: true, transparent: true, depthWrite: false, depthTest: true, sizeAttenuation: true,
    }));
    entityRoot.add(particlePoints);
  }
  let i = 0;
  const write = (p) => {
    if (i >= n) return;
    particlePos[i * 3] = p.x;
    particlePos[i * 3 + 1] = p.z;
    particlePos[i * 3 + 2] = p.y;
    const k = Math.min(1, p.life / p.max * 2);
    particleCol[i * 3] = (p.col[0] / 255) * k;
    particleCol[i * 3 + 1] = (p.col[1] / 255) * k;
    particleCol[i * 3 + 2] = (p.col[2] / 255) * k;
    i++;
  };
  for (let j = 0; j < nE && i < n; j++) write(embers[j]);
  for (let j = 0; j < nP && i < n; j++) write(particles[j]);
  particlePoints.geometry.setDrawRange(0, i);
  particlePoints.geometry.attributes.position.needsUpdate = true;
  particlePoints.geometry.attributes.color.needsUpdate = true;
  particlePoints.visible = true;
}

export function drawOthersAndCorpses(now) {
  for (const c of S.corpses) {
    if (c.mine) continue;
    const age = now - c.t, fall = Math.min(1, age / 450), sink = age > 4000 ? (age - 4000) / 2000 * 0.4 : 0;
    drawPlayerBillboard(c.x, c.y, c.z - sink, 1 - 0.72 * fall, 1 + 0.9 * fall, false, null, c.skin, null);
  }
  for (const o of Object.values(S.others)) {
    if (!o.now) continue;
    const player = S.room && S.room.players.find(p => p.id === o.now.id);
    const team = player ? player.team : o.now.team;
    const tint = S.room?.mode === 'plague' && S.room.gameOn && team === PLAGUE_TEAM
      ? PLAGUE_TINT : (S.room && ['teams', 'hardpoint'].includes(S.room.mode)) ? TEAM_TINT[team] : null;
    drawPlayerBillboard(
      o.now.x, o.now.y, o.now.z,
      o.now.sl ? SLIDE.crouch : 1,
      o.now.sl ? 1.15 : 1,
      now - o.hitT < 90, tint, player && player.skin, glowFor(o)
    );
  }
}
