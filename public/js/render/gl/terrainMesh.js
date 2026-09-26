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
  // floor height never climbs walls — blocked cells sit at 0 so the ground stays flat
  const floorZ = (i, j) => (kAt(i, j) === 1 ? 0 : Math.max(0, hAt(i, j)));

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

  const step = STRIDE;
  for (let j = 0; j < TH; j += step) for (let i = 0; i < TW; i += step) {
    if (kAt(i, j) !== 1) continue;
    let maxH = 0;
    const i1 = Math.min(TW, i + step), j1 = Math.min(TH, j + step);
    for (let jj = j; jj < j1; jj++) for (let ii = i; ii < i1; ii++)
      if (kAt(ii, jj) === 1) maxH = Math.max(maxH, hAt(ii, jj));
    if (maxH < 0.15) continue;
    const x0 = i / RES, y0 = j / RES, x1 = i1 / RES, y1 = j1 / RES;
    const tint = sampleColor(palette, i, j, TW, TH);
    // brighten a bit so racks/walls pop under Lambert
    const lit = [Math.min(1, tint[0] * 1.25), Math.min(1, tint[1] * 1.25), Math.min(1, tint[2] * 1.25)];
    const m = mAt(i, j);
    if (m === MAT.RACK) addBox(rackPos, rackUV, rackCol, rackIdx, x0, y0, x1, y1, 0, maxH, lit, 1.2);
    else if (m === MAT.CRATE) addBox(cratePos, crateUV, crateCol, crateIdx, x0, y0, x1, y1, 0, maxH, lit, 1);
    else if (m === MAT.ROCK || m === MAT.LAVA || m === MAT.BARK || m === MAT.ROOTS || m === MAT.LEAVES)
      addBox(rockPos, rockUV, rockCol, rockIdx, x0, y0, x1, y1, 0, maxH, lit, 0.8);
    else addBox(wallPos, wallUV, wallCol, wallIdx, x0, y0, x1, y1, 0, maxH, lit, 1);
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
      matOpts.emissiveIntensity = theme.id === 'castle' ? 0.75 : theme.id === 'witch' ? 0.25 : 0.35;
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
  scene.add(root);
  worldRoot = root;
  return root;
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
    } else if (p.type === 'hut' && lamps < maxLamps) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lampMat);
      bulb.position.set(p.x, 1.35, p.y);
      root.add(bulb);
      lamps++;
    }
  }
}
