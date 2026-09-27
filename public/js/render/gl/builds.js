// Conjured Stone Walls and Earth Ramps as their own meshes (the terrain mesh is built once per
// map), plus a see-through preview of the one being aimed: green if it fits, red if it doesn't.
import * as THREE from 'three';
import { S } from '../../state.js';
import { getScene } from './scene.js';
import { buildShape, DIRS, RAMP } from '/shared/spells.js';
import { buildPlan } from '../../spells.js';

const group = new THREE.Group();
group.name = 'builds';
const meshes = new Map(); // build id -> mesh
let stoneMat = null, ghost = null, ghostKey = '';

// grey blocks with faint violet runes
function stoneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 128; y += 32) for (let x = -32; x < 128; x += 64) {
    const ox = (y / 32) % 2 ? 32 : 0, v = 70 + ((x * 7 + y * 13) % 30);
    ctx.fillStyle = `rgb(${v},${v - 4},${v + 8})`;
    ctx.fillRect(x + ox + 1, y + 1, 62, 30);
  }
  ctx.strokeStyle = 'rgba(190,130,255,0.85)';
  ctx.lineWidth = 2;
  for (const [x, y] of [[20, 14], [84, 46], [44, 78], [100, 110]]) {
    ctx.beginPath(); ctx.moveTo(x - 6, y + 6); ctx.lineTo(x, y - 7); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x - 4, y + 1); ctx.lineTo(x + 4, y + 1); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(2.5, 2.5); // about four blocks across a wall face
  return tex;
}

// a wall is a box; a ramp is a wedge rising away from where it was cast
function geometry(kind, x, y, dir) {
  const { box, top } = buildShape(kind, x, y, dir);
  if (kind === 'wall') {
    const g = new THREE.BoxGeometry(box.x1 - box.x0, top, box.y1 - box.y0);
    g.translate((box.x0 + box.x1) / 2, top / 2, (box.y0 + box.y1) / 2);
    return g;
  }
  const [fx, fy] = DIRS[dir], sx = -fy * RAMP.width / 2, sy = fx * RAMP.width / 2;
  const nx = x - fx * RAMP.len / 2, ny = y - fy * RAMP.len / 2, far = [x + fx * RAMP.len / 2, y + fy * RAMP.len / 2];
  const low = RAMP.rise * 0.05;
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

export function drawBuilds() {
  const scene = getScene();
  if (!scene) return;
  if (group.parent !== scene) scene.add(group);
  if (!stoneMat) {
    const map = stoneTexture();
    stoneMat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide, emissive: 0x6030a0, emissiveMap: map, emissiveIntensity: 0.35 });
  }
  for (const [id, m] of meshes) if (!S.builds.has(id)) { group.remove(m); m.geometry.dispose(); meshes.delete(id); }
  for (const [id, b] of S.builds) if (!meshes.has(id)) {
    const m = new THREE.Mesh(geometry(b.kind, b.x, b.y, b.dir), stoneMat);
    group.add(m);
    meshes.set(id, m);
  }

  const plan = buildPlan();
  const key = plan ? `${plan.kind}:${plan.x}:${plan.y}:${plan.dir}` : '';
  if (key !== ghostKey) {
    if (ghost) { group.remove(ghost); ghost.geometry.dispose(); ghost.material.dispose(); ghost = null; }
    if (plan) {
      ghost = new THREE.Mesh(geometry(plan.kind, plan.x, plan.y, plan.dir),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
      group.add(ghost);
    }
    ghostKey = key;
  }
  if (ghost) ghost.material.color.set(plan.ok ? 0x70ff90 : 0xff5050);
}
