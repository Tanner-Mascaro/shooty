// Build a Three.js heightfield + vertical faces from the shared terrain heightmap.
import * as THREE from 'three';
import { MAT, CEILING_H } from '/shared/terrain.js';
import { MW, MH } from '/shared/levels.js';
import { texturesFor, clearTextureCache } from './textures.js';

const STRIDE = 4; // coarser mesh — big FPS win, still matches collision silhouette

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

function matTint(mat, theme) {
  if (mat === MAT.PIT) return [1, 0.85, 0.3];
  if (mat === MAT.LAVA) return [1, 0.55, 0.15];
  if (mat === MAT.LEAVES) return [0.35, 0.7, 0.3];
  if (mat === MAT.BARK || mat === MAT.ROOTS) return [0.45, 0.32, 0.2];
  if (mat === MAT.RACK) return [0.35, 0.4, 0.48];
  if (mat === MAT.CRATE) return [0.75, 0.58, 0.32];
  if (mat === MAT.WALL) return theme.wallTop.map(c => c / 255);
  if (mat === MAT.ROCK) return theme.id === 'ice' ? [0.75, 0.85, 0.95] : [0.55, 0.28, 0.22];
  return [1, 1, 1];
}

function addWallQuad(vpos, vuv, vcol, vidx, x0, y0, x1, y1, zLo, zHi0, zHi1, tint) {
  const base = vpos.length / 3;
  const uScale = Math.hypot(x1 - x0, y1 - y0);
  pushVert(vpos, x0, y0, zLo); pushUV(vuv, 0, 0); pushColor(vcol, tint[0] * 0.7, tint[1] * 0.7, tint[2] * 0.7);
  pushVert(vpos, x1, y1, zLo); pushUV(vuv, uScale, 0); pushColor(vcol, tint[0] * 0.7, tint[1] * 0.7, tint[2] * 0.7);
  pushVert(vpos, x1, y1, zHi1); pushUV(vuv, uScale, zHi1 - zLo); pushColor(vcol, ...tint);
  pushVert(vpos, x0, y0, zHi0); pushUV(vuv, 0, zHi0 - zLo); pushColor(vcol, ...tint);
  vidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function buildWorld(scene, T, theme) {
  clearWorld(scene);
  clearTextureCache();
  const tex = texturesFor(theme);
  const root = new THREE.Group();
  root.name = 'terrain';

  const { TW, TH, RES, hgt, mat, kind } = T;
  const sw = Math.ceil((TW - 1) / STRIDE), sh = Math.ceil((TH - 1) / STRIDE);
  const hAt = (i, j) => hgt[Math.min(TH - 1, Math.max(0, j)) * TW + Math.min(TW - 1, Math.max(0, i))];
  const mAt = (i, j) => mat[Math.min(TH - 1, Math.max(0, j)) * TW + Math.min(TW - 1, Math.max(0, i))];
  const kAt = (i, j) => kind[Math.min(TH - 1, Math.max(0, j)) * TW + Math.min(TW - 1, Math.max(0, i))];

  const pos = [], uv = [], col = [], idx = [];
  const vi = (si, sj) => sj * (sw + 1) + si;
  for (let sj = 0; sj <= sh; sj++) for (let si = 0; si <= sw; si++) {
    const i = Math.min(TW - 1, si * STRIDE), j = Math.min(TH - 1, sj * STRIDE);
    const x = (i + 0.5) / RES, y = (j + 0.5) / RES, z = hAt(i, j);
    pushVert(pos, x, y, z);
    pushUV(uv, x / MW, y / MH);
    const tint = matTint(mAt(i, j), theme);
    const shade = kAt(i, j) === 1 ? 0.85 : 1;
    pushColor(col, tint[0] * shade, tint[1] * shade, tint[2] * shade);
  }
  for (let sj = 0; sj < sh; sj++) for (let si = 0; si < sw; si++) {
    const a = vi(si, sj), b = vi(si + 1, sj), c = vi(si, sj + 1), d = vi(si + 1, sj + 1);
    idx.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    map: tex.floor,
    vertexColors: true,
  }));
  ground.receiveShadow = false;
  ground.castShadow = false;
  root.add(ground);

  const vpos = [], vuv = [], vcol = [], vidx = [];
  const step = STRIDE, thr = 0.12;
  for (let j = 0; j < TH; j += step) for (let i = 0; i < TW; i += step) {
    const i1 = Math.min(TW - 1, i + step), j1 = Math.min(TH - 1, j + step);
    const z00 = hAt(i, j), z10 = hAt(i1, j), z01 = hAt(i, j1);
    const x0 = (i + 0.5) / RES, y0 = (j + 0.5) / RES;
    const x1 = (i1 + 0.5) / RES, y1 = (j1 + 0.5) / RES;

    if (i1 > i && Math.abs(z10 - z00) > thr) {
      const lo = Math.min(z00, z10);
      const tint = matTint(z10 > z00 ? mAt(i1, j) : mAt(i, j), theme);
      addWallQuad(vpos, vuv, vcol, vidx, x0, y0, x1, y0, lo, z00, z10, tint);
    }
    if (j1 > j && Math.abs(z01 - z00) > thr) {
      const lo = Math.min(z00, z01);
      const tint = matTint(z01 > z00 ? mAt(i, j1) : mAt(i, j), theme);
      addWallQuad(vpos, vuv, vcol, vidx, x0, y0, x0, y1, lo, z00, z01, tint);
    }
  }

  if (vidx.length) {
    const vgeo = new THREE.BufferGeometry();
    vgeo.setAttribute('position', new THREE.Float32BufferAttribute(vpos, 3));
    vgeo.setAttribute('uv', new THREE.Float32BufferAttribute(vuv, 2));
    vgeo.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3));
    vgeo.setIndex(vidx);
    vgeo.computeVertexNormals();
    const walls = new THREE.Mesh(vgeo, new THREE.MeshLambertMaterial({
      map: tex.wall,
      vertexColors: true,
      side: THREE.DoubleSide,
    }));
    walls.castShadow = false;
    walls.receiveShadow = false;
    root.add(walls);
  }

  const pitPos = [], pitIdx = [];
  let pbase = 0;
  for (let j = 0; j < TH; j += step) for (let i = 0; i < TW; i += step) {
    if (mAt(i, j) !== MAT.PIT) continue;
    const x0 = i / RES, y0 = j / RES;
    const x1 = Math.min(TW, i + step) / RES, y1 = Math.min(TH, j + step) / RES;
    const z = hAt(i, j) + 0.03;
    pushVert(pitPos, x0, y0, z); pushVert(pitPos, x1, y0, z);
    pushVert(pitPos, x1, y1, z); pushVert(pitPos, x0, y1, z);
    pitIdx.push(pbase, pbase + 1, pbase + 2, pbase, pbase + 2, pbase + 3);
    pbase += 4;
  }
  if (pitIdx.length) {
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.Float32BufferAttribute(pitPos, 3));
    pgeo.setIndex(pitIdx);
    pgeo.computeVertexNormals();
    root.add(new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({
      map: tex.pit,
      color: new THREE.Color(theme.band[0] / 255, theme.band[1] / 255, theme.band[2] / 255),
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
  const bark = new THREE.MeshLambertMaterial({ color: 0x4a3220 });
  const leaf = new THREE.MeshLambertMaterial({ color: 0x2e6a28 });
  const lavaGlow = new THREE.MeshBasicMaterial({ color: 0xff4400 });
  let lights = 0;
  const MAX_LIGHTS = 3;

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
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 8), lavaGlow);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(p.x, h + 0.05, p.y);
      root.add(glow);
      if (lights < MAX_LIGHTS) {
        const light = new THREE.PointLight(0xff5500, 0.9, 8, 2);
        light.position.set(p.x, h + 0.5, p.y);
        root.add(light);
        lights++;
      }
    } else if (p.type === 'hut' && lights < MAX_LIGHTS) {
      const light = new THREE.PointLight(
        new THREE.Color(theme.band[0] / 255, theme.band[1] / 255, theme.band[2] / 255),
        0.4, 4, 2
      );
      light.position.set(p.x, 1.15, p.y);
      root.add(light);
      lights++;
    }
  }
}
