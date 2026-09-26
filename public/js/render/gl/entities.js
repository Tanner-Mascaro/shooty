// In-world sprites: pooled billboards + reusable particle buffers (updated in place each frame).
import * as THREE from 'three';
import { S } from '../../state.js';
import { BODY_H, SLIDE, PLAGUE_TEAM, isTeamMode } from '/shared/config.js';
import { walkHeight } from '/shared/terrain.js';
import { GUN_COLOR } from '../../constants.js';
import { pickupSprite, boxSprite, PLAYER_SPRITES } from '../sprites.js';
import { getScene } from './scene.js';

const spriteCache = new Map();
const entityRoot = new THREE.Group();
entityRoot.name = 'entities';
let attached = false;

const TEAM_TINT = { 1: [230, 50, 40], 2: [40, 110, 255] };
const PLAGUE_TINT = [100, 225, 45];
const MARK_MS = 3000;

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

function spriteTexture(px, pal, w = 32, h = 48) {
  const key = (px.name || 'fn') + '|' + pal.map(c => c ? c.join(',') : '').join(';') + '|' + w + 'x' + h;
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

function releaseUnused(pool) {
  for (const s of pool) {
    if (!s.userData.inUse) s.visible = false;
    else s.userData.inUse = false; // mark for next frame; callers set inUse true when reused
  }
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

function setBillboard(spr, tex, x, y, z, worldW, worldH, xray) {
  if (spr.material.map !== tex) {
    spr.material.map = tex;
    spr.material.needsUpdate = true;
  }
  spr.scale.set(worldW, worldH, 1);
  spr.position.set(x, z + worldH * 0.5, y);
  spr.material.depthTest = !xray;
  spr.renderOrder = xray ? 10 : 0;
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
    const tex = spriteTexture(sp.px, sp.pal, 32, 32);
    const spr = acquire(pickupPool, makeSprite);
    setBillboard(spr, tex, p.x, p.y, z, sp.w, sp.h, false);
  });

  const box = boxSprite(S.theme.accent);
  const boxTex = spriteTexture(box.px, box.pal, 24, 24);
  for (const b of S.boxes) {
    const spr = acquire(boxPool, makeSprite);
    setBillboard(spr, boxTex, b.x, b.y, b.z, box.w, box.h, false);
  }

  const nadeSp = pickupSprite('nade', GUN_COLOR.nade);
  const nadeTex = spriteTexture(nadeSp.px, nadeSp.pal, 16, 16);
  for (const n of S.thrown) {
    const bob = 0.04 * Math.sin(now / 70 + n.id);
    const spr = acquire(nadePool, makeSprite);
    setBillboard(spr, nadeTex, n.x, n.y, n.z + bob, nadeSp.w * 1.15, nadeSp.h * 1.15, false);
  }
}

function drawPlayerBillboard(x, y, z, hScale, wScale, flash, tint, skin, xray) {
  const s = PLAYER_SPRITES[skin] || PLAYER_SPRITES.demon;
  let pal = s.pal;
  if (tint || flash) {
    pal = tintPalette(s.pal.map(c => c && c.slice()), tint);
    if (flash) for (let i = 1; i < pal.length; i++) if (pal[i]) pal[i] = pal[i].map(v => Math.min(255, v + 80));
  }
  const tex = spriteTexture(s.px, pal, 32, 48);
  const h = (BODY_H + 0.12) * hScale;
  const spr = acquire(playerPool, makeSprite);
  setBillboard(spr, tex, x, y, z, 0.6 * wScale, h, xray);
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
      size: 0.1, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true,
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
  const teams = S.room && isTeamMode(S.room.mode);
  for (const c of S.corpses) {
    if (c.mine) continue;
    const age = now - c.t, fall = Math.min(1, age / 450), sink = age > 4000 ? (age - 4000) / 2000 * 0.4 : 0;
    drawPlayerBillboard(c.x, c.y, c.z - sink, 1 - 0.72 * fall, 1 + 0.9 * fall, false, null, c.skin, false);
  }
  for (const o of Object.values(S.others)) {
    if (!o.now) continue;
    const player = S.room && S.room.players.find(p => p.id === o.now.id);
    const team = player ? player.team : o.now.team;
    const tint = S.room?.mode === 'plague' && S.room.gameOn && team === PLAGUE_TEAM
      ? PLAGUE_TINT : (S.room && S.room.mode === 'teams') ? TEAM_TINT[team] : null;
    const ally = teams && o.now.team === S.myTeam;
    const xray = ally || now - o.markT < MARK_MS;
    drawPlayerBillboard(
      o.now.x, o.now.y, o.now.z,
      o.now.sl ? SLIDE.crouch : 1,
      o.now.sl ? 1.15 : 1,
      now - o.hitT < 90, tint, player && player.skin, xray
    );
  }
}
