// Conjured Earth Ramps as their own meshes (the terrain mesh is built once per map): a mossy
// mound of soil and gnarled roots dotted with glowing mushrooms that rises out of the ground when
// cast, plus a see-through preview of the one being aimed (violet if it fits, red if it doesn't).
// Only the look lives here; the slope you walk on is the height grid (shared/spells.js).
import * as THREE from 'three';
import { S } from '../../state.js';
import { getScene } from './scene.js';
import { buildShape, DIRS, RAMP } from '/shared/spells.js';
import { buildPlan } from '../../spells.js';

const RISE_MS = 350;
const group = new THREE.Group();
group.name = 'builds';
const built = new Map(); // build id -> THREE.Group
let mats = null, ghost = null, ghostKey = '';

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(repeat, repeat);
  return tex;
}
const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };

// moss and dark soil with roots crawling over it and a few glowing mushroom caps
function moss(ctx, n, glowOnly) {
  if (!glowOnly) {
    for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) {
      const m = hash(x >> 3, y >> 3), v = 0.7 + 0.3 * hash(x, y);
      ctx.fillStyle = m > 0.6 ? `rgb(${56 * v | 0},${40 * v | 0},${28 * v | 0})` : `rgb(${46 * v | 0},${74 * v | 0},${34 * v | 0})`;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.strokeStyle = 'rgba(60,40,24,0.95)'; ctx.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = hash(i, 2) * n, y = 0;
      ctx.moveTo(x, y);
      while (y < n) { y += 10; x += (hash(i, y) - 0.5) * 16; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n); }
  for (let i = 0; i < 9; i++) {
    const x = hash(i, 5) * n, y = hash(i, 6) * n, col = i % 3 ? '#c88cff' : '#8cff9c';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function makeMats() {
  const earth = canvasTexture(128, (ctx, n) => moss(ctx, n, false), 1.5);
  const earthGlow = canvasTexture(128, (ctx, n) => moss(ctx, n, true), 1.5);
  return {
    earth: new THREE.MeshLambertMaterial({ map: earth, emissive: 0xffffff, emissiveMap: earthGlow, emissiveIntensity: 0.8, side: THREE.DoubleSide }),
    stem: new THREE.MeshLambertMaterial({ color: 0xd8d0b8 }),
    capPurple: new THREE.MeshBasicMaterial({ color: 0xb070ff }),
    capGreen: new THREE.MeshBasicMaterial({ color: 0x70ff90 }),
  };
}

// a wedge rising away from where it was cast (a stacked one starts at `base` and is solid down
// to the ground)
function geometry(kind, x, y, dir, base = 0) {
  const { top } = buildShape(kind, x, y, dir, base);
  const [fx, fy] = DIRS[dir], sx = -fy * RAMP.width / 2, sy = fx * RAMP.width / 2;
  const nx = x - fx * RAMP.len / 2, ny = y - fy * RAMP.len / 2, far = [x + fx * RAMP.len / 2, y + fy * RAMP.len / 2];
  const low = base + RAMP.rise * 0.05;
  const P = {
    nl: [nx - sx, 0, ny - sy], nr: [nx + sx, 0, ny + sy], fl: [far[0] - sx, 0, far[1] - sy], fr: [far[0] + sx, 0, far[1] + sy],
    nlt: [nx - sx, low, ny - sy], nrt: [nx + sx, low, ny + sy], flt: [far[0] - sx, top, far[1] - sy], frt: [far[0] + sx, top, far[1] + sy],
  };
  const quads = [['nlt', 'nrt', 'frt', 'flt'], ['nl', 'fl', 'fr', 'nr'], ['fl', 'flt', 'frt', 'fr'], ['nl', 'nr', 'nrt', 'nlt'], ['nl', 'nlt', 'flt', 'fl'], ['nr', 'fr', 'frt', 'nrt']];
  const pos = [], uv = [];
  for (const [a, b, c, d] of quads) for (const k of [a, b, c, a, c, d]) {
    pos.push(...P[k]);
    uv.push((P[k][0] + P[k][2]) * 0.5, P[k][1] * 0.5 + (P[k][0] - P[k][2]) * 0.25);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function mushroom(obj, x, z, cap) {
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.16, 5), mats.stem);
  stem.position.set(x, 0.08, z);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), cap);
  top.position.set(x, 0.15, z);
  obj.add(stem, top);
}

// one ramp (a mushroom at each corner of its foot if it's on the ground), in a group that grows up
// out of the ground
function makeBuild(b) {
  const obj = new THREE.Group(), [fx, fy] = DIRS[b.dir];
  obj.add(new THREE.Mesh(geometry(b.kind, b.x, b.y, b.dir, b.base || 0), mats.earth));
  if (!b.base) {
    const sx = -fy * RAMP.width / 2, sy = fx * RAMP.width / 2, nx = b.x - fx * (RAMP.len / 2 + 0.15), ny = b.y - fy * (RAMP.len / 2 + 0.15);
    mushroom(obj, nx - sx, ny - sy, mats.capPurple);
    mushroom(obj, nx + sx * 0.8, ny + sy * 0.8, mats.capGreen);
  }
  obj.userData.born = performance.now();
  obj.scale.y = 0.01;
  return obj;
}

function dispose(obj) {
  obj.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}

export function drawBuilds(now = performance.now()) {
  const scene = getScene();
  if (!scene) return;
  if (group.parent !== scene) scene.add(group);
  if (!mats) mats = makeMats();
  for (const [id, obj] of built) if (!S.builds.has(id)) { group.remove(obj); dispose(obj); built.delete(id); }
  for (const [id, b] of S.builds) if (!built.has(id)) { const obj = makeBuild(b); group.add(obj); built.set(id, obj); }
  for (const obj of built.values()) {
    const k = Math.min(1, (now - obj.userData.born) / RISE_MS);
    obj.scale.y = Math.max(0.01, 1 - (1 - k) ** 3); // rises fast, then settles
  }
  mats.earth.emissiveIntensity = 0.65 + 0.3 * Math.sin(now / 400); // mushrooms breathe

  const plan = buildPlan();
  const key = plan ? `${plan.kind}:${plan.x}:${plan.y}:${plan.dir}:${plan.base}` : '';
  if (key !== ghostKey) {
    if (ghost) { group.remove(ghost); ghost.geometry.dispose(); ghost.material.dispose(); ghost = null; }
    if (plan) {
      ghost = new THREE.Mesh(geometry(plan.kind, plan.x, plan.y, plan.dir, plan.base),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      group.add(ghost);
    }
    ghostKey = key;
  }
  if (ghost) ghost.material.color.set(plan.ok ? 0xa070ff : 0xff5050);
}
