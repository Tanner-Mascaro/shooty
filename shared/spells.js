// The Earth Ramp on the height grid: raised onto the same samples on the server and in every
// browser, so movement, bullets and sight all respect it. A ramp only goes on flat open floor,
// so taking it down restores exactly what was there. Ramps stack: one cast from on (or at the top
// of) a ramp facing the same way continues it upward, starting at its top (`base`). `kind` names
// the build (see BUILDS in shared/config.js); the ramp is the only one.
import { MAT } from './terrain.js';

export const RAMP = { width: 2, len: 3, rise: 1.6, ahead: 0.6 };

// the four directions a build can face (east, south, west, north in map terms)
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const dirOf = a => Number.isFinite(a) ? ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4 : 0;
const snap = v => Math.round(v * 2) / 2;

// the ramp this one would continue: same direction, starting right where `under` ends
const continues = (under, x, y, dir) => {
  const [fx, fy] = DIRS[dir];
  return under.dir === dir && Math.abs(under.x + fx * RAMP.len - x) < 0.01 && Math.abs(under.y + fy * RAMP.len - y) < 0.01;
};

// the ramp under a new one at (x, y) facing dir, if it continues one (else null)
export const rampUnder = (builds, x, y, dir) => builds.find(b => continues(b, x, y, dir)) || null;

// where a ramp would go for someone at (x, y) looking along angle a: { x, y, dir, base, on }.
// Standing on a ramp (or just past its top) and facing the same way stacks the next one on it
// (whether that's still under the height limit is up to fitsLevels)
export function aimBuild(kind, x, y, a, builds = []) {
  const dir = dirOf(a), [fx, fy] = DIRS[dir];
  for (const b of builds) {
    if (b.dir !== dir) continue;
    const along = (x - b.x) * fx + (y - b.y) * fy, across = Math.abs((x - b.x) * fy - (y - b.y) * fx);
    if (along > -RAMP.len / 2 && along < RAMP.len / 2 + 1.2 && across < RAMP.width / 2 + 0.2)
      return { x: b.x + fx * RAMP.len, y: b.y + fy * RAMP.len, dir, base: (b.base || 0) + RAMP.rise, on: b.id };
  }
  const ahead = RAMP.ahead + RAMP.len / 2;
  return { x: snap(x + fx * ahead), y: snap(y + fy * ahead), dir, base: 0, on: null };
}

// a ramp starting at `base` is at most `levels` ramps high
export const fitsLevels = (base, levels) => base <= (levels - 1) * RAMP.rise + 0.01;

// the ramp's box on the map: { x0, y0, x1, y1 } plus its height over it (base at the near end,
// base + RAMP.rise at the far end; everything under the slope is solid)
export function buildShape(kind, x, y, dir, base = 0) {
  const [fx, fy] = DIRS[dir], hx = (fx ? RAMP.len : RAMP.width) / 2, hy = (fy ? RAMP.len : RAMP.width) / 2;
  const box = { x0: x - hx, y0: y - hy, x1: x + hx, y1: y + hy };
  const height = (px, py) => base + RAMP.rise * Math.max(0.05, Math.min(1, ((px - x) * fx + (py - y) * fy) / RAMP.len + 0.5));
  return { box, height, top: base + RAMP.rise };
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

// raise the ramp into the grid; returns what it covered so removeBuild can put it back
export function applyBuild(T, kind, x, y, dir, base = 0) {
  const { box, height } = buildShape(kind, x, y, dir, base), prev = [];
  samples(T, box, (i, j, k) => {
    prev.push(k, T.hgt[k], T.kind[k], T.mat[k]);
    T.hgt[k] = height((i + 0.5) / T.RES, (j + 0.5) / T.RES);
    T.kind[k] = 0; // a walkable slope
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
  const { box, top } = buildShape(b.kind, b.x, b.y, b.dir, b.base || 0);
  return x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad && z <= top + pad;
}
