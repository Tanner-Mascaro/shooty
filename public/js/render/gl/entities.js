// In-world sprites: pooled billboards + reusable particle buffers (updated in place each frame).
import * as THREE from 'three';
import { S } from '../../state.js';
import { BODY_H, SLIDE, PLAGUE_TEAM, isTeamMode, redBlue, MOBS } from '/shared/config.js';
import { walkHeight } from '/shared/terrain.js';
import { PET_SPRITES } from '../pets.js';
import { cryptLayout, isSurvivalLevel } from '/shared/crypt.js';
import { GUN_COLOR, POWER_COLOR, TEAM_RGB, SPELL_LOOK } from '../../constants.js';
import { pickupSprite, boxSprite, spriteFor, lookOf } from '../sprites.js';
import { gunArt } from '../gunArt.js';
import { getScene, getCamera } from './scene.js';

const spriteCache = new Map();
const entityRoot = new THREE.Group();
entityRoot.name = 'entities';
let attached = false;

const TEAM_TINT = { 1: [180, 50, 50], 2: [110, 70, 150] };
const HELD_SCALE = 0.95; // guns in someone's hands, drawn at about life size
const GROUND_SCALE = 1.3; // guns on pads and on the ground, a little bigger so you spot them
const HAND = 0.2, GRIP = 0.3; // hand's distance from the body's middle; where along the gun it's held
const PLAGUE_TINT = [70, 140, 55];

// pools
const shadowPool = [];
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

// a gun drawn from its 3D model (render/gunArt.js): { tex, w, h } in world size, or null
function gunTexture(w, flip = false, camo = null) {
  const key = 'gun|' + w + (flip ? '|l' : '') + (camo ? '|' + camo : '');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const art = gunArt(w, flip, camo);
  if (!art) return null;
  const tex = new THREE.CanvasTexture(art.canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const out = { tex, w: art.w, h: art.h };
  spriteCache.set(key, out);
  return out;
}

function canvasTexture(canvas, key) {
  if (spriteCache.has(key)) return spriteCache.get(key);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, tex);
  return tex;
}

function imageTexture(url) {
  if (spriteCache.has(url)) return spriteCache.get(url);
  const tex = new THREE.TextureLoader().load(url, t => {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
  });
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(url, tex);
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

// a round token with a glyph on it (power-ups, monster drops, elixirs, souls)
function glyphTexture(glyph, col) {
  const key = 'glyph|' + glyph + '|' + col.join(',');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, `rgba(${col.map(v => Math.min(255, v + 90)).join(',')},1)`);
  grad.addColorStop(0.6, `rgba(${col.join(',')},0.95)`);
  grad.addColorStop(1, `rgba(${col.map(v => v * 0.3).join(',')},0)`);
  g.fillStyle = grad; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  if (glyph) {
    g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = 'rgba(30,10,20,0.8)'; g.strokeText(glyph, 32, 34);
    g.fillStyle = '#fff8e8'; g.fillText(glyph, 32, 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, tex);
  return tex;
}
// a witch's hat: the shield (Witch's Hat power-up, Ward spell), on the ground and over the head
// of whoever is wearing one. Palette: 1 felt, 2 band, 3 buckle, 4 felt highlight
const HAT = {
  pal: [null, [42, 26, 64], [150, 70, 210], [235, 195, 80], [78, 52, 110]],
  px(u, v) {
    if (v >= 0.76 && v <= 0.92) { // the brim: a flat ellipse
      const e = ((v - 0.84) / 0.08) ** 2;
      if (Math.abs(u - 0.5) < 0.49 * Math.sqrt(Math.max(0, 1 - e))) return v < 0.8 ? 4 : 1;
      return 0;
    }
    if (v < 0.06 || v > 0.76) return 0;
    const k = (v - 0.06) / 0.7, cx = 0.5 + 0.16 * (1 - k) ** 2, w = 0.03 + 0.21 * k; // the cone, tip bent over
    if (Math.abs(u - cx) > w) return 0;
    if (v > 0.6 && v < 0.71) return Math.abs(u - cx) < 0.06 ? 3 : 2; // band and buckle
    return u < cx - w * 0.4 ? 4 : 1;
  },
};
function hatTexture() { return spriteTexture(HAT.px, HAT.pal, 32, 32, 'witchhat'); }

const POWER_GLYPH = { fury: '⚔', shield: '⛨', feather: '❦', cloak: '◌', maxammo: '▤', double: '2×', insta: '☠', nuke: '☢', troll: '♥', swift: '»', quick: '↻' };

function setBillboard(spr, tex, x, y, z, worldW, worldH, xray, additive) {
  spr.material.rotation = 0;
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

// soft round shadows on the ground under people, monsters and things lying about: darker and
// tighter the closer they are to the floor
let shadowTex = null, shadowGeo = null;
function makeShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.4)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
    shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 1;
  return m;
}
function dropShadow(x, y, z, r, strength = 1) {
  if (!S.T) return;
  const floor = walkHeight(S.T, x, y, z + 0.05), up = Math.max(0, z - floor);
  if (up > 4) return;
  const k = 1 / (1 + up * 0.9), m = acquire(shadowPool, makeShadow);
  m.position.set(x, floor + 0.015, y);
  const size = r * 2 * (1 + up * 0.25);
  m.scale.set(size, 1, size);
  m.material.opacity = 0.85 * k * strength;
}

export function beginEntities() {
  ensureRoot();
  resetPoolMarks(shadowPool);
  resetPoolMarks(playerPool);
  resetPoolMarks(pickupPool);
  resetPoolMarks(boxPool);
  resetPoolMarks(nadePool);
}

export function endEntities() {
  for (const s of shadowPool) if (!s.userData.inUse) s.visible = false;
  for (const s of playerPool) if (!s.userData.inUse) s.visible = false;
  for (const s of pickupPool) if (!s.userData.inUse) s.visible = false;
  for (const s of boxPool) if (!s.userData.inUse) s.visible = false;
  for (const s of nadePool) if (!s.userData.inUse) s.visible = false;
}

export function drawPickupBillboards(now) {
  if (!ensureRoot() || !S.T) return;
  S.pickupSpots.forEach((p, i) => {
    if (!S.pickupActive[i]) return;
    const z = 0.3 + 0.07 * Math.sin(now / 400 + i);
    const gun = gunTexture(p.weapon), sp = gun ? { w: gun.w * GROUND_SCALE, h: gun.h * GROUND_SCALE } : pickupSprite(p.weapon, GUN_COLOR[p.weapon], p.spell);
    const tex = gun ? gun.tex : sp.canvas ? canvasTexture(sp.canvas, 'spell|' + p.spell) : sp.src ? imageTexture(sp.src) : spriteTexture(sp.px, sp.pal, 32, 32, p.weapon);
    const spr = acquire(pickupPool, makeSprite);
    setBillboard(spr, tex, p.x, p.y, z, sp.w, sp.h, false);
    if (gun || sp.canvas || sp.src) { spr.material.opacity = 1; spr.material.alphaTest = gun ? 0.4 : 0.15; }
    dropShadow(p.x, p.y, 0, Math.max(0.18, sp.w * 0.45), 0.7);
    if (sp.src) { spr.material.opacity = 1; spr.material.alphaTest = 0.15; }
  });

  const box = boxSprite();
  const boxTex = imageTexture(box.src);
  // guns someone dropped: the guns themselves, lying where they fell
  for (const b of S.boxes) b.items.forEach((w, i) => {
    const sp = gunTexture(w);
    if (!sp) return;
    const off = (i - (b.items.length - 1) / 2) * 0.32, bob = 0.03 * Math.sin(now / 320 + b.id + i);
    dropShadow(b.x + off, b.y - off * 0.5, b.z, sp.w * 0.45, 0.8);
    const spr = acquire(boxPool, makeSprite);
    setBillboard(spr, sp.tex, b.x + off, b.y - off * 0.5, b.z + 0.12 + bob, sp.w * GROUND_SCALE, sp.h * GROUND_SCALE, false);
    spr.material.opacity = 1; spr.material.alphaTest = 0.4;
    spr.material.rotation = 0.35 * Math.sin(b.id * 1.7 + i); // tossed down at an angle
  });
  const token = (tex, x, y, z, size, rot = 0) => {
    dropShadow(x, y, z - 0.3, size * 0.4, 0.6);
    const spr = acquire(boxPool, makeSprite);
    setBillboard(spr, tex, x, y, z, size, size, false);
    spr.material.opacity = 1; spr.material.alphaTest = 0.05; spr.material.rotation = rot;
    return spr;
  };
  for (const u of S.powerups) if (u.active) {
    const z = u.z + 0.35 + 0.08 * Math.sin(now / 300 + u.id);
    if (u.kind === 'shield') { const spr = token(hatTexture(), u.x, u.y, z, 0.7, 0.15 * Math.sin(now / 400 + u.id)); spr.material.alphaTest = 0.4; }
    else token(glyphTexture(POWER_GLYPH[u.kind], POWER_COLOR[u.kind]), u.x, u.y, z, 0.55);
  }
  // Soul Harvest: wisps in the fallen's team color
  for (const o of S.souls) token(glyphTexture('', TEAM_RGB[o.t] || [220, 220, 255]), o.x, o.y, o.z + 0.45 + 0.1 * Math.sin(now / 250 + o.id), 0.5 + 0.06 * Math.sin(now / 90 + o.id));
  for (const t of S.totems) token(glyphTexture('♣', SPELL_LOOK.totem.col), t.x, t.y, t.z + 0.2 + 0.05 * Math.sin(now / 200), 0.7);
  // the Crypt: guns on the walls, elixir altars, the mystery cauldron, monster drops
  if (S.survival && isSurvivalLevel(S.level)) {
    const L = cryptLayout(S.MAP);
    for (const b of L.buys) {
      const sp = gunTexture(b.w);
      if (!sp) continue;
      const spr = acquire(pickupPool, makeSprite);
      setBillboard(spr, sp.tex, b.x + b.wx * 0.38, b.y + b.wy * 0.38, 0.95, sp.w * 1.1, sp.h * 1.1, false);
      spr.material.opacity = 1; spr.material.alphaTest = 0.4;
    }
    for (const e of L.elixirs) token(glyphTexture(POWER_GLYPH[e.elixir], POWER_COLOR[e.elixir]), e.x, e.y, 0.5 + 0.05 * Math.sin(now / 400 + e.id), 0.75);
    for (const c of L.boxes) {
      const spr = acquire(boxPool, makeSprite);
      setBillboard(spr, boxTex, c.x, c.y, 0.02 * Math.sin(now / 300), box.w * 1.8, box.h * 1.8, false);
      spr.material.opacity = 1; spr.material.alphaTest = 0.15;
    }
    for (const d of S.survival.drops || []) token(glyphTexture(POWER_GLYPH[d.k], POWER_COLOR[d.k]), d.x, d.y, d.z + 0.45 + 0.1 * Math.sin(now / 250 + d.id), 0.65, 0.2 * Math.sin(now / 500 + d.id));
  }
  // Capture the Cauldron: each coven's cauldron, big on the ground or small over its carrier's head
  if (S.ctf && S.room?.mode === 'ctf') for (const t of [1, 2]) {
    const c = S.ctf.c[t];
    if (c.carrier === S.myId) continue; // yours to carry: the HUD says so
    const carrier = c.carrier != null ? S.others[c.carrier]?.now : null;
    const at = carrier ? { x: carrier.x, y: carrier.y, z: carrier.z + 1.05 } : { x: c.x, y: c.y, z: c.z + 0.05 * Math.sin(now / 300 + t) };
    const size = carrier ? 0.5 : 1.15;
    const spr = acquire(boxPool, makeSprite);
    setBillboard(spr, boxTex, at.x, at.y, at.z, box.w * size / 0.72, box.h * size / 0.72, false);
    spr.material.opacity = 1;
    spr.material.alphaTest = 0.15;
  }

  const nadeSp = pickupSprite('nade', GUN_COLOR.nade);
  const nadeTex = nadeSp.src
    ? imageTexture(nadeSp.src)
    : spriteTexture(nadeSp.px, nadeSp.pal, 24, 32, 'nade');
  for (const n of S.thrown) {
    const bob = 0.04 * Math.sin(now / 70 + n.id);
    const spr = acquire(nadePool, makeSprite);
    setBillboard(spr, nadeTex, n.x, n.y, n.z + bob, nadeSp.w * 1.7, nadeSp.h * 1.7, false); // big enough to spot in flight
    if (nadeSp.src) { spr.material.opacity = 1; spr.material.alphaTest = 0.15; }
  }
}

const STRIDE_LEN = 0.55;   // metres walked per leg swap
const STRIDES = [1, 0, 2, 0]; // left up, both down, right up, both down
const KICK_MS = 110;       // recoil after a shot

// Which way we see someone, how their legs are, and whether their gun just kicked.
function poseFor(o, now) {
  const e = o.now, cam = getCamera();
  // back view when they face away from the camera (their yaw vs the direction from them to us)
  const toCam = Math.atan2(cam.position.z - e.y, cam.position.x - e.x);
  const back = Math.cos(toCam - (e.a || 0)) < -0.2;
  // walk cycle driven by distance actually covered, so it matches their speed
  const moved = o.lastX === undefined ? 0 : Math.hypot(e.x - o.lastX, e.y - o.lastY);
  o.lastX = e.x; o.lastY = e.y;
  if (moved > 0.002 && moved < 2 && !e.sl) { o.walk = (o.walk || 0) + moved; o.walkT = now; }
  const walking = now - (o.walkT || 0) < 150;
  const stride = walking ? STRIDES[Math.floor((o.walk || 0) / STRIDE_LEN) % 4] : 0;
  const kick = Math.max(0, 1 - (now - o.flashT) / KICK_MS);
  return { back, stride, bob: stride ? 0.04 : 0, kick, a: e.a || 0 };
}

// what an emote does to someone's sprite, `t` seconds in: { rot, bob, sx, sy, back }
function emoteAnim(e, t) {
  const s = Math.sin, a = Math.abs;
  switch (e) {
    case 'cackle': return { bob: a(s(t * 14)) * 0.07, sy: 1 - a(s(t * 14)) * 0.06, rot: s(t * 7) * 0.05 }; // doubled over laughing
    case 'curtsy': { const d = Math.max(0, s(t * 2.4)); return { sy: 1 - 0.18 * d, sx: 1 + 0.06 * d, rot: -0.1 * d }; }
    case 'hex': return { rot: s(t * 6) * 0.12, sx: 1 + 0.06 * a(s(t * 9)) }; // weaving a spell
    case 'brew': return { rot: s(t * 5) * 0.1, bob: Math.cos(t * 5) * 0.03 }; // stirring the cauldron
    case 'broom': return { bob: Math.min(1, t * 2) * (0.3 + s(t * 4) * 0.08), rot: -0.22 + s(t * 4) * 0.05 }; // up on a broomstick
    case 'bats': { const c = Math.cos(t * 9); return { sx: Math.max(0.08, a(c)), back: c < 0 }; } // whirls into a cloud of bats
    case 'howl': return { sy: 1.12, bob: 0.05, rot: s(t * 20) * 0.025 }; // at the moon
    case 'hiss': return { sx: 1.12, sy: 0.94, rot: s(t * 30) * 0.04 }; // back arched like a black cat
  }
  return null;
}
export function emoteFor(id, now) {
  const e = S.emotes[id];
  if (!e || now - e.t > e.ms) return null;
  return emoteAnim(e.emote, (now - e.t) / 1000);
}

function drawPlayerBillboard(x, y, z, hScale, wScale, flash, tint, skin, outline, pose, alpha = 1, xray = false, anim = null) {
  const s = spriteFor(skin); // a skin, or "skin@hat"
  if (anim) {
    hScale *= anim.sy || 1; wScale *= anim.sx || 1; z += anim.bob || 0;
    if (anim.back !== undefined && pose) pose = { ...pose, back: anim.back };
  }
  const px = pose ? s.pose(pose.back, pose.stride) : s.px;
  const poseKey = pose ? (pose.back ? 'b' : 'f') + pose.stride : '';
  if (pose) {
    // recoil: pushed back against where they aim, a little squashed
    x -= Math.cos(pose.a) * 0.08 * pose.kick; y -= Math.sin(pose.a) * 0.08 * pose.kick;
    z += pose.bob;
    hScale *= 1 - 0.05 * pose.kick; wScale *= 1 + 0.06 * pose.kick;
  }
  let pal = s.pal;
  if (tint || flash) {
    pal = tintPalette(s.pal.map(c => c && c.slice()), tint);
    if (flash) for (let i = 1; i < pal.length; i++) if (pal[i]) pal[i] = pal[i].map(v => Math.min(255, v + 80));
  }
  // a flat cutout wider than the body cuts into a wall its owner is hugging: slide it toward the
  // camera by a little less than the body radius (0.22), so it stays in front of the wall surface
  // without ever poking through to the far side
  const cam = getCamera();
  if (cam) {
    const dx = cam.position.x - x, dy = cam.position.z - y, d = Math.hypot(dx, dy);
    if (d > 0.5) { const pull = 0.2 / d; x += dx * pull; y += dy * pull; }
  }
  const skinKey = (skin || 'witch') + poseKey;
  const h = (BODY_H + 0.12) * hScale;
  const bw = 0.6 * wScale;

  if (outline) {
    const otex = outlineTexture(px, outline.col, 32, 48, skinKey);
    const ospr = acquire(playerPool, makeSprite);
    setBillboard(ospr, otex, x, y, z, bw * 1.12, h * 1.12, xray);
    const gtex = spriteTexture(px, [null, outline.col, outline.col, outline.col, outline.col, outline.col], 32, 48, 'glowfill|' + skinKey + '|' + outline.col.join(','));
    const gspr = acquire(playerPool, makeSprite);
    setBillboard(gspr, gtex, x, y, z, bw * 1.06, h * 1.06, xray, true);
    gspr.material.opacity = 0.28;
    gspr.material.alphaTest = 0.05;
  }

  const tex = spriteTexture(px, pal, 32, 48, skinKey + (tint ? tint.join(',') : '') + (flash ? 'f' : ''));
  const spr = acquire(playerPool, makeSprite);
  setBillboard(spr, tex, x, y, z, bw, h, xray);
  spr.material.opacity = alpha;
  spr.material.alphaTest = alpha < 1 ? 0.02 : 0.4;
  if (anim?.rot) spr.material.rotation = anim.rot;
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
    if (c.mine && !S.dead) continue; // your own body is under the camera, unless you're spectating
    const age = now - c.t, fall = Math.min(1, age / 450), sink = age > 4000 ? (age - 4000) / 2000 * 0.4 : 0, big = c.big || 1;
    dropShadow(c.x, c.y, c.z, 0.32 * big * (1 + 0.5 * fall), Math.max(0, 1 - sink * 2));
    drawPlayerBillboard(c.x, c.y, c.z - sink, (1 - 0.72 * fall) * big, (1 + 0.9 * fall) * big, false, null, c.skin, null);
  }
  // monsters and decoys
  for (const [id, o] of Object.entries(S.npcs)) {
    const e = o.now;
    if (!e) continue;
    if (e.at && now - o.flashT > 250) o.flashT = now; // lunging: drawn with the recoil kick
    const pose = poseFor(o, now);
    dropShadow(e.x, e.y, e.z, 0.3 * (MOBS[e.k]?.big || 1), MOBS[e.k]?.float ? 0.5 : 1);
    if (e.k === 'decoy') { // a double of its caster
      const owner = S.room?.players.find(p => p.id === e.o);
      const tint = S.room && redBlue(S.room.mode) && owner ? TEAM_TINT[owner.team] : null;
      drawPlayerBillboard(e.x, e.y, e.z, 1, 1, now - o.hitT < 90, tint, lookOf(owner), null, pose);
      continue;
    }
    const def = MOBS[e.k] || MOBS.ghoul, big = def.big || 1;
    const tint = e.fr ? [150, 220, 255] : def.tint || null;
    const floaty = def.float ? 0.25 + 0.08 * Math.sin(now / 300 + e.x) : 0;
    drawPlayerBillboard(e.x, e.y, e.z + floaty, big, big, now - o.hitT < 90, tint, def.skin, null, pose, def.float ? 0.75 : 1);
  }
  for (const o of Object.values(S.others)) {
    if (!o.now || o.now.dead) continue; // their corpse is drawn instead
    const killer = !!(S.killcam && S.dead && o.now.id === S.killcam.id); // in the killcam: seen through walls, outlined
    const player = S.room && S.room.players.find(p => p.id === o.now.id);
    const team = player ? player.team : o.now.team;
    const tint = S.room?.mode === 'plague' && S.room.gameOn && team === PLAGUE_TEAM
      ? PLAGUE_TINT : (S.room && redBlue(S.room.mode)) ? TEAM_TINT[team] : null;
    const pose = poseFor(o, now);
    if (!o.cur?.iv || killer) dropShadow(o.now.x, o.now.y, o.now.z, 0.3);
    drawPlayerBillboard(
      o.now.x, o.now.y, o.now.z,
      o.now.sl ? SLIDE.crouch : 1,
      o.now.sl ? 1.15 : 1,
      now - o.hitT < 90, tint, lookOf(player), killer ? { col: [255, 70, 90] } : null, pose, // only the killcam outlines anyone
      o.cur?.iv && !killer ? 0.12 : 1, // Invisibility: a faint shimmer
      killer, emoteFor(o.now.id, now)
    );
    if (o.now.w && (!o.cur?.iv || killer) && !emoteFor(o.now.id, now)) drawHeldGun(o.now, o.now.sl ? SLIDE.crouch : 1, pose, killer, player?.camos?.[o.now.w] || player?.camos?.['*']);
    if (o.cur?.sh && !o.cur?.iv) { // shielded: a glowing witch's hat hovers over them
      const spr = acquire(playerPool, makeSprite);
      setBillboard(spr, hatTexture(), o.now.x, o.now.y, o.now.z + (BODY_H + 0.08) * (o.now.sl ? SLIDE.crouch : 1) + 0.04 * Math.sin(now / 250 + o.now.id), 0.5, 0.5, false);
      spr.material.opacity = 0.9; spr.material.alphaTest = 0.4;
      spr.material.rotation = 0.12 * Math.sin(now / 500 + o.now.id);
    }
    if (player?.pet && (!o.cur?.iv || killer)) drawFamiliar(o.now.id, player.pet, o.now, now, false);
    if (S.room?.mode === 'sky' && (!o.cur?.iv || killer)) drawBroom(o.now, pose, killer);
  }
  const mine = S.room?.players.find(p => p.id === S.myId);
  if (mine?.pet && S.me && !S.dead) drawFamiliar(S.myId, mine.pet, S.me, now, true);
}

// Broom Battle: the broomstick under a rider, bristles trailing behind whichever way they're heading
let broomArt = null;
function broomTexture(flip) {
  broomArt ||= [false, true].map(f => {
    const c = document.createElement('canvas'), W = 64, H = 12;
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rect = (x0, y0, w, h, col) => { g.fillStyle = col; g.fillRect(f ? W - x0 - w : x0, y0, w, h); };
    rect(14, 5, 50, 2, '#6a4424'); rect(14, 5, 50, 1, '#8a5c34');                // the handle
    for (let i = 0; i < 16; i++) rect(i, 2 + (i * 7) % 4, 2, 8 - (i * 3) % 5, i % 3 ? '#c8a050' : '#a07830'); // bristles
    rect(13, 3, 3, 6, '#3a2818');                                                // the binding
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
  return broomArt[flip ? 1 : 0];
}
function drawBroom(e, pose, xray) {
  const cam = getCamera();
  if (!cam) return;
  camRight.setFromMatrixColumn(cam.matrixWorld, 0);
  const ax = Math.cos(e.a || 0), ay = Math.sin(e.a || 0), across = ax * camRight.x + ay * camRight.z;
  const w = 0.35 + 0.95 * Math.abs(across); // end-on when they fly at you or away
  const spr = acquire(playerPool, makeSprite);
  setBillboard(spr, broomTexture(across < 0), e.x, e.y, e.z + (pose?.bob || 0) + 0.18, w, 0.2, xray);
  spr.material.opacity = 1; spr.material.alphaTest = 0.4;
}

// a familiar trails its witch: fliers at her shoulder, walkers at her heels. Yours drifts round in
// front of you when you stand still (and behind you, out of sight, while you move)
const PET_SIZE = 0.34, familiars = new Map(); // player id -> where their familiar is
function drawFamiliar(id, pet, e, now, mine) {
  const art = PET_SPRITES[pet];
  if (!art || !S.T) return;
  let f = familiars.get(id);
  if (!f || f.pet !== pet || Math.hypot(f.x - e.x, f.y - e.y) > 6) familiars.set(id, f = { pet, x: e.x, y: e.y, z: e.z + 1, t: now });
  const dt = Math.min(0.1, (now - f.t) / 1000); f.t = now;
  const idle = mine && (S.speed || 0) < 0.3;
  const side = idle ? e.a + 0.7 + 0.25 * Math.sin(now / 2600) : e.a + Math.PI * 0.8, dist = idle ? 1.7 : 0.75;
  const tx = e.x + Math.cos(side) * dist, ty = e.y + Math.sin(side) * dist;
  const hop = Math.abs(Math.sin(now / 180 + id)) * 0.12;
  const tz = art.ground ? walkHeight(S.T, tx, ty, e.z) + (pet === 'frog' || pet === 'pumpkin' ? hop : 0)
    : e.z + (mine ? 0.72 : 1.0) + 0.08 * Math.sin(now / 320 + id);
  const k = 1 - Math.exp(-dt * 5);
  f.x += (tx - f.x) * k; f.y += (ty - f.y) * k; f.z += (tz - f.z) * k;
  const frame = art.frames[Math.floor(now / (art.ground ? 260 : 140)) % art.frames.length];
  const tex = spriteTexture(frame, art.pal, 24, 24, 'pet|' + pet + '|' + art.frames.indexOf(frame));
  const spr = acquire(playerPool, makeSprite);
  setBillboard(spr, tex, f.x, f.y, f.z, PET_SIZE, PET_SIZE, false);
  spr.material.opacity = 1; spr.material.alphaTest = 0.4;
  if (art.ground) dropShadow(f.x, f.y, walkHeight(S.T, f.x, f.y, f.z), 0.14, 0.6);
}

// the gun in someone's hand: a side view beside them, muzzle toward whichever side of the screen
// they aim, in front of the body when they face you and behind it when they face away
const camRight = new THREE.Vector3();
function drawHeldGun(e, hScale, pose, xray, camo = null) {
  const cam = getCamera();
  if (!cam) return;
  camRight.setFromMatrixColumn(cam.matrixWorld, 0);
  const ax = Math.cos(e.a || 0), ay = Math.sin(e.a || 0);
  const across = ax * camRight.x + ay * camRight.z; // +1 aiming screen right, -1 screen left
  const side = across >= 0 ? 1 : -1;
  let tx = cam.position.x - e.x, ty = cam.position.z - e.y;
  const d = Math.hypot(tx, ty) || 1;
  tx /= d; ty /= d;
  const facing = ax * tx + ay * ty > 0 ? 1 : -1;
  const art = gunTexture(e.w, side < 0, camo);
  if (!art) return;
  const gw = art.w * HELD_SCALE * (0.4 + 0.6 * Math.abs(across)), gh = art.h * HELD_SCALE; // shorter when aimed at / away from you
  const reach = side * (HAND + (0.5 - GRIP) * gw - 0.06 * pose.kick); // grip in the hand, kicked back after a shot
  const pull = d > 0.5 ? 0.2 + 0.08 * facing : 0; // same slide toward the camera as the body, plus a little
  const x = e.x + camRight.x * reach + tx * pull, y = e.y + camRight.z * reach + ty * pull;
  const h = (BODY_H + 0.12) * hScale;
  const spr = acquire(playerPool, makeSprite);
  setBillboard(spr, art.tex, x, y, e.z + pose.bob + h * 0.37 - gh / 2, gw, gh, xray);
  spr.material.opacity = 1;
  spr.material.alphaTest = 0.4;
}
