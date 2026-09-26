// Terrain mesh from shared heightmap: flat colorful floors + vertical obstacle boxes
// (no smoothed ramps into walls — those looked climbable and washed out detail).
import * as THREE from 'three';
import { MAT, CEILING_H } from '/shared/terrain.js';
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
  const wallPos = [], wallUV = [], wallCol = [], wallIdx = [];

  // Emit a box only where heightmap cells are blocked. Coarse STRIDE blocks that also
  // contain walkable cells used to skip the corner check and leave holes you could see through.
  const step = STRIDE;
  const pushObstacle = (i0, j0, i1, j1, maxH, m) => {
    if (maxH < 0.15) return;
    const x0 = i0 / RES, y0 = j0 / RES, x1 = i1 / RES, y1 = j1 / RES;
    const tint = sampleColor(palette, i0, j0, TW, TH);
    const lit = [Math.min(1, tint[0] * 1.25), Math.min(1, tint[1] * 1.25), Math.min(1, tint[2] * 1.25)];
    if (m === MAT.RACK) addBox(rackPos, rackUV, rackCol, rackIdx, x0, y0, x1, y1, 0, maxH, lit, 1.2);
    else if (m === MAT.CRATE) addBox(cratePos, crateUV, crateCol, crateIdx, x0, y0, x1, y1, 0, maxH, lit, 1);
    else if (m === MAT.ROCK || m === MAT.LAVA || m === MAT.BARK || m === MAT.ROOTS || m === MAT.LEAVES)
      addBox(rockPos, rockUV, rockCol, rockIdx, x0, y0, x1, y1, 0, maxH, lit, 0.8);
    else addBox(wallPos, wallUV, wallCol, wallIdx, x0, y0, x1, y1, 0, maxH, lit, 1);
  };
  for (let j = 0; j < TH; j += step) for (let i = 0; i < TW; i += step) {
    const i1 = Math.min(TW, i + step), j1 = Math.min(TH, j + step);
    let maxH = 0, blocked = 0, cells = 0, matBest = MAT.WALL, matN = 0;
    const matCount = new Map();
    for (let jj = j; jj < j1; jj++) for (let ii = i; ii < i1; ii++) {
      cells++;
      if (kAt(ii, jj) !== 1) continue;
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
      if (kAt(ii, jj) !== 1) continue;
      const h = hAt(ii, jj);
      if (h < 0.15) continue;
      pushObstacle(ii, jj, ii + 1, jj + 1, h, mAt(ii, jj));
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
  if (theme.id === 'castle') addCastleTorches(root, T, theme);
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

function addProps(root, T, theme) {
  const bark = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const leaf = new THREE.MeshLambertMaterial({
    color: theme.id === 'witch' ? 0x4a9a48 : 0x3a7a38,
  });
  const lavaGlow = new THREE.MeshBasicMaterial({ color: 0xff4400 });
  // unlit lamp meshes (no PointLights — those kill FPS on big maps)
  const lampMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(theme.band[0] / 255, theme.band[1] / 255, theme.band[2] / 255),
  });
  const hutRoofMats = {
    witch: new THREE.MeshLambertMaterial({ color: 0x2f6b32, side: THREE.DoubleSide }),
    nuke: new THREE.MeshLambertMaterial({ color: 0x6e5428, side: THREE.DoubleSide }),
    hell: new THREE.MeshLambertMaterial({ color: 0x4a3028, side: THREE.DoubleSide }),
    ice: new THREE.MeshLambertMaterial({ color: 0x8aa8c0, side: THREE.DoubleSide }),
  };
  let lamps = 0;
  const maxLamps = 6;

  for (const p of T.props) {
    if (p.type === 'tree') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, p.h * 0.55, 5), bark);
      trunk.position.set(p.x, p.h * 0.25, p.y);
      root.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.85, 6, 4), leaf);
      canopy.position.set(p.x, p.h - 0.4, p.y);
      root.add(canopy);
    } else if (p.type === 'volcano') {
      const h = p.top || 1.5;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 8), lavaGlow);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(p.x, h + 0.05, p.y);
      root.add(glow);
    } else if (p.type === 'tower' && p.treads) {
      // crisp stair treads / deck as solid boxes (heightmap alone looked like a melted blob)
      const stone = new THREE.MeshLambertMaterial({
        color: theme.id === 'castle' ? 0x6a6570 : 0x5a5858,
        flatShading: true,
      });
      for (const t of p.treads) {
        const w = Math.max(0.08, t.x1 - t.x0), d = Math.max(0.08, t.y1 - t.y0), h = Math.max(0.08, t.z);
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
        box.position.set((t.x0 + t.x1) / 2, h / 2, (t.y0 + t.y1) / 2);
        root.add(box);
      }
    } else if (p.type === 'hut') {
      // A-frame roof as real geometry so the heightmap roof doesn't seal the room as a floor mound
      const hw = (p.w || 2.2) / 2 + 0.06, hd = (p.d || 2.2) / 2 + 0.06;
      const wallH = p.h || 1.7;
      const peakH = Math.max(0.35, (p.roof || wallH + 0.7) - wallH);
      const ridgeZ = wallH + peakH;
      const eaveZ = Math.max(wallH - 0.15, wallH + peakH - (peakH + 0.25));
      const mat = hutRoofMats[p.style] || hutRoofMats.witch;
      const addSlope = (xEave) => {
        const geo = new THREE.BufferGeometry();
        // ridge along Y at hut center; eaves at ±X (matches shared/terrain raise)
        const positions = new Float32Array([
          p.x, ridgeZ, p.y - hd,
          p.x, ridgeZ, p.y + hd,
          xEave, eaveZ, p.y + hd,
          xEave, eaveZ, p.y - hd,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.computeVertexNormals();
        root.add(new THREE.Mesh(geo, mat));
      };
      addSlope(p.x - hw);
      addSlope(p.x + hw);
      if (lamps < maxLamps) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lampMat);
        bulb.position.set(p.x, Math.min(1.35, wallH - 0.25), p.y);
        root.add(bulb);
        lamps++;
      }
    }
  }
}
