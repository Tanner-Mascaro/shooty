// Build spells on the height grid: a Stone Wall or an Earth Ramp raised onto the same samples on
// the server and in every browser, so movement, bullets and sight all respect them. A build only
// goes on flat open floor, so taking it down restores exactly what was there.
import { MAT } from './terrain.js';

export const WALL = { len: 2.4, thick: 0.3, h: 2.2, ahead: 1.6 };
export const RAMP = { width: 2, len: 3, rise: 1.6, ahead: 0.6 };

// the four directions a build can face (east, south, west, north in map terms)
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const dirOf = a => Number.isFinite(a) ? ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4 : 0;
const snap = v => Math.round(v * 2) / 2;

// where a build would go for someone at (x, y) looking along angle a: { x, y, dir }
export function aimBuild(kind, x, y, a) {
  const dir = dirOf(a), [fx, fy] = DIRS[dir];
  const ahead = kind === 'wall' ? WALL.ahead : RAMP.ahead + RAMP.len / 2;
  return { x: snap(x + fx * ahead), y: snap(y + fy * ahead), dir };
}

// the build's box on the map: { x0, y0, x1, y1 } plus a height function over it
export function buildShape(kind, x, y, dir) {
  const [fx, fy] = DIRS[dir], along = kind === 'wall' ? WALL.thick : RAMP.len, across = kind === 'wall' ? WALL.len : RAMP.width;
  const hx = (fx ? along : across) / 2, hy = (fy ? along : across) / 2;
  const box = { x0: x - hx, y0: y - hy, x1: x + hx, y1: y + hy };
  // ramps rise away from the caster: 0 at the near end, RAMP.rise at the far end
  const height = kind === 'wall' ? () => WALL.h
    : (px, py) => RAMP.rise * Math.max(0.05, Math.min(1, ((px - x) * fx + (py - y) * fy) / RAMP.len + 0.5));
  return { box, height, top: kind === 'wall' ? WALL.h : RAMP.rise };
}

function samples(T, box, fn) {
  const i0 = Math.floor(box.x0 * T.RES), i1 = Math.ceil(box.x1 * T.RES) - 1;
  const j0 = Math.floor(box.y0 * T.RES), j1 = Math.ceil(box.y1 * T.RES) - 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (fn(i, j, j * T.TW + i) === false) return false;
  return true;
}

// true if the whole box is flat, open floor inside the map
export function canBuild(T, kind, x, y, dir) {
  const { box } = buildShape(kind, x, y, dir);
  return samples(T, box, (i, j, k) => i > 0 && j > 0 && i < T.TW - 1 && j < T.TH - 1
    && T.kind[k] === 0 && T.mat[k] === MAT.FLOOR && T.hgt[k] < 0.05);
}

// raise the build into the grid; returns what it covered so removeBuild can put it back
export function applyBuild(T, kind, x, y, dir) {
  const { box, height } = buildShape(kind, x, y, dir), prev = [];
  samples(T, box, (i, j, k) => {
    prev.push(k, T.hgt[k], T.kind[k], T.mat[k]);
    T.hgt[k] = height((i + 0.5) / T.RES, (j + 0.5) / T.RES);
    T.kind[k] = kind === 'wall' ? 1 : 0; // ramps are walkable slopes, walls block
    T.mat[k] = MAT.STONE;
  });
  return prev;
}

export function removeBuild(T, prev) {
  for (let n = 0; n < prev.length; n += 4) {
    const k = prev[n];
    T.hgt[k] = prev[n + 1]; T.kind[k] = prev[n + 2]; T.mat[k] = prev[n + 3];
  }
}

// is (x, y, z) on or inside this build (for bullets that stopped against it)?
export function touchesBuild(b, x, y, z, pad = 0.1) {
  const { box, top } = buildShape(b.kind, b.x, b.y, b.dir);
  return x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad && z <= top + pad;
}
