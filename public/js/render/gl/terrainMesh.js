// Terrain mesh from shared heightmap: flat colorful floors + vertical obstacle boxes
// (no smoothed ramps into walls — those looked climbable and washed out detail).
import * as THREE from 'three';
import { MAT, CEILING_H, HOUSE, houseAt, houseSolids, houseWindows } from '/shared/terrain.js';
import { MW, MH } from '/shared/levels.js';
import { texturesFor, clearTextureCache } from './textures.js';

const STRIDE = 3;

let worldRoot = null;

function disposeObject(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
}

export function clearWorld(scene) {
  if (worldRoot) {
    scene.remove(worldRoot);
    disposeObject(worldRoot);
    worldRoot = null;
  }
}

function pushVert(arr, x, y, z) { arr.push(x, z, y); }
function pushUV(arr, u, v) { arr.push(u, v); }
function pushColor(arr, r, g, b) { arr.push(r, g, b); }

function sampleColor(palette, i, j, TW, TH) {
  const ii = Math.min(TW - 1, Math.max(0, i)), jj = Math.min(TH - 1, Math.max(0, j));
  const k = jj * TW + ii;
  if (palette && palette.CR) return [palette.CR[k] / 255, palette.CG[k] / 255, palette.CB[k] / 255];
  return [0.55, 0.55, 0.6];
}

function addBox(vpos, vuv, vcol, vidx, x0, y0, x1, y1, z0, z1, tint, uScale = 1) {
  // top
  let b = vpos.length / 3;
  const tw = Math.max(0.2, (x1 - x0) * uScale), th = Math.max(0.2, (y1 - y0) * uScale);
  pushVert(vpos, x0, y0, z1); pushUV(vuv, 0, 0); pushColor(vcol, ...tint);
  pushVert(vpos, x1, y0, z1); pushUV(vuv, tw, 0); pushColor(vcol, ...tint);
  pushVert(vpos, x1, y1, z1); pushUV(vuv, tw, th); pushColor(vcol, ...tint);
  pushVert(vpos, x0, y1, z1); pushUV(vuv, 0, th); pushColor(vcol, ...tint);
  vidx.push(b, b + 1, b + 2, b, b + 2, b + 3);

  const face = (xa, ya, xb, yb, shade) => {
    b = vpos.length / 3;
    const us = Math.hypot(xb - xa, yb - ya);
    const c0 = [tint[0] * shade, tint[1] * shade, tint[2] * shade];
    pushVert(vpos, xa, ya, z0); pushUV(vuv, 0, 0); pushColor(vcol, ...c0);
    pushVert(vpos, xb, yb, z0); pushUV(vuv, us, 0); pushColor(vcol, ...c0);
    pushVert(vpos, xb, yb, z1); pushUV(vuv, us, z1 - z0); pushColor(vcol, tint[0], tint[1], tint[2]);
    pushVert(vpos, xa, ya, z1); pushUV(vuv, 0, z1 - z0); pushColor(vcol, tint[0], tint[1], tint[2]);
    vidx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  face(x0, y0, x1, y0, 0.55);
  face(x1, y0, x1, y1, 0.7);
  face(x1, y1, x0, y1, 0.55);
  face(x0, y1, x0, y0, 0.7);
}

export function buildWorld(scene, T, theme, palette) {
  clearWorld(scene);
  clearTextureCache();
  const tex = texturesFor(theme);
  const root = new THREE.Group();
  root.name = 'terrain';

  const { TW, TH, RES, hgt, mat, kind } = T;
  const treeCells = propCells(T); // drawn as real trees / houses by addTrees / addHouses, not as boxes
  const hAt = (i, j) => hgt[Math.min(TH - 1, Math.max(0, j)) * TW + Math.min(TW - 1, Math.max(0, i))];
  const kAt = (i, j) => kind[Math.min(TH - 1, Math.max(0, j)) * TW + Math.min(TW - 1, Math.max(0, i))];
  const mAt = (i, j) => mat[Math.min(TH - 1, Math.max(0, j)) * TW + Math.min(TW - 1, Math.max(0, i))];
  // floor height never climbs walls or hut roofs (roof lives in the heightmap for bullets;
  // walkable dirt under cottages stays at ground level so you can go inside)
  const underHutCell = (i, j) => {
    const x = (i + 0.5) / RES, y = (j + 0.5) / RES;
    for (const p of T.props || []) {
      if (p.type !== 'hut') continue;
      const hw = (p.w || 2.2) / 2 + 0.12, hd = (p.d || 2.2) / 2 + 0.12;
      if (Math.abs(x - p.x) < hw && Math.abs(y - p.y) < hd) return true;
    }
    return false;
  };
  // tower treads/decks are drawn as boxes — keep the continuous floor flat under them
  const underTowerTread = (i, j) => {
    const x = (i + 0.5) / RES, y = (j + 0.5) / RES;
    for (const p of T.props || []) {
      if (p.type !== 'tower' || !p.treads) continue;
      for (const t of p.treads) {
        if (x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1) return true;
      }
    }
    return false;
  };
  const floorZ = (i, j) => {
    if (kAt(i, j) === 1) return 0;
    if (underHutCell(i, j)) return 0;
    if (underTowerTread(i, j)) return 0;
    return Math.max(0, hAt(i, j));
  };

  // --- colorful floor heightfield (walkable surface only) ---
  const sw = Math.ceil((TW - 1) / STRIDE), sh = Math.ceil((TH - 1) / STRIDE);
  const pos = [], uv = [], col = [], idx = [];
  const vi = (si, sj) => sj * (sw + 1) + si;
  for (let sj = 0; sj <= sh; sj++) for (let si = 0; si <= sw; si++) {
    const i = Math.min(TW - 1, si * STRIDE), j = Math.min(TH - 1, sj * STRIDE);
    const x = (i + 0.5) / RES, y = (j + 0.5) / RES;
    pushVert(pos, x, y, floorZ(i, j));
    pushUV(uv, x * 0.55, y * 0.55);
    pushColor(col, ...sampleColor(palette, i, j, TW, TH));
  }
  for (let sj = 0; sj < sh; sj++) for (let si = 0; si < sw; si++) {
    const a = vi(si, sj), b = vi(si + 1, sj), c = vi(si, sj + 1), d = vi(si + 1, sj + 1);
    idx.push(a, c, b, b, c, d);
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  floorGeo.setIndex(idx);
  floorGeo.computeVertexNormals();
  root.add(new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({
    map: tex.floor,
    vertexColors: true,
  })));

  // --- vertical obstacle boxes (racks, walls, rocks, crates) ---
  const rackPos = [], rackUV = [], rackCol = [], rackIdx = [];
  const rockPos = [], rockUV = [], rockCol = [], rockIdx = [];
  const cratePos = [], crateUV = [], crateCol = [], crateIdx = [];
  const woodPos = [], woodUV = [], woodCol = [], woodIdx = [];
  const wallPos = [], wallUV = [], wallCol = [], wallIdx = [];

  // Emit a box only where heightmap cells are blocked. Coarse STRIDE blocks that also
  // contain walkable cells used to skip the corner check and leave holes you could see through.
  const step = STRIDE;
  const pushObstacle = (i0, j0, i1, j1, maxH, m) => {
    if (maxH < 0.15 || m === MAT.PUMPKIN) return; // pumpkins are drawn as props
    const x0 = i0 / RES, y0 = j0 / RES, x1 = i1 / RES, y1 = j1 / RES;
    const tint = sampleColor(palette, i0, j0, TW, TH);
    const lit = [Math.min(1, tint[0] * 1.25), Math.min(1, tint[1] * 1.25), Math.min(1, tint[2] * 1.25)];
    if (m === MAT.RACK) addBox(rackPos, rackUV, rackCol, rackIdx, x0, y0, x1, y1, 0, maxH, lit, 1.2);
    else if (m === MAT.CRATE) addBox(cratePos, crateUV, crateCol, crateIdx, x0, y0, x1, y1, 0, maxH, lit, 1);
    else if (m === MAT.BARK) addBox(woodPos, woodUV, woodCol, woodIdx, x0, y0, x1, y1, 0, maxH, lit, 1);
    else if (m === MAT.ROCK || m === MAT.LAVA || m === MAT.ROOTS || m === MAT.LEAVES)
      addBox(rockPos, rockUV, rockCol, rockIdx, x0, y0, x1, y1, 0, maxH, lit, 0.8);
    else addBox(wallPos, wallUV, wallCol, wallIdx, x0, y0, x1, y1, 0, maxH, lit, 1);
  };
  for (let j = 0; j < TH; j += step) for (let i = 0; i < TW; i += step) {
    const i1 = Math.min(TW, i + step), j1 = Math.min(TH, j + step);
    let maxH = 0, blocked = 0, cells = 0, matBest = MAT.WALL, matN = 0;
    const matCount = new Map();
    for (let jj = j; jj < j1; jj++) for (let ii = i; ii < i1; ii++) {
      cells++;
      if (kAt(ii, jj) !== 1 || treeCells[jj * TW + ii] || mAt(ii, jj) === MAT.DOOR) continue; // doors: render/gl/props.js
      const h = hAt(ii, jj);
      if (h < 0.15) continue;
      blocked++;
      maxH = Math.max(maxH, h);
      const m = mAt(ii, jj);
      const n = (matCount.get(m) || 0) + 1;
      matCount.set(m, n);
      if (n > matN) { matN = n; matBest = m; }
    }
    if (!blocked) continue;
    if (blocked === cells) {
      pushObstacle(i, j, i1, j1, maxH, matBest);
      continue;
    }
    // Mixed block: one sample-sized box per blocked cell so walls stay solid at edges/doors.
    for (let jj = j; jj < j1; jj++) for (let ii = i; ii < i1; ii++) {
      if (kAt(ii, jj) !== 1 || treeCells[jj * TW + ii] || mAt(ii, jj) === MAT.DOOR) continue;
      const h = hAt(ii, jj);
      if (h < 0.15) continue;
      pushObstacle(ii, jj, ii + 1, jj + 1, h, mAt(ii, jj));
    }
  }

  // tower stairs / decks share the wall atlas so they match curtain stone
  for (const p of T.props || []) {
    if (p.type !== 'tower' || !p.treads) continue;
    for (const t of p.treads) {
      const ci = Math.min(TW - 1, Math.max(0, Math.floor(((t.x0 + t.x1) / 2) * RES)));
      const cj = Math.min(TH - 1, Math.max(0, Math.floor(((t.y0 + t.y1) / 2) * RES)));
      const tint = sampleColor(palette, ci, cj, TW, TH);
      const lit = [Math.min(1, tint[0] * 1.15), Math.min(1, tint[1] * 1.15), Math.min(1, tint[2] * 1.15)];
      addBox(wallPos, wallUV, wallCol, wallIdx, t.x0, t.y0, t.x1, t.y1, 0, Math.max(0.08, t.z), lit, 1);
    }
  }

  const addMesh = (vpos, vuv, vcol, vidx, map, emissive) => {
    if (!vidx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vpos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(vuv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3));
    g.setIndex(vidx);
    g.computeVertexNormals();
    const matOpts = { map, vertexColors: true, side: THREE.DoubleSide };
    if (emissive) {
      matOpts.emissive = emissive;
      matOpts.emissiveIntensity = theme.id === 'castle' ? 0.28 : theme.id === 'witch' ? 0.25 : 0.35;
      matOpts.emissiveMap = map;
    }
    root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial(matOpts)));
  };

  const band = new THREE.Color(theme.band[0] / 255, theme.band[1] / 255, theme.band[2] / 255);
  addMesh(rackPos, rackUV, rackCol, rackIdx, tex.wall, theme.id === 'robot' ? band : null);
  // castle walls get a faint torch glow so halls don't go black
  addMesh(wallPos, wallUV, wallCol, wallIdx, tex.wall, theme.id === 'castle' ? band : null);
  addMesh(rockPos, rockUV, rockCol, rockIdx, tex.rock, null);
  addMesh(woodPos, woodUV, woodCol, woodIdx, tex.wood, null);
  addMesh(cratePos, crateUV, crateCol, crateIdx, tex.crate, null);

  // --- pits ---
  const pitPos = [], pitIdx = [];
  let pbase = 0;
  for (let j = 0; j < TH; j += step) for (let i = 0; i < TW; i += step) {
    if (mAt(i, j) !== MAT.PIT) continue;
    const x0 = i / RES, y0 = j / RES;
    const x1 = Math.min(TW, i + step) / RES, y1 = Math.min(TH, j + step) / RES;
    const z = hAt(i, j) + 0.02;
    pushVert(pitPos, x0, y0, z); pushVert(pitPos, x1, y0, z);
    pushVert(pitPos, x1, y1, z); pushVert(pitPos, x0, y1, z);
    pitIdx.push(pbase, pbase + 1, pbase + 2, pbase, pbase + 2, pbase + 3);
    pbase += 4;
  }
  if (pitIdx.length) {
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.Float32BufferAttribute(pitPos, 3));
    pgeo.setIndex(pitIdx);
    root.add(new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({
      map: tex.pit,
      color: band,
      side: THREE.DoubleSide,
    })));
  }

  if (theme.ceiling) {
    const cgeo = new THREE.PlaneGeometry(MW, MH);
    cgeo.rotateX(Math.PI / 2);
    const ceil = new THREE.Mesh(cgeo, new THREE.MeshLambertMaterial({
      color: new THREE.Color(theme.skyLo[0] / 255, theme.skyLo[1] / 255, theme.skyLo[2] / 255),
      side: THREE.DoubleSide,
    }));
    ceil.position.set(MW / 2, CEILING_H, MH / 2);
    root.add(ceil);
  }

  addProps(root, T, theme);
  addTrees(root, (T.props || []).filter(p => p.type === 'tree'), tex, theme);
  addHouses(root, T, tex);
  if (theme.id === 'castle' || theme.id === 'crypt') addCastleTorches(root, T, theme);
  scene.add(root);
  worldRoot = root;
  return root;
}

function addCastleTorches(root, T, theme) {
  const { TW, TH, RES, kind, hgt } = T;
  const iron = new THREE.MeshLambertMaterial({ color: 0x1a1520 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff6a20, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let count = 0;
  const max = 56;
  // place along open wall faces every ~3 map units
  for (let cy = 2; cy < MH - 2 && count < max; cy += 3) {
    for (let cx = 2; cx < MW - 2 && count < max; cx += 3) {
      const i = Math.min(TW - 1, Math.floor((cx + 0.5) * RES));
      const j = Math.min(TH - 1, Math.floor((cy + 0.5) * RES));
      if (kind[j * TW + i] !== 1 || hgt[j * TW + i] < 1.6) continue;
      for (const [dx, dy] of faces) {
        const oi = Math.min(TW - 1, Math.max(0, Math.floor((cx + dx + 0.5) * RES)));
        const oj = Math.min(TH - 1, Math.max(0, Math.floor((cy + dy + 0.5) * RES)));
        if (kind[oj * TW + oi] === 1) continue;
        const x = cx + 0.5 + dx * 0.48;
        const z = cy + 0.5 + dy * 0.48;
        const y = 1.45;
        // iron bracket flush to wall
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), iron);
        bracket.position.set(x - dx * 0.06, y - 0.08, z - dy * 0.06);
        root.add(bracket);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.18), iron);
        arm.position.set(x, y - 0.02, z);
        if (dx) arm.rotation.y = Math.PI / 2;
        root.add(arm);
        // glowing flame + soft halo (MeshBasic so halls stay lit without PointLights)
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), flameMat);
        flame.position.set(x + dx * 0.04, y + 0.12, z + dy * 0.04);
        flame.scale.set(0.85, 1.35, 0.85);
        root.add(flame);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), glowMat);
        halo.position.copy(flame.position);
        root.add(halo);
        count++;
        break;
      }
    }
  }
}

// Trees. In the heightmap a tree is only collision (a 2.4-tall trunk, a knee-high leaf skirt that stops
// you walking into it, roots), which drawn as boxes looked like a plank stump. Those cells are skipped
// and a real tree is drawn over them instead: flared trunk, branches, a clumpy canopy, bushes at the foot.
const TREE_R = 0.95; // covers the trunk, leaf skirt and roots that shared/terrain.js raises around a tree

function propCells(T) {
  const { TW, TH, RES, mat, hgt } = T;
  const mask = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) if (houseAt(T, (i + 0.5) / RES, (j + 0.5) / RES)) mask[j * TW + i] = 1;
  for (const p of T.props || []) {
    if (p.type !== 'tree') continue;
    for (let j = Math.max(0, Math.floor((p.y - TREE_R) * RES)); j < Math.min(TH, (p.y + TREE_R) * RES); j++)
      for (let i = Math.max(0, Math.floor((p.x - TREE_R) * RES)); i < Math.min(TW, (p.x + TREE_R) * RES); i++) {
        const k = j * TW + i, m = mat[k];
        if (Math.hypot((i + 0.5) / RES - p.x, (j + 0.5) / RES - p.y) > TREE_R) continue;
        // tall LEAVES is the boundary hedge, which stays
        if (m === MAT.BARK || m === MAT.ROOTS || (m === MAT.LEAVES && hgt[k] < 0.6)) mask[k] = 1;
      }
  }
  return mask;
}

// a low-poly leaf clump: an icosphere pushed in and out by a noise of its direction (same corner, same push,
// so the flat faces stay joined)
function blobGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const k = 0.82 + 0.3 * (n - Math.floor(n));
    a.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function addTrees(root, trees, tex, theme) {
  if (!trees.length) return;
  const trunkGeo = new THREE.LatheGeometry([[0.6, 0], [0.45, 0.04], [0.37, 0.12], [0.32, 0.35], [0.27, 0.65], [0.21, 0.9],
    [0.15, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  const branchGeo = new THREE.CylinderGeometry(0.05, 0.1, 1, 5).translate(0, 0.5, 0);
  const blobGeo = blobGeometry();
  const barkMat = new THREE.MeshLambertMaterial({ map: tex.bark, color: 0xc0a080 });
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
  const branches = new THREE.InstancedMesh(branchGeo, barkMat, trees.length * 3);
  const leaves = new THREE.InstancedMesh(blobGeo, leafMat, trees.length * 11);
  const green = new THREE.Color(theme.id === 'witch' ? 0x4a9a48 : 0x3a7a38);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let nb = 0, nl = 0;
  const leaf = (x, y, z, sx, sy, sz, light, rot) => {
    o.position.set(x, y, z); o.rotation.set(0, rot, 0); o.scale.set(sx, sy, sz); o.updateMatrix();
    leaves.setMatrixAt(nl, o.matrix);
    leaves.setColorAt(nl++, c.copy(green).offsetHSL((rot % 1 - 0.5) * 0.04, 0, light));
  };
  trees.forEach((p, t) => {
    const r = k => { const n = Math.sin(p.x * 12.9898 + p.y * 78.233 + k * 37.719) * 43758.5453; return n - Math.floor(n); };
    const h = p.h + 0.3, spin = r(1) * Math.PI * 2;
    o.position.set(p.x, 0, p.y); o.rotation.set(0, spin, 0); o.scale.set(1, h, 1); o.updateMatrix();
    trunks.setMatrixAt(t, o.matrix);
    for (let b = 0; b < 3; b++) { // branches reaching up into the canopy
      const yaw = spin + b * 2.1 + r(10 + b) * 0.8, len = 0.7 + 0.3 * r(20 + b);
      o.position.set(p.x, h * (0.55 + 0.15 * r(30 + b)), p.y);
      o.rotation.set(0.75 + 0.3 * r(40 + b), yaw, 0, 'YXZ'); o.scale.set(1, len, 1); o.updateMatrix();
      branches.setMatrixAt(nb++, o.matrix);
    }
    // canopy: a big middle clump, five around it, one on top (darker underneath, lighter on top)
    const top = h - 0.1, R = p.r;
    leaf(p.x, top, p.y, R * 0.8, R * 0.7, R * 0.8, 0, spin);
    for (let k = 0; k < 5; k++) {
      const a = spin + k * 1.2566 + r(50 + k) * 0.5, d = R * (0.5 + 0.15 * r(60 + k)), s = R * (0.5 + 0.15 * r(70 + k));
      leaf(p.x + Math.cos(a) * d, top - 0.3 + 0.4 * r(80 + k), p.y + Math.sin(a) * d, s, s * 0.85, s, -0.06 + 0.06 * r(90 + k), a);
    }
    leaf(p.x, top + R * 0.5, p.y, R * 0.5, R * 0.45, R * 0.5, 0.07, spin + 1);
    for (let k = 0; k < 4; k++) { // bushes on the leaf skirt at its foot
      const a = spin + k * 1.5708 + 0.4 + r(100 + k) * 0.6, s = 0.26 + 0.1 * r(110 + k);
      leaf(p.x + Math.cos(a) * 0.55, 0.12, p.y + Math.sin(a) * 0.55, s * 1.2, s, s * 1.2, -0.1, a);
    }
  });
  for (const m of [trunks, branches, leaves]) { m.instanceMatrix.needsUpdate = true; root.add(m); }
  leaves.instanceColor.needsUpdate = true;
}

// Two-storey cottages, drawn from the same houseSolids that movement and bullets use, so every doorway,
// window, floor and stair is exactly where the collision has it. Timber-framed: a heavier lower storey,
// plaster above, dark beams at the corners, floor line and eaves, shuttered windows, a shingled roof.
const HOUSE_LOOK = {
  //       lower storey [texture, tint]       upper storey                        timber              shutters            roof
  witch: { low: ['wood', [0.8, 0.64, 0.48]], up: ['plaster', [0.93, 0.88, 0.74]], beam: [0.3, 0.21, 0.15], shutter: [0.45, 0.26, 0.55], roof: 0x4a7a40 },
  nuke: { low: ['wood', [0.88, 0.6, 0.42]], up: ['plaster', [0.97, 0.86, 0.7]], beam: [0.32, 0.2, 0.14], shutter: [0.26, 0.44, 0.3], roof: 0x6a4058 },
  hell: { low: ['rock', [0.85, 0.66, 0.62]], up: ['wood', [0.5, 0.36, 0.3]], beam: [0.16, 0.1, 0.09], shutter: [0.5, 0.12, 0.08], roof: 0x4a2a2c },
  ice: { low: ['wood', [0.74, 0.62, 0.52]], up: ['plaster', [0.86, 0.91, 0.98]], beam: [0.3, 0.24, 0.2], shutter: [0.3, 0.46, 0.7], roof: 0xe8f0fa },
};

function addHouses(root, T, tex) {
  const houses = (T.props || []).filter(p => p.type === 'hut');
  if (!houses.length) return;
  const H = HOUSE, F = H.floor, look = HOUSE_LOOK[houses[0].style] || HOUSE_LOOK.witch;
  const buckets = {};
  const bucket = k => buckets[k] ||= { pos: [], uv: [], col: [], idx: [] };
  // a box, optionally with its underside (addBox leaves it off; ceilings are seen from below)
  const box = ([k, tint], x0, y0, x1, y1, z0, z1, under) => {
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005 || z1 - z0 < 0.005) return;
    const b = bucket(k);
    addBox(b.pos, b.uv, b.col, b.idx, x0, y0, x1, y1, z0, z1, tint);
    if (!under) return;
    const n = b.pos.length / 3;
    pushVert(b.pos, x0, y0, z0); pushVert(b.pos, x1, y0, z0); pushVert(b.pos, x1, y1, z0); pushVert(b.pos, x0, y1, z0);
    pushUV(b.uv, 0, 0); pushUV(b.uv, x1 - x0, 0); pushUV(b.uv, x1 - x0, y1 - y0); pushUV(b.uv, 0, y1 - y0);
    for (let i = 0; i < 4; i++) pushColor(b.col, tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6);
    b.idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  };
  const quad = ([k, tint], pts, uvs) => {
    const b = bucket(k), n = b.pos.length / 3;
    pts.forEach(([x, y, z], i) => { pushVert(b.pos, x, y, z); pushUV(b.uv, ...uvs[i]); pushColor(b.col, ...tint); });
    if (pts.length === 3) b.idx.push(n, n + 1, n + 2);
    else b.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const beam = ['wood', look.beam], floorboards = ['wood', [0.62, 0.46, 0.34]], shutter = ['wood', look.shutter];
  const roofTint = ['roof', [1, 1, 1]], stone = ['rock', [0.62, 0.58, 0.56]];

  for (const p of houses) {
    const hw = p.w / 2, hd = p.d / 2, t = p.t, x0 = p.x - hw, x1 = p.x + hw, y0 = p.y - hd, y1 = p.y + hd;
    // one wall piece [lo, hi]: lower storey, timber at the floor line and under the eaves, plaster between
    const piece = (ax, ay, bx, by, lo, hi) => {
      const cuts = [[lo, F - 0.1, look.low], [F - 0.1, F + 0.08, look.beam], [F + 0.08, p.h - 0.12, look.up], [p.h - 0.12, p.h, look.beam]];
      for (const [a, b, tint] of cuts) {
        const za = Math.max(lo, a), zb = Math.min(hi, b);
        if (zb <= za) continue;
        const k = tint === look.beam ? beam : tint === look.low ? look.low : look.up;
        const out = k === beam ? 0.02 : 0; // beams stand a little proud of the wall
        box(k, ax - out, ay - out, bx + out, by + out, za, zb);
      }
    };
    // walk along a wall in 5cm slices, merging slices whose solid layers match into one piece
    const layers = (x, y) => houseSolids(p, x, y).map(([lo, hi]) => [lo, Math.min(hi, p.h)]).filter(([lo, hi]) => hi > lo + 0.01);
    const wall = (alongX, c0, c1, from, to) => {
      const n = Math.round((to - from) / 0.05), step = (to - from) / n, mid = (c0 + c1) / 2;
      let start = from, key = null, cur = null;
      const flush = end => { for (const [lo, hi] of cur || []) alongX ? piece(start, c0, end, c1, lo, hi) : piece(c0, start, c1, end, lo, hi); };
      for (let i = 0; i < n; i++) {
        const a = from + i * step, L = alongX ? layers(a + step / 2, mid) : layers(mid, a + step / 2);
        const k = L.map(v => v[0].toFixed(2) + '-' + v[1].toFixed(2)).join('|');
        if (k !== key) { flush(a); start = a; key = k; cur = L; }
      }
      flush(to);
    };
    wall(false, x0, x0 + t, y0, y1);
    wall(false, x1 - t, x1, y0, y1);
    wall(true, y0, y0 + t, x0 + t, x1 - t);
    wall(true, y1 - t, y1, x0 + t, x1 - t);
    // corner posts
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]])
      box(beam, Math.min(cx, cx - Math.sign(cx - p.x) * 0.16) - 0.03, Math.min(cy, cy - Math.sign(cy - p.y) * 0.16) - 0.03,
        Math.max(cx, cx - Math.sign(cx - p.x) * 0.16) + 0.03, Math.max(cy, cy - Math.sign(cy - p.y) * 0.16) + 0.03, 0, p.h);
    // gables: the end walls' triangles above the eaves, outer and inner face
    for (const yy of [y0, y0 + t, y1 - t, y1])
      quad(look.up, [[x0, yy, p.h], [x1, yy, p.h], [p.x, yy, p.h + p.peak]], [[0, p.h], [p.w, p.h], [hw, p.h + p.peak]]);

    // floors and stairs
    const ix0 = x0 + t, ix1 = x1 - t, iy0 = y0 + t, iy1 = y1 - t, s = p.stairs;
    box(floorboards, ix0, iy0, ix1, iy1, 0, 0.015);
    for (const [ax, ay, bx, by] of [[ix0, iy0, ix1, s.y0], [ix0, s.y1, ix1, iy1], [ix0, s.y0, s.x0, s.y1], [s.x1, s.y0, ix1, s.y1]])
      box(floorboards, ax, ay, bx, by, F - H.slab, F, true);
    for (let i = 0; i < H.steps; i++) // lighter than the floor so the steps read from across the room
      box(['wood', [1.25, 1.0, 0.72]], s.x1 - (i + 1) * H.tread, s.y0, s.x1 - i * H.tread, s.y1, 0, (i + 1) * H.rise);
    // joists under the upper floor (not over the stairwell)
    for (let x = ix0 + 0.3; x < ix1 - 0.1; x += 0.5)
      for (const [ya, yb] of x > s.x0 - 0.05 && x < s.x1 + 0.05 ? [[s.y1, iy1], [iy0, s.y0]] : [[iy0, iy1]])
        box(beam, x - 0.05, ya, x + 0.05, yb, F - H.slab - 0.06, F - H.slab, true);

    // window trim: sill and head boards, shutters either side. `face` places a box against a wall's outside:
    // [a0, a1] along the wall from the house middle, [o0, o1] outward from the wall face
    const face = (w, k, a0, a1, o0, o1, z0, z1) => {
      if (w.wall === 'side') {
        const f = w.dir > 0 ? x1 : x0, xa = f + w.dir * o0, xb = f + w.dir * o1;
        box(k, Math.min(xa, xb), p.y + a0, Math.max(xa, xb), p.y + a1, z0, z1);
      } else {
        const f = w.dir > 0 ? y1 : y0, ya = f + w.dir * o0, yb = f + w.dir * o1;
        box(k, p.x + a0, Math.min(ya, yb), p.x + a1, Math.max(ya, yb), z0, z1);
      }
    };
    for (const w of houseWindows(p)) {
      const [lo, hi] = w.z, a = w.at, r = H.win;
      face(w, beam, a - r - 0.05, a + r + 0.05, -0.02, 0.07, lo - 0.05, lo);
      face(w, beam, a - r - 0.05, a + r + 0.05, -0.02, 0.04, hi, hi + 0.05);
      face(w, shutter, a - r - 0.26, a - r - 0.02, 0, 0.03, lo - 0.02, hi + 0.02);
      face(w, shutter, a + r + 0.02, a + r + 0.26, 0, 0.03, lo - 0.02, hi + 0.02);
    }
    // door frame and a doorstep
    const door = { wall: 'end', dir: p.doorDir }, dh = p.doorHalf;
    face(door, beam, -dh - 0.1, -dh, -0.02, 0.05, 0, H.door + 0.1);
    face(door, beam, dh, dh + 0.1, -0.02, 0.05, 0, H.door + 0.1);
    face(door, beam, -dh - 0.1, dh + 0.1, -0.02, 0.05, H.door, H.door + 0.12);
    face(door, stone, -dh, dh, 0, 0.35, 0, 0.03);

    // roof: two shingled slopes with an overhang, as thick as the collision roof, a ridge beam, fascia boards
    const OX = 0.3, OY = 0.22, ridge = p.h + p.peak, eave = p.h - p.peak * OX / hw, ya = y0 - OY, yb = y1 + OY;
    const slope = Math.hypot(hw + OX, p.peak + p.peak * OX / hw);
    for (const sgn of [-1, 1]) {
      const ex = p.x + sgn * (hw + OX);
      for (const dz of [0.01, -H.roofT])
        quad(roofTint, [[p.x, ya, ridge + dz], [p.x, yb, ridge + dz], [ex, yb, eave + dz], [ex, ya, eave + dz]],
          [[ya * 1.4, 0], [yb * 1.4, 0], [yb * 1.4, slope * 1.6], [ya * 1.4, slope * 1.6]]);
      for (const yy of [ya, yb]) // the roof's thickness at the gable ends
        quad(beam, [[p.x, yy, ridge + 0.01], [ex, yy, eave + 0.01], [ex, yy, eave - H.roofT], [p.x, yy, ridge - H.roofT]],
          [[0, 0], [1, 0], [1, 0.2], [0, 0.2]]);
      box(beam, Math.min(ex, ex - sgn * 0.05), ya, Math.max(ex, ex - sgn * 0.05), yb, eave - H.roofT - 0.02, eave + 0.02);
    }
    box(beam, p.x - 0.07, ya - 0.02, p.x + 0.07, yb + 0.02, ridge - 0.02, ridge + 0.07);
    // chimney through the back slope (looks only)
    const chx = p.x + hw * 0.5, chy = p.doorDir > 0 ? y0 + 0.35 : y1 - 0.69;
    box(stone, chx, chy, chx + 0.34, chy + 0.34, p.h + p.peak * 0.5 - H.roofT, ridge + 0.45); // starts at the roof's underside
    box(beam, chx - 0.04, chy - 0.04, chx + 0.38, chy + 0.38, ridge + 0.45, ridge + 0.53);
  }

  for (const [k, b] of Object.entries(buckets)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    g.computeVertexNormals();
    const roof = k === 'roof';
    root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      map: roof ? tex.shingle : tex[k], color: roof ? look.roof : 0xffffff, vertexColors: true, side: THREE.DoubleSide,
    })));
  }
}

function addProps(root, T, theme) {
  const lavaGlow = new THREE.MeshBasicMaterial({ color: 0xff4400 });
  const pumpkinMat = new THREE.MeshLambertMaterial({ color: 0xe0701c });
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x3a5a20 });
  const faceMat = new THREE.MeshBasicMaterial({ color: 0xffc040 });
  const pumpkinGeo = new THREE.SphereGeometry(1, 10, 7);
  const stemGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.16, 5);
  const eyeGeo = new THREE.CircleGeometry(0.07, 3);

  for (const p of T.props) {
    if (p.type === 'pumpkin') {
      // squat, ribbed-looking pumpkin; every third one is a lit jack-o'-lantern
      const body = new THREE.Mesh(pumpkinGeo, pumpkinMat);
      body.scale.set(p.r, p.r * 0.72, p.r);
      body.position.set(p.x, p.r * 0.62, p.y);
      root.add(body);
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(p.x, p.r * 1.32, p.y);
      root.add(stem);
      if ((Math.floor(p.x * 7 + p.y * 3) % 3) === 0) {
        const face = Math.atan2(MH / 2 - p.y, MW / 2 - p.x); // grin toward the middle of the map
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(eyeGeo, faceMat);
          const a = face + side * 0.35;
          eye.position.set(p.x + Math.cos(a) * p.r * 0.97, p.r * 0.78, p.y + Math.sin(a) * p.r * 0.97);
          eye.lookAt(p.x + Math.cos(a) * 3, p.r * 0.78, p.y + Math.sin(a) * 3);
          root.add(eye);
        }
      }
    } else if (p.type === 'volcano') {
      const h = p.top || 1.5;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 8), lavaGlow);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(p.x, h + 0.05, p.y);
      root.add(glow);
    }
  }
}
